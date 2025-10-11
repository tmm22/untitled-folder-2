interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  apiKey?: string | null;
}

const OPENAI_CHAT_URL = process.env.OPENAI_CHAT_COMPLETIONS_URL?.trim() || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_PIPELINE_MODEL?.trim() || 'gpt-4o-mini';

export class OpenAIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIUnavailableError';
  }
}

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getApiKey());
}

async function callChatCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string | null> {
  const apiKey = options.apiKey?.trim() || getApiKey();
  if (!apiKey) {
    throw new OpenAIUnavailableError('OpenAI API key is not configured');
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: options?.maxTokens ?? 180,
      temperature: options?.temperature ?? 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return null;
  }
  return content.trim();
}

export interface SummariseOptions {
  bulletCount?: number;
  includeKeywords?: boolean;
  style?: 'bullets' | 'paragraph';
}

export async function summariseText(text: string, options: SummariseOptions = {}): Promise<string | undefined> {
  if (!isOpenAIConfigured()) {
    return undefined;
  }

  try {
    const bulletCount = options.bulletCount ?? 3;
    const style = options.style ?? 'bullets';
    const promptStyle =
      style === 'paragraph'
        ? 'Return a single concise paragraph.'
        : `Respond with ${bulletCount} bullet points.`;

    const keywordInstruction = options.includeKeywords
      ? ' Append a short list of 3 keywords in bold at the end.'
      : '';

    const content = await callChatCompletion(
      [
        {
          role: 'system',
          content: `Summarise the provided text. ${promptStyle}${keywordInstruction}`,
        },
        {
          role: 'user',
          content: text.slice(0, 6000),
        },
      ],
      { maxTokens: style === 'paragraph' ? 220 : 180 },
    );
    return content ?? undefined;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      return undefined;
    }
    console.error('OpenAI summarise failed', error);
    return undefined;
  }
}

export interface TranslateOptions {
  targetLanguage: string;
  keepOriginal?: boolean;
  apiKey?: string | null;
}

export async function translateText(text: string, options: TranslateOptions): Promise<string> {
  try {
    const result = await callChatCompletion(
      [
        {
          role: 'system',
          content: `Translate the incoming text to ${options.targetLanguage}. Preserve names and numbers.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      { maxTokens: Math.min(2000, Math.round(text.length * 1.2)), apiKey: options.apiKey ?? undefined },
    );

    if (!result) {
      throw new Error('No translation returned');
    }

    if (options.keepOriginal) {
      return `${result}\n\n---\n\n${text}`;
    }
    return result;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      throw error;
    }
    console.error('OpenAI translation failed', error);
    throw new Error('Translation failed');
  }
}

export interface ToneOptions {
  tone: 'neutral' | 'friendly' | 'formal' | 'dramatic';
  audienceHint?: string;
}

export async function adjustTone(text: string, options: ToneOptions): Promise<string> {
  try {
    const audienceInstruction = options.audienceHint
      ? `The intended audience is: ${options.audienceHint}.`
      : '';
    const result = await callChatCompletion(
      [
        {
          role: 'system',
          content: `Rewrite the input text with a ${options.tone} tone. Keep meaning intact. ${audienceInstruction}`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      {
        maxTokens: Math.min(2000, Math.round(text.length * 1.1)),
        temperature: 0.5,
      },
    );

    if (!result) {
      throw new Error('No tone-adjusted text returned');
    }

    return result;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      throw error;
    }
    console.error('OpenAI tone adjustment failed', error);
    throw new Error('Tone adjustment failed');
  }
}
