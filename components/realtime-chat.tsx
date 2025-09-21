'use client';

import { useState, useEffect, useRef } from 'react';
import { useRealtimeWebRTC, type RealtimeEvent } from '@/lib/use-realtime-webrtc';
import { createDebugger } from '@/lib/webrtc-debug';
import AudioWaveVisualizer from './audio-wave-visualizer';

interface ConversationItem {
  id: string;
  type: string;
  role?: string;
  content?: any[];
  timestamp: number;
  isComplete?: boolean;
  transcriptText?: string; // For real-time speech transcription
}

interface ActiveTranscription {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isComplete: boolean;
}

export default function RealtimeChat() {
  const { 
    connectionState, 
    connect, 
    disconnect, 
    sendEvent, 
    addEventListener,
    localStream,
    remoteStream
  } = useRealtimeWebRTC();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [activeTranscription, setActiveTranscription] = useState<ActiveTranscription | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Handle incoming events
  useEffect(() => {
    const removeListener = addEventListener((event: RealtimeEvent) => {
      console.log('Received event:', event);
      
      // Handle specific event types
      switch (event.type) {
        case 'conversation.item.created':
          if (event.item) {
            setConversations(prev => [...prev, {
              id: event.item.id,
              type: event.item.type,
              role: event.item.role,
              content: event.item.content,
              timestamp: Date.now(),
              isComplete: true,
            }]);
          }
          break;

        case 'input_audio_buffer.speech_started':
          console.log('User started speaking');
          setUserSpeaking(true);
          // Create a placeholder for user speech
          setActiveTranscription({
            id: `user-speech-${Date.now()}`,
            role: 'user',
            text: '',
            isComplete: false
          });
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('User stopped speaking');
          setUserSpeaking(false);
          // Mark active user transcription as complete (waiting for transcription)
          setActiveTranscription(prev => 
            prev && prev.role === 'user' ? {
              ...prev,
              text: prev.text || 'Processing speech...',
              isComplete: true
            } : prev
          );
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          // Handle user speech transcription
          console.log('User speech transcribed:', event.transcript);
          // Add completed user message to conversation
          setConversations(prev => [...prev, {
            id: `user-transcription-${Date.now()}`,
            type: 'transcription',
            role: 'user',
            content: [{ type: 'text', text: event.transcript }],
            timestamp: Date.now(),
            isComplete: true,
            transcriptText: event.transcript,
          }]);
          
          // Clear active user transcription after a brief delay
          setTimeout(() => {
            setActiveTranscription(prev => 
              prev && prev.role === 'user' ? null : prev
            );
          }, 500);
          break;

        case 'response.audio_transcript.delta':
          // Handle partial AI transcription
          console.log('AI transcript delta:', event.delta);
          setActiveTranscription(prev => {
            if (prev && prev.role === 'assistant') {
              return {
                ...prev,
                text: prev.text + event.delta,
                isComplete: false
              };
            } else {
              // Start new AI transcription
              return {
                id: `ai-speech-${Date.now()}`,
                role: 'assistant',
                text: event.delta,
                isComplete: false
              };
            }
          });
          break;
          
        case 'response.audio_transcript.done':
          // Handle completed AI transcription
          console.log('AI transcript done:', event.transcript);
          // Add completed AI message to conversation (use the full transcript, not just the delta)
          setConversations(prev => [...prev, {
            id: `ai-transcription-${Date.now()}`,
            type: 'transcription',
            role: 'assistant',
            content: [{ type: 'text', text: event.transcript }],
            timestamp: Date.now(),
            isComplete: true,
            transcriptText: event.transcript,
          }]);
          
          // Clear active transcription after a small delay to show completion
          setTimeout(() => {
            setActiveTranscription(null);
          }, 500);
          break;
          
        case 'response.done':
          console.log('Response completed');
          setIsListening(false);
          // Don't clear active transcription here - let it be cleared by the transcript.done event
          break;
          
        case 'error':
          console.error('Realtime API error:', event.error);
          setActiveTranscription(null);
          break;
          
        default:
          console.log('Unhandled event type:', event.type);
      }
    });

    return removeListener;
  }, [addEventListener, activeTranscription]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  const handleConnect = async () => {
    try {
      // Initialize debugger
      createDebugger();
      await connect();
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleDisconnect = () => {
    console.log('handleDisconnect called');
    try {
      disconnect();
      setConversations([]);
      setIsListening(false);
      setUserSpeaking(false);
      setActiveTranscription(null);
      console.log('Disconnect completed successfully');
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  };

  const sendTextMessage = () => {
    if (!inputText.trim() || connectionState.status !== 'connected') return;

    const event: RealtimeEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: inputText,
          },
        ],
      },
    };

    sendEvent(event);
    
    // Add to local conversation
    setConversations(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: inputText }],
      timestamp: Date.now(),
    }]);

    setInputText('');
    
    // Request a response
    sendEvent({ type: "response.create" });
    setIsListening(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionState.status) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState.status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return `Error: ${connectionState.error}`;
      default: return 'Disconnected';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              OpenAI Realtime WebRTC Demo
            </h1>
            <div className="flex items-center space-x-4">
              <span className={`font-medium ${getConnectionStatusColor()}`}>
                {getConnectionStatusText()}
              </span>
              {connectionState.status === 'disconnected' ? (
                <button
                  onClick={handleConnect}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Connect
                </button>
              ) : (
                <button
                  onClick={() => {
                    console.log('Disconnect button clicked');
                    handleDisconnect();
                  }}
                  className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          
          {/* Audio Wave Visualizers */}
          {connectionState.status === 'connected' && (
            <div className="mt-4 flex justify-center space-x-8">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Your Voice</p>
                <AudioWaveVisualizer
                  isActive={userSpeaking}
                  color="#3b82f6"
                  height={50}
                  width={150}
                  barCount={15}
                  audioStream={localStream || undefined}
                  role="user"
                  className="bg-blue-50 rounded-lg p-2"
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">AI Voice</p>
                <AudioWaveVisualizer
                  isActive={activeTranscription?.role === 'assistant' && !activeTranscription.isComplete}
                  color="#10b981"
                  height={50}
                  width={150}
                  barCount={15}
                  audioStream={remoteStream || undefined}
                  role="assistant"
                  className="bg-green-50 rounded-lg p-2"
                />
              </div>
            </div>
          )}
        </div>

        {/* Conversation Area */}
        <div className="h-96 overflow-y-auto p-4 bg-gray-50">
          {conversations.length === 0 && !activeTranscription ? (
            <div className="text-center text-gray-500 mt-8">
              <p>No conversation yet. Connect and start chatting!</p>
              <p className="text-sm mt-2">
                You can type messages or speak directly once connected.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversations.map((item) => (
                <div
                  key={item.id}
                  className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      item.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-900 border'
                    }`}
                  >
                    <div className="text-sm">
                      {item.content?.map((content, idx) => (
                        <div key={idx}>
                          {content.type === 'input_text' && content.text}
                          {content.type === 'text' && content.text}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs opacity-70 mt-1 flex items-center gap-2">
                      {item.type === 'transcription' && (
                        <span>🎤</span>
                      )}
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Active Transcription Display */}
              {activeTranscription && (
                <div className={`flex ${activeTranscription.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg transition-all duration-300 ${
                    activeTranscription.isComplete 
                      ? (activeTranscription.role === 'user' 
                          ? 'border border-blue-500 bg-blue-100 text-blue-900' 
                          : 'border border-green-500 bg-green-100 text-green-900')
                      : (activeTranscription.role === 'user' 
                          ? 'border-2 border-dashed border-blue-300 bg-blue-50 text-blue-800' 
                          : 'border-2 border-dashed border-green-300 bg-green-50 text-green-800')
                  }`}>
                    <div className="text-xs opacity-70 mb-1 flex items-center gap-2">
                      {activeTranscription.role === 'user' ? 'You' : 'AI'} 
                      {activeTranscription.isComplete 
                        ? ' (Completed)' 
                        : ' (Speaking...)'
                      }
                      {!activeTranscription.isComplete && (
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
                          <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                      )}
                    </div>
                    <div className="text-sm">
                      {activeTranscription.text || (userSpeaking ? 'Listening...' : 'Processing...')}
                    </div>
                  </div>
                </div>
              )}
              
              {isListening && !activeTranscription && (
                <div className="flex justify-start">
                  <div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-pulse">🎤</div>
                      <span>AI is responding...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={conversationEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                connectionState.status === 'connected'
                  ? "Type a message or speak directly..."
                  : "Connect first to start chatting"
              }
              disabled={connectionState.status !== 'connected'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button
              onClick={sendTextMessage}
              disabled={connectionState.status !== 'connected' || !inputText.trim()}
              className="bg-blue-500 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
            >
              Send
            </button>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            <strong>Voice Chat:</strong> Once connected, you can speak directly into your microphone. 
            The AI will respond with voice and the conversation will appear above.
            {userSpeaking && (
              <div className="mt-1 text-blue-600 font-medium flex items-center gap-2">
                🗣️ Speaking detected... <div className="animate-pulse">●</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}