'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveTalkPage() {
  const router = useRouter();
  const [aiResponse, setAiResponse] = useState('Select a model and click Start to begin');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const [hasStarted, setHasStarted] = useState(false);

  // Available models for audio interaction
  const availableModels = [
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      description: 'Latest experimental model - Best for real-time audio',
      features: 'Fast, multimodal audio processing',
      recommended: true
    },
    {
      id: 'gemini-1.5-flash-exp',
      name: 'Gemini 1.5 Flash (Experimental)',
      description: 'Stable experimental model - Good for audio tasks',
      features: 'Reliable audio processing',
      recommended: false
    },
    {
      id: 'gemini-1.5-pro-exp',
      name: 'Gemini 1.5 Pro (Experimental)',
      description: 'Advanced experimental model - Complex reasoning',
      features: 'Advanced audio understanding',
      recommended: false
    }
  ];

  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Check authentication
  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('authenticated')) {
      router.push('/');
    }
  }, [router]);

  // Cleanup function
  const cleanup = useCallback(() => {
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
    setAiResponse('Initializing microphone...');
    await initializeAudioAndAI();
  };

  const initializeAudioAndAI = async () => {
    try {
      // Request microphone permission only
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      mediaStreamRef.current = stream;
      connectWebSocket(stream);
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Please allow microphone access');
      setAiResponse('Microphone access required');
      setHasStarted(false);
    }
  };

  const connectWebSocket = (stream) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/gemini`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setError('');
      setAiResponse('AI is listening...');
      setSessionTime(0);

      // Send model selection and audio-only mode to server
      ws.send(JSON.stringify({
        type: 'model_selection',
        model: selectedModel,
        mode: 'audio_only'
      }));

      // Start session timer
      sessionTimerRef.current = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);

      // Start audio streaming
      startAudioStreaming(ws, stream);

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

  const startAudioStreaming = (ws, stream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

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
    cleanup();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      mediaStreamRef.current = null;
    }

    setHasStarted(false);
    setIsConnected(false);
    setAiResponse('Select a model and click Start to begin');
    setError('');
    setSessionTime(0);
  };

  const handleLogout = () => {
    cleanup();
    sessionStorage.removeItem('authenticated');
    router.push('/');
  };

  const handleBackToVision = () => {
    cleanup();
    router.push('/camera');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-screen w-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-0 right-0 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-2000"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-3 sm:p-4 md:p-6">

        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8 text-center px-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-1 sm:mb-2">
            Live Audio Talk
          </h1>
          <p className="text-white/70 text-sm sm:text-base md:text-lg">
            Audio-only AI conversation
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-2xl bg-black/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-white/20 shadow-2xl">

          {/* Connection Status */}
          {hasStarted && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-white/10 gap-2 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <span className="text-white/90 text-xs sm:text-sm font-medium">
                  {isConnected ? 'AI Connected' : 'Connecting...'}
                </span>
              </div>
              {isConnected && (
                <span className="text-white/60 text-xs sm:text-sm">
                  Session: {formatTime(sessionTime)}
                </span>
              )}
            </div>
          )}

          {/* Model Selection - Before Start */}
          {!hasStarted && (
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-white text-base sm:text-lg md:text-xl font-semibold">Choose AI Model</h3>
              </div>
              <p className="text-white/60 text-xs sm:text-sm mb-3 sm:mb-4">
                Select your preferred model for audio conversation
              </p>

              <div className="space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full text-left p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all ${
                      selectedModel === model.id
                        ? 'bg-blue-500/30 border-blue-400/50 shadow-lg'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 active:bg-white/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <span className="text-white text-sm sm:text-base font-medium">{model.name}</span>
                          {model.recommended && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-green-300 text-[10px] sm:text-xs whitespace-nowrap">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-white/70 text-xs sm:text-sm mb-0.5 sm:mb-1">{model.description}</p>
                        <p className="text-white/50 text-[10px] sm:text-xs">{model.features}</p>
                      </div>
                      {selectedModel === model.id && (
                        <span className="text-blue-400 text-base sm:text-lg ml-1 sm:ml-2 flex-shrink-0">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Response Display */}
          <div className="mb-4 sm:mb-6">
            <h3 className="text-white/70 text-xs sm:text-sm font-medium mb-2 sm:mb-3">AI Response</h3>
            <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-6 min-h-[150px] sm:min-h-[200px] border border-white/10">
              <p className="text-white text-sm sm:text-base md:text-lg leading-relaxed whitespace-pre-wrap">
                {aiResponse}
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-lg sm:rounded-xl">
              <p className="text-red-300 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 sm:gap-3">
            {!hasStarted ? (
              <>
                <button
                  onClick={handleStart}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:from-blue-800 active:to-purple-800 text-white rounded-full font-semibold text-base sm:text-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Start Live Talk
                </button>
                <button
                  onClick={handleBackToVision}
                  className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full font-medium text-sm sm:text-base transition-all border border-white/20"
                >
                  Switch to Vision
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full font-medium text-sm sm:text-base transition-all border border-white/20"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleStopStreaming}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-orange-500/80 hover:bg-orange-500 active:bg-orange-600 text-white rounded-full font-medium text-sm sm:text-base transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Stop Audio
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-red-500/80 hover:bg-red-500 active:bg-red-600 text-white rounded-full font-medium text-sm sm:text-base transition-all transform hover:scale-105 active:scale-95"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* Auto-reconnect Notice */}
        {sessionTime >= 100 && sessionTime < 110 && (
          <div className="mt-4 sm:mt-6 bg-yellow-500/90 text-black px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-medium text-sm sm:text-base">
            Reconnecting in {110 - sessionTime} seconds...
          </div>
        )}
      </div>
    </div>
  );
}
