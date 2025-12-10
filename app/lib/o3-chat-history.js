'use client';

import { db } from './firebase';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from 'firebase/firestore';

// Collection name for O3 chat history
const COLLECTION_NAME = 'o3_chat_history';

/**
 * Save a new chat session for O3
 * @param {string} userId - Firebase user ID
 * @param {string} title - Chat session title (auto-generated from first message)
 * @param {Array} messages - Array of chat messages
 * @returns {Promise<string>} - Document ID of saved session
 */
export async function saveO3ChatSession(userId, title, messages) {
    if (!db) {
        console.warn('Firestore not initialized');
        return null;
    }

    // Validate userId exists
    if (!userId || userId === 'undefined' || userId === 'null') {
        console.error('[O3 Chat] ERROR: Invalid userId provided:', userId);
        throw new Error('Cannot save chat: userId is invalid');
    }

    console.log('[O3 Chat] Saving session for userId:', userId, 'Title:', title);

    try {
        const docData = {
            userId,
            title: title || 'New Chat',
            messages,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        console.log('[O3 Chat] Document data:', { userId, title, messageCount: messages.length });

        const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
        console.log('[O3 Chat] ✅ Session saved:', docRef.id, 'for user:', userId);
        return docRef.id;
    } catch (error) {
        console.error('[O3 Chat] ❌ Error saving session:', error);
        console.error('[O3 Chat] Error code:', error.code);
        console.error('[O3 Chat] Error message:', error.message);
        throw error;
    }
}

/**
 * Update an existing chat session
 * @param {string} sessionId - Document ID of the session
 * @param {Array} messages - Updated array of chat messages
 * @param {string} title - Optional new title
 */
export async function updateO3ChatSession(sessionId, messages, title = null) {
    if (!db) {
        console.warn('Firestore not initialized');
        return;
    }

    try {
        const docRef = doc(db, COLLECTION_NAME, sessionId);
        const updateData = {
            messages,
            updatedAt: serverTimestamp()
        };

        if (title) {
            updateData.title = title;
        }

        await updateDoc(docRef, updateData);
        console.log('[O3 Chat] Session updated:', sessionId);
    } catch (error) {
        console.error('[O3 Chat] Error updating session:', error);
        throw error;
    }
}

/**
 * Load all chat sessions for a user
 * @param {string} userId - Firebase user ID
 * @param {number} maxSessions - Maximum number of sessions to return
 * @returns {Promise<Array>} - Array of chat sessions
 */
export async function loadO3ChatSessions(userId, maxSessions = 50) {
    if (!db) {
        console.warn('Firestore not initialized');
        return [];
    }

    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
        console.error('[O3 Chat] ERROR: Invalid userId for loading:', userId);
        return [];
    }

    console.log('[O3 Chat] Loading sessions for userId:', userId);

    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc'),
            limit(maxSessions)
        );

        console.log('[O3 Chat] Executing query...');
        const querySnapshot = await getDocs(q);
        const sessions = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('[O3 Chat] Found session:', doc.id, 'userId:', data.userId);
            sessions.push({
                id: doc.id,
                ...data
            });
        });

        console.log('[O3 Chat] ✅ Loaded', sessions.length, 'sessions for user', userId);
        return sessions;
    } catch (error) {
        console.error('[O3 Chat] ❌ Error loading sessions:', error);
        console.error('[O3 Chat] Error code:', error.code);
        console.error('[O3 Chat] Error message:', error.message);

        // Check for index requirement
        if (error.message && error.message.includes('index')) {
            console.error('[O3 Chat] 🔴 FIRESTORE INDEX REQUIRED!');
            console.error('[O3 Chat] Look for a link in the error above to create the index.');
            console.error('[O3 Chat] Or manually create index: Collection=o3_chat_history, Fields=userId(Asc)+updatedAt(Desc)');
        }

        // Check for permission errors
        if (error.code === 'permission-denied') {
            console.error('[O3 Chat] 🔴 PERMISSION DENIED! Check Firestore security rules.');
        }

        return [];
    }
}

/**
 * Load a specific chat session by ID
 * @param {string} sessionId - Document ID of the session
 * @returns {Promise<Object|null>} - Chat session data or null
 */
export async function loadO3ChatSession(sessionId) {
    if (!db) {
        console.warn('Firestore not initialized');
        return null;
    }

    try {
        const docRef = doc(db, COLLECTION_NAME, sessionId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        } else {
            console.warn('[O3 Chat] Session not found:', sessionId);
            return null;
        }
    } catch (error) {
        console.error('[O3 Chat] Error loading session:', error);
        return null;
    }
}

/**
 * Delete a chat session
 * @param {string} sessionId - Document ID of the session
 */
export async function deleteO3ChatSession(sessionId) {
    if (!db) {
        console.warn('Firestore not initialized');
        return;
    }

    try {
        await deleteDoc(doc(db, COLLECTION_NAME, sessionId));
        console.log('[O3 Chat] Session deleted:', sessionId);
    } catch (error) {
        console.error('[O3 Chat] Error deleting session:', error);
        throw error;
    }
}

/**
 * Generate a title from the first user message
 * @param {string} text - First message text
 * @returns {string} - Generated title (truncated to 50 chars)
 */
export function generateChatTitle(text) {
    if (!text) return 'New Chat';

    // Take first 50 characters and clean up
    let title = text.trim().substring(0, 50);

    // If truncated, add ellipsis
    if (text.length > 50) {
        title += '...';
    }

    return title;
}
