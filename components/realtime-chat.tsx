'use client';

import { useState, useEffect, useRef } from 'react';
import { useRealtimeWebRTC, type RealtimeEvent } from '@/lib/use-realtime-webrtc';
import { createDebugger } from '@/lib/webrtc-debug';

interface ConversationItem {
  id: string;
  type: string;
  role?: string;
  content?: any[];
  timestamp: number;
}

export function RealtimeChat() {
  const { connectionState, connect, disconnect, sendEvent, addEventListener } = useRealtimeWebRTC();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
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
            }]);
          }
          break;
          
        case 'response.audio_transcript.delta':
          // Handle partial transcription
          console.log('Audio transcript delta:', event.delta);
          break;
          
        case 'response.audio_transcript.done':
          // Handle completed transcription
          console.log('Audio transcript done:', event.transcript);
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          // Handle user speech transcription
          console.log('User speech transcribed:', event.transcript);
          break;
          
        case 'response.done':
          console.log('Response completed');
          setIsListening(false);
          break;
          
        case 'error':
          console.error('Realtime API error:', event.error);
          break;
          
        default:
          console.log('Unhandled event type:', event.type);
      }
    });

    return removeListener;
  }, [addEventListener]);

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
    disconnect();
    setConversations([]);
    setIsListening(false);
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
                  onClick={handleDisconnect}
                  className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Conversation Area */}
        <div className="h-96 overflow-y-auto p-4 bg-gray-50">
          {conversations.length === 0 ? (
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
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {isListening && (
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
          </div>
        </div>
      </div>
    </div>
  );
}