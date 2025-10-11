import { translateText } from '@/lib/pipelines/openai';

export async function translateDocumentText(text: string, targetLanguageCode: string): Promise<string> {
  return await translateText(text, {
    targetLanguage: targetLanguageCode,
    keepOriginal: false,
  });
}
