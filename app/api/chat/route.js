import { NextResponse } from 'next/server';
import OpenAI from 'openai';


export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, model, apiKey, tokenLimit, provider } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Handle Gemini models
    if (provider === 'gemini' || model?.includes('gemini')) {
      return handleGeminiChat(messages, model, apiKey, tokenLimit);
    }

    // Handle OpenAI models
    return handleOpenAIChat(messages, model, apiKey, tokenLimit);

  } catch (error) {
    console.error('[API] Chat error:', error);
    console.error('[API] Error message:', error.message);

    let userMessage = 'Failed to process chat request';

    if (error.message?.includes('API key') || error.message?.includes('apiKey')) {
      userMessage = 'Invalid API key';
    } else if (error.message?.includes('rate limit') || error.message?.includes('RATE_LIMIT')) {
      userMessage = 'Rate limit exceeded. Please try again later';
    } else if (error.message?.includes('timeout')) {
      userMessage = 'Request timed out. Please try again';
    } else if (error.message?.includes('model')) {
      userMessage = 'Invalid model or model not available';
    } else if (error.message?.includes('content') || error.message?.includes('image')) {
      userMessage = 'Image processing error. Try fewer or smaller images.';
    } else if (error.message?.includes('maximum context length') || error.message?.includes('token')) {
      userMessage = 'Request too large. Try with fewer images or a shorter message.';
    } else if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      userMessage = 'API quota exceeded. Please check your billing or wait for quota reset.';
    }

    return NextResponse.json(
      { error: userMessage, details: error.message },
      { status: error.status || 500 }
    );
  }
}

// Handle OpenAI chat requests
async function handleOpenAIChat(messages, model, apiKey, tokenLimit) {
  const openai = new OpenAI({ apiKey });

  let completionParams = {
    model: model || 'gpt-4o',
    messages: messages
  };

  // Add o3-specific parameters
  if (model === 'o3') {
    const limit = parseInt(tokenLimit) || 100000;
    let reasoningEffort = 'medium';

    if (limit <= 25000) {
      reasoningEffort = 'low';
    } else if (limit >= 80000) {
      reasoningEffort = 'high';
    }

    completionParams.reasoning_effort = reasoningEffort;
    completionParams.max_completion_tokens = limit;

    let imageCount = 0;
    messages.forEach(msg => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach(item => {
          if (item.type === 'image_url') imageCount++;
        });
      }
    });

    console.log(`[API] o3 request - Token limit: ${limit}, Reasoning: ${reasoningEffort}, Images: ${imageCount}`);
  } else {
    // For GPT-4o and other models
    completionParams.max_tokens = 4096;
    completionParams.temperature = 0.7;
  }

  console.log(`[API] Calling OpenAI ${model} with ${messages.length} messages`);

  const completion = await openai.chat.completions.create(completionParams);
  const responseText = completion.choices[0]?.message?.content || 'No response generated';

  console.log(`[API] Response received from ${model}`);

  return NextResponse.json({
    success: true,
    text: responseText,
    model: model,
    usage: completion.usage
  });
}

// Handle Gemini chat requests
async function handleGeminiChat(messages, model, apiKey, tokenLimit) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use a working model - fallback to gemini-1.5-flash if needed
  let currentModel = model || 'gemini-1.5-flash';

  // Map preview models to stable versions
  if (currentModel.includes('gemini-3-pro')) {
    currentModel = 'gemini-1.5-pro'; // Gemini 3 not available yet, use 1.5 Pro
    console.log(`[API] Gemini 3 Pro not available, falling back to gemini-1.5-pro`);
  }

  // Configure generation settings - keep it simple for compatibility
  const generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 8192,
  };

  // Convert messages to Gemini format
  let geminiHistory = [];
  let currentParts = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastMessage = i === messages.length - 1;

    if (isLastMessage && msg.role === 'user') {
      // Current user message - add to currentParts
      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            currentParts.push({ text: item.text });
          } else if (item.type === 'image_url' && item.image_url?.url) {
            // Extract base64 data from data URL
            const dataUrl = item.image_url.url;
            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              currentParts.push({
                inlineData: {
                  mimeType: matches[1],
                  data: matches[2]
                }
              });
            }
          }
        }
      } else if (typeof msg.content === 'string') {
        currentParts.push({ text: msg.content });
      }
    } else {
      // History message
      const role = msg.role === 'assistant' ? 'model' : 'user';
      let parts = [];

      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            parts.push({ text: item.text });
          }
        }
      } else if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        geminiHistory.push({ role, parts });
      }
    }
  }

  console.log(`[API] Calling Gemini ${currentModel} with ${geminiHistory.length} history messages`);

  try {
    const geminiModel = genAI.getGenerativeModel({
      model: currentModel,
      generationConfig: generationConfig
    });

    const chat = geminiModel.startChat({
      history: geminiHistory
    });

    const result = await chat.sendMessage(currentParts);
    const responseText = result.response.text() || 'No response generated';

    console.log(`[API] Response received from Gemini ${currentModel}`);

    return NextResponse.json({
      success: true,
      text: responseText,
      model: currentModel,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    });
  } catch (error) {
    console.error(`[API] Gemini error:`, error.message);
    throw error;
  }
}
