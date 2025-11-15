'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PCM16AudioCapture } from '../lib/audio-capture';
import { PCM16AudioPlayer } from '../lib/audio-player';
import ProtectedRoute from '../components/ProtectedRoute';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';

function LiveTalkPageContent() {
  const router = useRouter();
  const { logout } = useAuth();
  const [aiResponse, setAiResponse] = useState('Select a model and click Start to begin');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const [hasStarted, setHasStarted] = useState(false);
  const [userTranscription, setUserTranscription] = useState(''); // Store user's spoken words
  const [isUserSpeaking, setIsUserSpeaking] = useState(false); // Track if user is speaking (OpenAI VAD)

  // Available AI providers
  const availableProviders = [
    { id: 'gemini', name: 'Google Gemini', description: 'Gemini Realtime API' },
    { id: 'openai', name: 'OpenAI', description: 'OpenAI Realtime API' }
  ];

  // Available models for Gemini
  const geminiModels = [
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

  // Available models for OpenAI
  const openaiModels = [
    {
      id: 'gpt-4o-realtime-preview-2024-10-01',
      name: 'GPT-4o Realtime',
      description: 'Production-ready realtime audio model',
      features: 'Speech-to-speech, audio transcription',
      recommended: true
    },
    {
      id: 'gpt-4o-mini-realtime-preview-2024-12-17',
      name: 'GPT-4o Mini Realtime',
      description: 'Lighter & cheaper realtime model',
      features: 'Fast audio processing, cost-effective',
      recommended: false
    }
  ];

  // Get current available models based on provider
  const availableModels = selectedProvider === 'openai' ? openaiModels : geminiModels;

  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pcm16CaptureRef = useRef(null); // For OpenAI PCM16 audio capture
  const audioPlayerRef = useRef(null); // For OpenAI audio playback

  // Cleanup function
  const cleanup = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (pcm16CaptureRef.current) {
      pcm16CaptureRef.current.stop();
      pcm16CaptureRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.close();
      audioPlayerRef.current = null;
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
    // Determine WebSocket URL based on provider
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsEndpoint = selectedProvider === 'openai' ? '/ws/openai' : '/ws/gemini';
    const wsUrl = `${protocol}//${window.location.host}${wsEndpoint}`;

    console.log('Connecting to WebSocket:', wsUrl, 'Provider:', selectedProvider);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setError('');
      setAiResponse('AI is listening...');
      setSessionTime(0);

      // Get API keys from sessionStorage
      const geminiApiKey = sessionStorage.getItem('gemini_api_key');
      const openaiApiKey = sessionStorage.getItem('openai_api_key');

      // Send model selection and audio-only mode to server with API key
      const modelSelection = {
        type: 'model_selection',
        model: selectedModel,
        mode: 'audio_only'
      };

      // Add appropriate API key based on provider
      if (selectedProvider === 'gemini') {
        modelSelection.apiKey = geminiApiKey;
      } else if (selectedProvider === 'openai') {
        modelSelection.apiKey = openaiApiKey;
      }

      ws.send(JSON.stringify(modelSelection));

      // Start session timer
      sessionTimerRef.current = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);

      // Start audio streaming
      startAudioStreaming(ws, stream);

      // Auto-reconnect before session limit
      // Note: Free tier has 200 requests/day limit. Reconnecting every 8 minutes = ~180 requests/day
      // This stays safely within free tier limits
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Auto-reconnecting to maintain session...');
        ws.close();
        connectWebSocket(stream);
      }, 480000); // 8 minutes (480 seconds) to stay within free tier 200 RPD limit
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle user speech detection (OpenAI VAD)
        if (data.type === 'user_speaking_started') {
          setIsUserSpeaking(true);
        }

        if (data.type === 'user_speaking_stopped') {
          setIsUserSpeaking(false);
        }

        // Handle user transcription (what user said)
        if (data.type === 'user_transcription' && data.transcription) {
          setUserTranscription(data.transcription);
        }

        // Handle AI audio response (OpenAI voice)
        if (data.type === 'audio_response_delta' && data.audio) {
          if (!audioPlayerRef.current) {
            audioPlayerRef.current = new PCM16AudioPlayer();
            await audioPlayerRef.current.initialize();
          }
          audioPlayerRef.current.addChunk(data.audio);
        }

        if (data.type === 'audio_response_complete') {
          console.log('AI finished speaking');
        }

        // Handle AI response text
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

      // Auto-reconnect after 3 seconds (only if media stream still active)
      if (mediaStreamRef.current) {
        setTimeout(() => {
          connectWebSocket(mediaStreamRef.current);
        }, 3000);
      }
    };
  };

  const startAudioStreaming = (ws, stream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      if (selectedProvider === 'openai') {
        // Use PCM16 audio capture for OpenAI
        try {
          pcm16CaptureRef.current = new PCM16AudioCapture(
            stream,
            (base64Audio) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'audio_chunk',
                  data: base64Audio,
                  format: 'pcm16',
                  timestamp: Date.now()
                }));
              }
            },
            (error) => {
              console.error('PCM16 capture error:', error);
              setError('Audio capture failed');
            }
          );
        } catch (err) {
          console.error('Failed to initialize PCM16 capture:', err);
          setError('Audio capture initialization failed');
        }
      } else {
        // Use MediaRecorder for Gemini (supports WebM)
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

  const handleLogout = async () => {
    cleanup();
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
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
    <div className="relative min-h-screen w-screen bg-gradient-to-br from-gray-900 via-slate-900 to-zinc-900 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-gray-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
        <div className="absolute top-0 right-0 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-slate-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-zinc-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-3 sm:p-4 md:p-6 lg:p-8">

        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8 lg:mb-10 text-center px-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-1 sm:mb-2 lg:mb-3">
            Live Audio Talk
          </h1>
          <p className="text-gray-400 text-sm sm:text-base md:text-lg lg:text-xl">
            Audio-only AI conversation
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-gray-800/50 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-10 border border-gray-700/50 shadow-2xl">

          {/* Connection Status */}
          {hasStarted && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gray-700 gap-2 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full ${isConnected ? 'bg-gray-300' : 'bg-gray-500'} animate-pulse`} />
                <span className="text-gray-200 text-xs sm:text-sm font-medium">
                  {isConnected ? 'AI Connected' : 'Connecting...'}
                </span>
                {selectedProvider === 'openai' && isUserSpeaking && (
                  <span className="text-blue-400 text-xs sm:text-sm font-medium flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    Speaking...
                  </span>
                )}
              </div>
              {isConnected && (
                <span className="text-gray-400 text-xs sm:text-sm">
                  Session: {formatTime(sessionTime)}
                </span>
              )}
            </div>
          )}

          {/* Provider Selection - Before Start */}
          {!hasStarted && (
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-white text-base sm:text-lg md:text-xl font-semibold">Choose AI Provider</h3>
              </div>
              <div className="flex gap-2 sm:gap-3 mb-4">
                {availableProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      // Set default model for the provider
                      if (provider.id === 'openai') {
                        setSelectedModel('gpt-4o-realtime-preview-2024-10-01');
                      } else {
                        setSelectedModel('gemini-2.0-flash-exp');
                      }
                    }}
                    className={`flex-1 p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all ${
                      selectedProvider === provider.id
                        ? 'bg-gray-700/60 border-gray-600 shadow-lg'
                        : 'bg-gray-800/30 border-gray-700/50 hover:bg-gray-700/40 active:bg-gray-700/50'
                    }`}
                  >
                    <div className="text-white text-sm sm:text-base font-medium">{provider.name}</div>
                    <div className="text-gray-400 text-xs sm:text-sm mt-0.5">{provider.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model Selection - Before Start */}
          {!hasStarted && (
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-white text-base sm:text-lg md:text-xl font-semibold">Choose AI Model</h3>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm mb-3 sm:mb-4">
                Select your preferred model for audio conversation
              </p>

              <div className="space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full text-left p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all ${
                      selectedModel === model.id
                        ? 'bg-gray-700/60 border-gray-600 shadow-lg'
                        : 'bg-gray-800/30 border-gray-700/50 hover:bg-gray-700/40 active:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <span className="text-white text-sm sm:text-base font-medium">{model.name}</span>
                          {model.recommended && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-gray-600/50 border border-gray-500/50 rounded text-gray-300 text-[10px] sm:text-xs whitespace-nowrap">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-gray-300 text-xs sm:text-sm mb-0.5 sm:mb-1">{model.description}</p>
                        <p className="text-gray-400 text-[10px] sm:text-xs">{model.features}</p>
                      </div>
                      {selectedModel === model.id && (
                        <span className="text-gray-300 text-base sm:text-lg ml-1 sm:ml-2 flex-shrink-0">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User Transcription - Show what user is saying */}
          {hasStarted && userTranscription && (
            <div className="mb-4 sm:mb-6">
              <h3 className="text-blue-300 text-xs sm:text-sm font-medium mb-2 sm:mb-3">YOU SAID:</h3>
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <p className="text-blue-100 text-sm sm:text-base md:text-lg leading-relaxed whitespace-pre-wrap">
                  {userTranscription}
                </p>
              </div>
            </div>
          )}

          {/* AI Response Display */}
          <div className="mb-4 sm:mb-6">
            <h3 className="text-gray-400 text-xs sm:text-sm lg:text-base font-medium mb-2 sm:mb-3">AI Response</h3>
            <div className="bg-gradient-to-br from-gray-700/40 to-gray-800/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 min-h-[150px] sm:min-h-[200px] lg:min-h-[250px] border border-gray-700/50">
              <p className="text-gray-100 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed whitespace-pre-wrap">
                {aiResponse}
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-700/40 border border-gray-600/50 rounded-lg sm:rounded-xl">
              <p className="text-gray-300 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 sm:gap-3 lg:gap-4">
            {!hasStarted ? (
              <>
                <button
                  onClick={handleStart}
                  className="w-full sm:w-auto px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 bg-white hover:bg-gray-100 active:bg-gray-200 text-gray-900 rounded-full font-semibold text-base sm:text-lg lg:text-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Start Live Talk
                </button>
                <button
                  onClick={handleBackToVision}
                  className="w-full sm:w-auto px-5 sm:px-6 lg:px-8 py-3 sm:py-3.5 lg:py-4 bg-gray-700/60 hover:bg-gray-700 active:bg-gray-600 text-gray-100 rounded-full font-medium text-sm sm:text-base lg:text-lg transition-all border border-gray-600 shadow-lg"
                >
                  Switch to Vision
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full sm:w-auto px-5 sm:px-6 lg:px-8 py-3 sm:py-3.5 lg:py-4 bg-gray-700/60 hover:bg-gray-700 active:bg-gray-600 text-gray-100 rounded-full font-medium text-sm sm:text-base lg:text-lg transition-all border border-gray-600 shadow-lg"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleStopStreaming}
                  className="w-full sm:w-auto px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-full font-semibold text-sm sm:text-base lg:text-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Stop Audio
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full sm:w-auto px-5 sm:px-6 lg:px-8 py-3 sm:py-3.5 lg:py-4 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-100 rounded-full font-medium text-sm sm:text-base lg:text-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* Auto-reconnect Notice */}
        {sessionTime >= 470 && sessionTime < 480 && (
          <div className="mt-4 sm:mt-6 bg-gray-700 text-gray-100 px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-medium text-sm sm:text-base border border-gray-600">
            Reconnecting in {480 - sessionTime} seconds...
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveTalkPage() {
  return (
    <ProtectedRoute>
      <Header />
      <LiveTalkPageContent />
    </ProtectedRoute>
  );
}
