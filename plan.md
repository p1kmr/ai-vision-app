# AI Vision + Audio Web App - Complete Implementation Guide

## Project Overview
A mobile-friendly web application where Gemini AI can see through your camera and hear through your microphone in real-time, displaying responses in an elegant overlay.

**Tech Stack:**
- Next.js 15 (App Router)
- Gemini Realtime API (BidiGenerateContent)
- WebSockets for real-time streaming
- MediaRecorder API (cross-browser compatible)
- Tailwind CSS for styling

**Key Features:**
- ✅ Works on Mobile & Desktop Chrome
- ✅ Real-time camera + microphone streaming
- ✅ AI responses in elegant overlay
- ✅ **Model Selection** - Choose from multiple Gemini models before starting
- ✅ **Manual Start Button** - Full control over when to begin session
- ✅ **Stop Camera & Mic** - Separate button to stop streaming without logging out
- ✅ **Separate Logout** - Complete logout functionality
- ✅ Simple authentication
- ✅ Auto-reconnect for continuous operation
- ✅ Automatic model fallback system
- ✅ No emojis in UI (professional appearance)

---

## Setup Instructions

### Step 1: Create Next.js Project

```bash
npx create-next-app@latest ai-vision-app --js --app --tailwind --no-src-dir
cd ai-vision-app
npm install ws
```

### Step 2: Environment Variables

Create `.env.local` in root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password_here
```

### Step 3: Update package.json

Add custom server script:

```json
{
  "scripts": {
    "dev": "node server.js",
    "dev-next": "next dev",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

---

## Complete File Structure

```
ai-vision-app/
├── .env.local
├── server.js                   # Custom WebSocket server with model fallback
├── app/
│   ├── layout.js              # Root layout
│   ├── page.js                # Login page
│   ├── globals.css            # Global styles
│   ├── camera/
│   │   └── page.js            # Main camera interface with model selection
│   └── api/
│       └── auth/
│           └── route.js       # Authentication endpoint
├── package.json
└── next.config.js
```

---

## Key Implementation Features

### 1. Model Selection System

**Available Models:**
- `gemini-2.0-flash-exp` - Recommended for real-time vision + audio
- `gemini-1.5-flash-exp` - Stable experimental model
- `gemini-1.5-pro-exp` - Advanced reasoning capabilities
- `gemini-2.0-flash-001` - Versioned GA model

**How It Works:**
1. User sees model selection screen before starting
2. All models displayed with descriptions and features
3. User selects preferred model
4. Selection is sent to server via WebSocket
5. Server prioritizes user-selected model
6. Automatic fallback if selected model fails

### 2. Manual Start Flow

**Before (Old):**
- Camera/mic started automatically on page load
- No control over when session begins

**After (Current):**
- Model selection screen shown first
- User must click "Start AI Vision" button
- Camera/mic only start after explicit user action
- Better user control and experience

### 3. Session Control

**Two Separate Buttons:**

1. **Stop Camera & Mic** (Orange button)
   - Stops all media tracks (video + audio)
   - Closes WebSocket connection
   - Clears video element
   - Returns to model selection screen
   - **User stays logged in**

2. **Logout** (Red button)
   - Stops all media tracks
   - Closes WebSocket connection
   - Clears session storage
   - Redirects to login page
   - **User is logged out**

### 4. Model Fallback System

**Server-Side Implementation:**
- Tries user-selected model first
- If fails, automatically tries:
  1. `gemini-2.0-flash-exp`
  2. `gemini-2.0-flash-001`
  3. `gemini-2.0-flash`
  4. `gemini-1.5-flash-exp`
- Logs each attempt to console
- Shows success message with working model

### 5. Media Stream Management

**Enhanced Cleanup:**
```javascript
// Explicitly stops all tracks
mediaStreamRef.current.getTracks().forEach(track => {
  track.stop();
  console.log(`Stopped ${track.kind} track`);
});

// Clears video element
videoRef.current.srcObject = null;

// Clears all intervals and timers
clearInterval(frameIntervalRef.current);
clearInterval(sessionTimerRef.current);
clearTimeout(reconnectTimeoutRef.current);
```

### 6. Error Handling

**Comprehensive Error Management:**
- Model errors: Automatic fallback
- Quota errors: User-friendly messages
- Connection errors: Auto-retry with delay
- Permission errors: Clear instructions
- All errors logged to console

---

## User Flow

```
1. Login Page
   ↓
2. Model Selection Screen
   - View available models
   - Select preferred model
   - Click "Start AI Vision"
   ↓
3. Permission Request
   - Camera permission
   - Microphone permission
   ↓
4. Active Session
   - AI watching and listening
   - Real-time responses
   - Session timer running
   ↓
5. User Options:
   a) Click "Stop Camera & Mic"
      → Return to Model Selection (stays logged in)
   b) Click "Logout"
      → Return to Login Page (logged out)
```

---

## Technical Implementation Details

### Model Selection Component

**State Management:**
- `selectedModel` - Currently selected model ID
- `hasStarted` - Whether session has started
- `isConnected` - WebSocket connection status

**UI States:**
- **Before Start:** Model selection visible, "Start AI Vision" button
- **After Start:** Connection status, AI responses, "Stop Camera & Mic" + "Logout" buttons

### Server Model Handling

**Message Flow:**
1. Client sends `{ type: 'model_selection', model: 'gemini-2.0-flash-exp' }`
2. Server receives and stores user selection
3. Server adds selected model to front of fallback list
4. Server connects to Gemini with selected model
5. If fails, automatically tries next model in list

**Error Recovery:**
- Detects model errors in WebSocket close events
- Detects model errors in message responses
- Automatically tries next model after 1 second delay
- Logs all attempts for debugging

### Media Stream Control

**Start:**
- Request camera and microphone permissions
- Create MediaStream
- Attach to video element
- Start frame capture interval
- Start audio recording cycle

**Stop:**
- Stop all media tracks explicitly
- Clear video element source
- Stop MediaRecorder
- Clear all intervals
- Close WebSocket
- Reset UI state

---

## Configuration

### Generation Config (server.js)

```javascript
generation_config: {
  response_modalities: ['TEXT'],
  temperature: 1.0,        // Default: 1.0 (range: 0.0-2.0)
  top_p: 0.95,             // Default: 0.95 (range: 0.0-1.0)
  top_k: 64,               // Fixed at 64 per documentation
  max_output_tokens: 8192  // Maximum: 8,192
}
```

### Media Constraints (camera/page.js)

```javascript
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
```

### Frame Capture Settings

- **Interval:** 500ms (2 frames per second)
- **Format:** JPEG
- **Quality:** 0.8 (80%)
- **Max Size:** 7 MB (validated before sending)

### Audio Recording Settings

- **Chunk Duration:** 1 second
- **Bitrate:** 16000 bps
- **MIME Types:** audio/webm, audio/mp4 (browser-dependent)

---

## Deployment Instructions

### Development Mode

```bash
# Install dependencies
npm install

# Run with custom server (recommended for WebSocket support)
npm run dev

# Or run standard Next.js dev server
npm run dev-next
```

### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Environment Setup for Production

1. **Vercel Deployment:**
   - Note: Standard Vercel deployment doesn't support WebSocket upgrade
   - Consider using Vercel Edge Functions or deploy to a different platform

2. **Alternative Platforms (Recommended for WebSocket):**
   - **Railway**: Full Node.js support with WebSockets
   - **Render**: Supports custom servers
   - **DigitalOcean App Platform**: Full Node.js support
   - **Google Cloud Run**: Supports WebSocket connections

3. **HTTPS Setup (Required for Camera/Mic):**
   - Use services like Cloudflare for SSL
   - Or configure nginx reverse proxy with Let's Encrypt

---

## Mobile Optimization Tips

### Browser Permissions
- On first visit, users must explicitly allow camera/microphone
- iOS Safari: Settings → Safari → Camera/Microphone → Allow
- Android Chrome: Site Settings → Permissions

### PWA Installation
1. Visit the app in Chrome/Safari
2. Click "Add to Home Screen"
3. App will run in fullscreen mode

### Performance Optimization
- Reduce video resolution on mobile: 720p instead of 1080p
- Increase frame interval to 1000ms on slower devices
- Use lower audio bitrate for 3G/4G connections

---

## Troubleshooting

### Common Issues and Solutions

1. **WebSocket Connection Failed:**
   - Ensure GEMINI_API_KEY is valid
   - Check firewall/proxy settings
   - Verify WebSocket port is open

2. **Camera/Mic Not Working:**
   - Check browser permissions
   - Ensure HTTPS in production
   - Test with different browsers

3. **Model Configuration Error:**
   - Check server logs for which model is being tried
   - Ensure API key has access to experimental models
   - Try selecting different model from dropdown
   - Server automatically tries fallback models

4. **Stop Camera & Mic Not Working:**
   - Check browser console for errors
   - Ensure you're clicking correct button (orange, not red)
   - Try refreshing page if media tracks don't stop

5. **Session Timeout:**
   - App auto-reconnects every 110 seconds
   - Manual refresh if connection lost

6. **Mobile Browser Issues:**
   - Clear browser cache
   - Update to latest browser version
   - Try incognito/private mode

---

## Security Considerations

1. **API Key Protection:**
   - Never expose GEMINI_API_KEY in client code
   - Use environment variables only
   - Rotate keys regularly

2. **Authentication:**
   - Change default credentials immediately
   - Consider implementing JWT tokens
   - Add rate limiting

3. **HTTPS Required:**
   - Camera/Mic APIs require secure context
   - Use SSL certificates in production
   - Redirect HTTP to HTTPS

---

## Testing Checklist

- [ ] Login with correct credentials
- [ ] Login fails with wrong credentials
- [ ] Model selection screen appears after login
- [ ] Can select different models
- [ ] "Start AI Vision" button works
- [ ] Camera permission request appears
- [ ] Microphone permission request appears
- [ ] AI responds to visual input
- [ ] AI responds to audio input
- [ ] "Stop Camera & Mic" stops streaming and returns to model selection
- [ ] "Logout" clears session and returns to login
- [ ] Session auto-reconnects at 110 seconds
- [ ] Model fallback works if selected model fails
- [ ] Works on mobile Chrome
- [ ] Works on desktop Chrome
- [ ] Works on Safari (iOS 14.3+)
- [ ] Works on Firefox
- [ ] Handles network interruptions

---

## Success Indicators

Your app is working correctly when:
1. Model selection screen appears after login
2. Can select and start with different models
3. Green connection indicator is pulsing
4. AI responses appear in overlay
5. Session timer counts up
6. "Stop Camera & Mic" returns to model selection
7. "Logout" returns to login page
8. Auto-reconnect happens before 2 minutes
9. No console errors in browser
10. Server logs show successful model connection

---

## Support & Resources

- [Gemini API Documentation](https://ai.google.dev/api/rest/v1beta/models/generateContent)
- [Gemini 2.0 Flash Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash)
- [Next.js Documentation](https://nextjs.org/docs)
- [WebSocket MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MediaRecorder API Guide](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

---

## License

This project is for personal use. Ensure you comply with Google's Gemini API terms of service and usage limits.

---

**Last Updated:** January 2025
**Version:** 2.0.0
**Compatibility:** Chrome 90+, Safari 14.3+, Firefox 88+, Edge 90+
