'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PCM16AudioCapture } from '../lib/audio-capture';
import { PCM16AudioPlayer } from '../lib/audio-player';
import ProtectedRoute from '../components/ProtectedRoute';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import Chatbox from '../components/Chatbox';
import {
  saveO3ChatSession,
  updateO3ChatSession,
  loadO3ChatSessions,
  loadO3ChatSession,
  deleteO3ChatSession,
  generateChatTitle
} from '../lib/o3-chat-history';

function LiveTalkPageContent() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [aiResponse, setAiResponse] = useState('Select a model and click Start to begin');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const [hasStarted, setHasStarted] = useState(false);
  const [userTranscription, setUserTranscription] = useState(''); // Store user's spoken words
  const [isUserSpeaking, setIsUserSpeaking] = useState(false); // Track if user is speaking (OpenAI VAD)
  const [isChatMode, setIsChatMode] = useState(false); // Toggle between voice and chat
  const [chatMessages, setChatMessages] = useState([]); // Store chat messages
  const [tokenLimit, setTokenLimit] = useState(100000); // Token limit for o3 model (numeric) - max 1M
  const [isAiTyping, setIsAiTyping] = useState(false); // Track if AI is generating response

  // O3 Chat History State
  const [o3Sessions, setO3Sessions] = useState([]); // List of saved O3 chat sessions
  const [currentSessionId, setCurrentSessionId] = useState(null); // Current active session ID
  const [showSessionList, setShowSessionList] = useState(false); // Toggle session list panel
  const [lastFailedMessage, setLastFailedMessage] = useState(null); // Store last failed message for retry
  const [tokenUsage, setTokenUsage] = useState(null); // Track token usage for O3

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
    },
    {
      id: 'o3',
      name: 'OpenAI o3 (Chat Only)',
      description: 'Advanced reasoning model - Chat mode only',
      features: 'Superior reasoning, text & image processing, no voice support',
      recommended: false,
      requiresTokenLimit: true
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

  // Load O3 chat sessions when user changes or model is O3
  useEffect(() => {
    if (user && selectedModel === 'o3') {
      loadO3ChatSessions(user.uid).then(sessions => {
        setO3Sessions(sessions);
      });
    }
  }, [user, selectedModel]);

  // Helper function to sanitize messages for Firestore storage
  // Removes large base64 image data and blob URLs to save space
  const sanitizeMessagesForStorage = (messages) => {
    return messages.map(msg => {
      const sanitizedMsg = {
        role: msg.role,
        text: msg.text || '',
        timestamp: msg.timestamp
      };

      // Keep token usage for AI messages
      if (msg.usage) {
        sanitizedMsg.usage = msg.usage;
      }

      // Keep file metadata but remove base64/blob data
      if (msg.files && msg.files.length > 0) {
        sanitizedMsg.files = msg.files.map(file => ({
          name: file.name,
          type: file.type,
          // Don't save preview (blob URL) or base64Data - they're too large
          hadImage: file.preview ? true : false
        }));
        sanitizedMsg.imageCount = msg.files.filter(f => f.type?.startsWith('image/')).length;
      }

      return sanitizedMsg;
    });
  };

  // Save O3 chat session whenever messages change (for O3 only)
  useEffect(() => {
    if (selectedModel === 'o3' && user && chatMessages.length > 0 && hasStarted) {
      // Debug: Log user info
      console.log('[Save Debug] User:', user?.uid, user?.email);

      // Debounce saving to avoid too many writes
      const saveTimeout = setTimeout(async () => {
        try {
          // Sanitize messages before saving (remove large image data)
          const sanitizedMessages = sanitizeMessagesForStorage(chatMessages);

          console.log('[Save Debug] Saving with userId:', user.uid);

          if (currentSessionId) {
            // Update existing session
            await updateO3ChatSession(currentSessionId, sanitizedMessages);
          } else {
            // Create new session with first user message as title
            const firstUserMessage = chatMessages.find(m => m.role === 'user');
            const title = generateChatTitle(firstUserMessage?.text);
            console.log('[Save Debug] Creating new session:', { userId: user.uid, title });
            const sessionId = await saveO3ChatSession(user.uid, title, sanitizedMessages);
            setCurrentSessionId(sessionId);
          }
        } catch (error) {
          console.error('Failed to save O3 chat session:', error);
        }
      }, 1000); // Wait 1 second before saving

      return () => clearTimeout(saveTimeout);
    }
  }, [chatMessages, selectedModel, user, currentSessionId, hasStarted]);

  // Load a specific O3 chat session
  const handleLoadO3Session = async (sessionId) => {
    try {
      const session = await loadO3ChatSession(sessionId);
      if (session) {
        setChatMessages(session.messages || []);
        setCurrentSessionId(sessionId);
        setShowSessionList(false);
        setHasStarted(true);
        setIsChatMode(true);
        setAiResponse('Loaded previous conversation');
      }
    } catch (error) {
      console.error('Failed to load O3 session:', error);
      setError('Failed to load chat session');
    }
  };

  // Start a new O3 chat session
  const handleNewO3Session = () => {
    setChatMessages([]);
    setCurrentSessionId(null);
    setShowSessionList(false);
  };

  // Delete an O3 chat session
  const handleDeleteO3Session = async (sessionId, e) => {
    e.stopPropagation(); // Prevent triggering load when clicking delete
    try {
      await deleteO3ChatSession(sessionId);
      setO3Sessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setChatMessages([]);
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to delete O3 session:', error);
      setError('Failed to delete chat session');
    }
  };

  // Edit a message and resubmit from that point
  const handleEditMessage = async (messageIndex, newText, files) => {
    // Remove all messages from this index onwards (this message and all following)
    const messagesBeforeEdit = chatMessages.slice(0, messageIndex);
    setChatMessages(messagesBeforeEdit);

    // Send the edited message
    const editedMessageData = {
      text: newText,
      files: files || []
    };

    // Small delay to ensure state is updated
    setTimeout(() => {
      handleSendChatMessage(editedMessageData);
    }, 100);
  };

  // Retry from a specific message (resend that message)
  const handleRetryMessage = async (messageIndex) => {
    const messageToRetry = chatMessages[messageIndex];
    if (!messageToRetry || messageToRetry.role !== 'user') return;

    // Remove all messages from this index onwards
    const messagesBeforeRetry = chatMessages.slice(0, messageIndex);
    setChatMessages(messagesBeforeRetry);

    // Resend the message
    const retryMessageData = {
      text: messageToRetry.text || '',
      files: messageToRetry.files || []
    };

    // Small delay to ensure state is updated
    setTimeout(() => {
      handleSendChatMessage(retryMessageData);
    }, 100);
  };

  const handleStart = async () => {
    setHasStarted(true);

    // For o3 model, use simple API calls (no WebSocket needed for chat-only)
    if (selectedModel === 'o3') {
      setIsChatMode(true); // Automatically switch to chat mode for o3
      setIsConnected(true); // Ready immediately (no connection needed)
      setAiResponse('Ready to chat with o3');
      setTokenUsage(null); // Reset token usage for new session
      return;
    }

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

      // Start audio streaming (skip for o3 model)
      if (stream) {
        startAudioStreaming(ws, stream);
      }

      // Auto-reconnect before session limit (NOT for o3 chat - would lose conversation history)
      // Note: Free tier has 200 requests/day limit. Reconnecting every 8 minutes = ~180 requests/day
      // This stays safely within free tier limits
      // SKIP for o3 or chat mode to maintain conversation history
      if (selectedModel !== 'o3' && !isChatMode) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Auto-reconnecting to maintain session...');
          ws.close();
          connectWebSocket(stream);
        }, 480000); // 8 minutes (480 seconds) to stay within free tier 200 RPD limit
      }
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

        // Handle chat message response
        if (data.type === 'chat_response') {
          const aiMessage = {
            role: 'assistant',
            text: data.text,
            timestamp: Date.now()
          };
          setChatMessages(prev => [...prev, aiMessage]);
          setIsAiTyping(false); // AI finished typing
        }

        // Handle AI response text (for voice mode)
        if (data.text && data.type !== 'chat_response') {
          setAiResponse(data.text);
        }

        if (data.error) {
          setError(data.error);
          setIsAiTyping(false); // Stop typing indicator on error
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
    // Stop audio streams but keep WebSocket connection for chat
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
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track`);
      });
      mediaStreamRef.current = null;
    }

    // Switch to chat mode and keep session active
    setIsChatMode(true);
    setAiResponse('Audio stopped - Continue chatting via text');
    setUserTranscription('');
    setIsUserSpeaking(false);
  };

  const handleEndSession = () => {
    // Completely end the session
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
    setIsChatMode(false);
    setChatMessages([]);
    setIsAiTyping(false);
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

  const handleSendChatMessage = async (messageData) => {
    // Helper function to compress image for O3 (max 1536px, JPEG 80% quality)
    // Optimized for 7-8 high-res phone photos (e.g., 50MP cameras)
    const compressImageForO3 = (file) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions (max 1536px on longest side - optimal for O3)
          const maxSize = 1536;
          let width = img.width;
          let height = img.height;

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG at 80% quality for smaller size (optimal for multiple images)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
          const base64 = dataUrl.split(',')[1];

          resolve({
            name: file.name,
            type: 'image/jpeg',
            data: base64
          });
        };
        img.onerror = () => {
          // Fallback to original if image loading fails
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              name: file.name,
              type: file.type,
              data: reader.result.split(',')[1]
            });
          };
          reader.readAsDataURL(file.file);
        };
        img.src = file.preview || URL.createObjectURL(file.file);
      });
    };

    // Convert files to base64 (with compression for O3)
    const filesData = await Promise.all(
      messageData.files.map(async (fileObj) => {
        // For O3 model, compress images
        if (selectedModel === 'o3' && fileObj.type.startsWith('image/')) {
          return compressImageForO3(fileObj);
        }

        // For other models/files, use original
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              name: fileObj.name,
              type: fileObj.type,
              data: reader.result.split(',')[1] // Get base64 data
            });
          };
          reader.readAsDataURL(fileObj.file);
        });
      })
    );

    // Add user message to chat
    const userMessage = {
      role: 'user',
      text: messageData.text,
      files: messageData.files,
      timestamp: Date.now()
    };

    // Get current conversation history (includes the new message we're about to send)
    const updatedChatMessages = [...chatMessages, userMessage];
    setChatMessages(updatedChatMessages);

    // Show AI typing indicator
    setIsAiTyping(true);

    // For o3 model, use simple API call (no WebSocket)
    if (selectedModel === 'o3') {
      try {
        // Validate API key exists
        const openaiApiKey = sessionStorage.getItem('openai_api_key');
        if (!openaiApiKey) {
          setError('OpenAI API key not configured. Please set it in Settings.');
          setIsAiTyping(false);
          return;
        }

        // Build messages array for OpenAI API
        const messages = updatedChatMessages.map((msg, index) => {
          const isCurrentMessage = index === updatedChatMessages.length - 1;
          const messageContent = [];

          if (msg.text) {
            messageContent.push({ type: 'text', text: msg.text });
          }

          // Add images only for current message (not history)
          if (isCurrentMessage && msg.role === 'user' && filesData.length > 0) {
            for (const file of filesData) {
              if (file.type.startsWith('image/')) {
                messageContent.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${file.type};base64,${file.data}`,
                    detail: 'high' // Use high detail for better understanding
                  }
                });
              }
            }
          }

          return {
            role: msg.role,
            content: messageContent.length === 1 && !isCurrentMessage ? messageContent[0].text : messageContent
          };
        });

        // Call API route for o3 reasoning - no client-side timeout, let it take as long as needed
        // o3 can take several minutes depending on complexity and reasoning_effort

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages,
              model: selectedModel,
              apiKey: openaiApiKey,
              tokenLimit: tokenLimit
            })
          });



          // Check HTTP status
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.error) {
            setError(data.error);
            setIsAiTyping(false);
            return;
          }

          // Track token usage
          if (data.usage) {
            setTokenUsage(prev => ({
              prompt_tokens: (prev?.prompt_tokens || 0) + (data.usage.prompt_tokens || 0),
              completion_tokens: (prev?.completion_tokens || 0) + (data.usage.completion_tokens || 0),
              total_tokens: (prev?.total_tokens || 0) + (data.usage.total_tokens || 0),
              last_request: data.usage
            }));
          }

          // Add AI response to chat
          const aiMessage = {
            role: 'assistant',
            text: data.text,
            timestamp: Date.now(),
            usage: data.usage // Store usage with message
          };
          setChatMessages(prev => [...prev, aiMessage]);
          setIsAiTyping(false);
          setLastFailedMessage(null); // Clear on success

        } catch (fetchError) {
          throw fetchError;
        }

      } catch (error) {
        console.error('API call error:', error);
        setError(error.message || 'Failed to send message');
        setLastFailedMessage(messageData); // Save for retry
        setIsAiTyping(false);
      }
      return;
    }

    // For other models (voice mode), check WebSocket connection
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to AI');
      setIsAiTyping(false);
      return;
    }

    // Build conversation history for server WITHOUT file data (only text and metadata)
    // This prevents sending all previous images with every new message
    const conversationHistory = updatedChatMessages.map(msg => {
      const historyMsg = {
        role: msg.role,
        text: msg.text
      };

      // Only include file metadata (not actual file data) for history
      if (msg.role === 'user' && msg.files && msg.files.length > 0) {
        historyMsg.fileCount = msg.files.length;
        historyMsg.fileNames = msg.files.map(f => f.name).join(', ');
      }

      return historyMsg;
    }).filter(msg => msg.role === 'user' || msg.role === 'assistant');

    // Send to server via WebSocket with full conversation history (text only) + current message files
    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      text: messageData.text,
      files: filesData, // Only current message files with base64 data
      model: selectedModel,
      tokenLimit: tokenLimit,
      conversationHistory: conversationHistory, // Text-only history without file data
      timestamp: Date.now()
    }));
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
        <div className={`w-full max-w-4xl lg:max-w-6xl xl:max-w-7xl bg-gray-800/50 backdrop-blur-xl rounded-none sm:rounded-3xl p-0 sm:p-4 border-0 sm:border border-gray-700/50 shadow-none sm:shadow-2xl ${hasStarted ? 'h-[100dvh] sm:h-[calc(100vh-40px)] flex flex-col' : ''}`}>

          {/* Connection Status */}
          {hasStarted && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gray-700 gap-2 sm:gap-0 flex-shrink-0 pt-2 sm:pt-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full ${isConnected ? 'bg-gray-300' : 'bg-gray-500'} animate-pulse`} />
                <span className="text-gray-200 text-xs sm:text-sm font-medium">
                  {isConnected ? 'AI Connected' : 'Connecting...'}
                </span>
                {selectedProvider === 'openai' && isUserSpeaking && !isChatMode && (
                  <span className="text-blue-400 text-xs sm:text-sm font-medium flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    Speaking...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isConnected && (
                  <span className="text-gray-400 text-xs sm:text-sm">
                    Session: {formatTime(sessionTime)}
                  </span>
                )}
                {/* Chat/Voice Toggle Button - Hidden for o3 (chat-only) */}
                {selectedModel !== 'o3' && (
                  <button
                    onClick={() => setIsChatMode(!isChatMode)}
                    className={`p-2 rounded-full transition-all ${isChatMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700/60 text-gray-300 hover:bg-gray-600/60'
                      }`}
                    title={isChatMode ? 'Switch to Voice Mode' : 'Switch to Chat Mode'}
                  >
                    {isChatMode ? (
                      // Mic icon (for switching back to voice)
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      // Chat icon
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" />
                      </svg>
                    )}
                  </button>
                )}
                {/* o3 Chat-Only Indicator */}
                {selectedModel === 'o3' && (
                  <span className="text-xs text-blue-400 font-medium">Chat Mode</span>
                )}
                {/* Token Usage Display for O3 */}
                {selectedModel === 'o3' && tokenUsage && (
                  <div
                    className="flex items-center gap-2 text-xs text-gray-400 cursor-help"
                    title={`Session Total - Input: ${tokenUsage.prompt_tokens?.toLocaleString() || 0} ($${((tokenUsage.prompt_tokens || 0) * 0.000002).toFixed(4)}) | Output: ${tokenUsage.completion_tokens?.toLocaleString() || 0} ($${((tokenUsage.completion_tokens || 0) * 0.000008).toFixed(4)})`}
                  >
                    <span>🎯 ~${((tokenUsage.prompt_tokens || 0) * 0.000002 + (tokenUsage.completion_tokens || 0) * 0.000008).toFixed(4)}</span>
                  </div>
                )}
              </div>
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
                    className={`flex-1 p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all ${selectedProvider === provider.id
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
                    className={`w-full text-left p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all ${selectedModel === model.id
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

          {/* Token Limit Input - For o3 model only */}
          {!hasStarted && selectedModel === 'o3' && (
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-white text-base sm:text-lg md:text-xl font-semibold">Token Limit</h3>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm mb-3 sm:mb-4">
                Enter the maximum reasoning tokens for o3 model (recommended: 20,000 - 100,000, max: 1,000,000)
              </p>

              <div className="space-y-3">
                <input
                  type="number"
                  value={tokenLimit}
                  onChange={(e) => setTokenLimit(parseInt(e.target.value) || 0)}
                  min="1000"
                  max="1000000"
                  step="1000"
                  className="w-full px-4 py-3 bg-gray-700/40 border border-gray-600/50 rounded-xl text-white text-base sm:text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter token limit..."
                />

                {/* Quick presets */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setTokenLimit(20000)}
                    className="px-3 py-1.5 bg-gray-700/40 hover:bg-gray-600/40 border border-gray-600/50 rounded-lg text-gray-300 text-xs sm:text-sm transition-all"
                  >
                    20K (Low)
                  </button>
                  <button
                    onClick={() => setTokenLimit(65000)}
                    className="px-3 py-1.5 bg-gray-700/40 hover:bg-gray-600/40 border border-gray-600/50 rounded-lg text-gray-300 text-xs sm:text-sm transition-all"
                  >
                    65K (Medium)
                  </button>
                  <button
                    onClick={() => setTokenLimit(100000)}
                    className="px-3 py-1.5 bg-gray-700/40 hover:bg-gray-600/40 border border-gray-600/50 rounded-lg text-gray-300 text-xs sm:text-sm transition-all"
                  >
                    100K (High)
                  </button>
                </div>

                {/* Validation message */}
                {tokenLimit < 1000 && (
                  <p className="text-red-400 text-xs">Token limit should be at least 1,000</p>
                )}
                {tokenLimit > 500000 && (
                  <p className="text-yellow-400 text-xs">⚠️ Very high token limit - may be expensive</p>
                )}
              </div>
            </div>
          )}

          {/* Chat Mode - Show Chatbox */}
          {hasStarted && isChatMode ? (
            <div className="mb-0 sm:mb-6 flex-1 min-h-0">
              <Chatbox
                messages={chatMessages}
                onSendMessage={handleSendChatMessage}
                onEditMessage={handleEditMessage}
                onRetryMessage={handleRetryMessage}
                isConnected={isConnected}
                isLoading={isAiTyping}
                // Chat history props for O3
                chatSessions={selectedModel === 'o3' ? o3Sessions : []}
                currentSessionId={currentSessionId}
                onLoadSession={handleLoadO3Session}
                onNewSession={handleNewO3Session}
                onDeleteSession={handleDeleteO3Session}
                showHistoryButton={selectedModel === 'o3' && user}
              />
            </div>
          ) : (
            <>
              {/* Voice Mode - User Transcription */}
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

              {/* Voice Mode - AI Response Display */}
              {hasStarted && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-gray-400 text-xs sm:text-sm lg:text-base font-medium mb-2 sm:mb-3">AI Response</h3>
                  <div className="bg-gradient-to-br from-gray-700/40 to-gray-800/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 min-h-[150px] sm:min-h-[200px] lg:min-h-[250px] border border-gray-700/50">
                    <p className="text-gray-100 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed whitespace-pre-wrap">
                      {aiResponse}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error Display with Retry */}
          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-900/30 border border-red-600/50 rounded-lg sm:rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-red-300 text-xs sm:text-sm flex-1">{error}</p>
                {lastFailedMessage && selectedModel === 'o3' && (
                  <button
                    onClick={async () => {
                      setError('');
                      // Remove the failed user message from chat
                      setChatMessages(prev => prev.slice(0, -1));
                      // Retry sending the message
                      await handleSendChatMessage(lastFailedMessage);
                      setLastFailedMessage(null);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                )}
                <button
                  onClick={() => {
                    setError('');
                    setLastFailedMessage(null);
                  }}
                  className="text-red-400 hover:text-red-300 p-1"
                  title="Dismiss"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
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
                {/* Stop Audio button - only show in voice mode */}
                {!isChatMode && selectedModel !== 'o3' && (
                  <button
                    onClick={handleStopStreaming}
                    className="w-full sm:w-auto px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-full font-semibold text-sm sm:text-base lg:text-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                  >
                    Stop Audio
                  </button>
                )}
                {/* End Session button */}
                <button
                  onClick={handleEndSession}
                  className="w-full sm:w-auto px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-full font-semibold text-sm sm:text-base lg:text-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  End Session
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
