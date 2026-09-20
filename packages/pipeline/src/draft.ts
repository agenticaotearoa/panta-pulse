import { validateMarketImageUrl } from '@panta-pulse/core';

export const PANTA_CATEGORIES: readonly string[] = [
  'sports',
  'crypto',
  'politics',
  'entertainment',
  'finance',
  'science',
  'world',
  'other',
] as const;

export interface MarketDraft {
  question: string;
  resolutionRule: string;
  sourcesOfTruth: string[];
  category: string;
  imageUrl: string;
  startTime: number;
  endTime: number;
  resolutionTime: number;
  rationale: string;
}

export interface NewsInput {
  headline: string;
  summary?: string;
  sourceUrl: string;
  category?: string;
  nowSeconds: number;
  imageUrl?: string;
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function findJsonBlock(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function parseReply(reply: string): Record<string, unknown> {
  const withoutFence = reply
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  const block = findJsonBlock(withoutFence);
  if (!block) throw new Error('The LLM response did not contain a JSON object');
  const parsed: unknown = JSON.parse(block);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The LLM response must contain a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function validateDraft(d: MarketDraft): string[] {
  const problems: string[] = [];
  if (!d.question || d.question.length > 512) problems.push('question must contain between 1 and 512 characters');
  if (!d.question.endsWith('?')) problems.push('question must end with a question mark');
  if (!d.resolutionRule || d.resolutionRule.length > 2048) problems.push('resolutionRule must contain between 1 and 2048 characters');
  if (d.sourcesOfTruth.length === 0 || d.sourcesOfTruth.length > 20) problems.push('sourcesOfTruth must contain between 1 and 20 URLs');
  if (d.sourcesOfTruth.some((source) => !isHttpUrl(source))) problems.push('every sourceOfTruth must be a valid http(s) URL');
  if (!PANTA_CATEGORIES.includes(d.category)) problems.push('category must be one of the supported Panta categories');
  if (!isHttpUrl(d.imageUrl) || !validateMarketImageUrl(d.imageUrl)) problems.push('imageUrl must be a valid public http(s) URL');
  if (!(d.startTime < d.endTime)) problems.push('startTime must be before endTime');
  if (d.endTime > d.resolutionTime) problems.push('resolutionTime must be at or after endTime');
  return problems;
}

export async function draftFromNews(input: NewsInput, llm: (prompt: string) => Promise<string>): Promise<MarketDraft> {
  const prompt = JSON.stringify({
    task: 'Create a Panta prediction market from this news item.',
    input: {
      headline: input.headline,
      summary: input.summary,
      sourceUrl: input.sourceUrl,
      category: input.category,
    },
    output: {
      question: 'A quotable question ending in a question mark.',
      resolutionRule: 'A precise, objective resolution rule.',
      sourcesOfTruth: 'An array of one or more public http(s) URLs, with no more than 20 URLs.',
      category: `One of: ${PANTA_CATEGORIES.join(', ')}.`,
      imageUrl: 'A public http(s) image URL, or an empty string to use the source URL.',
      startTime: 'Unix seconds, at least 3600 seconds in the future.',
      endTime: 'Unix seconds after startTime.',
      resolutionTime: 'Unix seconds at or after endTime.',
      rationale: 'A concise explanation of why this is a measurable market.',
    },
  });
  const reply = await llm(prompt);
  const parsed = parseReply(reply);
  const nowSeconds = Number.isFinite(input.nowSeconds) ? input.nowSeconds : Math.floor(Date.now() / 1000);
  const defaultStart = nowSeconds + 7200;
  const defaultEnd = nowSeconds + 7 * 24 * 60 * 60;
  const defaultResolution = defaultEnd + 3600;
  const startTime = asNumber(parsed.startTime) ?? defaultStart;
  const endTime = asNumber(parsed.endTime) ?? defaultEnd;
  const resolutionTime = asNumber(parsed.resolutionTime) ?? defaultResolution;
  const sourcesOfTruth = asStringArray(parsed.sourcesOfTruth);
  const draft: MarketDraft = {
    question: asString(parsed.question).trim() || `${input.headline.trim()}?`,
    resolutionRule: asString(parsed.resolutionRule).trim() || `Resolve YES only if authoritative sources confirm the event described by: ${input.headline}. Otherwise resolve NO.`,
    sourcesOfTruth: sourcesOfTruth.length > 0 ? sourcesOfTruth : [input.sourceUrl],
    category: asString(parsed.category).trim() || input.category || 'other',
    imageUrl: asString(parsed.imageUrl).trim() || input.imageUrl || input.sourceUrl,
    startTime,
    endTime,
    resolutionTime,
    rationale: asString(parsed.rationale).trim() || input.summary || 'This news item describes an objectively verifiable event.',
  };
  const problems = validateDraft(draft);
  if (problems.length > 0) throw new Error(`Invalid market draft: ${problems.join('; ')}`);
  return draft;
}
