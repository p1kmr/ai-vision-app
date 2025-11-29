'use client';

import { useState, useRef, useEffect } from 'react';

export default function Chatbox({
  messages,
  onSendMessage,
  isConnected,
  isLoading
}) {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputText]);

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

  const handleSend = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;

    const messageData = {
      text: inputText,
      files: attachedFiles
    };

    onSendMessage(messageData);

    // Clear input
    setInputText('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  return (
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm">Type a message, attach files, or upload images</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user'
                    ? 'bg-blue-600/80 text-white'
                    : 'bg-gray-700/60 text-gray-100'
                }`}
              >
                {/* Text content */}
                {msg.text && (
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                )}

                {/* File attachments */}
                {msg.files && msg.files.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.files.map((file, fileIndex) => (
                      <div key={fileIndex}>
                        {file.preview ? (
                          <img
                            src={file.preview}
                            alt={file.name}
                            className="rounded-lg max-w-full h-auto"
                          />
                        ) : (
                          <div className="flex items-center gap-2 bg-gray-600/40 rounded-lg p-2">
                            <span className="text-2xl">{getFileIcon(file.type)}</span>
                            <span className="text-sm truncate">{file.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-xs opacity-70 mt-2">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
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
      <div className="border-t border-gray-700/50 p-4">
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
            className="flex-shrink-0 w-10 h-10 bg-gray-700/60 hover:bg-gray-600/60 rounded-full flex items-center justify-center transition-colors border border-gray-600/50"
            title="Attach files"
          >
            <span className="text-xl">📎</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.js,.py,.java,.cpp,.html,.css"
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
              disabled={!isConnected}
              className="w-full bg-transparent text-white resize-none outline-none max-h-32 overflow-y-auto"
              rows={1}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!isConnected || (!inputText.trim() && attachedFiles.length === 0)}
            className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50 rounded-full flex items-center justify-center transition-colors"
            title="Send message"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <div className="mt-2 text-xs text-gray-400 text-center">
            Disconnected - start a session to chat
          </div>
        )}
      </div>
    </div>
  );
}
