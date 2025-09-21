# OpenAI Realtime API WebRTC Demo

This project demonstrates how to implement the OpenAI Realtime API using WebRTC for real-time voice conversations in a Next.js application.

## Features

- **Real-time Voice Chat**: Speak directly to OpenAI's GPT models and receive voice responses
- **WebRTC Integration**: Uses WebRTC for optimal audio streaming performance
- **Text Chat Support**: Send text messages alongside voice conversations
- **Connection Management**: Easy connect/disconnect with visual status indicators
- **Audio Processing**: Automatic echo cancellation, noise suppression, and gain control
- **Event Handling**: Complete event system for managing conversation state

## Prerequisites

- Node.js 18+ 
- pnpm (or npm/yarn)
- An OpenAI API key with access to the Realtime API
- A modern web browser with WebRTC support
- Microphone access for voice features

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

**Important**: Make sure your OpenAI API key has access to the Realtime API. This feature requires specific API access.

### 3. Run the Application

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Usage

1. **Connect**: Click the "Connect" button to establish a WebRTC connection
2. **Grant Permissions**: Allow microphone access when prompted
3. **Voice Chat**: Simply speak into your microphone - the AI will respond with voice
4. **Text Chat**: Type messages in the input field and press Enter
5. **Disconnect**: Click "Disconnect" to end the session

## How It Works

### Architecture

The implementation follows the OpenAI Realtime API WebRTC integration pattern:

1. **Frontend (Browser)**:
   - Creates WebRTC peer connection
   - Sets up audio tracks and data channels
   - Generates SDP offer

2. **Backend API** (`/api/session`):
   - Receives SDP from browser
   - Forwards to OpenAI Realtime API with session configuration
   - Returns SDP answer from OpenAI

3. **OpenAI Realtime API**:
   - Handles voice processing and AI responses
   - Streams audio directly via WebRTC
   - Sends events via data channel

### Key Components

- **`useRealtimeWebRTC` Hook**: Manages WebRTC connection lifecycle
- **`RealtimeChat` Component**: Provides the user interface
- **`/api/session` Route**: Handles session creation with OpenAI

### WebRTC Features

- **Audio Tracks**: Bidirectional audio streaming
- **Data Channel**: Real-time event communication
- **Echo Cancellation**: Built-in audio processing
- **Connection Management**: Automatic cleanup and error handling

## Configuration

### Session Configuration

The AI session is configured in `/app/api/session/route.ts`:

```typescript
const sessionConfig = {
  session: {
    type: "realtime",
    model: "gpt-realtime",
    audio: {
      output: {
        voice: "marin", // Available voices: alloy, ash, coral, echo, sage, shimmer
      },
    },
  },
};
```

### Audio Settings

Microphone settings in the WebRTC hook:

```typescript
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

## Event Types

The implementation handles various Realtime API events:

- `conversation.item.created`: New conversation items
- `response.audio_transcript.delta`: Partial transcriptions
- `response.audio_transcript.done`: Complete transcriptions
- `conversation.item.input_audio_transcription.completed`: User speech transcribed
- `response.done`: Response completion
- `error`: Error events

## Browser Compatibility

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

WebRTC is well-supported in modern browsers, but older versions may have limitations.

## Troubleshooting

### Common Issues

1. **"Microphone access required"**: 
   - Grant microphone permissions in browser settings
   - Check for browser security restrictions on HTTP vs HTTPS

2. **"OpenAI API key not configured"**:
   - Verify `.env.local` file exists and contains valid API key
   - Ensure API key has Realtime API access

3. **Connection failures**:
   - Check network connectivity
   - Verify OpenAI API status
   - Check browser console for detailed error messages

4. **Audio not working**:
   - Verify microphone permissions
   - Check audio device settings
   - Test with different browsers

### Debug Mode

Enable detailed logging by opening browser developer tools and checking the console. The implementation provides extensive logging for WebRTC events and API responses.

## Security Considerations

- API keys are kept server-side only
- Uses the "unified interface" approach for better security
- WebRTC provides encrypted audio streams
- No sensitive data is stored client-side

## Next Steps

Potential enhancements:

- Add voice activity detection
- Implement conversation history persistence
- Add support for multiple conversation sessions
- Integrate with other OpenAI models
- Add recording/playback functionality

## Resources

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Next.js Documentation](https://nextjs.org/docs)

## License

This project is provided as a demonstration of OpenAI's Realtime API integration patterns.
