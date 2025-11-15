'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import Header from '../components/Header';

function SetupPageContent() {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Load existing keys from sessionStorage if any (only in browser)
    if (typeof window !== 'undefined') {
      const savedGeminiKey = sessionStorage.getItem('gemini_api_key') || '';
      const savedOpenaiKey = sessionStorage.getItem('openai_api_key') || '';
      setGeminiKey(savedGeminiKey);
      setOpenaiKey(savedOpenaiKey);
    }
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate that at least one key is provided
    if (!geminiKey.trim() && !openaiKey.trim()) {
      setError('Please provide at least one API key (Gemini or OpenAI)');
      return;
    }

    // Save keys to sessionStorage (not database)
    if (geminiKey.trim()) {
      sessionStorage.setItem('gemini_api_key', geminiKey.trim());
    } else {
      sessionStorage.removeItem('gemini_api_key');
    }

    if (openaiKey.trim()) {
      sessionStorage.setItem('openai_api_key', openaiKey.trim());
    } else {
      sessionStorage.removeItem('openai_api_key');
    }

    setSuccess('API keys saved successfully!');

    // Redirect to camera page after 1.5 seconds
    setTimeout(() => {
      router.push('/camera');
    }, 1500);
  };

  const handleSkip = () => {
    router.push('/camera');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <Header />
      <div className="flex items-center justify-center p-4 lg:p-8 pt-20 lg:pt-24">
        <div className="w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl">
          <form onSubmit={handleSave} className="bg-white/10 backdrop-blur-lg p-8 lg:p-10 xl:p-12 rounded-2xl shadow-2xl border border-white/20">
            <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-2 lg:mb-3 text-center text-white">API Key Setup</h1>
            <p className="text-white/60 text-center mb-8 lg:mb-10 text-sm lg:text-base xl:text-lg">
              Enter your API keys to use the AI Vision features. Your keys are stored only in your browser session and never saved to a database.
            </p>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/20 border border-green-500/50 text-green-200 p-3 rounded-lg mb-6 text-sm">
                {success}
              </div>
            )}

            <div className="space-y-6 lg:space-y-8">
              <div>
                <label className="block text-white font-semibold mb-2 lg:mb-3 text-base lg:text-lg">
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter your Gemini API key (optional)"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full p-4 lg:p-5 bg-white/10 border border-white/20 rounded-lg text-white text-base lg:text-lg placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-white/50 text-xs lg:text-sm mt-2">
                  Get your key from{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 lg:mb-3 text-base lg:text-lg">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter your OpenAI API key (optional)"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full p-4 lg:p-5 bg-white/10 border border-white/20 rounded-lg text-white text-base lg:text-lg placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-white/50 text-xs lg:text-sm mt-2">
                  Get your key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    OpenAI Platform
                  </a>
                </p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 lg:p-5">
                <p className="text-blue-200 text-sm lg:text-base">
                  <strong>Privacy Notice:</strong> Your API keys are stored only in your browser&apos;s session storage.
                  They are never sent to our servers for storage and will be cleared when you logout or close the browser.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 lg:gap-5 mt-8 lg:mt-10">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-4 lg:p-5 rounded-lg text-base lg:text-lg font-semibold transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Save Keys
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="px-6 lg:px-8 bg-gray-700 hover:bg-gray-600 text-white p-4 lg:p-5 rounded-lg text-base lg:text-lg font-semibold transition-all"
              >
                Skip
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <ProtectedRoute>
      <SetupPageContent />
    </ProtectedRoute>
  );
}
