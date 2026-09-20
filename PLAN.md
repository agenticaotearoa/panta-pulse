# PLAN — panta-api-side-track ($5,000 USDG, 4 winners, deadline 2026-10-13)

Project: **Panta Pulse** — an agent-native prediction-market radar.

## 1. The literal ask (quoted from the fetched listing)

> "For Colosseum Crypto World's Fair, we are offering a $5,000 USDG Sidetrack prize pool for
> builders who use Panta API to explore what prediction markets can become when they are built
> into products, applications, and experiences beyond a traditional prediction market platform."

> "Judging Criteria — Panta API Integration: How meaningfully is Panta API used within the
> product? Technical Execution: The quality, functionality, and implementation of the product."

> "Your submission should be a working demo or compelling prototype." · "Submissions must be in English."

Wanted category harvested verbatim: *"AI + Prediction Markets: Build AI-powered products that
use Panta markets or market data as part of the user experience."*

## 2. The implicit ask (judging context)

The judges are Panta's own team. What earns their vote is not visual polish; it is:
1. evidence the public API was driven hard and correctly, including its awkward edges;
2. a product that would push *usage* of Panta (volume, market creation, attribution) if it shipped;
3. code they could read without wincing — typed, tested, documented, reproducible.

## 3. Disqualifiers (violation voids the entry)

| id | disqualifier | status |
|---|---|---|
| d1 | Not registered for the official Colosseum Crypto World's Fair | **CLEARED** — account created + email-verified + hackathon registered 2026-09-20 |
| d2 | Submission not in English | will satisfy |
| d3 | Panta API not meaningfully used | must satisfy via c3 |
| d4 | Colosseum: under 18 / sanctioned-country resident | owner is NZ, adult — clear |

## 4. Measured API reality (fetched, not assumed)

| fact | evidence |
|---|---|
| Signup is free email+password; `canCreateMarkets: true`; no KYC, no wallet | `POST /auth/register/` → 201, captured |
| `pk_test_` keys serve **sandbox fixtures only** ("Test mode… sandbox fixtures") | captured response |
| `pk_live_` keys serve **real Solana mainnet catalog** | `GET /markets/?limit=25` → 200 |
| **`title` is empty on 50/50 markets**; the real question lives in `description` | measured over a 50-market page |
| only 8/50 carried any `description`; the rest are image-only | measured |
| 44/50 carry a price and non-zero `totalVolumeUsdc` (max seen $4,225) | measured |
| 38/50 are `resolved`; live ones are `secondary_active`/`open`/`primary`/`secondary` | measured |
| `startTime`/`endTime` are unix **seconds** on live but ISO strings in sandbox | measured — normaliser required |
| category allowlist: sports, crypto, politics, entertainment, finance, science, world, other | `GET /categories/` → 200 |
| `/events/`, `/campaigns/`, `/markets/catalog/` do **not** exist (404) | probed |
| custody model: API returns **unsigned** transactions; the wallet signs | docs, quoted |

**Consequence for the design:** the catalog is text-poor. A naive "browse markets" UI shows blank
cards. The product must *earn* its readability by normalising title→description→image→id, which is
itself the technical-execution story the rubric rewards. `/events/` not existing means grouping must
be derived from category + image path, not fetched.

## 5. CLAIM graph

| claim | predicate | artifact that satisfies it | proof |
|---|---|---|---|
| c1 | Registered for official Colosseum Crypto World's Fair | Colosseum account + hackathon registration | `/arena/hackathon` shows "Your project" |
| c2 | Working demo / compelling prototype, publicly accessible | deployed live site | HTTP 200 + captured page |
| c3 | Panta API used **meaningfully** (≥5 distinct product routes) | typed client | captured live calls: markets list, market detail, market trades, categories, primary-buy quote, build-unsigned-tx, positions |
| c4 | Technical execution: quality, functionality, implementation | repo + test suite | `pnpm test` green output |
| c5 | English | all copy + video + deck | review pass |
| c6 | Project GitHub link | public repo | URL resolves, repo public |
| c7 | Project website | deployed site | URL resolves |
| c8 | Project X link | X post (OWNER-GATED: public post) | post URL |
| c9 | Pitch deck or Loom/video presentation | narrated demo video + deck | file + link |
| c10 | Submitted to official Colosseum + project link + profile link | Colosseum project page | project URL captured |

## 6. Assumptions (labelled, not silent)

- **a1** An agent-built project is admissible. The listing restricts *entry method* (HUMAN_ONLY on
  Earn) but not authorship; the Colosseum rules speak of "Entrant" = an Individual, and the owner is
  the Entrant. Recorded as an assumption; no rule found that bans it.
- **a2** `X Link` (c8) can be the same X account already used for the Superteam submissions
  (@mcmuffin699, 0 followers). Reach is not a judging criterion for this track — the rubric is
  integration + execution — so 0 followers should not be fatal here, unlike a reach-judged bounty.
- **a3** Colosseum City field is left blank until the owner supplies it; not guessed. Blocks nothing
  until final submission.

## 7. Plan node

Artifact set (smallest that satisfies every claim — YAGNI):
1. `apps/web` — Next.js app: market radar (normalised), market detail with price + tape, AI analyst
   brief, non-custodial trade handoff (quote → build unsigned → wallet signs).
2. `packages/panta` — typed API client covering the routes in c3, with the normaliser and tests.
3. `apps/mcp` — MCP server exposing Panta as agent tools (the AI-native differentiator).
4. Deployed live site (Cloudflare Pages via existing token, or Vercel).
5. Narrated demo video + pitch deck.
6. Colosseum project page + Earn submission.

Effort box: 3 sessions to a strong MVP; hard stop at `MAX_HOURS_PER_JOB`.
Abort triggers: (i) live key stops serving real data; (ii) Colosseum project page cannot be created;
(iii) owner declines the X post — then c8 falls back to the optional field and the entry ships without it.

## 8. Review

- **Loop 1 (plan review)**: fresh-context reviewer gets only the listing text + CLAIM table + this
  plan, must return zero BLOCKER/MATERIAL or the plan is revised.
- **Loop 2 (deliverable review)**: fresh-context reviewer reads the deployed artifact as a Panta
  judge, then adversarially argues the strongest disqualification case. Max 3 iterations.
