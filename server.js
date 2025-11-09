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

// Rate limiting for Gemini free tier
// Free tier limits: 15 requests/minute, 1,500 requests/day, 1M tokens/minute
class GeminiRateLimiter {
  constructor(requestsPerMinute = 15, requestsPerDay = 1500) {
    this.requestsPerMinute = requestsPerMinute;
    this.requestsPerDay = requestsPerDay;
    this.minuteWindow = [];
    this.dayWindow = [];
    this.queue = [];
    this.isProcessing = false;
    this.backoffDelay = 0; // Exponential backoff delay in ms
    this.consecutiveErrors = 0;
  }

  // Check if we can make a request now
  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    // Clean old entries
    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);
    this.dayWindow = this.dayWindow.filter(t => t > oneDayAgo);

    // Check limits
    const withinMinuteLimit = this.minuteWindow.length < this.requestsPerMinute;
    const withinDayLimit = this.dayWindow.length < this.requestsPerDay;

    return withinMinuteLimit && withinDayLimit && this.backoffDelay === 0;
  }

  // Get time until next request is allowed (in ms)
  getWaitTime() {
    if (this.backoffDelay > 0) {
      return this.backoffDelay;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);

    if (this.minuteWindow.length >= this.requestsPerMinute) {
      // Calculate when the oldest request will age out
      const oldestRequest = Math.min(...this.minuteWindow);
      return Math.max(0, 60000 - (now - oldestRequest) + 100); // +100ms buffer
    }

    return 0;
  }

  // Record a successful request
  recordRequest() {
    const now = Date.now();
    this.minuteWindow.push(now);
    this.dayWindow.push(now);

    // Reset backoff on success
    if (this.consecutiveErrors > 0) {
      console.log('Rate limit recovered, resetting backoff');
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;
    }
  }

  // Handle rate limit error
  handleRateLimitError() {
    this.consecutiveErrors++;

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s (max)
    this.backoffDelay = Math.min(32000, Math.pow(2, this.consecutiveErrors) * 1000);

    console.log(`Rate limit hit! Consecutive errors: ${this.consecutiveErrors}, Backing off for ${this.backoffDelay}ms`);

    // Clear backoff after delay
    setTimeout(() => {
      console.log('Backoff period ended, resuming requests');
      this.backoffDelay = 0;
      this.processQueue();
    }, this.backoffDelay);
  }

  // Add request to queue
  async enqueueRequest(requestFn, errorCallback) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, errorCallback });
      this.processQueue();
    });
  }

  // Process queue with rate limiting
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (!this.canMakeRequest()) {
        const waitTime = this.getWaitTime();

        if (waitTime > 0) {
          console.log(`Rate limit: waiting ${waitTime}ms before next request (Queue: ${this.queue.length})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      const { requestFn, resolve, reject, errorCallback } = this.queue.shift();

      try {
        this.recordRequest();
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        if (errorCallback) {
          errorCallback(error);
        }
        reject(error);
      }

      // Small delay between requests to avoid burst
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  // Get current status
  getStatus() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);
    this.dayWindow = this.dayWindow.filter(t => t > oneDayAgo);

    return {
      requestsLastMinute: this.minuteWindow.length,
      requestsToday: this.dayWindow.length,
      queueLength: this.queue.length,
      backoffDelay: this.backoffDelay,
      canMakeRequest: this.canMakeRequest()
    };
  }
}

// OpenAI Rate Limiter and Cost Tracker
// Rate limits are tier-based. Free tier has lower limits than paid tiers.
// Cost optimization: Track usage to prevent runaway costs
class OpenAIRateLimiter {
  constructor(options = {}) {
    // Rate limits (tier-based, adjust based on your tier)
    this.requestsPerMinute = options.requestsPerMinute || 100; // Conservative default
    this.requestsPerDay = options.requestsPerDay || 10000;

    // Cost tracking
    this.maxCostPerHour = options.maxCostPerHour || 1.0; // $1/hour default limit
    this.audioMinutesThisHour = 0;
    this.totalCostThisHour = 0;
    this.hourlyResetTime = Date.now() + 3600000; // Reset every hour

    // Request tracking
    this.minuteWindow = [];
    this.dayWindow = [];
    this.queue = [];
    this.isProcessing = false;
    this.backoffDelay = 0;
    this.consecutiveErrors = 0;

    // Audio session tracking
    this.activeSessions = new Map(); // Track audio minutes per session

    // Hourly cost reset
    setInterval(() => {
      this.resetHourlyCosts();
    }, 3600000);
  }

  resetHourlyCosts() {
    const previousCost = this.totalCostThisHour;
    const previousMinutes = this.audioMinutesThisHour;

    this.audioMinutesThisHour = 0;
    this.totalCostThisHour = 0;
    this.hourlyResetTime = Date.now() + 3600000;

    if (previousCost > 0) {
      console.log(`[OpenAI Cost] Hourly usage reset. Previous hour: $${previousCost.toFixed(4)}, ${previousMinutes.toFixed(2)} audio minutes`);
    }
  }

  // Estimate cost for audio session
  // gpt-4o-mini-realtime is ~4x cheaper than gpt-4o-realtime
  estimateAudioCost(audioMinutes, model = 'gpt-4o-mini-realtime-preview-2024-12-17') {
    const isMini = model.includes('mini');

    // Pricing per minute (approximate)
    // gpt-4o-realtime: $0.06/min input + $0.24/min output = $0.30/min total
    // gpt-4o-mini-realtime: ~4x cheaper = $0.075/min total (estimated)
    const costPerMinute = isMini ? 0.075 : 0.30;

    return audioMinutes * costPerMinute;
  }

  // Track audio session
  trackAudioSession(sessionId, durationSeconds) {
    const minutes = durationSeconds / 60;

    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, { totalMinutes: 0, startTime: Date.now() });
    }

    const session = this.activeSessions.get(sessionId);
    session.totalMinutes += minutes;
    this.audioMinutesThisHour += minutes;

    return session.totalMinutes;
  }

  // Check if cost limit would be exceeded
  canAffordAudioSession(estimatedMinutes, model) {
    const estimatedCost = this.estimateAudioCost(estimatedMinutes, model);
    const projectedTotal = this.totalCostThisHour + estimatedCost;

    return projectedTotal <= this.maxCostPerHour;
  }

  // Update total cost (call this when actual costs are known)
  updateCost(cost) {
    this.totalCostThisHour += cost;
  }

  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);
    this.dayWindow = this.dayWindow.filter(t => t > oneDayAgo);

    const withinMinuteLimit = this.minuteWindow.length < this.requestsPerMinute;
    const withinDayLimit = this.dayWindow.length < this.requestsPerDay;
    const withinCostLimit = this.totalCostThisHour < this.maxCostPerHour;

    return withinMinuteLimit && withinDayLimit && withinCostLimit && this.backoffDelay === 0;
  }

  getWaitTime() {
    if (this.backoffDelay > 0) {
      return this.backoffDelay;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);

    if (this.minuteWindow.length >= this.requestsPerMinute) {
      const oldestRequest = Math.min(...this.minuteWindow);
      return Math.max(0, 60000 - (now - oldestRequest) + 100);
    }

    return 0;
  }

  recordRequest() {
    const now = Date.now();
    this.minuteWindow.push(now);
    this.dayWindow.push(now);

    if (this.consecutiveErrors > 0) {
      console.log('[OpenAI] Rate limit recovered, resetting backoff');
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;
    }
  }

  handleRateLimitError() {
    this.consecutiveErrors++;
    this.backoffDelay = Math.min(32000, Math.pow(2, this.consecutiveErrors) * 1000);

    console.log(`[OpenAI] Rate limit hit! Consecutive errors: ${this.consecutiveErrors}, Backing off for ${this.backoffDelay}ms`);

    setTimeout(() => {
      console.log('[OpenAI] Backoff period ended, resuming requests');
      this.backoffDelay = 0;
      this.processQueue();
    }, this.backoffDelay);
  }

  async enqueueRequest(requestFn, errorCallback) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, errorCallback });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (!this.canMakeRequest()) {
        const waitTime = this.getWaitTime();

        if (waitTime > 0) {
          console.log(`[OpenAI] Rate limit: waiting ${waitTime}ms before next request (Queue: ${this.queue.length})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Cost limit reached
        if (this.totalCostThisHour >= this.maxCostPerHour) {
          const minutesUntilReset = Math.ceil((this.hourlyResetTime - Date.now()) / 60000);
          console.log(`[OpenAI] Cost limit reached ($${this.maxCostPerHour}/hour). Resets in ${minutesUntilReset} minutes.`);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          continue;
        }
      }

      const { requestFn, resolve, reject, errorCallback } = this.queue.shift();

      try {
        this.recordRequest();
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        if (errorCallback) {
          errorCallback(error);
        }
        reject(error);
      }

      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    this.isProcessing = false;
  }

  getStatus() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    this.minuteWindow = this.minuteWindow.filter(t => t > oneMinuteAgo);
    this.dayWindow = this.dayWindow.filter(t => t > oneDayAgo);

    return {
      requestsLastMinute: this.minuteWindow.length,
      requestsToday: this.dayWindow.length,
      queueLength: this.queue.length,
      backoffDelay: this.backoffDelay,
      canMakeRequest: this.canMakeRequest(),
      totalCostThisHour: this.totalCostThisHour,
      audioMinutesThisHour: this.audioMinutesThisHour,
      maxCostPerHour: this.maxCostPerHour,
      minutesUntilCostReset: Math.ceil((this.hourlyResetTime - Date.now()) / 60000)
    };
  }
}

// Create rate limiter instances
const geminiRateLimiter = new GeminiRateLimiter(
  parseInt(process.env.GEMINI_RPM_LIMIT) || 15,
  parseInt(process.env.GEMINI_RPD_LIMIT) || 1500
);

const openaiRateLimiter = new OpenAIRateLimiter({
  requestsPerMinute: parseInt(process.env.OPENAI_RPM_LIMIT) || 100,
  requestsPerDay: parseInt(process.env.OPENAI_RPD_LIMIT) || 10000,
  maxCostPerHour: parseFloat(process.env.OPENAI_MAX_COST_HOUR) || 1.0
});

// Log rate limiter status every 30 seconds
setInterval(() => {
  const geminiStatus = geminiRateLimiter.getStatus();
  if (geminiStatus.requestsLastMinute > 0 || geminiStatus.queueLength > 0) {
    console.log(`[Gemini Rate Limiter] Requests/min: ${geminiStatus.requestsLastMinute}/15, Today: ${geminiStatus.requestsToday}/1500, Queue: ${geminiStatus.queueLength}`);
  }

  const openaiStatus = openaiRateLimiter.getStatus();
  if (openaiStatus.requestsLastMinute > 0 || openaiStatus.queueLength > 0 || openaiStatus.totalCostThisHour > 0) {
    console.log(`[OpenAI Rate Limiter] Requests/min: ${openaiStatus.requestsLastMinute}/${openaiRateLimiter.requestsPerMinute}, Cost: $${openaiStatus.totalCostThisHour.toFixed(4)}/$${openaiStatus.maxCostPerHour}/hour, Audio: ${openaiStatus.audioMinutesThisHour.toFixed(2)}min`);
  }
}, 30000);

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

    // Helper function to transform client messages to Gemini format with validation
    const transformMessageForGemini = (data) => {
      // Validate message structure
      if (!data || !data.type) {
        console.error('[Gemini] Invalid message: missing type');
        return null;
      }

      if (data.type === 'video_frame') {
        // Validate video frame data
        if (!data.data || typeof data.data !== 'string') {
          console.error('[Gemini] Invalid video frame: missing or invalid data');
          return null;
        }

        // Validate audio-only mode doesn't send video
        if (isAudioOnlyMode) {
          console.warn('[Gemini] Video frame received in audio-only mode, ignoring');
          return null;
        }

        return {
          realtime_input: {
            media_chunks: [{
              mime_type: 'image/jpeg',
              data: data.data
            }]
          }
        };
      } else if (data.type === 'audio_chunk') {
        // Validate audio chunk data
        if (!data.data || typeof data.data !== 'string') {
          console.error('[Gemini] Invalid audio chunk: missing or invalid data');
          return null;
        }

        // Supported audio MIME types for Gemini 2.0 Flash:
        // audio/x-aac, audio/flac, audio/mp3, audio/m4a, audio/mpeg,
        // audio/mpga, audio/mp4, audio/ogg, audio/pcm, audio/wav, audio/webm
        const mimeType = normalizeMimeType(data.mimeType);
        const supportedTypes = ['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/pcm'];

        if (!supportedTypes.includes(mimeType)) {
          console.warn(`[Gemini] Unsupported audio MIME type: ${mimeType}, using default`);
        }

        return {
          realtime_input: {
            media_chunks: [{
              mime_type: mimeType,
              data: data.data
            }]
          }
        };
      } else if (data.type === 'text') {
        // Validate text message
        if (!data.text || typeof data.text !== 'string') {
          console.error('[Gemini] Invalid text message: missing or invalid text');
          return null;
        }

        // Check text length (Gemini has token limits)
        if (data.text.length === 0) {
          console.warn('[Gemini] Empty text message, ignoring');
          return null;
        }

        if (data.text.length > 100000) {
          console.warn('[Gemini] Text message too long, truncating to 100k chars');
          data.text = data.text.substring(0, 100000);
        }

        return {
          client_content: {
            turn: {
              role: 'user',
              parts: [{ text: data.text }]
            }
          }
        };
      }

      // Unknown message type
      console.warn(`[Gemini] Unknown message type: ${data.type}`);
      return null;
    };

    const connectToGemini = () => {
      geminiWs = new WebSocket(geminiUrl);

      geminiWs.on('open', async () => {
        console.log('Connected to Gemini API');

        // Send setup configuration with rate limiting
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

        // Use rate limiter for setup request
        try {
          await geminiRateLimiter.enqueueRequest(
            () => {
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(setupConfig));
              }
              return Promise.resolve();
            },
            (error) => {
              console.error('Setup request failed:', error);
            }
          );
        } catch (error) {
          console.error('Rate limiter error during setup:', error);
        }
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

            // Send initial prompt with rate limiting
            geminiRateLimiter.enqueueRequest(
              () => {
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
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
                }
                return Promise.resolve();
              }
            ).catch(error => {
              console.error('Failed to send initial prompt:', error);
            });

            const welcomeMessage = isAudioOnlyMode
              ? 'AI Audio Active - I can hear you now!'
              : 'AI Vision Active - I can see and hear you now!';

            clientWs.send(JSON.stringify({
              text: welcomeMessage
            }));

            // Process buffered messages with rate limiting
            const processBuffer = async () => {
              for (const clientData of messageBuffer) {
                if (isGeminiReady) {
                  const geminiMessage = transformMessageForGemini(clientData);
                  if (geminiMessage) {
                    await geminiRateLimiter.enqueueRequest(
                      () => {
                        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                          geminiWs.send(JSON.stringify(geminiMessage));
                        }
                        return Promise.resolve();
                      }
                    ).catch(error => {
                      console.error('Failed to send buffered message:', error);
                    });
                  }
                }
              }
              messageBuffer = [];
            };
            processBuffer();
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
          console.error('Gemini API rate limit exceeded. Activating exponential backoff...');

          // Use rate limiter's backoff strategy
          geminiRateLimiter.handleRateLimitError();

          const status = geminiRateLimiter.getStatus();
          clientWs.send(JSON.stringify({
            error: 'Rate limit exceeded',
            text: `Rate limit exceeded. Free tier: 15 requests/min. Backing off for ${Math.round(status.backoffDelay / 1000)}s... (Requests this minute: ${status.requestsLastMinute}/15, Today: ${status.requestsToday}/1500)`
          }));

          // Reconnect after backoff period
          setTimeout(() => {
            if (activeConnections.has(connectionId)) {
              connectToGemini();
            }
          }, status.backoffDelay);
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

        // Transform and send message to Gemini with rate limiting
        const geminiMessage = transformMessageForGemini(data);
        if (!geminiMessage) {
          // Validation failed - notify client
          clientWs.send(JSON.stringify({
            error: 'Invalid message',
            text: `Message type '${data.type}' validation failed. Check console for details.`
          }));
          return;
        }

        const status = geminiRateLimiter.getStatus();

        // Inform client if queue is building up
        if (status.queueLength > 5) {
          clientWs.send(JSON.stringify({
            text: `Processing... (Queue: ${status.queueLength}, Rate: ${status.requestsLastMinute}/15 per min)`
          }));
        }

        geminiRateLimiter.enqueueRequest(
          () => {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify(geminiMessage));
            }
            return Promise.resolve();
          }
        ).catch(error => {
          console.error('Failed to send message:', error);
          clientWs.send(JSON.stringify({
            error: 'Failed to send message',
            text: 'Message delivery failed. Please try again.'
          }));
        });
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

    // Audio session tracking for cost estimation
    let sessionStartTime = null;
    let totalAudioSeconds = 0;

    // Available OpenAI Realtime models (default to cheaper mini model)
    const availableModels = [
      'gpt-4o-mini-realtime-preview-2024-12-17', // Default to cheaper model
      'gpt-4o-realtime-preview-2024-10-01'
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

      openaiWs.on('open', async () => {
        console.log('Connected to OpenAI Realtime API');
        isOpenAIReady = true;
        sessionStartTime = Date.now();

        // Check cost limits before starting
        const status = openaiRateLimiter.getStatus();
        if (status.totalCostThisHour >= status.maxCostPerHour) {
          clientWs.send(JSON.stringify({
            error: 'Cost limit reached',
            text: `Hourly cost limit reached ($${status.maxCostPerHour}). Resets in ${status.minutesUntilCostReset} minutes.`
          }));
          openaiWs.close();
          return;
        }

        // Configure the session with minimal system prompt for cost savings
        // Note: Keep instructions brief - they're charged on every interaction
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: isAudioOnlyMode ? 'Helpful AI assistant.' : 'Helpful AI that can see and hear.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad', // Server-side VAD helps reduce cost by not billing silence
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            temperature: 0.8,
            max_response_output_tokens: 2048 // Reduced from 4096 to save costs
          }
        };

        // Use rate limiter for session config
        try {
          await openaiRateLimiter.enqueueRequest(
            () => {
              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify(sessionConfig));
              }
              return Promise.resolve();
            }
          );
        } catch (error) {
          console.error('[OpenAI] Failed to configure session:', error);
        }

        const welcomeMessage = isAudioOnlyMode
          ? 'OpenAI Audio Active - I can hear you now!'
          : 'OpenAI Vision Active - I can see and hear you now!';

        clientWs.send(JSON.stringify({
          text: welcomeMessage
        }));

        // Process buffered messages with proper async handling
        const processBuffer = async () => {
          for (const clientData of messageBuffer) {
            if (isOpenAIReady) {
              try {
                await processClientMessage(clientData);
              } catch (error) {
                console.error('[OpenAI] Failed to process buffered message:', error);
              }
            }
          }
          messageBuffer = [];
        };
        processBuffer();
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

        // Calculate session cost
        if (sessionStartTime) {
          const sessionDuration = (Date.now() - sessionStartTime) / 1000; // seconds
          const audioMinutes = sessionDuration / 60;
          const estimatedCost = openaiRateLimiter.estimateAudioCost(audioMinutes, userSelectedModel || availableModels[0]);

          console.log(`[OpenAI] Session ended. Duration: ${sessionDuration.toFixed(1)}s, Estimated cost: $${estimatedCost.toFixed(4)}`);

          // Update rate limiter with estimated cost
          openaiRateLimiter.updateCost(estimatedCost);
          openaiRateLimiter.trackAudioSession(connectionId, sessionDuration);
        }

        // Handle rate limit errors
        const reasonStr = reason ? reason.toString() : '';
        if (code === 1008 || reasonStr.includes('rate_limit') || reasonStr.includes('too_many_requests')) {
          console.error('[OpenAI] Rate limit exceeded. Activating exponential backoff...');
          openaiRateLimiter.handleRateLimitError();

          const status = openaiRateLimiter.getStatus();
          clientWs.send(JSON.stringify({
            error: 'Rate limit exceeded',
            text: `Rate limit exceeded. Backing off for ${Math.round(status.backoffDelay / 1000)}s... Cost this hour: $${status.totalCostThisHour.toFixed(4)}`
          }));

          setTimeout(() => {
            if (activeConnections.has(connectionId)) {
              connectToOpenAI();
            }
          }, status.backoffDelay);
          return;
        }

        // Attempt reconnection after 2 seconds for other errors
        setTimeout(() => {
          if (activeConnections.has(connectionId)) {
            connectToOpenAI();
          }
        }, 2000);
      });
    };

    const processClientMessage = async (data) => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !isOpenAIReady) {
        return;
      }

      // Check cost limits
      const status = openaiRateLimiter.getStatus();
      if (status.totalCostThisHour >= status.maxCostPerHour) {
        clientWs.send(JSON.stringify({
          error: 'Cost limit reached',
          text: `Hourly cost limit ($${status.maxCostPerHour}) reached. Resets in ${status.minutesUntilCostReset}min.`
        }));
        return;
      }

      if (data.type === 'audio_chunk') {
        // Track audio duration (approximately 100ms chunks)
        totalAudioSeconds += 0.1;

        // Send audio to OpenAI with rate limiting
        try {
          await openaiRateLimiter.enqueueRequest(
            () => {
              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({
                  type: 'input_audio_buffer.append',
                  audio: data.data
                }));
              }
              return Promise.resolve();
            }
          );
        } catch (error) {
          console.error('[OpenAI] Failed to send audio chunk:', error);
        }
      } else if (data.type === 'video_frame') {
        // OpenAI Realtime API doesn't support video yet
        console.log('[OpenAI] Video frames not yet supported with Realtime API');
      } else if (data.type === 'text') {
        // Send text message with rate limiting
        try {
          await openaiRateLimiter.enqueueRequest(
            async () => {
              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
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
                await new Promise(resolve => setTimeout(resolve, 50));
                openaiWs.send(JSON.stringify({
                  type: 'response.create'
                }));
              }
              return Promise.resolve();
            }
          );
        } catch (error) {
          console.error('[OpenAI] Failed to send text message:', error);
        }
      }
    };

    // Handle client messages
    clientWs.on('message', async (message) => {
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

        // Process message with proper async handling
        await processClientMessage(data);
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

      // Log session stats
      if (sessionStartTime) {
        const sessionDuration = (Date.now() - sessionStartTime) / 1000;
        const audioMinutes = sessionDuration / 60;
        const estimatedCost = openaiRateLimiter.estimateAudioCost(audioMinutes, userSelectedModel || availableModels[0]);

        console.log(`[OpenAI] Client session stats: Duration: ${sessionDuration.toFixed(1)}s, Audio: ${totalAudioSeconds.toFixed(1)}s, Est. cost: $${estimatedCost.toFixed(4)}`);
      }

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
