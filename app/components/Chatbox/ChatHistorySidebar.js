'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatHistorySidebar({
    chatSessions = [],
    currentSessionId = null,
    onLoadSession,
    onNewSession,
    onDeleteSession,
    onClose
}) {
    return (
        <div className="w-64 border-r border-gray-700/50 flex flex-col bg-gray-900/50">
            {/* Header */}
            <div className="p-3 border-b border-gray-700/50 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm">Chat History</h3>
                <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-white rounded"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* New Chat Button */}
            <div className="p-2">
                <button
                    onClick={() => {
                        if (onNewSession) onNewSession();
                        onClose?.();
                    }}
                    className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700/40 transition-colors flex items-center gap-2 text-sm"
                >
                    <span>+</span>
                    <span>New Chat</span>
                </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {chatSessions.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center py-4">No saved chats yet</p>
                ) : (
                    chatSessions.map((session) => (
                        <div
                            key={session.id}
                            className={`p-2 rounded-lg cursor-pointer transition-colors group flex items-center justify-between ${currentSessionId === session.id
                                    ? 'bg-gray-700/60 border border-gray-500'
                                    : 'hover:bg-gray-700/40 border border-transparent'
                                }`}
                            onClick={() => {
                                if (onLoadSession) onLoadSession(session.id);
                                onClose?.();
                            }}
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-200 text-sm truncate">{session.title}</p>
                                <p className="text-gray-500 text-xs">
                                    {session.messages?.length || 0} msgs
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDeleteSession) onDeleteSession(session.id, e);
                                }}
                                className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
