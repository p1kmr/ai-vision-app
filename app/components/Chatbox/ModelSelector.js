'use client';

import { useState, useRef, useEffect } from 'react';

// Model configurations for different providers
export const MODEL_CONFIGS = {
    gemini: {
        providerName: 'Google Gemini',
        models: [
            {
                id: 'gemini-1.5-pro',
                name: 'Gemini 1.5 Pro',
                shortName: '1.5 Pro',
                description: 'Most capable - Advanced reasoning',
                features: '1M context, vision + reasoning',
                recommended: true,
                type: 'chat'
            },
            {
                id: 'gemini-1.5-flash',
                name: 'Gemini 1.5 Flash',
                shortName: '1.5 Flash',
                description: 'Fast & efficient',
                features: 'Quick responses, vision support',
                recommended: false,
                type: 'chat'
            },
            {
                id: 'gemini-2.0-flash-exp',
                name: 'Gemini 2.0 Flash',
                shortName: '2.0 Flash',
                description: 'Latest experimental',
                features: 'Multimodal, fast',
                recommended: false,
                type: 'experimental'
            }
        ]
    },
    openai: {
        providerName: 'OpenAI',
        models: [
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                shortName: 'GPT-4o',
                description: 'Most capable model',
                features: 'Vision + Text',
                recommended: true,
                type: 'chat'
            },
            {
                id: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                shortName: '4o Mini',
                description: 'Fast & affordable',
                features: 'Vision + Text',
                recommended: false,
                type: 'chat'
            },
            {
                id: 'o3',
                name: 'OpenAI o3',
                shortName: 'o3',
                description: 'Advanced reasoning',
                features: 'Superior reasoning',
                recommended: false,
                type: 'reasoning',
                requiresTokenLimit: true
            },
            {
                id: 'gpt-4o-realtime-preview-2024-10-01',
                name: 'GPT-4o Realtime',
                shortName: 'Realtime',
                description: 'Voice capable',
                features: 'Speech-to-speech',
                recommended: false,
                type: 'realtime'
            },
            {
                id: 'gpt-4o-mini-realtime-preview-2024-12-17',
                name: 'GPT-4o Mini Realtime',
                shortName: 'Mini RT',
                description: 'Lighter realtime',
                features: 'Fast audio',
                recommended: false,
                type: 'realtime'
            }
        ]
    }
};

// Get all chat-compatible models (non-realtime)
export const getChatModels = () => {
    const chatModels = [];

    // Gemini models (all work with chat)
    MODEL_CONFIGS.gemini.models.forEach(model => {
        chatModels.push({
            ...model,
            provider: 'gemini',
            providerName: 'Gemini'
        });
    });

    // OpenAI chat models (exclude realtime)
    MODEL_CONFIGS.openai.models
        .filter(model => model.type !== 'realtime')
        .forEach(model => {
            chatModels.push({
                ...model,
                provider: 'openai',
                providerName: 'OpenAI'
            });
        });

    return chatModels;
};

// Get model by ID
export const getModelById = (modelId) => {
    for (const provider of Object.values(MODEL_CONFIGS)) {
        const model = provider.models.find(m => m.id === modelId);
        if (model) return model;
    }
    return null;
};

// Get provider for a model
export const getProviderForModel = (modelId) => {
    for (const [providerId, provider] of Object.entries(MODEL_CONFIGS)) {
        if (provider.models.some(m => m.id === modelId)) {
            return providerId;
        }
    }
    return null;
};

export default function ModelSelector({
    currentModel,
    currentProvider,
    onModelChange,
    disabled = false,
    showOnlyChat = true, // By default, only show chat-compatible models
    compact = false // Compact mode for inline display
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Get available models based on mode
    const availableModels = showOnlyChat ? getChatModels() : [
        ...MODEL_CONFIGS.gemini.models.map(m => ({ ...m, provider: 'gemini', providerName: 'Gemini' })),
        ...MODEL_CONFIGS.openai.models.map(m => ({ ...m, provider: 'openai', providerName: 'OpenAI' }))
    ];

    // Get current model info
    const currentModelInfo = availableModels.find(m => m.id === currentModel) || availableModels[0];

    const handleModelSelect = (model) => {
        if (disabled) return;
        onModelChange(model.id, model.provider);
        setIsOpen(false);
    };

    // Compact inline selector
    if (compact) {
        return (
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all ${disabled
                        ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700/60 hover:bg-gray-600/60 text-gray-200 cursor-pointer border border-gray-600/50'
                        }`}
                    title="Switch Model"
                >
                    <span className="font-medium">{currentModelInfo?.shortName || currentModel}</span>
                    <svg
                        className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Dropdown Menu - Opens downward */}
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800/95 backdrop-blur-xl rounded-xl border border-gray-700/50 shadow-2xl z-50 overflow-hidden">
                        <div className="p-2 border-b border-gray-700/50">
                            <p className="text-xs text-gray-400 font-medium">Switch Model</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {/* Group by provider */}
                            {Object.entries(
                                availableModels.reduce((acc, model) => {
                                    if (!acc[model.providerName]) acc[model.providerName] = [];
                                    acc[model.providerName].push(model);
                                    return acc;
                                }, {})
                            ).map(([providerName, models]) => (
                                <div key={providerName}>
                                    <div className="px-3 py-1.5 bg-gray-900/50">
                                        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                            {providerName}
                                        </span>
                                    </div>
                                    {models.map((model) => (
                                        <button
                                            key={model.id}
                                            onClick={() => handleModelSelect(model)}
                                            className={`w-full text-left px-3 py-2 transition-all ${model.id === currentModel
                                                ? 'bg-blue-600/20 border-l-2 border-blue-500'
                                                : 'hover:bg-gray-700/50 border-l-2 border-transparent'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-white font-medium">
                                                            {model.name}
                                                        </span>
                                                        {model.recommended && (
                                                            <span className="px-1 py-0.5 bg-green-600/30 text-green-400 text-[9px] rounded font-medium">
                                                                REC
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {model.description}
                                                    </p>
                                                </div>
                                                {model.id === currentModel && (
                                                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full selector (for settings/header)
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-xl text-sm transition-all ${disabled
                    ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700/60 hover:bg-gray-600/60 text-gray-200 cursor-pointer border border-gray-600/50'
                    }`}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${currentModelInfo?.provider === 'openai' ? 'bg-green-400' : 'bg-blue-400'
                        }`} />
                    <div className="text-left">
                        <div className="font-medium">{currentModelInfo?.name || currentModel}</div>
                        <div className="text-xs text-gray-400">{currentModelInfo?.description}</div>
                    </div>
                </div>
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-gray-800/95 backdrop-blur-xl rounded-xl border border-gray-700/50 shadow-2xl z-50 overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                        {/* Group by provider */}
                        {Object.entries(
                            availableModels.reduce((acc, model) => {
                                if (!acc[model.providerName]) acc[model.providerName] = [];
                                acc[model.providerName].push(model);
                                return acc;
                            }, {})
                        ).map(([providerName, models]) => (
                            <div key={providerName}>
                                <div className="px-3 py-2 bg-gray-900/50 sticky top-0">
                                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                        {providerName}
                                    </span>
                                </div>
                                {models.map((model) => (
                                    <button
                                        key={model.id}
                                        onClick={() => handleModelSelect(model)}
                                        className={`w-full text-left px-3 py-3 transition-all ${model.id === currentModel
                                            ? 'bg-blue-600/20'
                                            : 'hover:bg-gray-700/50'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm text-white font-medium">
                                                        {model.name}
                                                    </span>
                                                    {model.recommended && (
                                                        <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-[10px] rounded font-medium">
                                                            RECOMMENDED
                                                        </span>
                                                    )}
                                                    {model.type === 'reasoning' && (
                                                        <span className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 text-[10px] rounded font-medium">
                                                            REASONING
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {model.description}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {model.features}
                                                </p>
                                            </div>
                                            {model.id === currentModel && (
                                                <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
