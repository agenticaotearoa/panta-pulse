# Panta Pulse

**Turn a news headline into a live prediction market on Panta.**

Panta Pulse is an agent-native market-creation engine. Give it a headline; it produces a
fully-formed Panta market — question, resolution rule, sources of truth, category, image and
timing — validates it against Panta's real on-chain constraints, gets the real creation fee
quoted, and builds the real unsigned Solana transaction for a wallet to sign.

Built for the **Panta API Sidetrack** of the Colosseum Crypto World's Fair.

> **Powered by Panta**

---

## Why this exists

Panta's own brief for the sidetrack says prediction markets are *"usually experienced as a
destination"*, and asks what they become *"when they are built into products, applications, and
experiences beyond a traditional prediction market platform."*

The answer here is not another place to browse markets. It is the **engine that puts markets
into other products**: a pipeline any newsroom, sports platform, creator tool or AI agent can
call. The embeddable surface (`toEmbedCard`, `renderDiscordMessage`) plus an MCP server mean a
market can be created and displayed **inside someone else's interface**, which is the thing the
brief actually asks for.

It also fixes a real catalogue problem. Measured against the live API: the `title` field is empty
on **50 of 50** markets, and only 8 of 50 carry any description at all — so a large share of the
catalogue is an image and an ID. Markets created through this pipeline are *born with* a question,
a resolution rule and named sources of truth.

## What it does

```
headline ──▶ LLM drafts market ──▶ validated against Panta's constraints
         ──▶ POST /markets/create/quote/    (real USDC fee)
         ──▶ POST /markets/create/build/    (real unsigned Solana mainnet tx)
         ──▶ wallet signs                   ← the boundary. we stop here.
         ──▶ POST /markets/create/register/ (market goes live, titled)
```

The engine **never signs and never broadcasts**. That is not a limitation, it is Panta's custody
model, quoted from their docs: *"Panta cooks the transaction. The user signs. You file it on-chain.
Then you send the receipt."* Panta Pulse respects that boundary by construction.

## Verified against the live API

Not mock-ups. A real run on 2026-09-20 against `https://live-api.panta.market/api/v1`:

| Step | Real result |
|---|---|
| Quote | `paymentUsdc` **50.00 USDC** (40 platform + 10 liquidity injection) |
| Build | **1,632-character** base64 unsigned Solana **mainnet** versioned transaction |
| Derived accounts | `event` `GE18VEH5…`, `vaultAuthority`, `marketConfig`, `creatorWhitelist`, `creatorFeeVault` |
| Signing | local, deterministic, **never broadcast** — nothing was spent |
| Attribution | `Powered by Panta` |

Full captured output: [`evidence/live-pipeline-run-2026-09-20.json`](evidence/live-pipeline-run-2026-09-20.json)

## Quick start

```bash
pnpm install

# Draft a market from a headline (needs an OpenAI-compatible LLM endpoint)
export LLM_BASE_URL="https://openrouter.ai/api/v1"
export LLM_API_KEY="sk-or-..."
export LLM_MODEL="dots-studio/dots-3-note-preview:free"

pnpm -C packages/pipeline exec tsx src/cli.ts draft \
  --headline "Solana hits 100k TPS in a public stress test" \
  --source "https://solana.com/news" --category crypto

# Quote and build the real unsigned transaction (needs a Panta API key)
export PANTA_API_KEY="pk_live_..."
pnpm -C packages/pipeline exec tsx src/cli.ts quote \
  --headline "Solana hits 100k TPS in a public stress test" \
  --source "https://solana.com/news" --category crypto --live
```

Get a free Panta API key: `POST /auth/register/` then `POST /account/keys/` — no wallet, no KYC.
`pk_test_` keys serve sandbox fixtures only; **you need `pk_live_` for real data.**

## Layout

| Package | What it is |
|---|---|
| `packages/panta` | Typed Panta API client + catalogue normaliser. Zero runtime dependencies. |
| `packages/pipeline` | The creation engine: draft → validate → quote → build, plus the embed layer. |
| `packages/mcp` | MCP server exposing Panta as agent tools, so other agents can embed it. |

## The catalogue normaliser

The live catalogue is text-poor, and pretending otherwise produces blank UI. `normalizeMarket`
degrades honestly and reports which case it hit via `textQuality`:

- `full` — a real title
- `description-only` — the question lives in `description` (the common case)
- `image-only` — no text at all, only an image
- `none`

It also reconciles shapes the API returns inconsistently: `startTime`/`endTime`/`resolutionTime`
are **unix seconds live but ISO strings in sandbox**; prices arrive as `yesPrice`,
`primaryYesPrice` or `secondaryYesPrice` and are frequently `null` — which must render as
"no live price", never as `0`. That distinction is load-bearing: a market with no price is not a
market at 0%.

## Two API behaviours worth knowing

Both cost real debugging time and are handled explicitly:

1. **`/markets/?limit=2` — the slash comes before the query.** Panta requires a trailing slash on
   the path; `/markets?limit=2` is a different, wrong route.
2. **Most public image hosts are refused.** `imageUrl` goes through a soft check at *quote* time
   and a harder one at *build*. `https://placehold.co/1024x1024.png` passes quote and then fails
   build with an opaque `unexpected create build failure`. The pipeline defaults to a URL verified
   to complete **both** steps.

## Compliance

Panta's API Terms of Use §6 requires the exact attribution **"Powered by Panta"**, prominently
placed. It is emitted by every embed payload and asserted in the tests, so it cannot silently
disappear. The engine also never presents cached or simulated data as live.

## Tests

```bash
pnpm -C packages/panta test && pnpm -C packages/pipeline test && pnpm -C packages/mcp test
```

**60 tests, all green**, and all three packages typecheck clean under `strict`. No test touches the
network — the Panta client takes an injectable `fetchImpl`, so the suites are deterministic.

```
packages/panta     18 passed   tsc clean
packages/pipeline  33 passed   tsc clean
packages/mcp        9 passed   tsc clean
```

## Licence

MIT
