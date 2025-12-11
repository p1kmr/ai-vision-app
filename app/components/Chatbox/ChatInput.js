'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatInput({
    inputText,
    setInputText,
    attachedFiles,
    setAttachedFiles,
    isConnected,
    onSend,
    showHistoryButton = false,
    onToggleHistory,
    showHistory = false,
    getFileIcon,
    isLoading = false
}) {
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputText]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        const newFiles = files.map(file => ({
            file,
            preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
            type: file.type,
            name: file.name
        }));
        setAttachedFiles([...attachedFiles, ...newFiles]);
    };

    const removeFile = (index) => {
        const newFiles = [...attachedFiles];
        if (newFiles[index].preview) {
            URL.revokeObjectURL(newFiles[index].preview);
        }
        newFiles.splice(index, 1);
        setAttachedFiles(newFiles);
    };

    return (
        <div className="border-t border-gray-700/50 p-2">
            {/* File previews */}
            {attachedFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => (
                        <div key={index} className="relative group">
                            {file.preview ? (
                                <div className="relative">
                                    <img
                                        src={file.preview}
                                        alt={file.name}
                                        className="w-20 h-20 object-cover rounded-lg border border-gray-600"
                                    />
                                    <button
                                        onClick={() => removeFile(index)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <div className="relative bg-gray-700/60 rounded-lg p-3 pr-8 flex items-center gap-2 border border-gray-600">
                                    <span className="text-xl">{getFileIcon(file.type)}</span>
                                    <span className="text-xs text-gray-300 max-w-[100px] truncate">
                                        {file.name}
                                    </span>
                                    <button
                                        onClick={() => removeFile(index)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors text-xs"
                                    >
                                        ×
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Input box */}
            <div className="flex gap-2 items-end">

                {/* Attachment button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-shrink-0 w-10 h-10 bg-gray-700/60 hover:bg-gray-600/60 disabled:opacity-50 rounded-full flex items-center justify-center transition-colors border border-gray-600/50"
                    title="Attach files or take photo"
                >
                    <span className="text-xl">📎</span>
                </button>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.js,.py,.java,.cpp,.html,.css"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                {/* Text input */}
                <div className="flex-1 bg-gray-700/40 rounded-2xl border border-gray-600/50 px-4 py-2">
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isConnected ? "Type a message... (Shift+Enter for new line)" : "Not connected"}
                        disabled={!isConnected || isLoading}
                        className="w-full bg-transparent text-white resize-none outline-none max-h-32 overflow-y-auto"
                        rows={1}
                    />
                </div>

                {/* Send button */}
                <button
                    onClick={onSend}
                    disabled={!isConnected || isLoading || (!inputText.trim() && attachedFiles.length === 0)}
                    className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50 rounded-full flex items-center justify-center transition-colors"
                    title="Send message"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Connection status */}
            {!isConnected && (
                <div className="mt-2 text-xs text-gray-400 text-center">
                    Disconnected - start a session to chat
                </div>
            )}
        </div>
    );
}
