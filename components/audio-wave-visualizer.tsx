'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AudioWaveVisualizerProps {
  isActive: boolean;
  color?: string;
  height?: number;
  width?: number;
  barCount?: number;
  className?: string;
  audioStream?: MediaStream;
  role?: 'user' | 'assistant';
}

export function AudioWaveVisualizer({
  isActive,
  color = '#3b82f6',
  height = 60,
  width = 200,
  barCount = 20,
  className = '',
  audioStream,
  role = 'user'
}: AudioWaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Initialize audio analysis
  useEffect(() => {
    if (!audioStream || !isActive) {
      cleanup();
      return;
    }

    const setupAudioAnalysis = async () => {
      try {
        // Create audio context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioContext = audioContextRef.current;

        // Create analyser node
        analyserRef.current = audioContext.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;

        // Connect audio stream to analyser
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyserRef.current);

        // Create data array for frequency data
        const bufferLength = analyserRef.current.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(new ArrayBuffer(bufferLength));

        setIsAnalyzing(true);
        startVisualization();
      } catch (error) {
        console.error('Error setting up audio analysis:', error);
      }
    };

    setupAudioAnalysis();

    return cleanup;
  }, [audioStream, isActive]);

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    setIsAnalyzing(false);
  };

  const startVisualization = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current || !dataArrayRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current || !isActive) return;

      // Get frequency data
      // @ts-ignore - TypeScript ArrayBuffer type issue with Web Audio API
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Calculate bar dimensions
      const barWidth = width / barCount;
      const dataStep = Math.floor(dataArrayRef.current.length / barCount);

      // Draw frequency bars
      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * dataStep;
        const amplitude = dataArrayRef.current[dataIndex] / 255;
        const barHeight = amplitude * height * 0.8;

        const x = i * barWidth;
        const y = (height - barHeight) / 2;

        // Create gradient for bars
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, color + '80'); // Semi-transparent
        gradient.addColorStop(1, color + 'FF'); // Full opacity

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);

        // Add glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  // Fallback animation when no audio stream
  useEffect(() => {
    if (isActive && !isAnalyzing) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let frame = 0;
      const fallbackDraw = () => {
        if (!isActive) return;

        ctx.clearRect(0, 0, width, height);

        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          // Create animated bars with sine wave
          const amplitude = (Math.sin(frame * 0.05 + i * 0.3) + 1) * 0.3 + 0.2;
          const barHeight = amplitude * height * 0.6;

          const x = i * barWidth;
          const y = (height - barHeight) / 2;

          const gradient = ctx.createLinearGradient(0, 0, 0, height);
          gradient.addColorStop(0, color + '60');
          gradient.addColorStop(1, color + 'AA');

          ctx.fillStyle = gradient;
          ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
        }

        frame++;
        animationRef.current = requestAnimationFrame(fallbackDraw);
      };

      fallbackDraw();

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isActive, isAnalyzing, color, height, width, barCount]);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`transition-opacity duration-300 ${
          isActive ? 'opacity-100' : 'opacity-30'
        }`}
        style={{ 
          filter: isActive ? 'none' : 'grayscale(100%)',
          background: 'transparent',
          pointerEvents: 'none' // Prevent canvas from blocking clicks
        }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">
          {role === 'user' ? '🎤 Speak to see waves' : '🔊 AI will show waves'}
        </div>
      )}
    </div>
  );
}

export default AudioWaveVisualizer;