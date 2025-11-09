# AI Vision + Audio Web App

A mobile-friendly web application where AI can see through your camera and hear through your microphone in real-time, displaying responses in an elegant overlay.

**Supports both Google Gemini and OpenAI Realtime APIs!**

## Features

### **Two Interaction Modes:**

#### 1. **AI Vision Mode** (`/camera`)
- Real-time camera + microphone streaming
- AI sees and hears simultaneously
- Visual feedback with video overlay

#### 2. **Live Audio Talk Mode** (`/live-talk`) - NEW!
- **Audio-only interaction** - No video required
- Microphone-only streaming for voice conversations
- Beautiful gradient UI with rich text responses
- Perfect for hands-free AI conversations

### **Core Features:**
- **Multi-Provider Support** - Choose between Google Gemini or OpenAI
- **Provider-Specific Models** - See only relevant models for your selected provider
- **Real-time Transcription** - See what you're saying displayed in the UI overlay
- **Model Selection** - Choose from multiple AI models before starting
- **Start Button** - Full control over when to begin the AI session
- **Stop Camera & Mic** - Instantly stop streaming and return to model selection (without logging out)
- **Mode Switching** - Easily switch between Vision and Live Talk modes
- **Separate Logout** - Option to logout when done
- **Automatic Model Fallback** - Server tries multiple models if one fails (Gemini)
- Works on Mobile & Desktop Chrome
- Simple authentication
- Auto-reconnect for continuous operation

## Setup

### 1. Configure Environment Variables

Create a `.env.local` file in the root directory and add your credentials:

```env
# Required - Authentication
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password

# AI Provider API Keys (add at least one)
GEMINI_API_KEY=your_actual_gemini_api_key
OPENAI_API_KEY=your_actual_openai_api_key

# Optional - Gemini Rate Limiting (for free tier optimization)
# Free tier defaults: 15 requests/min, 1500 requests/day
# Paid tier example: 60 requests/min, 10000 requests/day
# GEMINI_RPM_LIMIT=15
# GEMINI_RPD_LIMIT=1500

# Optional - OpenAI Rate Limiting & Cost Control
# OPENAI_RPM_LIMIT=100         # Requests/min (tier-based)
# OPENAI_RPD_LIMIT=10000       # Requests/day
# OPENAI_MAX_COST_HOUR=1.0     # Max cost/hour in USD (default: $1)
```

**Getting API Keys:**
- **Gemini API Key:** Get it from [Google AI Studio](https://aistudio.google.com/apikey)
- **OpenAI API Key:** Get it from [OpenAI Platform](https://platform.openai.com/api-keys)

**Note:** You can use either or both providers. If you only want to use one, just add that provider's API key.

### 2. Install Dependencies

Dependencies should already be installed. If not, run:

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## Usage

### **Option 1: AI Vision Mode**
1. Open the app in your browser
2. Login with the credentials you set in `.env.local`
3. You'll land on the AI Vision page (`/camera`)
4. **Select your AI Provider:**
   - Choose between **Google Gemini** or **OpenAI**
5. **Select your preferred AI Model:**
   - **For Gemini:**
     - **Gemini 2.0 Flash (Experimental)** - Recommended for real-time vision + audio
     - **Gemini 1.5 Flash (Experimental)** - Stable experimental model
     - **Gemini 1.5 Pro (Experimental)** - Advanced reasoning capabilities
   - **For OpenAI:**
     - **GPT-4o Realtime** - Production-ready realtime audio (Recommended)
     - **GPT-4o Mini Realtime** - Lighter & cheaper realtime model
6. **Click "Start AI Vision"** button to begin
7. Allow camera and microphone permissions when prompted
8. The AI will start observing and responding to what it sees and hears
9. **See your speech in real-time** - Your spoken words will appear in a blue box overlay
10. **Control your session:**
   - Click **"Stop Camera & Mic"** to instantly stop all streaming and return to model selection (stay logged in)
   - Click **"Switch to Live Talk"** to switch to audio-only mode
   - Click **"Logout"** to completely logout and return to login page

### **Option 2: Live Audio Talk Mode**
1. From the Vision page, click **"Switch to Live Talk"** button
2. Or navigate directly to `/live-talk` after logging in
3. **Select your AI Provider:**
   - Choose between **Google Gemini** or **OpenAI**
4. **Select your preferred AI Model** for audio conversation:
   - **For Gemini:**
     - **Gemini 2.0 Flash (Experimental)** - Recommended for real-time audio
     - **Gemini 1.5 Flash (Experimental)** - Stable option
     - **Gemini 1.5 Pro (Experimental)** - Advanced reasoning
   - **For OpenAI:**
     - **GPT-4o Realtime** - Production-ready realtime audio (Recommended)
     - **GPT-4o Mini Realtime** - Lighter & cheaper realtime model
5. **Click "Start Live Talk"** button to begin
6. Allow microphone permission when prompted (no camera needed!)
7. Start talking - AI will respond with text in the beautiful overlay
8. **See your speech in real-time** - Your spoken words will appear in a blue section above the AI response
9. **Control your session:**
   - Click **"Stop Audio"** to stop microphone and return to model selection
   - Click **"Switch to Vision"** to switch to camera + audio mode
   - Click **"Logout"** to completely logout

## Important Notes

- **HTTPS Required for Production:** Camera and microphone APIs require a secure context (HTTPS) in production
- **API Key Security:** Never commit your `.env.local` file to version control
- **Session Limits:** The app auto-reconnects every 110 seconds to maintain continuous operation
- **Model Selection:** The Realtime API works best with experimental models. The app will automatically try fallback models if your selected model fails.
- **Rate Limiting (Gemini Free Tier):** The app includes intelligent rate limiting optimized for Gemini's free tier:
  - **15 requests/minute** and **1,500 requests/day** limits
  - Automatic request queuing to prevent hitting rate limits
  - Exponential backoff on rate limit errors (2s → 4s → 8s → 16s → 32s)
  - Real-time status monitoring showing current usage
  - If you upgrade to a paid tier, adjust `GEMINI_RPM_LIMIT` and `GEMINI_RPD_LIMIT` in `.env.local`

- **Cost Optimization (OpenAI):** Intelligent cost tracking and optimization for OpenAI Realtime API:
  - **gpt-4o-mini-realtime** set as default model (~75% cheaper than gpt-4o-realtime)
  - **Hourly cost limits** - Set `OPENAI_MAX_COST_HOUR` to prevent unexpected bills (default: $1/hour)
  - **Real-time cost tracking** - Monitor costs in server logs every 30 seconds
  - **Automatic session tracking** - Logs estimated cost per session
  - **Minimal system prompts** - Reduced from verbose to brief to save on per-request token costs
  - **Server-side VAD** - Voice Activity Detection prevents billing during silence
  - **Reduced output tokens** - Limited to 2048 tokens (vs 4096) to save ~50% on output costs
  - **Pricing comparison**:
    - gpt-4o-realtime: ~$0.30/minute
    - gpt-4o-mini-realtime: ~$0.075/minute (**4x cheaper**)
  - Cost tracking resets every hour with detailed logging

## Tech Stack

- Next.js 15 (App Router)
- **Dual AI Provider Support:**
  - **Google Gemini Realtime API** (BidiGenerateContent):
    - `gemini-2.0-flash-exp` (experimental - recommended for real-time)
    - `gemini-1.5-flash-exp` (stable experimental)
    - `gemini-1.5-pro-exp` (advanced experimental)
    - `gemini-2.0-flash-001` (versioned GA)
  - **OpenAI Realtime API:**
    - `gpt-4o-realtime-preview-2024-10-01` (production-ready)
    - `gpt-4o-mini-realtime-preview-2024-12-17` (lighter/cheaper)
- WebSockets for real-time streaming
- OpenAI SDK for OpenAI integration
- Tailwind CSS for styling

**Important Notes:**
- **Gemini:** The Realtime API (BidiGenerateContent) uses a `v1alpha` endpoint which works best with experimental models. The app includes automatic fallback if a model fails.
- **OpenAI:** The Realtime API includes automatic speech transcription using Whisper, so you can see what you're saying in real-time.
- **Transcription:** When using OpenAI, your spoken words are automatically transcribed and displayed in a blue overlay box.

## Project Structure

```
ai-vision-app/
├── .env.local                 # Environment variables (not in git)
├── .env.local.example         # Example environment file
├── server.js                  # Custom WebSocket server (handles Gemini & OpenAI)
├── app/
│   ├── layout.js             # Root layout
│   ├── page.js               # Login page
│   ├── globals.css           # Global styles
│   ├── camera/
│   │   └── page.js           # AI Vision mode (camera + microphone)
│   ├── live-talk/
│   │   └── page.js           # Live Audio Talk mode (microphone only)
│   └── api/
│       └── auth/
│           └── route.js      # Authentication endpoint
├── package.json
└── next.config.js
```

## Deployment

For production deployment, consider platforms that support WebSocket connections:
- Railway
- Render
- DigitalOcean App Platform
- Google Cloud Run

**Note:** Standard Vercel deployments don't support WebSocket upgrades.

## Troubleshooting

### Camera/Mic Not Working
- Check browser permissions
- Ensure HTTPS in production
- Try a different browser (Chrome/Safari recommended)

### WebSocket Connection Failed
- Verify your `GEMINI_API_KEY` is valid
- Check that port 3000 is not in use
- Review server logs for errors

### Model Configuration Error
- The Realtime API requires experimental models in most cases
- Try selecting **Gemini 2.0 Flash (Experimental)** from the model dropdown
- Check server logs to see which model is being attempted
- Ensure your API key has access to experimental models
- If all models fail, check your Google AI Studio API quota
- The server automatically tries fallback models - check console logs

### Rate Limit Errors (Gemini)
- **"Rate limit exceeded"** message means you've hit the 15 requests/minute limit
- The app automatically queues requests and retries with exponential backoff
- Check server console for rate limiter status: `[Rate Limiter] Requests/min: X/15, Today: Y/1500`
- If you consistently hit rate limits, consider:
  - Reducing the frequency of video frames being sent
  - Upgrading to a paid Gemini API tier (60 RPM)
  - Setting `GEMINI_RPM_LIMIT` and `GEMINI_RPD_LIMIT` in `.env.local` for paid tier
- Daily quota resets at midnight Pacific time

### OpenAI Cost & Rate Limit Management
- **Cost limit reached**: If you see "Cost limit reached", you've hit your hourly spending cap
  - Default limit is $1/hour, adjust with `OPENAI_MAX_COST_HOUR` in `.env.local`
  - Cost tracking resets every hour automatically
  - Check server console for: `[OpenAI Rate Limiter] Cost: $X.XX/$1.00/hour`
- **Cost optimization tips**:
  - Always use **gpt-4o-mini-realtime** (default) unless you need the full gpt-4o model
  - Monitor server logs for session costs: `[OpenAI] Session ended. Duration: Xs, Estimated cost: $X.XXXX`
  - Stop sessions when not in use - costs accumulate continuously while connected
  - Server-side VAD already enabled to prevent billing during silence
- **Rate limit errors**:
  - OpenAI rate limits are tier-based (check your tier at platform.openai.com)
  - The app automatically implements exponential backoff on rate limit errors
  - Adjust `OPENAI_RPM_LIMIT` based on your account tier
  - Free tier: Very limited, Tier 1: ~100 RPM, Tier 5: Much higher
- **Unexpected costs**:
  - Audio streaming bills by the minute, not by usage
  - Each session logs estimated cost - review server console regularly
  - Set `OPENAI_MAX_COST_HOUR=0.50` for tighter control during testing

### Session Timeout
- The app automatically reconnects every 110 seconds
- If connection is lost, try refreshing the page

### Stop Camera & Mic Not Working
- Ensure you're clicking the orange "Stop Camera & Mic" button (not Logout)
- Check browser console for any errors
- Try refreshing the page if media tracks don't stop

### Live Audio Talk Mode Issues
- Ensure microphone permission is granted in browser settings
- Check that you're on HTTPS in production (required for mic access)
- Verify the correct model is selected for audio interaction
- If no response, check browser console for WebSocket errors

## Key Implementation Details

### Dual Mode Architecture
- **Vision Mode**: Sends both video frames and audio chunks to Gemini API
- **Audio-Only Mode**: Sends only audio chunks (no video frames)
- Server detects mode via `mode: 'audio_only'` flag in model selection message
- Different AI prompts are used based on the selected mode

### Model Selection Flow
1. User selects model from dropdown before starting
2. Model selection is sent to server via WebSocket
3. Server prioritizes user-selected model
4. If selected model fails, server automatically tries fallback models
5. Console logs show which model successfully connects

### Media Stream Management
- Camera and microphone tracks are explicitly stopped when "Stop Camera & Mic" is clicked
- Video element source is cleared
- All intervals and timers are cleared
- WebSocket connection is closed
- User returns to model selection screen (stays logged in)

### Error Handling
- Model errors trigger automatic fallback to next model in list
- Quota errors show helpful messages
- Connection errors auto-retry with exponential backoff
- All errors are logged to console for debugging

## License

This project is for personal use. Ensure you comply with Google's Gemini API terms of service.
