export type SummaryEngine = 'openai' | 'browser-ai' | 'extractive';

export const MAX_KEY_POINTS = 4;
export const MAX_TAGS = 5;

/**
 * Enriched summary shape shared by the OpenAI and on-device paths so both
 * entitlement tiers render identically in the Imports panel. Key points
 * expand on the summary rather than repeating it.
 */
export interface SummaryEnrichment {
  summary: string;
  keyPoints: string[];
  tags: string[];
}
