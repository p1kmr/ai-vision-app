'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();

  // Redirect to main login page since we only use Google Sign-In
  useEffect(() => {
    router.push('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl border border-white/20">
          <h1 className="text-2xl font-bold text-white mb-4">Redirecting...</h1>
          <p className="text-white/60 text-sm">Please sign in with Google</p>
        </div>
      </div>
    </div>
  );
}
