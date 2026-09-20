import { PantaClient, formatUsdc } from '@panta-pulse/core';
import type { MarketDraft } from './draft.js';

export interface PipelineResult {
  draft: MarketDraft;
  quote: unknown;
  unsignedTransaction: string;
  derived: Record<string, string>;
  feeUsdc: string;
}

interface QuoteResponse {
  createId: string;
  paymentUsdc: string | number;
}

interface BuildResponse {
  transaction: string;
  derived?: Record<string, unknown>;
}

interface PipelineClient {
  quoteCreateMarket(input: unknown): Promise<unknown>;
  buildCreateTransaction(createId: string): Promise<BuildResponse>;
}

function isQuoteResponse(value: unknown): value is QuoteResponse {
  return typeof value === 'object' && value !== null && 'createId' in value && typeof (value as { createId?: unknown }).createId === 'string' && 'paymentUsdc' in value && typeof (value as { paymentUsdc?: unknown }).paymentUsdc !== 'undefined';
}

function isBuildResponse(value: unknown): value is BuildResponse {
  return typeof value === 'object' && value !== null && 'transaction' in value && typeof (value as { transaction?: unknown }).transaction === 'string';
}

export async function runPipeline(client: PantaClient | PipelineClient, input: Record<string, unknown>, llm: (prompt: string) => Promise<string>): Promise<PipelineResult> {
  const draft = await import('./draft.js').then((draftModule) => draftModule.draftFromNews(input as never, llm));
  const quoteValue = await client.quoteCreateMarket({ ...input, ...draft } as never);
  if (!isQuoteResponse(quoteValue)) throw new Error('Panta quote did not include a createId');
  const quote = quoteValue;
  const createId = quote.createId;
  const builtValue = await client.buildCreateTransaction(createId);
  if (!isBuildResponse(builtValue)) {
    throw new Error('Panta build response did not include an unsigned transaction');
  }
  const built = builtValue;
  const derivedValue = built.derived;
  const derived = typeof derivedValue === 'object' && derivedValue !== null && !Array.isArray(derivedValue)
    ? Object.fromEntries(Object.entries(derivedValue).map(([key, value]) => [key, String(value)]))
    : {};
  return {
    draft,
    quote,
    unsignedTransaction: built.transaction,
    derived,
    feeUsdc: formatUsdc(quote.paymentUsdc),
  };
}
