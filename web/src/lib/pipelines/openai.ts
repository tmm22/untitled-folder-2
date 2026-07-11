import {
  OpenAIClient,
  OpenAIClientError,
  OpenAIUnavailableError,
} from '@/lib/openai/client';
export { OpenAIUnavailableError };

function describeOpenAIError(error: unknown): string {
  if (error instanceof OpenAIClientError) {
    return `OpenAI request failed${error.status ? ` (status ${error.status})` : ''}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

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
  maxOutputTokens?: number;
  temperature?: number;
  apiKey?: string | null;
  responseFormat?: {
    type: 'json_schema';
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  signal?: AbortSignal;
}

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function isOpenAIConfigured(): boolean {
  return OpenAIClient.isConfigured();
}

async function callChatCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string | null> {
  const apiKey = options.apiKey?.trim() ?? getApiKey();
  if (!apiKey || apiKey.length === 0) {
    throw new OpenAIUnavailableError('OpenAI API key is not configured');
  }

  const client = new OpenAIClient({ apiKey });
  const content = await client.generateText(messages, {
    maxOutputTokens: options.maxOutputTokens ?? 180,
    temperature: options.temperature ?? 0.3,
    responseFormat: options.responseFormat,
    signal: options.signal,
  });
  if (!content) {
    return null;
  }
  return content;
}

export interface SummariseOptions {
  bulletCount?: number;
  includeKeywords?: boolean;
  style?: 'bullets' | 'paragraph';
  apiKey?: string | null;
}

export async function summariseText(text: string, options: SummariseOptions = {}): Promise<string | undefined> {
  if (!options.apiKey && !isOpenAIConfigured()) {
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
      { maxOutputTokens: style === 'paragraph' ? 220 : 180, apiKey: options.apiKey },
    );
    return content ?? undefined;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      return undefined;
    }
    console.error('OpenAI summarise failed:', describeOpenAIError(error));
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
      { maxOutputTokens: Math.min(2000, Math.round(text.length * 1.2)), apiKey: options.apiKey ?? undefined },
    );

    if (!result) {
      throw new Error('No translation returned');
    }

    if (options.keepOriginal) {
      return `${result}\n\n---\n\n${text}`;
    }
    return result;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError || error instanceof OpenAIClientError) {
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
        maxOutputTokens: Math.min(2000, Math.round(text.length * 1.1)),
        temperature: 0.5,
      },
    );

    if (!result) {
      throw new Error('No tone-adjusted text returned');
    }

    return result;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError || error instanceof OpenAIClientError) {
      throw error;
    }
    console.error('OpenAI tone adjustment failed', error);
    throw new Error('Tone adjustment failed');
  }
}

export interface CleanupInstructionOptions {
  instruction: string;
}

const MAX_CLEANUP_TEXT_LENGTH = 12_000;

export async function applyTranscriptCleanup(
  text: string,
  options: CleanupInstructionOptions,
  signal?: AbortSignal,
): Promise<string> {
  const instruction = options.instruction.trim();
  if (!instruction) {
    return text;
  }

  if (!isOpenAIConfigured()) {
    return text;
  }

  const transcriptSample = text.length > MAX_CLEANUP_TEXT_LENGTH ? text.slice(0, MAX_CLEANUP_TEXT_LENGTH) : text;

  try {
    const response = await callChatCompletion(
      [
        {
          role: 'system',
          content:
            'You rewrite transcripts according to the provided instructions. Return polished text only, without commentary or formatting markers beyond paragraphs.',
        },
        {
          role: 'user',
          content: `Instruction:\n${instruction}\n\nTranscript:\n${transcriptSample}`,
        },
      ],
      {
        maxOutputTokens: Math.min(3000, Math.round(transcriptSample.length * 1.1)),
        temperature: 0.3,
        signal,
      },
    );

    if (!response) {
      return text;
    }

    return response.trim();
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      return text;
    }
    console.error('OpenAI transcript cleanup failed:', describeOpenAIError(error));
    return text;
  }
}

const TRANSCRIPT_INSIGHT_PROMPT = `You are an assistant that analyses transit operations transcripts. Return a minified JSON object with this exact shape:
{
  "summary": string,
  "actionItems": Array<{ "text": string, "ownerHint": string | null, "dueDateHint": string | null }>,
  "scheduleRecommendation": { "title": string, "startWindow": string | null, "durationMinutes": number | null, "participants": string[] | null } | null
}
Keep actionItems to at most 5 clear items. For unknown values, use null instead of omitting keys.`;

const TRANSCRIPT_INSIGHT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'actionItems', 'scheduleRecommendation'],
  properties: {
    summary: { type: 'string' },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'ownerHint', 'dueDateHint'],
        properties: {
          text: { type: 'string' },
          ownerHint: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          dueDateHint: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      },
    },
    scheduleRecommendation: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'startWindow', 'durationMinutes', 'participants'],
          properties: {
            title: { type: 'string' },
            startWindow: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
            },
            durationMinutes: {
              anyOf: [{ type: 'number' }, { type: 'null' }],
            },
            participants: {
              anyOf: [
                {
                  type: 'array',
                  items: { type: 'string' },
                },
                { type: 'null' },
              ],
            },
          },
        },
        { type: 'null' },
      ],
    },
  },
};

function normaliseTranscriptInsights(parsed: unknown, fallbackSummary: string): TranscriptInsights {
  if (!parsed || typeof parsed !== 'object') {
    return {
      summary: fallbackSummary,
      actionItems: [],
      scheduleRecommendation: null,
    };
  }

  const payload = parsed as Partial<TranscriptInsights>;
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : fallbackSummary;
  const actionItems = Array.isArray(payload.actionItems)
    ? payload.actionItems
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
        .slice(0, 5)
    : [];

  const schedule = payload.scheduleRecommendation as Partial<TranscriptScheduleRecommendation> | null | undefined;
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
}

export async function generateTranscriptInsights(
  transcript: string,
  signal?: AbortSignal,
): Promise<TranscriptInsights | null> {
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
        maxOutputTokens: 400,
        temperature: 0.2,
        responseFormat: {
          type: 'json_schema',
          name: 'transcript_insights',
          schema: TRANSCRIPT_INSIGHT_SCHEMA,
          strict: true,
        },
        signal,
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
      const parsed = JSON.parse(response) as unknown;
      return normaliseTranscriptInsights(parsed, '');
    } catch (parseError) {
      console.warn('Failed to parse transcript insight response', parseError);
      return normaliseTranscriptInsights(null, response.trim());
    }
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      return {
        summary: '',
        actionItems: [],
        scheduleRecommendation: null,
      };
    }
    console.error('OpenAI transcript insight generation failed:', describeOpenAIError(error));
    return {
      summary: '',
      actionItems: [],
      scheduleRecommendation: null,
    };
  }
}
