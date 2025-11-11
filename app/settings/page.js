'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import Header from '../components/Header';

// Default settings
const DEFAULT_SETTINGS = {
  geminiRpmLimit: 15,
  geminiRpdLimit: 1500,
  openaiRpmLimit: 100,
  openaiRpdLimit: 10000,
  openaiMaxCostHour: 0.30
};

function SettingsPageContent() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [success, setSuccess] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Load existing settings from localStorage if any
    const savedSettings = localStorage.getItem('advanced_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    }
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    setSuccess('');

    // Validate settings
    if (settings.geminiRpmLimit < 1 || settings.geminiRpdLimit < 1) {
      alert('Gemini rate limits must be at least 1');
      return;
    }

    if (settings.openaiRpmLimit < 1 || settings.openaiRpdLimit < 1) {
      alert('OpenAI rate limits must be at least 1');
      return;
    }

    if (settings.openaiMaxCostHour <= 0) {
      alert('OpenAI max cost per hour must be greater than 0');
      return;
    }

    // Save to localStorage
    localStorage.setItem('advanced_settings', JSON.stringify(settings));
    setSuccess('Settings saved successfully!');

    // Clear success message after 3 seconds
    setTimeout(() => {
      setSuccess('');
    }, 3000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('advanced_settings');
    setSuccess('Settings reset to defaults!');
    setTimeout(() => {
      setSuccess('');
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <Header />
      <div className="flex items-center justify-center p-4 pt-20">
        <div className="w-full max-w-3xl">
          <form onSubmit={handleSave} className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl border border-white/20">
            <h1 className="text-3xl font-bold mb-2 text-center text-white">Advanced Settings</h1>
            <p className="text-white/60 text-center mb-8 text-sm">
              Configure rate limits and cost controls for AI providers
            </p>

            {success && (
              <div className="bg-green-500/20 border border-green-500/50 text-green-200 p-3 rounded-lg mb-6 text-sm">
                {success}
              </div>
            )}

            {/* Gemini Settings */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                <span className="bg-blue-500 w-2 h-6 mr-3 rounded"></span>
                Google Gemini Rate Limits
              </h2>
              <div className="space-y-4 pl-5">
                <div>
                  <label className="block text-white/80 font-medium mb-2">
                    Requests Per Minute (RPM)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.geminiRpmLimit}
                    onChange={(e) => setSettings({...settings, geminiRpmLimit: parseInt(e.target.value) || 1})}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-white/50 text-xs mt-1">Free tier: 15 RPM | Paid tier: 60+ RPM</p>
                </div>

                <div>
                  <label className="block text-white/80 font-medium mb-2">
                    Requests Per Day (RPD)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.geminiRpdLimit}
                    onChange={(e) => setSettings({...settings, geminiRpdLimit: parseInt(e.target.value) || 1})}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-white/50 text-xs mt-1">Free tier: 1,500 RPD | Paid tier: 10,000+ RPD</p>
                </div>
              </div>
            </div>

            {/* OpenAI Settings */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                <span className="bg-green-500 w-2 h-6 mr-3 rounded"></span>
                OpenAI Rate Limits & Cost Control
              </h2>
              <div className="space-y-4 pl-5">
                <div>
                  <label className="block text-white/80 font-medium mb-2">
                    Requests Per Minute (RPM)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.openaiRpmLimit}
                    onChange={(e) => setSettings({...settings, openaiRpmLimit: parseInt(e.target.value) || 1})}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-white/50 text-xs mt-1">Depends on your OpenAI account tier</p>
                </div>

                <div>
                  <label className="block text-white/80 font-medium mb-2">
                    Requests Per Day (RPD)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.openaiRpdLimit}
                    onChange={(e) => setSettings({...settings, openaiRpdLimit: parseInt(e.target.value) || 1})}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-white/50 text-xs mt-1">Typical: 10,000 RPD or higher</p>
                </div>

                <div>
                  <label className="block text-white/80 font-medium mb-2">
                    Max Cost Per Hour (USD)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={settings.openaiMaxCostHour}
                    onChange={(e) => setSettings({...settings, openaiMaxCostHour: parseFloat(e.target.value) || 0.01})}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-white/50 text-xs mt-1">
                    Recommended: $0.30 for single user | gpt-4o-mini: ~$0.06/min | gpt-4o: ~$0.30/min
                  </p>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <p className="text-yellow-200 text-sm">
                <strong>Note:</strong> These settings are stored locally in your browser. Adjust based on your API provider&apos;s tier and quota limits to avoid rate limit errors or unexpected costs.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg font-semibold transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Save Settings
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-6 bg-gray-700 hover:bg-gray-600 text-white p-4 rounded-lg font-semibold transition-all"
              >
                Reset to Defaults
              </button>
            </div>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => router.push('/camera')}
                className="text-white/60 hover:text-white text-sm"
              >
                Back to Camera
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsPageContent />
    </ProtectedRoute>
  );
}
