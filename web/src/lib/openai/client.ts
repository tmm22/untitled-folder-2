import { isResponsesApiEnabled } from './featureFlags';

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
  signal?: AbortSignal;
}

export interface OpenAITranscriptionInput {
  file: File | Blob;
  fileName: string;
  mimeType?: string;
  model?: string;
  language?: string;
  signal?: AbortSignal;
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
  /** GA session type. Transcription sessions do not produce audio output. */
  type?: 'realtime' | 'transcription';
  model?: string;
  voice?: string;
  instructions?: string;
  outputModalities?: Array<'text' | 'audio'>;
  signal?: AbortSignal;
}

/** Normalized server-side DTO for a minted Realtime client secret. */
export interface OpenAIRealtimeSessionResponse {
  clientSecret: string;
  expiresAt?: number;
  model?: string;
}

const DEFAULT_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
// GA Realtime mints ephemeral client secrets via /v1/realtime/client_secrets
// (the beta /v1/realtime/sessions endpoint is deprecated).
const DEFAULT_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const DEFAULT_TEXT_MODEL = 'gpt-4.1-mini';
// whisper-1 is the only transcription model that returns verbose_json with
// segment timestamps, which the transit pipeline depends on.
const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';
const DEFAULT_REALTIME_MODEL = 'gpt-realtime';
const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60_000;

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

function resolveApiKey(explicit?: string | null): string {
  const key = explicit?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new OpenAIUnavailableError('OpenAI API key is not configured');
  }
  return key;
}

function resolveTimeoutMs(): number {
  const raw = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Combine the caller's abort signal with a request timeout so server-side
 * OpenAI calls stop when the client disconnects or the deadline passes.
 */
function buildAbortSignal(callerSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (callerSignal) {
    signals.push(callerSignal);
  }
  return AbortSignal.any(signals);
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) {
    return `OpenAI request failed (${response.status})`;
  }
  return `OpenAI request failed (${response.status}): ${body}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const timeoutMs = resolveTimeoutMs();
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(url, { ...init, signal: buildAbortSignal(callerSignal, timeoutMs) });
      if (response.ok) {
        return response;
      }

      const message = await parseErrorMessage(response);
      const failure = new OpenAIClientError(message, { status: response.status });
      if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
        throw failure;
      }
      lastError = failure;
    } catch (error) {
      // 4xx client errors and caller-initiated aborts are never retryable.
      if (error instanceof OpenAIClientError && error.status !== undefined && !isRetryableStatus(error.status)) {
        throw error;
      }
      if (isAbortError(error) || callerSignal?.aborted) {
        throw error;
      }
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

interface ResponsesPayloadShape {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: unknown;
  output?: unknown;
}

function collectResponsesOutputText(payload: ResponsesPayloadShape): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return '';
  }

  const chunks: string[] = [];
  for (const item of payload.output) {
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

/**
 * Extract assistant text from a Responses API payload, surfacing failures
 * loudly instead of returning an empty string the caller cannot distinguish
 * from a real (but empty) completion.
 */
export function extractTextFromResponsesPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new OpenAIClientError('OpenAI Responses API returned an unexpected payload');
  }

  const shaped = payload as ResponsesPayloadShape;

  if (shaped.error && typeof shaped.error === 'object') {
    throw new OpenAIClientError(
      `OpenAI Responses API error: ${shaped.error.message ?? 'unknown error'}`,
    );
  }

  if (shaped.status && shaped.status !== 'completed') {
    const reason = shaped.incomplete_details?.reason;
    throw new OpenAIClientError(
      `OpenAI Responses API did not complete (status: ${shaped.status}${reason ? `, reason: ${reason}` : ''})`,
    );
  }

  return collectResponsesOutputText(shaped);
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
    if (isResponsesApiEnabled()) {
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

    const response = await requestWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      },
      input.signal,
    );

    return (await response.json()) as OpenAITranscriptionResponse;
  }

  async createRealtimeSession(input: OpenAIRealtimeSessionInput = {}): Promise<OpenAIRealtimeSessionResponse> {
    const url = process.env.OPENAI_REALTIME_SESSIONS_URL?.trim() || DEFAULT_REALTIME_CLIENT_SECRETS_URL;
    const model = input.model?.trim() || process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
    const sessionType = input.type ?? 'realtime';

    const session: Record<string, unknown> = {
      type: sessionType,
      model,
    };
    if (input.instructions && sessionType === 'realtime') {
      session.instructions = input.instructions;
    }
    if (sessionType === 'realtime') {
      session.output_modalities = input.outputModalities ?? ['audio'];
      if (input.voice?.trim()) {
        session.audio = { output: { voice: input.voice.trim() } };
      }
    }

    const response = await requestWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session }),
      },
      input.signal,
    );

    const payload = (await response.json()) as {
      value?: string;
      expires_at?: number;
      session?: { model?: string };
    };

    if (!payload.value) {
      throw new OpenAIClientError('OpenAI Realtime API did not return a client secret');
    }

    return {
      clientSecret: payload.value,
      expiresAt: payload.expires_at,
      model: payload.session?.model ?? model,
    };
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

    const response = await requestWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      options.signal,
    );

    const json = (await response.json()) as unknown;
    return extractTextFromResponsesPayload(json);
  }

  private async generateTextViaChatCompletions(messages: OpenAIMessage[], options: OpenAITextOptions): Promise<string> {
    const url = process.env.OPENAI_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_CHAT_COMPLETIONS_URL;
    const body: Record<string, unknown> = {
      model: options.model?.trim() || process.env.OPENAI_PIPELINE_MODEL?.trim() || DEFAULT_TEXT_MODEL,
      messages,
      max_tokens: options.maxOutputTokens ?? 240,
      temperature: options.temperature ?? 0.3,
    };

    if (options.responseFormat) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.responseFormat.name,
          schema: options.responseFormat.schema,
          strict: options.responseFormat.strict ?? true,
        },
      };
    }

    const response = await requestWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      options.signal,
    );

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
