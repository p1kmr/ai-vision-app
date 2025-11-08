# AI Vision + Audio Web App

A mobile-friendly web application where Gemini AI can see through your camera and hear through your microphone in real-time, displaying responses in an elegant overlay.

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
- **Model Selection** - Choose from multiple Gemini models before starting
- **Start Button** - Full control over when to begin the AI session
- **Stop Camera & Mic** - Instantly stop streaming and return to model selection (without logging out)
- **Mode Switching** - Easily switch between Vision and Live Talk modes
- **Separate Logout** - Option to logout when done
- **Automatic Model Fallback** - Server tries multiple models if one fails
- Works on Mobile & Desktop Chrome
- Simple authentication
- Auto-reconnect for continuous operation

## Setup

### 1. Configure Environment Variables

Edit the `.env.local` file and add your credentials:

```env
GEMINI_API_KEY=your_actual_gemini_api_key
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password
```

**Important:** Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

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
4. **Select your preferred AI Model:**
   - Choose from the displayed model options:
     - **Gemini 2.0 Flash (Experimental)** - Recommended for real-time vision + audio
     - **Gemini 1.5 Flash (Experimental)** - Stable experimental model
     - **Gemini 1.5 Pro (Experimental)** - Advanced reasoning capabilities
5. **Click "Start AI Vision"** button to begin
6. Allow camera and microphone permissions when prompted
7. The AI will start observing and responding to what it sees and hears
8. **Control your session:**
   - Click **"Stop Camera & Mic"** to instantly stop all streaming and return to model selection (stay logged in)
   - Click **"Switch to Live Talk"** to switch to audio-only mode
   - Click **"Logout"** to completely logout and return to login page

### **Option 2: Live Audio Talk Mode** (NEW!)
1. From the Vision page, click **"Switch to Live Talk"** button
2. Or navigate directly to `/live-talk` after logging in
3. **Select your preferred AI Model** for audio conversation:
   - **Gemini 2.0 Flash (Experimental)** - Recommended for real-time audio
   - **Gemini 1.5 Flash (Experimental)** - Stable option
   - **Gemini 1.5 Pro (Experimental)** - Advanced reasoning
4. **Click "Start Live Talk"** button to begin
5. Allow microphone permission when prompted (no camera needed!)
6. Start talking - AI will respond with text in the beautiful overlay
7. **Control your session:**
   - Click **"Stop Audio"** to stop microphone and return to model selection
   - Click **"Switch to Vision"** to switch to camera + audio mode
   - Click **"Logout"** to completely logout

## Important Notes

- **HTTPS Required for Production:** Camera and microphone APIs require a secure context (HTTPS) in production
- **API Key Security:** Never commit your `.env.local` file to version control
- **Session Limits:** The app auto-reconnects every 110 seconds to maintain continuous operation
- **Model Selection:** The Realtime API works best with experimental models. The app will automatically try fallback models if your selected model fails.

## Tech Stack

- Next.js 15 (App Router)
- Gemini Realtime API (BidiGenerateContent) with model selection:
  - `gemini-2.0-flash-exp` (experimental - recommended for real-time)
  - `gemini-1.5-flash-exp` (stable experimental)
  - `gemini-1.5-pro-exp` (advanced experimental)
  - `gemini-2.0-flash-001` (versioned GA)
- WebSockets for real-time streaming
- Tailwind CSS for styling

**Important:** The Realtime API (BidiGenerateContent) uses a `v1alpha` endpoint which works best with experimental models. The app includes an in-app model selector for easy switching between supported models and automatic fallback if a model fails.

**Note:** For Live API native audio with enhanced voice features, use model `gemini-live-2.5-flash-preview-native-audio-09-2025` (requires different endpoint configuration).

## Project Structure

```
ai-vision-app/
├── .env.local                 # Environment variables (not in git)
├── server.js                  # Custom WebSocket server (handles both modes)
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
