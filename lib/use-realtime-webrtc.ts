'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

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
      
      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Wait a bit before reconnecting
      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          await connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }, 2000 * connectionAttempts.current); // Exponential backoff
    } else {
      console.error('Max reconnection attempts reached');
      setConnectionState({ 
        status: 'error', 
        error: 'Connection failed after multiple attempts. Please check your network connection and try again.' 
      });
    }
  }, []); // Remove connect dependency to avoid circular reference

  const disconnect = useCallback(() => {
    console.log('Disconnecting...');
    
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset connection attempts
    connectionAttempts.current = 0;
    
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
    try {
      setConnectionState({ status: 'connecting' });

      // Create peer connection with ICE servers for better connectivity
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
      });
      pcRef.current = pc;

      // Set up to play remote audio from the model
      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.setAttribute('playsinline', 'true'); // Important for mobile
      audioElementRef.current = audioElement;
      
      pc.ontrack = (e) => {
        console.log('Received remote track:', e.track.kind);
        if (audioElement && e.streams[0]) {
          audioElement.srcObject = e.streams[0];
          // Ensure audio plays on mobile devices
          audioElement.play().catch(console.error);
        }
      };

      // Add local audio track for microphone input
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 24000,
          },
        });
        localStreamRef.current = mediaStream;
        
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
          pc.addTrack(audioTrack, mediaStream);
          console.log('Added local audio track');
        }
      } catch (error) {
        console.error('Error accessing microphone:', error);
        throw new Error('Microphone access required for voice chat. Please grant permission and try again.');
      }

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events", {
        ordered: true,
      });
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('Data channel opened');
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          console.log('Received event:', event.type);
          
          // Notify all listeners
          eventListeners.forEach(listener => {
            try {
              listener(event);
            } catch (error) {
              console.error('Error in event listener:', error);
            }
          });
        } catch (error) {
          console.error('Error parsing event data:', error);
        }
      };

      dc.onerror = (error) => {
        console.error('Data channel error:', error);
      };

      dc.onclose = () => {
        console.log('Data channel closed');
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        
        switch (pc.connectionState) {
          case 'connecting':
            // Keep the current connecting state
            break;
          case 'connected':
            setConnectionState({ status: 'connected' });
            break;
          case 'disconnected':
            console.warn('Connection disconnected, monitoring for recovery...');
            // Don't immediately disconnect, give it time to recover
            break;
          case 'failed':
            console.error('Connection failed permanently');
            setConnectionState({ status: 'disconnected' });
            break;
          case 'closed':
            setConnectionState({ status: 'disconnected' });
            break;
        }
      };

      // Monitor ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
      };

      pc.onicecandidateerror = (error: Event) => {
        console.error('ICE candidate error:', error);
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        
        switch (pc.iceConnectionState) {
          case 'connected':
          case 'completed':
            console.log('ICE connection successful');
            connectionAttempts.current = 0; // Reset attempts on success
            break;
          case 'disconnected':
            console.warn('ICE connection disconnected, monitoring for recovery...');
            // Give it some time to recover before attempting reconnection
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                console.log('ICE connection did not recover, attempting reconnection...');
                attemptReconnect();
              }
            }, 5000); // Wait 5 seconds for natural recovery
            break;
          case 'failed':
            console.error('ICE connection failed permanently');
            attemptReconnect();
            break;
          case 'closed':
            console.log('ICE connection closed');
            break;
        }
      };

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
        iceRestart: false,
      });
      await pc.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error('Failed to create SDP offer');
      }

      // Send SDP to our backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const sdpResponse = await fetch("/api/session", {
          method: "POST",
          body: offer.sdp,
          headers: {
            "Content-Type": "application/sdp",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!sdpResponse.ok) {
          const errorText = await sdpResponse.text();
          if (sdpResponse.status === 401) {
            throw new Error('OpenAI API key invalid or missing Realtime API access');
          }
          throw new Error(`Session creation failed: ${errorText}`);
        }

        const answerSdp = await sdpResponse.text();
        if (!answerSdp) {
          throw new Error('Empty SDP response from server');
        }

        const answer: RTCSessionDescriptionInit = {
          type: "answer",
          sdp: answerSdp,
        };
        
        await pc.setRemoteDescription(answer);
        console.log('WebRTC connection established');
        
        // Reset connection attempts on successful connection
        connectionAttempts.current = 0;

      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Connection timeout. Please try again.');
        }
        throw error;
      }

    } catch (error) {
      console.error('Connection error:', error);
      
      // Only set error state if this is the first attempt or we've exhausted retries
      if (connectionAttempts.current === 0) {
        setConnectionState({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown connection error' 
        });
      }
      
      // Cleanup on error
      disconnect();
    }
  }, [eventListeners, disconnect, attemptReconnect]);

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