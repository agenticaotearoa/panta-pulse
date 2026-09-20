import { describe, expect, it, vi } from 'vitest';
import { formatPrice, formatRelativeTime, formatUsdc, normalizeMarket, PantaClient, PantaError, toUnixSeconds, validateMarketImageUrl, type QuoteCreateRequest } from '../src/panta';

describe('time and formatting utilities', () => {
  it('converts unix seconds and numeric strings', () => {
    expect(toUnixSeconds(1786595400)).toBe(1786595400);
    expect(toUnixSeconds('1786595400')).toBe(1786595400);
  });

  it('converts ISO strings and floors milliseconds', () => {
    expect(toUnixSeconds('2026-01-01T00:00:00Z')).toBe(1767225600);
    expect(toUnixSeconds(1786595400123)).toBe(1786595400);
  });

  it('rejects null, undefined, and garbage times', () => {
    expect(toUnixSeconds(null)).toBeNull();
    expect(toUnixSeconds(undefined)).toBeNull();
    expect(toUnixSeconds('not-a-date')).toBeNull();
  });

  it('formats USDC base units with integer math', () => {
    expect(formatUsdc('50000000')).toBe('50.00');
    expect(formatUsdc('1000000')).toBe('1.00');
    expect(formatUsdc('')).toBe('0.00');
    expect(formatUsdc(null)).toBe('0.00');
  });

  it('formats prices and relative times', () => {
    expect(formatPrice(0.5)).toBe('0.5000');
    expect(formatPrice(null)).toBe('—');
    expect(formatRelativeTime(null, 100)).toBe('—');
    expect(formatRelativeTime(99, 100)).toBe('ended');
    expect(formatRelativeTime(180, 100)).toBe('in 1m');
    expect(formatRelativeTime(3700, 100)).toBe('in 1h');
    expect(formatRelativeTime(172900, 100)).toBe('in 2d');
  });
});

describe('market normalization', () => {
  it('uses the title fallback chain and detects text quality', () => {
    expect(normalizeMarket({ marketId: 'market-123456789', category: 'Sports', title: '  ' , description: 'Description' })).toMatchObject({ title: 'Description', textQuality: 'description-only' });
    expect(normalizeMarket({ marketId: 'market-123456789', category: 'Sports', description: null })).toMatchObject({ title: 'Untitled market market-1', textQuality: 'none' });
  });

  it('uses the first image and full text quality', () => {
    expect(normalizeMarket({ marketId: 'm', category: 'Sports', title: 'Title', description: 'Description', images: ['', 'https://example.com/image.png'] })).toMatchObject({ image: 'https://example.com/image.png', textQuality: 'full' });
  });

  it('applies price fallbacks without turning all-null into zero', () => {
    expect(normalizeMarket({ marketId: 'm', category: 'Sports', yesPrice: '', primaryYesPrice: '0.2', secondaryYesPrice: '0.3', noPrice: null, primaryNoPrice: '0.8' })).toMatchObject({ yesPrice: 0.2, noPrice: 0.8 });
    expect(normalizeMarket({ marketId: 'm', category: 'Sports' })).toMatchObject({ yesPrice: null, noPrice: null });
  });

  it('normalizes volume, phase, and resolved status', () => {
    expect(normalizeMarket({ marketId: 'm', category: 'Sports', volumeUsdc: '2.50', phase: null, status: 'resolved' })).toMatchObject({ volumeUsdc: '2.50', phase: '', isResolved: true });
    expect(normalizeMarket({ marketId: 'm', category: 'Sports', totalVolumeUsdc: '', volumeUsdc: null, resolved: true })).toMatchObject({ volumeUsdc: '0.00', isResolved: true });
  });
});

describe('image URL validation', () => {
  it('accepts public HTTP and HTTPS URLs', () => {
    expect(validateMarketImageUrl('https://example.com/image.png')).toBe(true);
    expect(validateMarketImageUrl('http://example.com/image.png')).toBe(true);
  });

  it('rejects data URLs, empty values, and local hosts', () => {
    expect(validateMarketImageUrl('')).toBe(false);
    expect(validateMarketImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(validateMarketImageUrl('http://localhost/image.png')).toBe(false);
    expect(validateMarketImageUrl('https://10.0.0.1/image.png')).toBe(false);
    expect(validateMarketImageUrl('https://192.168.1.2/image.png')).toBe(false);
  });
});

describe('PantaClient', () => {
  const request: QuoteCreateRequest = { wallet: 'wallet', question: 'Question', resolutionRule: 'Rule', sourcesOfTruth: ['https://example.com'], category: 'Sports', startTime: 1, endTime: 2, resolutionTime: 3, imageUrl: 'https://example.com/image.png' };

  it('sends a trailing-slash URL and API key header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = new PantaClient({ apiKey: 'secret', fetchImpl });
    await client.listMarkets({ limit: 2 });
    expect(fetchImpl).toHaveBeenCalled();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/\/markets\?limit=2$/);
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    expect((fetchImpl.mock.calls[0]?.[1]?.headers as Headers).get('X-Api-Key')).toBe('secret');
  });

  it('maps a JSON 400 body to PantaError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'invalid_request', message: 'Bad request', fields: { wallet: ['required'] } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const client = new PantaClient({ fetchImpl });
    await expect(client.getMarket('bad')).rejects.toMatchObject({ code: 'invalid_request', status: 400, fields: { wallet: ['required'] } });
  });

  it('uses a generic code for non-JSON errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('failure', { status: 500 }));
    const client = new PantaClient({ fetchImpl });
    await expect(client.getCategories()).rejects.toBeInstanceOf(PantaError);
    await expect(client.getCategories()).rejects.toMatchObject({ code: 'unknown_error', status: 500 });
  });

  it('fetches market trades from the trailing-slash endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ marketId: 'market-1', items: [] }), { status: 200 }));
    const client = new PantaClient({ fetchImpl });
    await client.getMarketTrades('market-1');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://live-api.panta.market/api/v1/markets/market-1/trades/');
  });

  it('requests a signed image upload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uploadUrl: 'https://example.com' }), { status: 200 }));
    const client = new PantaClient({ fetchImpl });
    await client.requestImageUpload('image/png');
    expect(fetchImpl).toHaveBeenCalledWith('https://live-api.panta.market/api/v1/markets/create/image-upload/', expect.objectContaining({ method: 'POST' }));
    expect((fetchImpl.mock.calls[0]?.[1]?.body as string)).toContain('image/png');
  });

  it('gets trade status by signature', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'pending' }), { status: 200 }));
    const client = new PantaClient({ fetchImpl });
    await client.getTradeStatus('sig/with spaces');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://live-api.panta.market/api/v1/trades/status/?signature=sig%2Fwith%20spaces');
  });

  it('reports a trade to the trailing-slash endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'reported' }), { status: 200 }));
    const client = new PantaClient({ fetchImpl });
    await client.reportTrade({ signature: 'sig', wallet: 'wallet', marketId: 'market-1' });
    expect(fetchImpl).toHaveBeenCalledWith('https://live-api.panta.market/api/v1/trades/report/', expect.objectContaining({ method: 'POST' }));
  });
});
