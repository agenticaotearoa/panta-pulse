import type { MarketStatus } from './lifecycle.js';

/**
 * The embeddable surface of Panta Pulse.
 *
 * WHY THIS FILE EXISTS
 * An independent review of this project made one finding that reshaped it: a
 * market-creation pipeline on its own is a *utility*, and the Panta sidetrack
 * brief explicitly asks for "what prediction markets can become when they are
 * built into products ... beyond a traditional prediction market platform".
 * A creation tool is still a destination. So the market has to be able to appear
 * INSIDE somebody else's product. These functions turn a normalised market into
 * the shapes a host application actually consumes: a generic card, and a Discord
 * webhook payload.
 *
 * ATTRIBUTION IS NOT OPTIONAL
 * Panta's API Terms of Use section 6 requires any Developer Product that displays
 * Panta markets to display the exact string "Powered by Panta", reasonably
 * prominently, linked to panta.market. Every payload built here carries it, and
 * the tests assert the exact wording. Do not make it configurable.
 */

/** The exact wording required by Panta's API Terms of Use, section 6.3. */
export const PANTA_ATTRIBUTION = 'Powered by Panta';

/** Where the mandatory attribution must link to (Terms section 6.4). */
export const PANTA_HOME = 'https://panta.market';

/** A host-agnostic representation of one market, ready to render anywhere. */
export interface EmbedCard {
  /** Human-readable question. Never empty — `normalizeMarket` guarantees a fallback. */
  title: string;
  marketId: string;
  /** Canonical deep link into the host product. */
  url: string;
  yesPrice: number | null;
  noPrice: number | null;
  phase: string;
  resolved: boolean;
  /**
   * How much the source catalogue actually told us about this market. The live
   * Panta catalogue ships an empty `title` on every observed row, so a host must
   * be able to render honestly rather than inventing a question.
   */
  textQuality: string;
  /** Always exactly `PANTA_ATTRIBUTION`. */
  attribution: string;
  /** Provenance for the market, e.g. the headline that produced it. */
  createdFrom: string;
}

/** Discord embed object (subset of their webhook schema that we populate). */
export interface DiscordEmbed {
  title: string;
  url: string;
  description: string;
  footer: { text: string };
}

export interface DiscordMessage {
  content: string;
  embeds: DiscordEmbed[];
}

export interface EmbedOptions {
  /** Base URL of the host product, used to build deep links. */
  appBaseUrl: string;
  /** Where this market came from, e.g. a headline or a chat message. */
  createdFrom: string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function formatOdds(price: number | null): string {
  return price === null ? 'no live price' : `${(price * 100).toFixed(1)}%`;
}

/**
 * Project a normalised market status into an embeddable card.
 *
 * Pure and total: it never throws and never returns an empty title, so a host
 * can render it unconditionally.
 */
export function toEmbedCard(status: MarketStatus, opts: EmbedOptions): EmbedCard {
  return {
    title: status.question.trim() === '' ? `Market ${status.marketId.slice(0, 8)}` : status.question,
    marketId: status.marketId,
    url: joinUrl(opts.appBaseUrl, `/market/${status.marketId}`),
    yesPrice: status.yesPrice,
    noPrice: status.noPrice,
    phase: status.phase,
    resolved: status.resolved,
    textQuality: status.textQuality,
    attribution: PANTA_ATTRIBUTION,
    createdFrom: opts.createdFrom,
  };
}

/**
 * Render a card as a Discord webhook payload.
 *
 * The attribution goes in `footer.text` because that is the field Discord always
 * renders, which is what "reasonably prominent" requires; it is repeated in
 * `content` so the text is present even for clients that suppress embeds.
 */
export function renderDiscordMessage(card: EmbedCard): DiscordMessage {
  const state = card.resolved ? 'resolved' : card.phase;
  const description =
    `${card.createdFrom}\n` +
    `YES ${formatOdds(card.yesPrice)} · NO ${formatOdds(card.noPrice)} · ${state}`;
  return {
    content: `${card.title} — ${PANTA_ATTRIBUTION}`,
    embeds: [
      {
        title: card.title,
        url: card.url,
        description,
        footer: { text: PANTA_ATTRIBUTION },
      },
    ],
  };
}
