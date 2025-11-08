'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function CameraPage() {
  const router = useRouter();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [aiResponse, setAiResponse] = useState('Select a model and click Start to begin');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [hasStarted, setHasStarted] = useState(false); // Track if user has started the session
  
  // Available models for Realtime API (BidiGenerateContent)
  // Based on official Google documentation
  const availableModels = [
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      description: 'Latest experimental model - Best for real-time vision + audio',
      features: 'Fast, multimodal (vision, audio, video)',
      recommended: true
    },
    {
      id: 'gemini-1.5-flash-exp',
      name: 'Gemini 1.5 Flash (Experimental)',
      description: 'Stable experimental model - Good for real-time tasks',
      features: 'Multimodal (vision, audio, video)',
      recommended: false
    },
    {
      id: 'gemini-1.5-pro-exp',
      name: 'Gemini 1.5 Pro (Experimental)',
      description: 'Advanced experimental model - More complex reasoning',
      features: 'Advanced multimodal processing',
      recommended: false
    },
    {
      id: 'gemini-2.0-flash-001',
      name: 'Gemini 2.0 Flash (Versioned)',
      description: 'Stable versioned model - May have limited availability',
      features: 'Multimodal support',
      recommended: false
    }
  ];

  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Check authentication
  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('authenticated')) {
      router.push('/');
    }
  }, [router]);

  // Cleanup function - defined before useEffect to avoid reference error
  const cleanup = useCallback(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleStart = async () => {
    setHasStarted(true);
    setAiResponse('Initializing camera and microphone...');
    await initializeCameraAndAI();
  };

  const initializeCameraAndAI = async () => {
    try {
      // Request camera and microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          connectWebSocket(stream);
        };
      }
    } catch (err) {
      console.error('Camera/Mic error:', err);
      setError('Please allow camera and microphone access');
      setAiResponse('Camera/Microphone access required');
      setHasStarted(false); // Allow retry
    }
  };

  const connectWebSocket = (stream) => {
    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/gemini`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setError('');
      setAiResponse('AI is watching and listening...');
      setSessionTime(0);

      // Send model selection to server
      ws.send(JSON.stringify({
        type: 'model_selection',
        model: selectedModel
      }));

      // Start session timer
      sessionTimerRef.current = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);

      // Start streaming
      startStreaming(ws, stream);

      // Auto-reconnect before 2-minute limit (at 110 seconds)
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Auto-reconnecting before session limit...');
        ws.close();
        connectWebSocket(stream);
      }, 110000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          setAiResponse(data.text);
        }
        if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        console.error('Message parse error:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      clearInterval(sessionTimerRef.current);
      clearTimeout(reconnectTimeoutRef.current);

      // Auto-reconnect after 3 seconds
      if (mediaStreamRef.current && sessionStorage.getItem('authenticated')) {
        setTimeout(() => {
          connectWebSocket(mediaStreamRef.current);
        }, 3000);
      }
    };
  };

  const startStreaming = (ws, stream) => {
    // Video frame capture
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const sendFrame = () => {
      if (!videoRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;

      const video = videoRef.current;
      if (video.readyState !== 4) return; // Video not ready

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Gemini 2.0 Flash image limits:
      // - Maximum images per prompt: 3,000
      // - Maximum image size: 7 MB
      // - Supported MIME types: image/png, image/jpeg, image/webp
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          // Check size limit (7 MB = 7 * 1024 * 1024 bytes)
          if (blob.size > 7 * 1024 * 1024) {
            console.warn('Image size exceeds 7 MB limit, skipping frame');
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'video_frame',
                data: base64,
                timestamp: Date.now()
              }));
            }
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg', // Supported MIME type
        0.8 // Quality (0-1) - lower quality = smaller file size
      );
    };

    // Send frames every 500ms for smoother experience
    frameIntervalRef.current = setInterval(sendFrame, 500);

    // Audio capture with MediaRecorder
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      // Determine MIME type based on browser support
      // Gemini 2.0 Flash supports: audio/x-aac, audio/flac, audio/mp3, audio/m4a, 
      // audio/mpeg, audio/mpga, audio/mp4, audio/ogg, audio/pcm, audio/wav, audio/webm
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
      // Note: The codec specification (e.g., ;codecs=opus) may need to be stripped
      // when sending to API if the API only accepts base MIME types

      try {
        const audioStream = new MediaStream(audioTracks);
        const mediaRecorder = new MediaRecorder(audioStream, {
          mimeType,
          audioBitsPerSecond: 16000
        });

        mediaRecorderRef.current = mediaRecorder;

        const audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (audioChunks.length > 0 && ws.readyState === WebSocket.OPEN) {
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              ws.send(JSON.stringify({
                type: 'audio_chunk',
                data: base64,
                mimeType: mimeType,
                timestamp: Date.now()
              }));
            };
            reader.readAsDataURL(audioBlob);
          }
          audioChunks.length = 0;
        };

        // Record in 1-second chunks
        const recordCycle = () => {
          if (mediaRecorder.state === 'inactive' && ws.readyState === WebSocket.OPEN) {
            mediaRecorder.start();
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                setTimeout(recordCycle, 100);
              }
            }, 1000);
          }
        };

        recordCycle();
      } catch (err) {
        console.error('Audio recording error:', err);
        setError('Audio recording failed');
      }
    }
  };

  const handleStopStreaming = () => {
    // Stop camera, mic, and WebSocket
    cleanup();
    
    // Explicitly stop all media tracks (video and audio)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      mediaStreamRef.current = null;
    }
    
    // Stop video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Reset to model selection screen
    setHasStarted(false);
    setIsConnected(false);
    setAiResponse('Select a model and click Start to begin');
    setError('');
    setSessionTime(0);
  };

  const handleLogout = () => {
    // End session and logout
    cleanup();
    sessionStorage.removeItem('authenticated');
    router.push('/');
  };

  const handleSwitchToLiveTalk = () => {
    cleanup();
    router.push('/live-talk');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Hidden Canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Overlay - AI Response */}
      <div className="absolute top-0 left-0 right-0 p-2 sm:p-3 md:p-4 bg-gradient-to-b from-black/90 to-transparent">
        <div className="bg-black/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10">
          {/* Connection Status */}
          {hasStarted && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-3 gap-1 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <span className="text-white/80 text-xs sm:text-sm font-medium">
                  {isConnected ? 'AI Connected' : 'Connecting...'}
                </span>
              </div>
              {isConnected && (
                <span className="text-white/60 text-xs sm:text-sm pl-5 sm:pl-0">
                  Session: {formatTime(sessionTime)}
                </span>
              )}
            </div>
          )}

          {/* Pre-Start Model Selection */}
          {!hasStarted && (
            <div className="mb-2 sm:mb-3">
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <h3 className="text-white text-base sm:text-lg font-semibold">AI Vision Setup</h3>
              </div>
              <p className="text-white/60 text-xs sm:text-sm mb-2 sm:mb-3">
                Select your preferred AI model before starting the session
              </p>
            </div>
          )}

          {/* Model Selection - Always visible before start */}
          {!hasStarted && (
            <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-black/80 rounded-lg sm:rounded-xl border border-white/20">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-white text-xs sm:text-sm font-semibold">Choose AI Model</h3>
              </div>
              <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full text-left p-2.5 sm:p-3 rounded-md sm:rounded-lg border transition-all ${
                      selectedModel === model.id
                        ? 'bg-gray-700/60 border-gray-600'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 active:bg-white/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="text-white text-xs sm:text-sm font-medium">{model.name}</span>
                          {model.recommended && (
                            <span className="px-1.5 py-0.5 bg-gray-600/50 border border-gray-500/50 rounded text-gray-300 text-[10px] sm:text-xs whitespace-nowrap">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-white/60 text-[10px] sm:text-xs mt-0.5 sm:mt-1">{model.description}</p>
                        <p className="text-white/40 text-[9px] sm:text-xs mt-0.5 sm:mt-1">{model.features}</p>
                      </div>
                      {selectedModel === model.id && (
                        <span className="text-gray-300 text-xs sm:text-sm font-bold flex-shrink-0">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-[10px] sm:text-xs mt-2 sm:mt-3 italic">
                Note: Experimental models work best with Realtime API
              </p>
            </div>
          )}

          {/* AI Response */}
          <div className="text-white">
            <p className="text-sm sm:text-base md:text-lg leading-relaxed font-light">
              {aiResponse}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 bg-red-500/20 border border-red-500/50 rounded-md sm:rounded-lg">
              <p className="text-red-300 text-xs sm:text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 md:p-4 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 md:gap-4 max-w-4xl mx-auto px-2">
          {!hasStarted ? (
            <>
              <button
                onClick={handleStart}
                className="w-full sm:w-auto px-8 sm:px-10 md:px-12 py-3 sm:py-3.5 md:py-4 bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-900 rounded-full font-semibold text-base sm:text-lg backdrop-blur-sm transition-all transform hover:scale-105 active:scale-95 shadow-lg"
              >
                Start AI Vision
              </button>
              <button
                onClick={handleSwitchToLiveTalk}
                className="w-full sm:w-auto px-6 sm:px-7 md:px-8 py-3 sm:py-3.5 md:py-4 bg-gray-700/60 hover:bg-gray-700 active:bg-gray-600 text-gray-100 rounded-full font-medium text-sm sm:text-base backdrop-blur-sm transition-all border border-gray-600"
              >
                Switch to Live Talk
              </button>
              <button
                onClick={handleLogout}
                className="w-full sm:w-auto px-6 sm:px-7 md:px-8 py-3 sm:py-3.5 md:py-4 bg-gray-700/60 hover:bg-gray-700 active:bg-gray-600 text-gray-100 rounded-full font-medium text-sm sm:text-base backdrop-blur-sm transition-all border border-gray-600"
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStopStreaming}
                className="w-full sm:w-auto px-6 sm:px-7 md:px-8 py-3 bg-gray-600 hover:bg-gray-500 active:bg-gray-400 text-white rounded-full font-medium text-sm sm:text-base backdrop-blur-sm transition-all transform hover:scale-105 active:scale-95"
              >
                Stop Camera & Mic
              </button>
              <button
                onClick={handleLogout}
                className="w-full sm:w-auto px-6 sm:px-7 md:px-8 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-100 rounded-full font-medium text-sm sm:text-base backdrop-blur-sm transition-all transform hover:scale-105 active:scale-95"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>

      {/* Auto-reconnect Notice */}
      {sessionTime >= 100 && sessionTime < 110 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-700 text-gray-100 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-sm sm:text-base border border-gray-600">
          Reconnecting in {110 - sessionTime} seconds...
        </div>
      )}
    </div>
  );
}
