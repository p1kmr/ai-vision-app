'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';

export default function Chatbox({
  messages,
  onSendMessage,
  isConnected,
  isLoading
}) {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
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

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Check if item is an image
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

    // Add paste event listener to document
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

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use rear camera on mobile
          width: { ideal: 4096 }, // Request high resolution for better text readability
          height: { ideal: 2160 },
          aspectRatio: { ideal: 16/9 }
        },
        audio: false
      });
      setCameraStream(stream);
      setShowCamera(true);

      // Wait for video element to be available
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error('Camera access error:', error);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    // Create canvas to capture photo at full resolution
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');

    // Use high quality settings for better text/code readability
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(videoRef.current, 0, 0);

    // Convert canvas to blob - use PNG for lossless quality (better for text/code)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera-${Date.now()}.png`, { type: 'image/png' });
        const newFile = {
          file,
          preview: URL.createObjectURL(blob),
          type: 'image/png',
          name: file.name
        };
        setAttachedFiles(prev => [...prev, newFile]);
        closeCamera();
      }
    }, 'image/png'); // PNG format for lossless quality
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
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden relative">
      {/* Camera Modal */}
      {showCamera && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
          {/* Camera Preview */}
          <div className="flex-1 relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          </div>

          {/* Camera Controls */}
          <div className="p-4 bg-gray-900 flex items-center justify-between">
            <button
              onClick={closeCamera}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={capturePhoto}
              className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 hover:border-blue-500 transition-colors flex items-center justify-center"
            >
              <div className="w-12 h-12 bg-white rounded-full"></div>
            </button>

            <div className="w-20"></div>
          </div>
        </div>
      )}

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
                {/* Text content with markdown rendering */}
                {msg.text && (
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Custom code block renderer
                        code({ node, inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const language = match ? match[1] : '';

                          return !inline ? (
                            <div className="relative group my-2">
                              {/* Language label */}
                              {language && (
                                <div className="absolute top-0 right-0 px-2 py-1 text-xs text-gray-400 bg-gray-800 rounded-bl rounded-tr">
                                  {language}
                                </div>
                              )}
                              {/* Code block with syntax highlighting */}
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={language || 'text'}
                                PreTag="div"
                                customStyle={{
                                  margin: 0,
                                  borderRadius: '0.5rem',
                                  padding: '1rem',
                                  fontSize: '0.875rem',
                                  backgroundColor: '#1e1e1e',
                                }}
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            // Inline code
                            <code
                              className="px-1.5 py-0.5 rounded bg-gray-800/80 text-blue-300 font-mono text-sm"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                        // Custom paragraph renderer
                        p({ children }) {
                          return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>;
                        },
                        // Custom list renderers
                        ul({ children }) {
                          return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                        },
                        ol({ children }) {
                          return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                        },
                        li({ children }) {
                          return <li className="ml-4">{children}</li>;
                        },
                        // Custom heading renderers
                        h1({ children }) {
                          return <h1 className="text-2xl font-bold mb-2 mt-4">{children}</h1>;
                        },
                        h2({ children }) {
                          return <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>;
                        },
                        h3({ children }) {
                          return <h3 className="text-lg font-bold mb-2 mt-2">{children}</h3>;
                        },
                        // Custom link renderer
                        a({ href, children }) {
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {children}
                            </a>
                          );
                        },
                        // Custom blockquote renderer
                        blockquote({ children }) {
                          return (
                            <blockquote className="border-l-4 border-gray-600 pl-4 italic my-2">
                              {children}
                            </blockquote>
                          );
                        },
                        // Custom table renderers
                        table({ children }) {
                          return (
                            <div className="overflow-x-auto my-2">
                              <table className="min-w-full border border-gray-600">{children}</table>
                            </div>
                          );
                        },
                        th({ children }) {
                          return (
                            <th className="border border-gray-600 px-4 py-2 bg-gray-800 font-bold">
                              {children}
                            </th>
                          );
                        },
                        td({ children }) {
                          return <td className="border border-gray-600 px-4 py-2">{children}</td>;
                        },
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
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
          {/* Attachment button with camera support */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 bg-gray-700/60 hover:bg-gray-600/60 rounded-full flex items-center justify-center transition-colors border border-gray-600/50"
            title="Attach files or take photo"
          >
            <span className="text-xl">📎</span>
          </button>

          {/* Hidden file input with camera capture support */}
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
