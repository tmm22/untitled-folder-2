import { translateText } from '@/lib/pipelines/openai';

interface TranslateDocumentOptions {
  apiKey?: string | null;
}

export async function translateDocumentText(
  text: string,
  targetLanguageCode: string,
  options: TranslateDocumentOptions = {},
): Promise<string> {
  return await translateText(text, {
    targetLanguage: targetLanguageCode,
    keepOriginal: false,
    apiKey: options.apiKey ?? undefined,
  });
}
