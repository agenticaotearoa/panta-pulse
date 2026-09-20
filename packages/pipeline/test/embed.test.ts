import { describe, expect, it } from 'vitest';
import {
  PANTA_ATTRIBUTION,
  toEmbedCard,
  renderDiscordMessage,
  type EmbedCard,
} from '../src/embed.js';
import type { MarketStatus } from '../src/lifecycle.js';

function status(overrides: Partial<MarketStatus> = {}): MarketStatus {
  return {
    marketId: 'EWiohz3LKFPmtWKF33K1wDj1xQUUP3Q3xfkj5Tsq9LTd',
    phase: 'primary',
    resolved: false,
    yesPrice: 0.62,
    noPrice: 0.38,
    textQuality: 'full',
    question: 'Will the automated probe resolve YES?',
    volumeUsdc: '12.34',
    ...overrides,
  };
}

const opts = { appBaseUrl: 'https://panta-pulse.example', createdFrom: 'Reuters headline' };

describe('toEmbedCard', () => {
  it('always carries the exact legally-required attribution', () => {
    expect(toEmbedCard(status(), opts).attribution).toBe('Powered by Panta');
    expect(toEmbedCard(status(), opts).attribution).toBe(PANTA_ATTRIBUTION);
  });

  it('builds a canonical deep link and tolerates a trailing slash on the base url', () => {
    expect(toEmbedCard(status(), opts).url).toBe(
      'https://panta-pulse.example/market/EWiohz3LKFPmtWKF33K1wDj1xQUUP3Q3xfkj5Tsq9LTd',
    );
    expect(toEmbedCard(status(), { ...opts, appBaseUrl: 'https://x.example/' }).url).toBe(
      'https://x.example/market/EWiohz3LKFPmtWKF33K1wDj1xQUUP3Q3xfkj5Tsq9LTd',
    );
  });

  it('carries prices, phase and resolution through unchanged', () => {
    const card = toEmbedCard(status({ resolved: true, phase: 'resolved' }), opts);
    expect(card.yesPrice).toBe(0.62);
    expect(card.noPrice).toBe(0.38);
    expect(card.resolved).toBe(true);
    expect(card.phase).toBe('resolved');
  });

  it('never yields an empty title — the live catalogue ships empty titles', () => {
    const card = toEmbedCard(status({ question: '', textQuality: 'image-only' }), opts);
    expect(card.title).not.toBe('');
    expect(card.title).toContain('EWiohz3');
    expect(card.textQuality).toBe('image-only');
  });

  it('preserves provenance', () => {
    expect(toEmbedCard(status(), opts).createdFrom).toBe('Reuters headline');
  });
});

describe('renderDiscordMessage', () => {
  it('puts the exact attribution in the always-rendered footer', () => {
    const msg = renderDiscordMessage(toEmbedCard(status(), opts));
    expect(msg.embeds[0]!.footer.text).toBe('Powered by Panta');
  });

  it('repeats the attribution in content for clients that suppress embeds', () => {
    const msg = renderDiscordMessage(toEmbedCard(status(), opts));
    expect(msg.content).toContain('Powered by Panta');
  });

  it('links the embed to the canonical market url', () => {
    const card = toEmbedCard(status(), opts);
    expect(renderDiscordMessage(card).embeds[0]!.url).toBe(card.url);
  });

  it('renders odds and shows "no live price" rather than a fake zero', () => {
    const priced = renderDiscordMessage(toEmbedCard(status(), opts));
    expect(priced.embeds[0]!.description).toContain('YES 62.0%');

    const unpriced = renderDiscordMessage(
      toEmbedCard(status({ yesPrice: null, noPrice: null }), opts),
    );
    expect(unpriced.embeds[0]!.description).toContain('no live price');
    expect(unpriced.embeds[0]!.description).not.toContain('0.0%');
  });

  it('marks resolved markets as resolved', () => {
    const msg = renderDiscordMessage(toEmbedCard(status({ resolved: true }), opts));
    expect(msg.embeds[0]!.description).toContain('resolved');
  });

  it('accepts a card built anywhere, not just from toEmbedCard', () => {
    const handMade: EmbedCard = {
      title: 'Handmade',
      marketId: 'abc',
      url: 'https://x.example/market/abc',
      yesPrice: null,
      noPrice: null,
      phase: 'secondary',
      resolved: false,
      textQuality: 'none',
      attribution: PANTA_ATTRIBUTION,
      createdFrom: 'unit test',
    };
    expect(renderDiscordMessage(handMade).embeds[0]!.title).toBe('Handmade');
  });
});
