'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';

export default function MessageContent({ message, getFileIcon }) {
    return (
        <>
            {/* Text content with markdown rendering */}
            {message.text && (
                <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const language = match ? match[1] : '';
                                return !inline ? (
                                    <div className="relative group my-2">
                                        {language && (
                                            <div className="absolute top-0 right-0 px-2 py-1 text-xs text-gray-400 bg-gray-800 rounded-bl rounded-tr">
                                                {language}
                                            </div>
                                        )}
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
                                    <code className="px-1.5 py-0.5 rounded bg-gray-800/80 text-blue-300 font-mono text-sm" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            p({ children }) {
                                return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>;
                            },
                            ul({ children }) {
                                return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                            },
                            ol({ children }) {
                                return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                            },
                            li({ children }) {
                                return <li className="ml-4">{children}</li>;
                            },
                            h1({ children }) {
                                return <h1 className="text-2xl font-bold mb-2 mt-4">{children}</h1>;
                            },
                            h2({ children }) {
                                return <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>;
                            },
                            h3({ children }) {
                                return <h3 className="text-lg font-bold mb-2 mt-2">{children}</h3>;
                            },
                            a({ href, children }) {
                                return (
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                        {children}
                                    </a>
                                );
                            },
                            blockquote({ children }) {
                                return (
                                    <blockquote className="border-l-4 border-gray-600 pl-4 italic my-2">
                                        {children}
                                    </blockquote>
                                );
                            },
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
                        {message.text}
                    </ReactMarkdown>
                </div>
            )}

            {/* File attachments */}
            {message.files && message.files.length > 0 && (
                <div className="mt-2 space-y-2">
                    {message.files.map((file, fileIndex) => (
                        <div key={fileIndex}>
                            {file.preview ? (
                                <img
                                    src={file.preview}
                                    alt={file.name}
                                    className="rounded-lg max-w-full h-auto"
                                />
                            ) : file.hadImage ? (
                                // Placeholder for images loaded from saved history
                                <div className="flex items-center gap-2 bg-gray-600/40 rounded-lg p-3 border border-dashed border-gray-500">
                                    <span className="text-2xl">🖼️</span>
                                    <div className="flex-1">
                                        <span className="text-sm text-gray-300">{file.name || 'Image'}</span>
                                        <p className="text-xs text-gray-500">Image was attached (not saved in history)</p>
                                    </div>
                                </div>
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

            {/* Image count indicator (for loaded sessions) */}
            {message.imageCount > 0 && !message.files?.some(f => f.preview) && (
                <div className="mt-1 text-xs text-gray-500">
                    📷 {message.imageCount} image{message.imageCount > 1 ? 's' : ''} were attached
                </div>
            )}

            {/* Timestamp and Token Usage */}
            <div className="flex items-center gap-2 text-xs opacity-70 mt-2">
                <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                {message.usage && (
                    <span
                        className="text-blue-300 cursor-help"
                        title={`Input: ${message.usage.prompt_tokens?.toLocaleString()} ($${((message.usage.prompt_tokens || 0) * 0.000002).toFixed(4)}) | Output: ${message.usage.completion_tokens?.toLocaleString()} ($${((message.usage.completion_tokens || 0) * 0.000008).toFixed(4)}) | Total: ${message.usage.total_tokens?.toLocaleString()} tokens`}
                    >
                        • {message.usage.completion_tokens?.toLocaleString()} tokens (~${((message.usage.prompt_tokens || 0) * 0.000002 + (message.usage.completion_tokens || 0) * 0.000008).toFixed(4)})
                    </span>
                )}
            </div>
        </>
    );
}
