# Copilot Instructions

## Project Overview

This is a **OpenAI Realtime API + WebRTC** demo built with Next.js 15, React 19, and TypeScript. The architecture enables real-time voice conversations with OpenAI's GPT models through direct WebRTC audio streaming.

## Architecture Pattern

### Three-Layer Communication Flow
1. **Browser** → Creates WebRTC peer connection, generates SDP offer
2. **Next.js API Route** (`/app/api/session/route.ts`) → Proxies SDP to OpenAI with session config
3. **OpenAI Realtime API** → Returns SDP answer, establishes direct WebRTC connection

**Key Insight**: The backend only facilitates the initial handshake. All audio streams directly between browser and OpenAI via WebRTC, with events flowing through a WebRTC data channel.

## Core Components

### `lib/use-realtime-webrtc.ts` - Connection Manager
- **Pattern**: Custom hook managing WebRTC lifecycle with automatic reconnection
- **Refs Used**: `pcRef` (RTCPeerConnection), `dcRef` (data channel), `audioElementRef`, `localStreamRef`
- **Reconnection Logic**: Exponential backoff (max 3 attempts) for ICE connection failures
- **Event System**: Publisher-subscriber pattern for Realtime API events

### `components/realtime-chat.tsx` - UI Controller  
- **Pattern**: Event-driven conversation management with local state synchronization
- **Event Handling**: Switch statement for different Realtime API event types
- **State Management**: Local conversation array + listening state for UI feedback

### `app/api/session/route.ts` - Session Proxy
- **Pattern**: Minimal proxy that forwards SDP + session config to OpenAI
- **Security**: API key server-side only, never exposed to client
- **Error Handling**: Detailed logging with structured error responses

## Development Workflow

### Essential Commands
```bash
pnpm dev                    # Dev server with Turbopack
pnpm dev --experimental-https  # HTTPS for production-like WebRTC testing
pnpm build --turbopack      # Production build
```

### Environment Setup
```bash
# Required: .env.local
OPENAI_API_KEY=your_key_here  # Must have Realtime API access (limited beta)
```

### Debugging WebRTC Issues
1. **Browser Console**: Monitor ICE connection states and event flows
2. **Network Tab**: Check `/api/session` SDP exchange 
3. **Test Networks**: Use mobile hotspot to isolate firewall/NAT issues
4. **HTTPS**: Required for microphone access in production

## Project-Specific Patterns

### WebRTC Configuration
```typescript
// Multiple STUN servers for better connectivity
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // ... up to 5 servers
],
iceCandidatePoolSize: 10  // Pre-gather candidates
```

### Audio Constraints
```typescript
// Optimized for voice chat
audio: {
  echoCancellation: true,
  noiseSuppression: true, 
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 24000  // OpenAI Realtime API preferred
}
```

### Event System Architecture
- **Outbound**: `sendEvent()` → WebRTC data channel → OpenAI
- **Inbound**: OpenAI → WebRTC data channel → `addEventListener()` callbacks
- **Key Events**: `conversation.item.created`, `response.audio_transcript.done`, `error`

### Reconnection Strategy
- ICE state monitoring with 5-second grace period for natural recovery
- Connection attempts tracked with exponential backoff
- Cleanup pattern: Close data channel → peer connection → media streams → audio element

## Critical Dependencies

- **openai**: ^5.22.0 (Realtime API support)
- **Next.js**: 15.5.3 (App Router required for API routes)
- **React**: 19.1.0 (useRef for WebRTC object lifecycle)
- **TypeScript**: Strict mode enabled, paths configured for `@/*` imports

## Common Troubleshooting

### WebRTC Connection Failures
- **Symptom**: ICE connection goes "checking" → "disconnected" → "failed"  
- **Solution**: Network firewall issue - test with mobile hotspot
- **Code**: Check `pc.iceConnectionState` logs in browser console

### API 400 Errors
- **Symptom**: Session creation fails with empty error from OpenAI
- **Solution**: Verify model name `gpt-4o-realtime-preview-2024-10-01` and session config format
- **Code**: Check console logs in `/api/session` route

### Microphone Access Denied
- **Requirement**: HTTPS context required for `getUserMedia()` in production
- **Fallback**: Text chat still works when voice fails

## File Organization Logic

```
app/
  api/session/route.ts     # WebRTC session proxy (backend)
  page.tsx                 # Simple container for RealtimeChat
lib/ 
  use-realtime-webrtc.ts   # Core WebRTC + reconnection logic
components/
  realtime-chat.tsx        # UI + conversation state management
```

**Convention**: Single-purpose components with clear separation between WebRTC management (lib) and UI logic (components).