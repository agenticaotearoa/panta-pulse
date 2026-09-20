# Pipeline evidence

```console
$ cd <repo root> && pnpm install
Scope: all 3 workspace projects
Lockfile is up to date, resolution step was skipped
Already up to date

Done in 180ms using pnpm v10.33.0

$ pnpm -C packages/pipeline exec tsc --noEmit

$ pnpm -C packages/pipeline test

> @panta-pulse/pipeline@ test /Users/agenta/Documents/Deepseek-harness/jobs/panta-pulse/packages/pipeline
> vitest run


 RUN  v1.6.1 /Users/agenta/Documents/Deepseek-harness/jobs/panta-pulse/packages/pipeline

 ✓ test/draft.test.ts  (14 tests) 4ms
 ✓ test/pipeline.test.ts  (1 test) 12ms

 Test Files  2 passed (2)
 Tests  15 passed (15)
 Start at  13:36:52
 Duration  139ms (transform 41ms; collect 52ms; tests 16ms; prepare 65ms)


$ pnpm -C packages/pipeline exec tsx src/cli.ts draft --headline "Solana hits 100k TPS in a public test" --source https://solana.com/news
{
  "draft": {
    "question": "Will Solana hit 100k TPS in a public test?",
    "resolutionRule": "Resolve YES if an official public test report confirms at least 100,000 TPS; otherwise resolve NO.",
    "sourcesOfTruth": [
      "https://solana.com/news"
    ],
    "category": "crypto",
    "imageUrl": "https://solana.com/news",
    "startTime": 2000000000,
    "endTime": 2000604800,
    "resolutionTime": 2000608400,
    "rationale": "The headline identifies a measurable public benchmark."
  },
  "validation": []
}

Powered by Panta
```

The required CLI invocation without `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` exits 1 with:

```text
LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required
```

The successful JSON evidence above uses a local deterministic OpenAI-compatible test endpoint; no external network request was made.
