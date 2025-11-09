const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { WebSocket } = require('ws');
const OpenAI = require('openai');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store active connections
const activeConnections = new Map();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wssGemini = new WebSocketServer({ noServer: true });
  const wssOpenAI = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);

    if (pathname === '/ws/gemini') {
      wssGemini.handleUpgrade(request, socket, head, (ws) => {
        wssGemini.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/openai') {
      wssOpenAI.handleUpgrade(request, socket, head, (ws) => {
        wssOpenAI.emit('connection', ws, request);
      });
    } else {
      // Next.js HMR WebSocket won't work with custom server
      // This is expected - HMR is disabled when using custom server
      // The app's WebSockets (/ws/gemini, /ws/openai) will work fine
      socket.destroy();
    }
  });

  // Gemini WebSocket Handler
  wssGemini.on('connection', (clientWs) => {
    const connectionId = Date.now().toString();
    console.log(`Gemini client connected: ${connectionId}`);
    
    // Reset model index for each new connection
    let currentModelIndex = 0;
    const modelAttempts = [
      'models/gemini-2.0-flash-exp', // Experimental model (Realtime API typically requires exp models)
      'models/gemini-2.0-flash-001', // Versioned GA model
      'models/gemini-2.0-flash', // GA model
      'models/gemini-1.5-flash-exp' // Fallback experimental model
    ];

    // Initialize Gemini connection
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

    let geminiWs = null;
    let isGeminiReady = false;
    let messageBuffer = [];
    let userSelectedModel = null; // Store user's model selection
    let hasReceivedModelSelection = false;
    let isAudioOnlyMode = false; // Track if this is audio-only mode

    // Helper function to normalize MIME type (remove codec specifications)
    const normalizeMimeType = (mimeType) => {
      if (!mimeType) return 'audio/webm';
      // Remove codec specifications (e.g., 'audio/webm;codecs=opus' -> 'audio/webm')
      return mimeType.split(';')[0].trim();
    };

    // Helper function to transform client messages to Gemini format
    const transformMessageForGemini = (data) => {
      if (data.type === 'video_frame') {
        return {
          realtime_input: {
            media_chunks: [{
              mime_type: 'image/jpeg',
              data: data.data
            }]
          }
        };
      } else if (data.type === 'audio_chunk') {
        // Supported audio MIME types for Gemini 2.0 Flash:
        // audio/x-aac, audio/flac, audio/mp3, audio/m4a, audio/mpeg, 
        // audio/mpga, audio/mp4, audio/ogg, audio/pcm, audio/wav, audio/webm
        // Note: For Live API native audio (gemini-live-2.5-flash-preview-native-audio-09-2025),
        // use Raw 16-bit PCM audio at 16kHz, little-endian
        return {
          realtime_input: {
            media_chunks: [{
              mime_type: normalizeMimeType(data.mimeType),
              data: data.data
            }]
          }
        };
      } else if (data.type === 'text') {
        return {
          client_content: {
            turn: {
              role: 'user',
              parts: [{ text: data.text }]
            }
          }
        };
      }
      return null;
    };

    const connectToGemini = () => {
      geminiWs = new WebSocket(geminiUrl);

      geminiWs.on('open', () => {
        console.log('Connected to Gemini API');

        // Send setup configuration
        // Note: Realtime API (BidiGenerateContent) uses v1alpha endpoint which may only support experimental models
        // Try experimental model first, then fallback to versioned GA model
        const currentModel = modelAttempts[currentModelIndex];
        console.log(`Attempting to use model: ${currentModel}`);
        
        const setupConfig = {
          setup: {
            model: currentModel,
            generation_config: {
              response_modalities: ['TEXT'], // For Live API native audio, use ['TEXT', 'AUDIO']
              temperature: 1.0, // Default: 1.0 (range: 0.0-2.0)
              top_p: 0.95, // Default: 0.95 (range: 0.0-1.0)
              top_k: 64, // Fixed at 64 per documentation
              max_output_tokens: 8192 // Maximum: 8,192 (default)
            }
          }
        };

        geminiWs.send(JSON.stringify(setupConfig));
      });

      geminiWs.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());

          // Handle setup errors
          if (response.error) {
            const errorMessage = response.error.message || JSON.stringify(response.error);
            console.error(`Setup error: ${errorMessage}`);
            
            // Check if it's a model-related error
            if (errorMessage.includes('not found') || errorMessage.includes('not supported') || errorMessage.includes('invalid model')) {
              currentModelIndex++;
              if (currentModelIndex < modelAttempts.length) {
                console.log(`Model ${modelAttempts[currentModelIndex - 1]} failed, trying next: ${modelAttempts[currentModelIndex]}`);
                // Close current connection and try next model
                geminiWs.close();
                setTimeout(() => {
                  if (activeConnections.has(connectionId)) {
                    connectToGemini();
                  }
                }, 1000);
                return;
              } else {
                clientWs.send(JSON.stringify({
                  error: 'Model not supported',
                  text: 'All model attempts failed. Realtime API may require experimental models.'
                }));
                return;
              }
            }
          }

          // Handle setup complete
          if (response.setupComplete) {
            console.log(`Gemini setup complete with model: ${modelAttempts[currentModelIndex]}`);
            isGeminiReady = true;

            // Send initial prompt based on mode
            const initialPrompt = isAudioOnlyMode
              ? 'You are an AI assistant that can hear through the microphone. Listen to what I say and respond in a conversational, helpful manner. Keep responses clear and concise.'
              : 'You are an AI assistant that can see through the camera and hear through the microphone. Describe what you observe and respond to any sounds or speech you hear. Keep responses concise and helpful.';

            geminiWs.send(JSON.stringify({
              client_content: {
                turn: {
                  role: 'user',
                  parts: [{
                    text: initialPrompt
                  }]
                }
              }
            }));

            const welcomeMessage = isAudioOnlyMode
              ? 'AI Audio Active - I can hear you now!'
              : 'AI Vision Active - I can see and hear you now!';

            clientWs.send(JSON.stringify({
              text: welcomeMessage
            }));

            // Process buffered messages - transform them before sending
            messageBuffer.forEach(clientData => {
              if (isGeminiReady) {
                const geminiMessage = transformMessageForGemini(clientData);
                if (geminiMessage) {
                  geminiWs.send(JSON.stringify(geminiMessage));
                }
              }
            });
            messageBuffer = [];
          }

          // Handle model responses
          if (response.serverContent?.modelTurn?.parts) {
            const textParts = response.serverContent.modelTurn.parts
              .filter(part => part.text)
              .map(part => part.text)
              .join(' ');

            if (textParts.trim()) {
              clientWs.send(JSON.stringify({
                text: textParts
              }));
            }
          }

          // Handle tool responses
          if (response.toolCallResult) {
            console.log('Tool call result received');
          }

        } catch (err) {
          console.error('Error parsing Gemini response:', err);
        }
      });

      geminiWs.on('error', (error) => {
        console.error('Gemini WebSocket error:', error);
        clientWs.send(JSON.stringify({
          error: 'AI service error',
          text: 'AI service temporarily unavailable'
        }));
      });

      geminiWs.on('close', (code, reason) => {
        console.log(`Gemini connection closed: ${code} - ${reason}`);
        isGeminiReady = false;

        const reasonStr = reason ? reason.toString() : '';

        // Handle quota exceeded error
        if (code === 1011 || reasonStr.includes('quota') || reasonStr.includes('RESOURCE_EXHAUSTED')) {
          console.error('Gemini API quota exceeded. Please check your billing or wait for quota reset.');
          clientWs.send(JSON.stringify({
            error: 'API quota exceeded',
            text: 'API quota exceeded. Free tier limits: 200 requests/day for Gemini 2.0 Flash. Please wait for daily quota reset at midnight Pacific time, or upgrade your plan in Google AI Studio.'
          }));
          // Don't auto-reconnect if quota is exceeded
          return;
        }

        // Handle rate limit errors (429)
        if (code === 1008 || code === 1013 || reasonStr.includes('rate limit') || reasonStr.includes('RATE_LIMIT_EXCEEDED')) {
          console.error('Gemini API rate limit exceeded. Retrying after delay...');
          clientWs.send(JSON.stringify({
            error: 'Rate limit exceeded',
            text: 'Rate limit exceeded. Free tier: 15 requests/min. Waiting before retry...'
          }));
          // Wait 5 seconds before reconnecting on rate limit
          setTimeout(() => {
            if (activeConnections.has(connectionId)) {
              connectToGemini();
            }
          }, 5000);
          return;
        }

        // Handle unsupported model error - try next model in fallback list
        if (code === 1008 || reasonStr.includes('not found') || reasonStr.includes('not supported') || reasonStr.includes('invalid model')) {
          currentModelIndex++;
          if (currentModelIndex < modelAttempts.length) {
            console.log(`Model ${modelAttempts[currentModelIndex - 1]} not supported, trying next: ${modelAttempts[currentModelIndex]}`);
            // Try next model after a short delay
            setTimeout(() => {
              if (activeConnections.has(connectionId)) {
                connectToGemini();
              }
            }, 1000);
            return;
          } else {
            // All models failed
            console.error('All model attempts failed. Realtime API may require experimental models.');
            clientWs.send(JSON.stringify({
              error: 'Model not supported',
              text: 'No supported models found. Realtime API (BidiGenerateContent) may only support experimental models. Please check your API key permissions or try using gemini-2.0-flash-exp.'
            }));
            return;
          }
        }

        // Attempt reconnection after 2 seconds for other errors
        setTimeout(() => {
          if (activeConnections.has(connectionId)) {
            connectToGemini();
          }
        }, 2000);
      });
    };

    // Don't connect immediately - wait for model selection
    activeConnections.set(connectionId, { clientWs, geminiWs });

    // Handle client messages
    clientWs.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle model selection message
        if (data.type === 'model_selection' && !hasReceivedModelSelection) {
          userSelectedModel = data.model;
          isAudioOnlyMode = data.mode === 'audio_only'; // Check if audio-only mode
          hasReceivedModelSelection = true;
          console.log(`User selected model: ${userSelectedModel}, mode: ${isAudioOnlyMode ? 'audio-only' : 'vision+audio'}`);

          // Add user-selected model to the beginning of the attempts list
          currentModelIndex = 0;
          modelAttempts.unshift(`models/${userSelectedModel}`);

          // Now connect to Gemini with the selected model
          connectToGemini();

          clientWs.send(JSON.stringify({
            text: `Connecting with ${userSelectedModel}...`
          }));
          return;
        }

        // Check if Gemini is ready
        if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN || !isGeminiReady) {
          console.log('Gemini not ready, buffering message');
          // Store the parsed data object, not the raw string
          messageBuffer.push(data);
          return;
        }

        // Transform and send message to Gemini
        const geminiMessage = transformMessageForGemini(data);
        if (geminiMessage) {
          geminiWs.send(JSON.stringify(geminiMessage));
        }
      } catch (err) {
        console.error('Error processing client message:', err);
        clientWs.send(JSON.stringify({
          error: 'Failed to process message'
        }));
      }
    });

    // Handle client disconnect
    clientWs.on('close', () => {
      console.log(`Client disconnected: ${connectionId}`);

      const connection = activeConnections.get(connectionId);
      if (connection && connection.geminiWs) {
        connection.geminiWs.close();
      }

      activeConnections.delete(connectionId);
    });

    clientWs.on('error', (error) => {
      console.error(`Client WebSocket error: ${error.message}`);
    });
  });

  // OpenAI WebSocket Handler
  wssOpenAI.on('connection', (clientWs) => {
    const connectionId = Date.now().toString();
    console.log(`OpenAI client connected: ${connectionId}`);

    let openaiWs = null;
    let isOpenAIReady = false;
    let messageBuffer = [];
    let userSelectedModel = null;
    let hasReceivedModelSelection = false;
    let isAudioOnlyMode = false;

    // Available OpenAI Realtime models
    const availableModels = [
      'gpt-4o-realtime-preview-2024-10-01',
      'gpt-4o-mini-realtime-preview-2024-12-17'
    ];

    const connectToOpenAI = () => {
      if (!process.env.OPENAI_API_KEY) {
        clientWs.send(JSON.stringify({
          error: 'OpenAI API key not configured',
          text: 'Please add OPENAI_API_KEY to your .env.local file'
        }));
        return;
      }

      const model = userSelectedModel || availableModels[0];
      console.log(`Connecting to OpenAI with model: ${model}`);

      // OpenAI Realtime API WebSocket URL
      const openaiUrl = 'wss://api.openai.com/v1/realtime?model=' + model;

      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      openaiWs.on('open', () => {
        console.log('Connected to OpenAI Realtime API');
        isOpenAIReady = true;

        // Configure the session
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: isAudioOnlyMode ? ['text', 'audio'] : ['text', 'audio'],
            instructions: isAudioOnlyMode
              ? 'You are a helpful AI assistant. Listen to the user and respond conversationally.'
              : 'You are a helpful AI assistant that can see and hear. Respond to what you observe and hear.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            temperature: 0.8,
            max_response_output_tokens: 4096
          }
        };

        openaiWs.send(JSON.stringify(sessionConfig));

        const welcomeMessage = isAudioOnlyMode
          ? 'OpenAI Audio Active - I can hear you now!'
          : 'OpenAI Vision Active - I can see and hear you now!';

        clientWs.send(JSON.stringify({
          text: welcomeMessage
        }));

        // Process buffered messages
        messageBuffer.forEach(clientData => {
          if (isOpenAIReady) {
            processClientMessage(clientData);
          }
        });
        messageBuffer = [];
      });

      openaiWs.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          console.log('OpenAI event type:', event.type);

          // Handle different event types
          switch (event.type) {
            case 'session.created':
            case 'session.updated':
              console.log('Session configured:', event.session);
              break;

            case 'conversation.item.created':
              console.log('Conversation item created');
              break;

            case 'input_audio_buffer.speech_started':
              // User started speaking (detected by server VAD)
              clientWs.send(JSON.stringify({
                type: 'user_speaking_started'
              }));
              break;

            case 'input_audio_buffer.speech_stopped':
              // User stopped speaking
              clientWs.send(JSON.stringify({
                type: 'user_speaking_stopped'
              }));
              break;

            case 'input_audio_buffer.committed':
              // Audio buffer committed for processing
              console.log('Audio buffer committed');
              break;

            case 'response.audio.delta':
              // AI's voice response (PCM16 audio chunks)
              if (event.delta) {
                clientWs.send(JSON.stringify({
                  type: 'audio_response_delta',
                  audio: event.delta
                }));
              }
              break;

            case 'response.audio.done':
              // AI finished speaking
              clientWs.send(JSON.stringify({
                type: 'audio_response_complete'
              }));
              break;

            case 'response.audio_transcript.delta':
              // AI's spoken response transcription
              if (event.delta) {
                clientWs.send(JSON.stringify({
                  text: event.delta,
                  type: 'ai_response_delta'
                }));
              }
              break;

            case 'response.audio_transcript.done':
              // Complete AI transcription
              if (event.transcript) {
                clientWs.send(JSON.stringify({
                  text: event.transcript,
                  type: 'ai_response_complete'
                }));
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              // User's speech transcription
              if (event.transcript) {
                clientWs.send(JSON.stringify({
                  text: event.transcript,
                  type: 'user_transcription',
                  transcription: event.transcript
                }));
              }
              break;

            case 'response.text.delta':
              // Text response delta
              if (event.delta) {
                clientWs.send(JSON.stringify({
                  text: event.delta,
                  type: 'ai_response_delta'
                }));
              }
              break;

            case 'response.text.done':
              // Complete text response
              if (event.text) {
                clientWs.send(JSON.stringify({
                  text: event.text,
                  type: 'ai_response_complete'
                }));
              }
              break;

            case 'response.done':
              console.log('Response completed');
              break;

            case 'error':
              console.error('OpenAI error:', event.error);
              clientWs.send(JSON.stringify({
                error: event.error.message || 'OpenAI API error',
                text: `Error: ${event.error.message || 'Unknown error'}`
              }));
              break;

            case 'rate_limits.updated':
              console.log('Rate limits:', event.rate_limits);
              break;
          }
        } catch (err) {
          console.error('Error parsing OpenAI response:', err);
        }
      });

      openaiWs.on('error', (error) => {
        console.error('OpenAI WebSocket error:', error);
        clientWs.send(JSON.stringify({
          error: 'OpenAI service error',
          text: 'OpenAI service temporarily unavailable'
        }));
      });

      openaiWs.on('close', (code, reason) => {
        console.log(`OpenAI connection closed: ${code} - ${reason}`);
        isOpenAIReady = false;

        // Attempt reconnection after 2 seconds
        setTimeout(() => {
          if (activeConnections.has(connectionId)) {
            connectToOpenAI();
          }
        }, 2000);
      });
    };

    const processClientMessage = (data) => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !isOpenAIReady) {
        return;
      }

      if (data.type === 'audio_chunk') {
        // Send audio to OpenAI
        // OpenAI expects base64 encoded PCM16 audio
        openaiWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: data.data
        }));
      } else if (data.type === 'video_frame') {
        // For now, OpenAI Realtime API doesn't support video
        // We can add vision separately using GPT-4V if needed
        console.log('Video frames not yet supported with OpenAI Realtime API');
      } else if (data.type === 'text') {
        // Send text message
        openaiWs.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{
              type: 'input_text',
              text: data.text
            }]
          }
        }));

        // Trigger response
        openaiWs.send(JSON.stringify({
          type: 'response.create'
        }));
      }
    };

    // Handle client messages
    clientWs.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle model selection
        if (data.type === 'model_selection' && !hasReceivedModelSelection) {
          userSelectedModel = data.model;
          isAudioOnlyMode = data.mode === 'audio_only';
          hasReceivedModelSelection = true;
          console.log(`User selected OpenAI model: ${userSelectedModel}, mode: ${isAudioOnlyMode ? 'audio-only' : 'vision+audio'}`);

          // Connect to OpenAI
          connectToOpenAI();

          clientWs.send(JSON.stringify({
            text: `Connecting to OpenAI with ${userSelectedModel}...`
          }));
          return;
        }

        // Buffer messages if not ready
        if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !isOpenAIReady) {
          console.log('OpenAI not ready, buffering message');
          messageBuffer.push(data);
          return;
        }

        // Process message
        processClientMessage(data);
      } catch (err) {
        console.error('Error processing client message:', err);
        clientWs.send(JSON.stringify({
          error: 'Failed to process message'
        }));
      }
    });

    // Handle client disconnect
    clientWs.on('close', () => {
      console.log(`OpenAI client disconnected: ${connectionId}`);

      if (openaiWs) {
        openaiWs.close();
      }

      activeConnections.delete(connectionId);
    });

    clientWs.on('error', (error) => {
      console.error(`Client WebSocket error: ${error.message}`);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket servers ready:`);
    console.log(`  - Gemini: ws://${hostname}:${port}/ws/gemini`);
    console.log(`  - OpenAI: ws://${hostname}:${port}/ws/openai`);
  });
});
