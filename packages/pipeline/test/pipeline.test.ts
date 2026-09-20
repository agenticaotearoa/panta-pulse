import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

const draft = {
  question: 'Will it happen?',
  resolutionRule: 'Resolve YES if it happens.',
  sourcesOfTruth: ['https://example.com'],
  category: 'crypto',
  imageUrl: 'https://images.example.com/a.png',
  startTime: 2_000_000_000,
  endTime: 2_000_604_800,
  resolutionTime: 2_000_608_400,
  rationale: 'A test market.',
};

describe('runPipeline', () => {
  it('quotes, builds, and stops at the unsigned transaction', async () => {
    const quoteCreateMarket = vi.fn().mockResolvedValue({ createId: 'create-1', paymentUsdc: '50000000' });
    const buildCreateTransaction = vi.fn().mockResolvedValue({ transaction: 'base64-unsigned', derived: { event: 'event-pda' } });
    const client = { quoteCreateMarket, buildCreateTransaction };
    const llm = vi.fn().mockResolvedValue(JSON.stringify({ question: draft.question, resolutionRule: draft.resolutionRule, sourcesOfTruth: draft.sourcesOfTruth, category: draft.category, imageUrl: draft.imageUrl, startTime: draft.startTime, endTime: draft.endTime, resolutionTime: draft.resolutionTime, rationale: draft.rationale }));
    const result = await runPipeline(client as never, { wallet: 'wallet', ...draft } as never, llm);
    expect(quoteCreateMarket).toHaveBeenCalledTimes(1);
    expect(buildCreateTransaction).toHaveBeenCalledWith('create-1');
    expect(result.feeUsdc).toBe('50.00');
    expect(result.unsignedTransaction).toBe('base64-unsigned');
    expect(client).not.toHaveProperty('sign');
    expect(client).not.toHaveProperty('broadcast');
  });
});
