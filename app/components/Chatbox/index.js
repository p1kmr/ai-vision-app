'use client';

import { useState, useRef, useEffect } from 'react';
import ChatHistorySidebar from './ChatHistorySidebar';
import MessageActions from './MessageActions';
import MessageContent from './MessageContent';
import ChatInput from './ChatInput';
import CameraModal from './CameraModal';

export default function Chatbox({
    messages,
    onSendMessage,
    onEditMessage,
    onRetryMessage,
    isConnected,
    isLoading,
    // Chat history props
    chatSessions = [],
    currentSessionId = null,
    onLoadSession,
    onNewSession,
    onDeleteSession,
    showHistoryButton = false
}) {
    const [inputText, setInputText] = useState('');
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [editingMessageIndex, setEditingMessageIndex] = useState(null);
    const [editText, setEditText] = useState('');
    const [openMenuIndex, setOpenMenuIndex] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle paste event for images
    useEffect(() => {
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const newFile = {
                            file,
                            preview: URL.createObjectURL(file),
                            type: file.type,
                            name: `pasted-image-${Date.now()}.png`
                        };
                        setAttachedFiles(prev => [...prev, newFile]);
                    }
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('paste', handlePaste);
        };
    }, []);

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [cameraStream]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenMenuIndex(null);
        if (openMenuIndex !== null) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [openMenuIndex]);

    const handleSend = async () => {
        if (!inputText.trim() && attachedFiles.length === 0) return;
        const messageData = {
            text: inputText,
            files: attachedFiles
        };
        onSendMessage(messageData);
        setInputText('');
        setAttachedFiles([]);
    };

    const getFileIcon = (type) => {
        if (type.startsWith('image/')) return '🖼️';
        if (type.startsWith('video/')) return '🎥';
        if (type.startsWith('audio/')) return '🎵';
        if (type.includes('pdf')) return '📄';
        if (type.includes('text')) return '📝';
        if (type.includes('code') || type.includes('javascript') || type.includes('python')) return '💻';
        return '📎';
    };

    const handleCameraCapture = (file, preview) => {
        const newFile = {
            file,
            preview,
            type: 'image/png',
            name: file.name
        };
        setAttachedFiles(prev => [...prev, newFile]);
    };

    const closeCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setShowCamera(false);
    };

    return (
        <div className="flex h-full bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden relative">
            {/* Chat History Sidebar */}
            {showHistory && showHistoryButton && (
                <ChatHistorySidebar
                    chatSessions={chatSessions}
                    currentSessionId={currentSessionId}
                    onLoadSession={onLoadSession}
                    onNewSession={onNewSession}
                    onDeleteSession={onDeleteSession}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Camera Modal */}
                <CameraModal
                    showCamera={showCamera}
                    cameraStream={cameraStream}
                    setCameraStream={setCameraStream}
                    onClose={closeCamera}
                    onCapture={handleCameraCapture}
                />

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
                    {/* History Button - Top Right */}
                    {showHistoryButton && (
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${showHistory
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700/80 hover:bg-gray-600/80 text-gray-300'
                                }`}
                            title="Chat History"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            History
                        </button>
                    )}

                    {messages.length === 0 ? (
                        <div className="text-center text-gray-400 mt-8">
                            <p className="text-lg mb-2">Start a conversation</p>
                            <p className="text-sm">Type a message, attach files, or upload images</p>
                        </div>
                    ) : (
                        messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {/* Three-dot menu for user messages (left side) */}
                                {msg.role === 'user' && (
                                    <MessageActions
                                        message={msg}
                                        messageIndex={index}
                                        isUserMessage={true}
                                        onEdit={(idx) => {
                                            setEditingMessageIndex(idx);
                                            setEditText(msg.text || '');
                                        }}
                                        onRetry={onRetryMessage}
                                        openMenuIndex={openMenuIndex}
                                        setOpenMenuIndex={setOpenMenuIndex}
                                    />
                                )}

                                <div
                                    className={`max-w-[80%] rounded-2xl p-4 relative ${msg.role === 'user'
                                        ? 'bg-blue-600/80 text-white'
                                        : 'bg-gray-700/60 text-gray-100'
                                        }`}
                                >
                                    {/* Editing mode */}
                                    {editingMessageIndex === index ? (
                                        <div className="space-y-2">
                                            <textarea
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                className="w-full bg-gray-800/60 text-white rounded-lg p-2 resize-none border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows={3}
                                                autoFocus
                                            />
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => {
                                                        setEditingMessageIndex(null);
                                                        setEditText('');
                                                    }}
                                                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (onEditMessage && editText.trim()) {
                                                            onEditMessage(index, editText, msg.files || []);
                                                        }
                                                        setEditingMessageIndex(null);
                                                        setEditText('');
                                                    }}
                                                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                                                >
                                                    Save & Submit
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <MessageContent message={msg} getFileIcon={getFileIcon} />
                                    )}
                                </div>

                                {/* Three-dot menu for AI messages (right side) */}
                                {msg.role === 'assistant' && (
                                    <MessageActions
                                        message={msg}
                                        messageIndex={index}
                                        isUserMessage={false}
                                        onRetry={onRetryMessage}
                                        openMenuIndex={openMenuIndex}
                                        setOpenMenuIndex={setOpenMenuIndex}
                                    />
                                )}
                            </div>
                        ))
                    )}

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-700/60 rounded-2xl p-4">
                                <div className="flex gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <ChatInput
                    inputText={inputText}
                    setInputText={setInputText}
                    attachedFiles={attachedFiles}
                    setAttachedFiles={setAttachedFiles}
                    isConnected={isConnected}
                    onSend={handleSend}
                    showHistoryButton={showHistoryButton}
                    onToggleHistory={() => setShowHistory(!showHistory)}
                    showHistory={showHistory}
                    getFileIcon={getFileIcon}
                />
            </div>
        </div>
    );
}
