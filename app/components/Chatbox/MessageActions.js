'use client';

import { useState } from 'react';

export default function MessageActions({
    message,
    messageIndex,
    isUserMessage,
    onEdit,
    onRetry,
    openMenuIndex,
    setOpenMenuIndex
}) {
    const isOpen = openMenuIndex === messageIndex;

    return (
        <div className={`relative flex items-start ${isUserMessage ? 'mr-2' : 'ml-2'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuIndex(isOpen ? null : messageIndex);
                }}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/60 rounded-lg transition-colors"
                title="More options"
            >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div className={`absolute ${isUserMessage ? 'right-0' : 'left-0'} top-8 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[120px]`}>
                    {isUserMessage ? (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onEdit) onEdit(messageIndex);
                                    setOpenMenuIndex(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRetry) onRetry(messageIndex);
                                    setOpenMenuIndex(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Retry
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onRetry) onRetry(messageIndex - 1); // Retry the user message before this
                                setOpenMenuIndex(null);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Regenerate
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
