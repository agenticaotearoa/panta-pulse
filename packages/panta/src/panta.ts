export type MarketText = 'full' | 'description-only' | 'image-only' | 'none';

export interface RawMarket {
  marketId: string;
  category: string;
  title?: string | null;
  description?: string | null;
  images?: string[] | null;
  phase?: string | null;
  status?: string | null;
  resolved?: boolean | null;
  startTime?: number | string | null;
  endTime?: number | string | null;
  resolutionTime?: number | string | null;
  yesPrice?: number | string | null;
  noPrice?: number | string | null;
  primaryYesPrice?: number | string | null;
  primaryNoPrice?: number | string | null;
  secondaryYesPrice?: number | string | null;
  secondaryNoPrice?: number | string | null;
  totalVolumeUsdc?: string | null;
  volumeUsdc?: string | null;
}

export interface NormalizedMarket {
  marketId: string;
  title: string;
  category: string;
  textQuality: MarketText;
  image: string | null;
  startTime: number | null;
  endTime: number | null;
  resolutionTime: number | null;
  yesPrice: number | null;
  noPrice: number | null;
  volumeUsdc: string;
  phase: string;
  isResolved: boolean;
}

export class PantaError extends Error {
  code: string;
  status: number;
  fields: Record<string, string[]> | undefined;

  constructor(status: number, body: { code?: string; message?: string; fields?: Record<string, string[]> }) {
    super(body.message ?? 'Request failed');
    this.name = 'PantaError';
    this.code = body.code ?? 'unknown_error';
    this.status = status;
    this.fields = body.fields;
  }
}

function isPresent(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim().length > 0;
}

function firstPrice(...values: Array<number | string | null | undefined>): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return Number(value);
    }
  }
  return null;
}

export function toUnixSeconds(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.floor(value >= 1e11 ? value / 1000 : value);
  }
  if (/^[+-]?\d+$/.test(value.trim())) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.floor(numeric >= 1e11 ? numeric / 1000 : numeric);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export function normalizeMarket(raw: RawMarket): NormalizedMarket {
  const title = isPresent(raw.title) ? raw.title!.trim() : '';
  const description = isPresent(raw.description) ? raw.description!.trim() : '';
  const image = raw.images?.find(isPresent) ?? null;
  let textQuality: MarketText;
  if (title) textQuality = 'full';
  else if (description) textQuality = 'description-only';
  else if (image) textQuality = 'image-only';
  else textQuality = 'none';
  const status = raw.status?.toLowerCase();
  return {
    marketId: raw.marketId,
    title: title || description || `Untitled market ${raw.marketId.slice(0, 8)}`,
    category: raw.category,
    textQuality,
    image,
    startTime: toUnixSeconds(raw.startTime),
    endTime: toUnixSeconds(raw.endTime),
    resolutionTime: toUnixSeconds(raw.resolutionTime),
    yesPrice: firstPrice(raw.yesPrice, raw.primaryYesPrice, raw.secondaryYesPrice),
    noPrice: firstPrice(raw.noPrice, raw.primaryNoPrice, raw.secondaryNoPrice),
    volumeUsdc: isPresent(raw.totalVolumeUsdc) ? raw.totalVolumeUsdc!.trim() : isPresent(raw.volumeUsdc) ? raw.volumeUsdc!.trim() : '0.00',
    phase: raw.phase ?? '',
    isResolved: raw.resolved === true || status === 'resolved',
  };
}

function integerString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return '0';
  const text = String(value).trim();
  return /^[+-]?\d+$/.test(text) ? text : '0';
}

export function formatUsdc(baseUnits: string | number | null | undefined): string {
  const raw = integerString(baseUnits);
  const sign = raw!.startsWith('-') ? '-' : '';
  const digits = raw!.replace(/^[+-]/, '');
  const whole = digits.length > 6 ? digits.slice(0, -6) : '0';
  const fraction = digits.length > 6 ? digits.slice(-6) : digits.padStart(6, '0');
  return `${sign}${Number(whole).toLocaleString('en-US')}.${fraction.slice(0, 2)}`;
}

export function formatPrice(price: number | null): string {
  return price === null ? '—' : price.toFixed(4);
}

export function formatRelativeTime(unixSeconds: number | null, nowSeconds: number): string {
  if (unixSeconds === null) return '—';
  if (unixSeconds <= nowSeconds) return 'ended';
  const seconds = unixSeconds - nowSeconds;
  if (seconds < 60) return 'in 1m';
  if (seconds < 3600) return `in ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `in ${Math.floor(seconds / 3600)}h`;
  return `in ${Math.floor(seconds / 86400)}d`;
}

function isPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '0.0.0.0') return true;
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}

export function validateMarketImageUrl(url: string): boolean {
  if (!url || url.toLowerCase().startsWith('data:')) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

export interface QuoteCreateRequest {
  wallet: string;
  question: string;
  resolutionRule: string;
  sourcesOfTruth: string[];
  category: string;
  startTime: number;
  endTime: number;
  resolutionTime: number;
  imageUrl: string;
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export class PantaClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts?: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.apiKey = opts?.apiKey;
    this.baseUrl = withTrailingSlash(opts?.baseUrl ?? 'https://live-api.panta.market/api/v1');
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (this.apiKey) headers.set('X-Api-Key', this.apiKey);
    const response = await this.fetchImpl(`${this.baseUrl}${path.replace(/^\/+/, '')}`, { ...init, headers });
    if (response.ok) return response;
    let body: { code?: string; message?: string; fields?: Record<string, string[]> } = {};
    try {
      const parsed: unknown = await response.json();
      if (typeof parsed === 'object' && parsed !== null) body = parsed as { code?: string; message?: string; fields?: Record<string, string[]> };
    } catch {
      body = {};
    }
    throw new PantaError(response.status, body);
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(path, init);
    return response.json() as Promise<unknown>;
  }

  async listMarkets(opts?: { limit?: number; cursor?: string; category?: string }): Promise<unknown> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.category) params.set('category', opts.category);
    const query = params.toString();
    return this.json(`markets${query ? `?${query}` : ''}`);
  }

  async getMarket(id: string): Promise<unknown> {
    return this.json(`markets/${encodeURIComponent(id)}`);
  }

  async getCategories(): Promise<unknown> {
    return this.json('categories');
  }

  async getPositions(wallet: string): Promise<unknown> {
    return this.json(`positions?wallet=${encodeURIComponent(wallet)}`);
  }

  async quoteCreateMarket(body: QuoteCreateRequest): Promise<unknown> {
    return this.json('quote/create-market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async buildCreateTransaction(createId: string): Promise<unknown> {
    return this.json(`create/${encodeURIComponent(createId)}/transaction`);
  }

  async registerMarket(createId: string, signature: string): Promise<unknown> {
    return this.json(`create/${encodeURIComponent(createId)}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature }) });
  }

  async reportTrade(body: { signature: string; wallet: string; marketId: string }): Promise<unknown> {
    return this.json('trades/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
}
