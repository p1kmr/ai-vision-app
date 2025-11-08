const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { WebSocket } = require('ws');

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

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);

    if (pathname === '/ws/gemini') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Next.js HMR WebSocket won't work with custom server
      // This is expected - HMR is disabled when using custom server
      // The app's WebSocket (/ws/gemini) will work fine
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs) => {
    const connectionId = Date.now().toString();
    console.log(`Client connected: ${connectionId}`);
    
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

            // Send initial prompt
            geminiWs.send(JSON.stringify({
              client_content: {
                turn: {
                  role: 'user',
                  parts: [{
                    text: 'You are an AI assistant that can see through the camera and hear through the microphone. Describe what you observe and respond to any sounds or speech you hear. Keep responses concise and helpful.'
                  }]
                }
              }
            }));

            clientWs.send(JSON.stringify({
              text: 'AI Vision Active - I can see and hear you now!'
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
        if (code === 1011 || reasonStr.includes('quota')) {
          console.error('Gemini API quota exceeded. Please check your billing or wait for quota reset.');
          clientWs.send(JSON.stringify({
            error: 'API quota exceeded',
            text: 'API quota exceeded. Please set up billing in Google AI Studio to increase limits, or wait for daily quota reset.'
          }));
          // Don't auto-reconnect if quota is exceeded
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
          hasReceivedModelSelection = true;
          console.log(`User selected model: ${userSelectedModel}`);
          
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

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/ws/gemini`);
  });
});
