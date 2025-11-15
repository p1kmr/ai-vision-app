'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import {
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { validateGoogleEmail } from '../lib/email-validator';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only run on client-side where auth is available
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error('Firebase auth is not initialized');
    }

    try {
      // Sign in with Google popup
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Validate the email address
      const validation = validateGoogleEmail(user.email);
      
      if (!validation.isValid) {
        // If email is not valid, sign out the user and throw error
        await signOut(auth);
        throw new Error(validation.error);
      }

      // Email is valid, return the result
      return result;
    } catch (error) {
      // Re-throw the error to be handled by the component
      throw error;
    }
  };

  const logout = () => {
    // Clear API keys and settings from sessionStorage (only in browser)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('gemini_api_key');
      sessionStorage.removeItem('openai_api_key');
      sessionStorage.removeItem('advanced_settings');
    }
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      loginWithGoogle,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};
