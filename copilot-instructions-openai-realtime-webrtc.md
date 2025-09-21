---
applyTo: '**'
---

# OpenAI Realtime API with WebRTC Implementation Guide

## Overview
This guide covers implementing the OpenAI Realtime API using WebRTC for real-time voice conversations in Next.js applications. This provides low-latency, bidirectional audio streaming directly between the browser and OpenAI's servers.

## Core Architecture

### Technologies Stack
- **OpenAI Realtime API**: Real-time speech-to-speech AI models
- **WebRTC**: Peer-to-peer audio streaming protocol
- **Next.js App Router**: Backend API routes for session management
- **React Hooks**: Custom hooks for WebRTC connection management
- **TypeScript**: Full type safety for events and configurations

### Connection Flow
1. Browser creates WebRTC peer connection with audio tracks
2. Browser generates SDP offer and sends to backend API
3. Backend forwards SDP + session config to OpenAI Realtime API
4. OpenAI returns SDP answer for WebRTC connection
5. Browser establishes direct WebRTC connection to OpenAI
6. Bidirectional audio streams + data channel for events

## Implementation Components

### 1. Backend API Route (`/api/session/route.ts`)

```typescript
import { NextRequest } from 'next/server';

const sessionConfig = JSON.stringify({
  model: "gpt-4o-realtime-preview-2024-10-01",
  voice: "alloy" // Available: alloy, ash, coral, echo, sage, shimmer
});

export async function POST(req: NextRequest) {
  try {
    const sdp = await req.text();
    const apiKey = process.env.OPENAI_API_KEY;
    
    const formData = new FormData();
    formData.set("sdp", sdp);
    formData.set("session", sessionConfig);

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const responseSdp = await response.text();
    return new Response(responseSdp, {
      headers: { 'Content-Type': 'application/sdp' },
    });
  } catch (error) {
    console.error("Session creation error:", error);
    return new Response('Failed to create session', { status: 500 });
  }
}
```

### 2. WebRTC Hook (`lib/use-realtime-webrtc.ts`)

```typescript
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

  const [eventListeners, setEventListeners] = useState<((event: RealtimeEvent) => void)[]>([]);

  const addEventListener = useCallback((listener: (event: RealtimeEvent) => void) => {
    setEventListeners(prev => [...prev, listener]);
    return () => setEventListeners(prev => prev.filter(l => l !== listener));
  }, []);

  const sendEvent = useCallback((event: RealtimeEvent) => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.send(JSON.stringify(event));
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnectionState({ status: 'connecting' });

      // Create peer connection with multiple STUN servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
      });

      // Set up audio element for playback
      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.setAttribute('playsinline', 'true');
      audioElementRef.current = audioElement;
      
      pc.ontrack = (e) => {
        if (audioElement && e.streams[0]) {
          audioElement.srcObject = e.streams[0];
          audioElement.play().catch(console.error);
        }
      };

      // Get user microphone
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
      pc.addTrack(mediaStream.getAudioTracks()[0], mediaStream);

      // Set up data channel for events
      const dc = pc.createDataChannel("oai-events", { ordered: true });
      dcRef.current = dc;

      dc.onmessage = (e) => {
        const event = JSON.parse(e.data) as RealtimeEvent;
        eventListeners.forEach(listener => listener(event));
      };

      // Handle connection states with reconnection logic
      pc.oniceconnectionstatechange = () => {
        switch (pc.iceConnectionState) {
          case 'connected':
          case 'completed':
            connectionAttempts.current = 0;
            setConnectionState({ status: 'connected' });
            break;
          case 'failed':
            attemptReconnect();
            break;
        }
      };

      // Create and send offer
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("/api/session", {
        method: "POST",
        body: offer.sdp,
        headers: { "Content-Type": "application/sdp" },
      });

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      
      connectionAttempts.current = 0;
      pcRef.current = pc;

    } catch (error) {
      setConnectionState({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      });
    }
  }, [eventListeners]);

  const disconnect = useCallback(() => {
    // Cleanup all connections and streams
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioElementRef.current) audioElementRef.current.remove();
    
    setConnectionState({ status: 'disconnected' });
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    sendEvent,
    addEventListener,
  };
}
```

### 3. React Component Usage

```typescript
'use client';

import { useRealtimeWebRTC } from '@/lib/use-realtime-webrtc';

export function RealtimeChat() {
  const { connectionState, connect, disconnect, sendEvent, addEventListener } = useRealtimeWebRTC();

  // Handle incoming events
  useEffect(() => {
    const removeListener = addEventListener((event) => {
      switch (event.type) {
        case 'conversation.item.created':
          // Handle new conversation items
          break;
        case 'response.audio_transcript.done':
          // Handle completed transcriptions
          break;
        case 'error':
          console.error('Realtime API error:', event.error);
          break;
      }
    });
    return removeListener;
  }, [addEventListener]);

  const sendTextMessage = (text: string) => {
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    sendEvent({ type: "response.create" });
  };

  return (
    <div>
      <button 
        onClick={connectionState.status === 'disconnected' ? connect : disconnect}
      >
        {connectionState.status === 'connected' ? 'Disconnect' : 'Connect'}
      </button>
      {/* UI components */}
    </div>
  );
}
```

## Key Event Types

### Outgoing Events (Client → OpenAI)
- `conversation.item.create`: Add user message/audio
- `response.create`: Request AI response
- `input_audio_buffer.append`: Add audio data
- `input_audio_buffer.commit`: Finalize audio input

### Incoming Events (OpenAI → Client)
- `conversation.item.created`: New conversation item
- `response.audio_transcript.delta`: Partial transcription
- `response.audio_transcript.done`: Complete transcription
- `conversation.item.input_audio_transcription.completed`: User speech transcribed
- `response.done`: Response completed
- `error`: Error events

## Configuration Options

### Session Configuration
```typescript
const sessionConfig = {
  model: "gpt-4o-realtime-preview-2024-10-01", // Required model
  voice: "alloy", // alloy, ash, coral, echo, sage, shimmer
  input_audio_format: "pcm16", // Audio format
  output_audio_format: "pcm16",
  input_audio_transcription: { model: "whisper-1" }, // Enable transcription
  turn_detection: { 
    type: "server_vad", // Voice activity detection
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 200
  },
  tools: [], // Function calling tools
  tool_choice: "auto",
  temperature: 0.8,
  max_response_output_tokens: 4096
};
```

### Audio Settings
```typescript
const audioConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 24000, // 24kHz recommended
  }
};
```

### WebRTC Configuration
```typescript
const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10, // Pre-gather ICE candidates
};
```

## Best Practices

### Connection Management
1. **Always handle reconnection**: Implement automatic reconnection with exponential backoff
2. **Monitor ICE states**: Track `iceConnectionState` for network issues
3. **Cleanup properly**: Close all connections and stop media tracks on disconnect
4. **Handle permissions**: Request microphone access gracefully with error handling

### Audio Handling
1. **Use appropriate constraints**: Enable echo cancellation and noise suppression
2. **Mobile compatibility**: Set `playsinline` attribute for iOS compatibility
3. **Autoplay policies**: Handle autoplay restrictions in browsers
4. **Sample rate**: Use 24kHz for optimal quality

### Error Handling
1. **Network failures**: Implement retry logic for temporary connectivity issues
2. **Permission errors**: Provide clear messaging for microphone access requirements
3. **API errors**: Handle 401 (invalid key) and 429 (rate limit) responses
4. **WebRTC errors**: Monitor connection states and provide user feedback

### Security Considerations
1. **API key protection**: Never expose API keys in client-side code
2. **Server-side validation**: Validate session requests on your backend
3. **Rate limiting**: Implement rate limiting to prevent abuse
4. **User consent**: Always request explicit permission for microphone access

## Environment Setup

### Required Dependencies
```bash
pnpm add openai
```

### Environment Variables
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### API Access Requirements
- OpenAI API key with Realtime API access (currently in limited beta)
- Modern browser with WebRTC support
- HTTPS recommended for production (required for microphone access)

## Troubleshooting

### Common Issues
1. **ICE connection failures**: Usually firewall/NAT issues - try different networks
2. **Microphone permission denied**: Check browser settings and use HTTPS
3. **API 400 errors**: Verify model name and session configuration format
4. **Audio not playing**: Check autoplay policies and audio element setup
5. **Connection drops**: Implement reconnection logic with proper cleanup

### Debug Tips
1. **Enable verbose logging**: Monitor WebRTC events and API responses
2. **Check network**: Test with mobile hotspot to isolate network issues
3. **Browser compatibility**: Test across different browsers
4. **API status**: Verify OpenAI API status and rate limits

## Production Considerations
1. **HTTPS required**: WebRTC requires secure contexts for microphone access
2. **Load balancing**: Consider connection affinity for session persistence
3. **Monitoring**: Track connection success rates and error patterns
4. **Fallback options**: Provide alternative input methods for connection failures
5. **Resource cleanup**: Ensure proper cleanup to prevent memory leaks

This implementation provides a robust, production-ready foundation for real-time voice AI applications using the OpenAI Realtime API with WebRTC.