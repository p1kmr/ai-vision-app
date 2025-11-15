'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/AuthContext';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await loginWithGoogle();
      
      // Check if user has API keys set up (only in browser)
      if (typeof window !== 'undefined') {
        const hasGeminiKey = sessionStorage.getItem('gemini_api_key');
        const hasOpenAIKey = sessionStorage.getItem('openai_api_key');

        // Redirect to setup if no API keys, otherwise go to camera
        if (!hasGeminiKey && !hasOpenAIKey) {
          router.push('/setup');
        } else {
          router.push('/camera');
        }
      } else {
        // Fallback for SSR (though this shouldn't happen in practice)
        router.push('/camera');
      }
    } catch (err) {
      console.error('Google login error:', err);
      
      // Handle specific error cases
      if (err.message && err.message.includes('not allowed')) {
        setError(err.message);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up was blocked by your browser. Please allow pop-ups for this site.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized. Please contact support.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // User opened another popup, ignore this error
        setError('');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl border border-white/20">
          {/* App Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 text-white">AI Vision</h1>
            <p className="text-white/60 text-sm">Sign in with your Google account</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-300 text-gray-800 font-semibold p-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {/* Info Text */}
          <div className="mt-6 text-center">
            <p className="text-white/50 text-xs">
              Only legitimate email addresses are allowed.
              <br />
              Temporary/disposable emails will be rejected.
            </p>
          </div>

          {/* Features List */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-white/60 text-sm font-semibold mb-3 text-center">Features:</p>
            <ul className="text-white/50 text-xs space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                Real-time AI vision analysis
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                Live voice conversation with AI
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                Secure Google authentication
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                Camera & microphone integration
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
