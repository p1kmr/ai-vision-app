import { NextResponse } from 'next/server';
import OpenAI from 'openai';

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

      console.log(`[API] o3 request - Token limit: ${limit}, Reasoning: ${reasoningEffort}`);
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

    return NextResponse.json(
      {
        error: error.message || 'Failed to process chat request',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
