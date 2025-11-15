'use client';

import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!user) return null;

  return (
    <header className="bg-black/50 backdrop-blur-lg border-b border-white/10 p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <button
          onClick={() => router.push('/camera')}
          className="text-white font-semibold text-lg focus:outline-none hover:text-blue-300 transition-colors"
        >
          AI Vision App
        </button>
        <div className="flex gap-4 items-center">
          <span className="text-white/70 text-sm">{user.email}</span>
          <button
            onClick={() => router.push('/setup')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            API Keys
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
