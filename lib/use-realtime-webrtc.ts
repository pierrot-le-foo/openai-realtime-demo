'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { createDebugger, getDebugger } from './webrtc-debug';
import { 
  createOpenAICompatiblePeerConnection, 
  configureAudioTransceiverForOpenAI,
  createOpenAICompatibleOffer,
  validateSDPForOpenAI 
} from './openai-webrtc-compat';

export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export function useRealtimeWebRTC() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected'
  });
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttempts = useRef<number>(0);
  const maxReconnectAttempts = 3;

  // Event listeners
  const [eventListeners, setEventListeners] = useState<((event: RealtimeEvent) => void)[]>([]);

  const addEventListener = useCallback((listener: (event: RealtimeEvent) => void) => {
    setEventListeners(prev => [...prev, listener]);
    return () => {
      setEventListeners(prev => prev.filter(l => l !== listener));
    };
  }, []);

  const sendEvent = useCallback((event: RealtimeEvent) => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.send(JSON.stringify(event));
    } else {
      console.warn('Data channel not ready, event not sent:', event);
    }
  }, []);

  const attemptReconnect = useCallback(() => {
    if (connectionAttempts.current < maxReconnectAttempts) {
      connectionAttempts.current += 1;
      console.log(`Attempting reconnection ${connectionAttempts.current}/${maxReconnectAttempts}`);
      
      const debug = getDebugger();
      debug?.log(`Attempting reconnection ${connectionAttempts.current}/${maxReconnectAttempts}`);
      
      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Cleanup current connection before reconnecting
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      
      if (dcRef.current) {
        dcRef.current.close();
        dcRef.current = null;
      }
      
      // Wait a bit before reconnecting
      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          await connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
          debug?.log('Reconnection failed:', error);
        }
      }, 2000 * connectionAttempts.current); // Exponential backoff
    } else {
      console.error('Max reconnection attempts reached');
      const debug = getDebugger();
      debug?.log('Max reconnection attempts reached');
      setConnectionState({ 
        status: 'error', 
        error: 'Connection failed after multiple attempts. Please check your network connection and try again.' 
      });
    }
  }, []);

  const restartIce = useCallback(async () => {
    const debug = getDebugger();
    debug?.log('Attempting ICE restart...');
    
    if (!pcRef.current) {
      debug?.log('No peer connection available for ICE restart');
      return;
    }

    try {
      // Create a new offer with ICE restart
      const offer = await pcRef.current.createOffer({ iceRestart: true });
      await pcRef.current.setLocalDescription(offer);
      
      if (!offer.sdp) {
        throw new Error('Failed to create ICE restart offer');
      }

      debug?.log('ICE restart offer created, sending to server...');
      
      // Send the new offer to the server
      const response = await fetch("/api/session", {
        method: "POST",
        body: offer.sdp,
        headers: {
          "Content-Type": "application/sdp",
        },
      });

      if (!response.ok) {
        throw new Error(`ICE restart failed: ${response.status}`);
      }

      const answerSdp = await response.text();
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: answerSdp,
      };
      
      await pcRef.current.setRemoteDescription(answer);
      debug?.log('ICE restart completed successfully');
      
    } catch (error) {
      debug?.log('ICE restart failed:', error);
      console.error('ICE restart failed:', error);
      // If ICE restart fails, fall back to full reconnection
      attemptReconnect();
    }
  }, [attemptReconnect]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting...');
    
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset connection attempts and session state
    connectionAttempts.current = 0;
    setIsSessionStarted(false);
    
    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    
    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    // Stop local media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    // Remove audio element
    if (audioElementRef.current) {
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }
    
    setConnectionState({ status: 'disconnected' });
  }, []);

  const connect = useCallback(async () => {
    const debug = createDebugger();
    
    try {
      debug.log('=== Starting WebRTC Connection ===');
      setConnectionState({ status: 'connecting' });

      if (!isSessionStarted) {
        setIsSessionStarted(true);
        
        // Get an ephemeral session token
        debug.log('Getting ephemeral session token...');
        const sessionResponse = await fetch("/api/session");
        
        if (!sessionResponse.ok) {
          throw new Error(`Failed to get session token: ${sessionResponse.status}`);
        }
        
        const session = await sessionResponse.json();
        const sessionToken = session.client_secret.value;
        const sessionId = session.id;

        debug.log('Session ID:', sessionId);
        console.log("Session id:", sessionId);

        // Create a basic peer connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        debug.log('Created basic RTCPeerConnection');

        // Set up to play remote audio from the model
        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute('playsinline', 'true');
        audioElementRef.current = audioElement;
        
        pc.ontrack = (e) => {
          debug.log('Received remote track:', e.track.kind);
          if (audioElement && e.streams[0]) {
            audioElement.srcObject = e.streams[0];
            audioElement.play().catch((err) => {
              debug.log('Audio play failed:', err);
              console.error('Audio play failed:', err);
            });
          }
        };

        // Add local audio track for microphone input
        try {
          debug.log('Requesting microphone access...');
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          localStreamRef.current = mediaStream;
          
          mediaStream.getTracks().forEach((track) => {
            pc.addTrack(track, mediaStream);
          });
          
          debug.log('Added local audio tracks');
        } catch (error) {
          debug.log('Microphone access failed:', error);
          console.error('Microphone access failed:', error);
          throw error;
        }

        // Set up data channel for sending and receiving events
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        debug.log('Created data channel');

        // Set up ICE handling
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            debug.log('ICE candidate:', event.candidate.candidate);
          } else {
            debug.log('ICE gathering complete');
          }
        };

        pc.onicegatheringstatechange = () => {
          debug.log('ICE gathering state:', pc.iceGatheringState);
        };

        pc.oniceconnectionstatechange = () => {
          debug.log(`ICE connection state: ${pc.iceConnectionState}`);
          
          switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
              console.log('ICE connection successful');
              debug.log('ICE connection successful - media flowing');
              setConnectionState({ status: 'connected' });
              connectionAttempts.current = 0;
              break;
            case 'disconnected':
              console.warn('ICE connection disconnected');
              debug.log('ICE connection disconnected');
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              reconnectTimeoutRef.current = setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                  attemptReconnect();
                }
              }, 5000);
              break;
            case 'failed':
              console.error('ICE connection failed');
              debug.log('ICE connection failed');
              attemptReconnect();
              break;
          }
        };

        // Create offer and set local description
        debug.log('Creating SDP offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send offer to OpenAI directly
        debug.log('Sending offer to OpenAI...');
        const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`, {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            "Content-Type": "application/sdp",
          },
        });

        if (!sdpResponse.ok) {
          throw new Error(`OpenAI SDP exchange failed: ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        debug.log('Received SDP answer from OpenAI');

        const answer: RTCSessionDescriptionInit = {
          type: "answer",
          sdp: answerSdp,
        };
        
        await pc.setRemoteDescription(answer);
        debug.log('Set remote description');

        // Set up data channel event listeners
        dc.addEventListener('open', () => {
          debug.log('Data channel opened');
          setConnectionState({ status: 'connected' });
        });

        dc.addEventListener('message', (e) => {
          const event = JSON.parse(e.data);
          eventListeners.forEach(listener => listener(event));
        });

        debug.log('WebRTC connection setup complete');
        connectionAttempts.current = 0;
      }
    } catch (error) {
      debug.log('Connection failed:', error);
      console.error('Connection failed:', error);
      setConnectionState({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      attemptReconnect();
    }
  }, [eventListeners, attemptReconnect, isSessionStarted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    sendEvent,
    addEventListener,
    audioElement: audioElementRef.current,
  };
}