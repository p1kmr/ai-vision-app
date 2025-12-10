import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Configure API route for long-running requests (o3 can take 2-5 minutes)
export const maxDuration = 300; // 5 minutes (Vercel Pro plan supports up to 300s)
export const dynamic = 'force-dynamic'; // Disable static optimization

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, model, apiKey, tokenLimit } = body;

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

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });

    // Build API parameters based on model
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

      // Count images in the request for logging
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

    console.log(`[API] Calling ${model} with ${messages.length} messages`);

    // Call OpenAI Chat Completions API
    const completion = await openai.chat.completions.create(completionParams);

    // Get assistant response
    const responseText = completion.choices[0]?.message?.content || 'No response generated';

    console.log(`[API] Response received from ${model}`);

    return NextResponse.json({
      success: true,
      text: responseText,
      model: model,
      usage: completion.usage
    });

  } catch (error) {
    console.error('[API] Chat error:', error);
    console.error('[API] Error message:', error.message);
    console.error('[API] Error status:', error.status);

    // Don't expose internal error details to client (security issue)
    // Only log detailed errors server-side
    let userMessage = 'Failed to process chat request';

    // Provide specific user-friendly messages for common errors
    if (error.message?.includes('API key')) {
      userMessage = 'Invalid API key';
    } else if (error.message?.includes('rate limit')) {
      userMessage = 'Rate limit exceeded. Please try again later';
    } else if (error.message?.includes('timeout')) {
      userMessage = 'Request timed out. Please try again';
    } else if (error.message?.includes('model')) {
      userMessage = 'Invalid model or model not available';
    } else if (error.message?.includes('content') || error.message?.includes('image')) {
      userMessage = 'Image processing error. Try fewer or smaller images.';
    } else if (error.message?.includes('maximum context length') || error.message?.includes('token')) {
      userMessage = 'Request too large. Try with fewer images or a shorter message.';
    } else if (error.status === 400) {
      userMessage = error.message || 'Bad request - check your input';
    }

    return NextResponse.json(
      { error: userMessage, details: error.message },
      { status: error.status || 500 }
    );
  }
}

