import { describe, expect, it, vi } from 'vitest';
import { draftFromNews, PANTA_CATEGORIES, validateDraft } from '../src/draft.js';
import type { MarketDraft } from '../src/draft.js';

const base: MarketDraft = {
  question: 'Will Solana reach 100k TPS?',
  resolutionRule: 'Resolve YES if the public test reports at least 100,000 TPS; otherwise NO.',
  sourcesOfTruth: ['https://solana.com/news'],
  category: 'crypto',
  imageUrl: 'https://images.example.com/solana.png',
  startTime: 2_000_000_000,
  endTime: 2_000_604_800,
  resolutionTime: 2_000_608_400,
  rationale: 'A measurable public benchmark.',
};

describe('validateDraft', () => {
  it('accepts a complete valid draft', () => expect(validateDraft(base)).toEqual([]));
  it('rejects an empty question', () => expect(validateDraft({ ...base, question: '' }).some((problem) => problem.includes('question'))).toBe(true));
  it('rejects a question over 512 characters', () => expect(validateDraft({ ...base, question: `${'x'.repeat(513)}?` })).toBeTruthy());
  it('rejects a question without a question mark', () => expect(validateDraft({ ...base, question: 'Will this happen' }).some((problem) => problem.includes('question'))).toBe(true));
  it('rejects an empty or long resolution rule', () => {
    expect(validateDraft({ ...base, resolutionRule: '' })).toBeTruthy();
    expect(validateDraft({ ...base, resolutionRule: 'x'.repeat(2049) })).toBeTruthy();
  });
  it('rejects empty, excessive, and invalid source lists', () => {
    expect(validateDraft({ ...base, sourcesOfTruth: [] })).toBeTruthy();
    expect(validateDraft({ ...base, sourcesOfTruth: Array(21).fill('https://example.com') })).toBeTruthy();
    expect(validateDraft({ ...base, sourcesOfTruth: ['not-a-url'] })).toBeTruthy();
  });
  it('rejects an unsupported category', () => expect(validateDraft({ ...base, category: 'unknown' })).toBeTruthy());
  it('rejects invalid time ordering', () => {
    expect(validateDraft({ ...base, endTime: base.startTime - 1 })).toBeTruthy();
    expect(validateDraft({ ...base, resolutionTime: base.endTime - 1 })).toBeTruthy();
  });
  it('rejects a start time less than one hour from now', () => expect(validateDraft({ ...base, startTime: 1_999_996_399 })).toBeTruthy());
  it('rejects invalid image URLs', () => expect(validateDraft({ ...base, imageUrl: 'data:text/plain,no' })).toBeTruthy());
  it('exposes the exact category allowlist', () => expect(PANTA_CATEGORIES).toEqual(['sports', 'crypto', 'politics', 'entertainment', 'finance', 'science', 'world', 'other']));
});

describe('draftFromNews', () => {
  it('strips a json fence and uses defaults for missing fields', async () => {
    const llm = vi.fn().mockResolvedValue('```json\n{"question":"Will it happen?"}\n```');
    const draft = await draftFromNews({ headline: 'It happened', sourceUrl: 'https://example.com/news', nowSeconds: 1_999_990_000 }, llm);
    expect(draft.question).toBe('Will it happen?');
    expect(draft.startTime).toBe(1_999_997_200);
    expect(draft.endTime).toBe(2_000_594_800);
    expect(draft.resolutionTime).toBe(2_000_598_400);
    expect(draft.sourcesOfTruth).toEqual(['https://example.com/news']);
  });
  it('finds the first JSON object block', async () => {
    const llm = vi.fn().mockResolvedValue('Here is the result:\n{"question":"Will it happen?","resolutionRule":"Yes if it happens.","category":"crypto","sourcesOfTruth":["https://example.com"],"imageUrl":"https://images.example.com/a.png","startTime":2000000000,"endTime":2000604800,"resolutionTime":2000608400}\n');
    await expect(draftFromNews({ headline: 'It happened', sourceUrl: 'https://example.com', nowSeconds: 1_999_990_000 }, llm)).resolves.toMatchObject({ question: 'Will it happen?' });
  });
  it('throws when the LLM output remains invalid', async () => {
    const llm = vi.fn().mockResolvedValue('{"question":"No question mark","resolutionRule":"x","sourcesOfTruth":["https://example.com"],"category":"crypto","imageUrl":"https://images.example.com/a.png","startTime":2000000000,"endTime":2000604800,"resolutionTime":2000608400}');
    await expect(draftFromNews({ headline: 'It happened', sourceUrl: 'https://example.com', nowSeconds: 1_999_990_000 }, llm)).rejects.toThrow('Invalid market draft');
  });
});
