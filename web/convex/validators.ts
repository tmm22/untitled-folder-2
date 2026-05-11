import { v } from 'convex/values';

export const pipelineStepKind = v.union(
  v.literal('clean'),
  v.literal('summarise'),
  v.literal('translate'),
  v.literal('tone'),
  v.literal('chunk'),
  v.literal('queue'),
);

export const pipelineStep = v.object({
  id: v.string(),
  kind: pipelineStepKind,
  label: v.optional(v.string()),
  options: v.object({
    preserveQuotes: v.optional(v.boolean()),
    normaliseWhitespace: v.optional(v.boolean()),
    stripBullets: v.optional(v.boolean()),
    bulletCount: v.optional(v.number()),
    includeKeywords: v.optional(v.boolean()),
    style: v.optional(v.union(v.literal('bullets'), v.literal('paragraph'))),
    targetLanguage: v.optional(v.string()),
    keepOriginal: v.optional(v.boolean()),
    tone: v.optional(v.union(v.literal('neutral'), v.literal('friendly'), v.literal('formal'), v.literal('dramatic'))),
    audienceHint: v.optional(v.string()),
    strategy: v.optional(v.union(v.literal('paragraph'), v.literal('sentence'))),
    maxCharacters: v.optional(v.number()),
    joinShortSegments: v.optional(v.boolean()),
    provider: v.optional(v.string()),
    voicePreference: v.optional(v.union(v.literal('history'), v.literal('default'), v.literal('custom'))),
    voiceId: v.optional(v.string()),
    segmentDelayMs: v.optional(v.number()),
  }),
});

export const pipelineSchedule = v.object({
  cron: v.string(),
  description: v.optional(v.string()),
});

export const pipelineDefaultSource = v.object({
  kind: v.literal('url'),
  value: v.string(),
});

export const transcriptSegment = v.object({
  start: v.number(),
  end: v.number(),
  text: v.string(),
  confidence: v.optional(v.number()),
});

