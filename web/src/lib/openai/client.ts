export interface OpenAIClientConfig {
  apiKey?: string | null;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string;
}

export interface OpenAITextOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseFormat?: {
    type: 'json_schema';
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  metadata?: Record<string, string>;
}

export interface OpenAITranscriptionInput {
  file: File | Blob;
  fileName: string;
  mimeType?: string;
  model?: string;
  language?: string;
}

export interface OpenAITranscriptionSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

export interface OpenAITranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: OpenAITranscriptionSegment[];
}

export interface OpenAIRealtimeSessionInput {
  model?: string;
  voice?: string;
  instructions?: string;
  modalities?: Array<'text' | 'audio'>;
  metadata?: Record<string, string>;
}

export interface OpenAIRealtimeSessionResponse {
  id?: string;
  model?: string;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
  expires_at?: number;
  [key: string]: unknown;
}

const DEFAULT_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';
const DEFAULT_TEXT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const DEFAULT_REALTIME_MODEL = 'gpt-4o-realtime-preview';
const MAX_RETRIES = 2;

export class OpenAIClientError extends Error {
  status?: number;
  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = 'OpenAIClientError';
    this.status = options?.status;
  }
}

export class OpenAIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIUnavailableError';
  }
}

function envFlagEnabled(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function resolveApiKey(explicit?: string | null): string {
  const key = explicit?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new OpenAIUnavailableError('OpenAI API key is not configured');
  }
  return key;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) {
    return `OpenAI request failed (${response.status})`;
  }
  return `OpenAI request failed (${response.status}): ${body}`;
}

async function requestWithRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }

      const shouldRetry = response.status === 429 || response.status >= 500;
      if (!shouldRetry || attempt === MAX_RETRIES) {
        const message = await parseErrorMessage(response);
        throw new OpenAIClientError(message, { status: response.status });
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) {
        break;
      }
    }

    attempt += 1;
    const delayMs = 200 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new OpenAIClientError('OpenAI request failed');
}

function extractTextFromResponsesPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const maybeOutputText = (payload as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === 'string') {
    return maybeOutputText.trim();
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return '';
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim().length > 0) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function supportsVerboseTranscriptionResponse(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith('whisper');
}

export class OpenAIClient {
  private readonly apiKey: string;

  constructor(config: OpenAIClientConfig = {}) {
    this.apiKey = resolveApiKey(config.apiKey);
  }

  static isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async generateText(messages: OpenAIMessage[], options: OpenAITextOptions = {}): Promise<string> {
    const useResponses = envFlagEnabled('OPENAI_USE_RESPONSES_API', true);
    if (useResponses) {
      return this.generateTextViaResponses(messages, options);
    }
    return this.generateTextViaChatCompletions(messages, options);
  }

  async createTranscription(input: OpenAITranscriptionInput): Promise<OpenAITranscriptionResponse> {
    const url = process.env.OPENAI_TRANSCRIPTIONS_URL?.trim() || DEFAULT_TRANSCRIPTIONS_URL;
    const formData = new FormData();
    const model = input.model?.trim() || process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
    const useVerboseResponse = supportsVerboseTranscriptionResponse(model);
    formData.append('model', model);
    formData.append('response_format', useVerboseResponse ? 'verbose_json' : 'json');
    formData.append('temperature', '0');
    if (useVerboseResponse) {
      formData.append('timestamp_granularities[]', 'segment');
    }

    if (input.language) {
      formData.append('language', input.language);
    }

    const blob = input.file instanceof File ? input.file : new File([input.file], input.fileName, { type: input.mimeType });
    formData.append('file', blob, input.fileName);

    const response = await requestWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    return (await response.json()) as OpenAITranscriptionResponse;
  }

  async createRealtimeSession(input: OpenAIRealtimeSessionInput = {}): Promise<OpenAIRealtimeSessionResponse> {
    const url = process.env.OPENAI_REALTIME_SESSIONS_URL?.trim() || DEFAULT_REALTIME_SESSIONS_URL;
    const payload = {
      model: input.model?.trim() || process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL,
      voice: input.voice,
      modalities: input.modalities ?? ['text', 'audio'],
      instructions: input.instructions,
      metadata: input.metadata,
    };

    const response = await requestWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as OpenAIRealtimeSessionResponse;
  }

  private async generateTextViaResponses(messages: OpenAIMessage[], options: OpenAITextOptions): Promise<string> {
    const url = process.env.OPENAI_RESPONSES_URL?.trim() || DEFAULT_RESPONSES_URL;
    const payload: Record<string, unknown> = {
      model: options.model?.trim() || process.env.OPENAI_PIPELINE_MODEL?.trim() || DEFAULT_TEXT_MODEL,
      input: messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
      max_output_tokens: options.maxOutputTokens ?? 240,
      temperature: options.temperature ?? 0.3,
      metadata: options.metadata,
    };

    if (options.responseFormat) {
      payload.text = {
        format: {
          type: options.responseFormat.type,
          name: options.responseFormat.name,
          schema: options.responseFormat.schema,
          strict: options.responseFormat.strict ?? true,
        },
      };
    }

    const response = await requestWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as unknown;
    return extractTextFromResponsesPayload(json);
  }

  private async generateTextViaChatCompletions(messages: OpenAIMessage[], options: OpenAITextOptions): Promise<string> {
    const url = process.env.OPENAI_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_CHAT_COMPLETIONS_URL;
    const response = await requestWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model?.trim() || process.env.OPENAI_PIPELINE_MODEL?.trim() || DEFAULT_TEXT_MODEL,
        messages,
        max_tokens: options.maxOutputTokens ?? 240,
        temperature: options.temperature ?? 0.3,
      }),
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
