import { normalizeMarket, PantaClient, type RawMarket } from '@panta-pulse/core';

export interface MarketStatus {
  marketId: string;
  phase: string;
  resolved: boolean;
  yesPrice: number | null;
  noPrice: number | null;
  textQuality: string;
  question: string;
  volumeUsdc: string;
}

export async function readStatus(client: PantaClient, marketId: string): Promise<MarketStatus> {
  const raw = await client.getMarket(marketId) as RawMarket;
  const market = normalizeMarket(raw);
  return {
    marketId: market.marketId,
    phase: market.phase,
    resolved: market.isResolved,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    textQuality: market.textQuality,
    question: market.title,
    volumeUsdc: market.volumeUsdc,
  };
}
