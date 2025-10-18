interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface TranscriptInsightAction {
  text: string;
  ownerHint?: string;
  dueDateHint?: string;
}

export interface TranscriptScheduleRecommendation {
  title: string;
  startWindow?: string;
  durationMinutes?: number;
  participants?: string[];
}

export interface TranscriptInsights {
  summary: string;
  actionItems: TranscriptInsightAction[];
  scheduleRecommendation?: TranscriptScheduleRecommendation | null;
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

const TRANSCRIPT_INSIGHT_PROMPT = `You are an assistant that analyses transit operations transcripts. Return a minified JSON object with this exact shape:
{
  "summary": string,
  "actionItems": Array<{ "text": string, "ownerHint"?: string, "dueDateHint"?: string }>,
  "scheduleRecommendation": { "title": string, "startWindow"?: string, "durationMinutes"?: number, "participants"?: string[] } | null
}
Keep actionItems to at most 5 clear items. Leave optional fields out or null if unknown.`;

export async function generateTranscriptInsights(transcript: string): Promise<TranscriptInsights | null> {
  if (!transcript.trim()) {
    return {
      summary: '',
      actionItems: [],
      scheduleRecommendation: null,
    };
  }

  if (!isOpenAIConfigured()) {
    return {
      summary: '',
      actionItems: [],
      scheduleRecommendation: null,
    };
  }

  try {
    const response = await callChatCompletion(
      [
        { role: 'system', content: TRANSCRIPT_INSIGHT_PROMPT },
        {
          role: 'user',
          content: transcript.slice(0, 8000),
        },
      ],
      {
        maxTokens: 400,
        temperature: 0.2,
      },
    );

    if (!response) {
      return {
        summary: '',
        actionItems: [],
        scheduleRecommendation: null,
      };
    }

    try {
      const parsed = JSON.parse(response) as TranscriptInsights;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      const actionItems = Array.isArray(parsed.actionItems)
        ? parsed.actionItems
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return null;
              }
              const text = typeof item.text === 'string' ? item.text.trim() : '';
              if (!text) {
                return null;
              }
              const ownerHint =
                typeof item.ownerHint === 'string' && item.ownerHint.trim().length > 0
                  ? item.ownerHint.trim()
                  : undefined;
              const dueDateHint =
                typeof item.dueDateHint === 'string' && item.dueDateHint.trim().length > 0
                  ? item.dueDateHint.trim()
                  : undefined;
              const candidate: TranscriptInsightAction = { text };
              if (ownerHint) {
                candidate.ownerHint = ownerHint;
              }
              if (dueDateHint) {
                candidate.dueDateHint = dueDateHint;
              }
              return candidate;
            })
            .filter((item): item is TranscriptInsightAction => item !== null)
        : [];

      const schedule = parsed.scheduleRecommendation;
      const normalizedSchedule =
        schedule && typeof schedule === 'object'
          ? {
              title: typeof schedule.title === 'string' ? schedule.title.trim() : '',
              startWindow:
                typeof schedule.startWindow === 'string' && schedule.startWindow.trim().length > 0
                  ? schedule.startWindow.trim()
                  : undefined,
              durationMinutes:
                typeof schedule.durationMinutes === 'number' && Number.isFinite(schedule.durationMinutes)
                  ? Math.max(0, Math.round(schedule.durationMinutes))
                  : undefined,
              participants: Array.isArray(schedule.participants)
                ? schedule.participants
                    .map((participant) =>
                      typeof participant === 'string' ? participant.trim() : '',
                    )
                    .filter((participant) => participant.length > 0)
                : undefined,
            }
          : null;

      return {
        summary,
        actionItems,
        scheduleRecommendation: normalizedSchedule && normalizedSchedule.title ? normalizedSchedule : null,
      };
    } catch (parseError) {
      console.warn('Failed to parse transcript insight response', parseError);
      return {
        summary: response.trim(),
        actionItems: [],
        scheduleRecommendation: null,
      };
    }
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      return {
        summary: '',
        actionItems: [],
        scheduleRecommendation: null,
      };
    }
    console.error('OpenAI transcript insight generation failed', error);
    return {
      summary: '',
      actionItems: [],
      scheduleRecommendation: null,
    };
  }
}
