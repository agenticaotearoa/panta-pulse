#!/usr/bin/env node
import { PantaClient, formatUsdc } from '@panta-pulse/core';
import { draftFromNews, validateDraft } from './draft.js';
import { runPipeline } from './pipeline.js';

interface CliOptions {
  headline?: string;
  source?: string;
  category?: string;
  wallet?: string;
  live?: boolean;
}

function usage(): never {
  throw new Error('Usage: panta-pulse draft --headline <text> --source <url> [--category <category>]\n       panta-pulse quote --headline <text> --source <url> [--wallet <base58>] [--live]');
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === '--live') {
      options.live = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) usage();
    if (key === '--headline') options.headline = value;
    else if (key === '--source') options.source = value;
    else if (key === '--category') options.category = value;
    else if (key === '--wallet') options.wallet = value;
    else usage();
    index += 1;
  }
  return options;
}

async function defaultLlm(prompt: string): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) throw new Error(`LLM request failed with HTTP ${response.status}`);
  const body: unknown = await response.json();
  const choices = typeof body === 'object' && body !== null && 'choices' in body && Array.isArray((body as { choices: unknown }).choices)
    ? (body as { choices: Array<{ message?: { content?: unknown } }> }).choices
    : [];
  const content = typeof choices[0]?.message?.content === 'string'
    ? choices[0].message.content
    : '';
  if (!content) throw new Error('LLM response did not include message content');
  return content;
}

function printFooter(): void {
  console.log('\nPowered by Panta');
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const options = parseArgs(args);
  if (!options.headline || !options.source) usage();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (command === 'draft') {
    const draft = await draftFromNews({ headline: options.headline, sourceUrl: options.source, category: options.category, nowSeconds }, defaultLlm);
    console.log(JSON.stringify({ draft, validation: validateDraft(draft) }, null, 2));
    printFooter();
    return;
  }
  if (command !== 'quote') usage();
  if (!options.live) throw new Error('quote requires --live');
  const apiKey = process.env.PANTA_API_KEY;
  if (!apiKey) throw new Error('--live requires PANTA_API_KEY');
  const client = new PantaClient({ apiKey });
  const wallet = options.wallet ?? process.env.PANTA_WALLET;
  if (!wallet) throw new Error('quote requires --wallet or PANTA_WALLET');
  const draft = await draftFromNews({ headline: options.headline, sourceUrl: options.source, category: options.category, nowSeconds }, defaultLlm);
  const result = await runPipeline(client, { ...draft, wallet }, defaultLlm);
  console.log(JSON.stringify({ draft, feeUsdc: result.feeUsdc, derived: result.derived, unsignedTransaction: result.unsignedTransaction }, null, 2));
  printFooter();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
