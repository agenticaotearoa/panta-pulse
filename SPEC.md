# Panta Pulse — BUILD SPEC (read this file; do not ask questions)

You are a build worker. Everything you need is here. Build exactly this. Do not redesign it.

## Goal
A submission for the **Panta API Sidetrack** of Colosseum Crypto World's Fair. Pool $5,000 USDG,
4 winners, deadline 2026-10-13. Judged ONLY on:
1. **Panta API Integration** — "How meaningfully is Panta API used within the product?"
2. **Technical Execution** — "The quality, functionality, and implementation of the product."

Requirement verbatim: "Your submission should be a working demo or compelling prototype."
"Submissions must be in English."

## The product (decided — do not change)
**Panta Pulse** turns a news item into a fully-formed, live prediction market on Panta.

It is an **agent-native market-creation pipeline**, not a browsing site:
`news/RSS item → AI drafts market spec → Panta quotes the real fee → Panta builds the unsigned
Solana transaction → wallet signs → Panta registers the market → market is live and titled`.

Plus a supporting read-only **Radar** UI so the artifact feels like a product.

Why: the sponsor said prediction markets are "usually experienced as a destination" and wants to see
"what prediction markets can become when they are built into products… beyond a traditional
prediction market platform." A creation pipeline is infrastructure other products embed.

## HARD COMPLIANCE REQUIREMENTS (violating these breaks the submission)
1. **"Powered by Panta" attribution is MANDATORY and must read exactly that.** Panta API Terms of Use
   §6.3. Place it prominently wherever Panta data appears, and link it to https://panta.market.
2. Never misrepresent simulated/cached/stale data as live (Terms §5). Label sandbox vs live clearly.
3. Never put the API key in client-side code. It is server-side only.
4. The app must never hold keys or sign. It returns **unsigned** transactions only.

## MEASURED API FACTS — these are VERIFIED, code against them, do not re-derive
Base URL: `https://live-api.panta.market/api/v1` — **trailing slashes are required on every path**.
Auth: header `X-Api-Key: pk_live_…` (or `Authorization: Bearer <jwt>`).
A `pk_test_…` key returns **sandbox fixtures only**; `pk_live_…` returns real Solana mainnet data.

Verified working endpoints:
- `GET /markets/?limit=50&cursor=…` → `{items:[…], nextCursor, disclaimer}`. Max 50 per page.
- `GET /markets/{marketId}/` → single market.
- `GET /markets/{marketId}/trades/` → `{marketId, items:[]}` (trade tape; may be empty).
- `GET /categories/` → `{categories:["sports","crypto","politics","entertainment","finance","science","world","other"]}` — this is the ONLY valid category allowlist.
- `GET /positions/?wallet=<base58>` → `{wallet, positions:[{marketId,category,side,shares,phase,claimable,claimed,outcome}], summary:{…}}`.
- `POST /markets/create/quote/` → `{createId, expectedEventPda, paymentUsdc, liquidityInjectionUsdc, platformRevenueUsdc, marketType, expiresAt, blockhashExpiryHintSec}`.
- `POST /markets/create/build/` with `{createId}` → `{transaction (base64 UNSIGNED versioned tx), recentBlockhash, lastValidBlockHeight, buildFingerprint, derived:{event, vaultAuthority, marketConfig, creatorWhitelist, creatorFeeVault}, …}`.
- `POST /markets/create/register/` with `{createId, signature}` → `{marketId, status:"registered", images:[…]}`.
- `POST /markets/create/image-upload/` with `{contentType}` → Cloudinary signed upload fields.
- `POST /trades/report/` with `{signature, wallet, marketId, quoteId?, clientOrderId?}` → attribution.
- `GET /trades/status/?signature=…` → order status.
- DO NOT call `/events/`, `/campaigns/`, `/markets/catalog/` — they 404.

Create-quote required body fields (all required):
`wallet` (base58 fee payer), `question` (≤512 chars), `resolutionRule` (≤2048),
`sourcesOfTruth` (non-empty array of strings, ≤20), `category` (allowlist above),
`startTime` (unix **seconds**, must be ≥ ~3600s in the future), `endTime`, `resolutionTime`,
`imageUrl` (publicly reachable http/https, max 2048 chars, NOT a data URL, NOT localhost/private —
there is an SSRF guard; `data:` URLs and some CDN URLs get rejected with HTTP 400).

**Measured quirks you MUST handle (this is where the technical-execution marks are):**
- `title` is EMPTY on 50/50 live markets. The real question text lives in **`description`**.
- Only 8/50 markets had any `description`; many are **image-only**. Your radar must degrade
  gracefully: question → description → image → short marketId, never a blank card.
- `startTime`/`endTime`/`resolutionTime` are **unix seconds on live** but **ISO strings in sandbox**.
  A normaliser must accept both.
- `yesPrice`/`noPrice` are often `null`; prefer `primaryYesPrice`/`secondaryYesPrice`, and when all
  are null show "no live price" rather than 0.
- `totalVolumeUsdc` is the reliable volume field (`volumeUsdc` is null on some rows).
- Live creation fee measured: `paymentUsdc` = **50000000** base units = **50 USDC** per market
  (40 platform revenue + 10 liquidity injection). So the pipeline must always quote BEFORE building,
  show the fee, and never broadcast without explicit human consent.
- `derived.creatorWhitelist` exists on chain (`3hh4H3AdyqmSeJhyPq2h7Pro2t8QrC7iwYgC8YRDLgGt`,
  owned by Panta program `6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp`) so creation MAY be
  permissioned. Surface a clear error if register fails for that reason.

## Repo layout (pnpm workspace)
```
panta-pulse/
  package.json            # pnpm workspace root, scripts: build, test, dev
  README.md               # what it is, architecture, setup, how to run, evidence
  packages/panta/         # typed client + normaliser + tests  (BUILD FIRST)
  apps/web/               # Next.js app: Radar + Market detail + Studio (creation pipeline)
  apps/mcp/               # MCP server exposing Panta as tools
```

## Stage 1 — what to build NOW: `packages/panta`
A dependency-light TypeScript package, testable with `vitest`, runnable with `tsx`.
- `src/client.ts` — `PantaClient` with an injectable fetch + baseUrl + apiKey. Methods:
  `listMarkets({limit,cursor,category,phase})`, `getMarket(id)`, `getMarketTrades(id)`,
  `getCategories()`, `getPositions(wallet)`, `quoteCreateMarket(input)`, `buildCreateTransaction(createId)`,
  `registerMarket(createId, signature)`, `requestImageUpload(contentType)`, `reportTrade(input)`,
  `getTradeStatus(signature)`. Every method typed, every error surfaced as a `PantaError` carrying
  `code`, `message`, `status` and `fields`.
- `src/normalize.ts` — the normaliser. Must handle: dual timestamp shapes (unix seconds vs ISO vs
  numeric string), the title→description→image→id fallback chain, price fallback chain, volume
  selection, and a `textQuality` flag (`'full' | 'description-only' | 'image-only' | 'none'`) so the
  UI can be honest about how much it knows about a market.
- `src/format.ts` — atomic-unit helpers (USDC has 6 decimals: `50000000` → `"50.00"`), price
  formatting, relative-time formatting.
- `test/` — **vitest tests that use FIXTURES, not the network.** Include a fixture captured from a
  real live response shape. Tests must cover: both timestamp shapes, the fallback chain producing
  `image-only`, null prices not rendering as 0, atomic-unit conversion, and error mapping.

Rules: TypeScript strict. No `any`. JSDoc on every exported function. No network calls in tests.

## Definition of done for Stage 1
`pnpm install && pnpm -C packages/panta test` passes, and `pnpm -C packages/panta exec tsc --noEmit`
is clean. Report the exact commands you ran and their real output.

## Evidence discipline (non-negotiable)
Never claim something works without running it and pasting the real output. If something fails, say
it failed and give the error. Do not invent API responses — if you need a fixture, say you are
synthesising one from the measured facts above.
