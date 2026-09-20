#!/usr/bin/env node
import { PantaClient, formatUsdc } from '@panta-pulse/core';
import { draftFromNews, validateDraft } from './draft.js';
import { getSimulationPublicKey, offlineSignUnsignedTransaction } from './signmock.js';
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


/**
 * Drafting depends on a language model, and models intermittently return prose
 * instead of JSON. Measured: the same headline drafted cleanly once and failed with
 * "The LLM response did not contain a JSON object" on the next run. A single retry
 * turns that from a broken demo into a footnote.
 */
async function draftWithRetry(
  input: Parameters<typeof draftFromNews>[0],
  llm: (prompt: string) => Promise<string>,
  attempts = 3,
): Promise<Awaited<ReturnType<typeof draftFromNews>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await draftFromNews(input, llm);
    } catch (error: unknown) {
      lastError = error;
      console.error(`# draft attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function defaultLlm(prompt: string): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required');
  // LLM_BASE_URL is an OpenAI-COMPATIBLE BASE, not the full endpoint. Posting straight
  // to the base 404s (measured against OpenRouter: POST /api/v1 -> 404, POST
  // /api/v1/chat/completions -> 200). Accept either form so callers cannot get this wrong.
  const endpoint = /\/chat\/completions\/?$/.test(baseUrl)
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
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
    const draft = await draftWithRetry({ headline: options.headline, sourceUrl: options.source, category: options.category, nowSeconds }, defaultLlm);
    console.log(JSON.stringify({ draft, validation: validateDraft(draft) }, null, 2));
    printFooter();
    return;
  }
  if (command !== 'quote') usage();
  if (!options.live) throw new Error('quote requires --live');
  const apiKey = process.env.PANTA_API_KEY;
  if (!apiKey) throw new Error('--live requires PANTA_API_KEY');
  const client = new PantaClient({ apiKey });
  // Default to the deterministic simulation wallet, so the wallet that QUOTES is the
  // same wallet that SIGNS. Panta only ever returns unsigned transactions, and
  // VersionedTransaction.sign() rejects any key the message does not list as a
  // required signer, so a mismatched pair cannot be signed at all.
  const simulated = options.wallet === undefined && process.env.PANTA_WALLET === undefined;
  const wallet = options.wallet ?? process.env.PANTA_WALLET ?? getSimulationPublicKey();
  if (simulated) {
    console.log(`# no --wallet given; using deterministic simulation wallet ${wallet}`);
    console.log('# nothing is funded and nothing is broadcast.');
  }

  const draft = await draftWithRetry({ headline: options.headline, sourceUrl: options.source, category: options.category, nowSeconds }, defaultLlm);
  const result = await runPipeline(client, { ...draft, wallet }, defaultLlm);

  // Close the loop locally. This is a SIMULATION: no RPC, no broadcast, no fee paid.
  const signed = await offlineSignUnsignedTransaction(result.unsignedTransaction);

  console.log(JSON.stringify({
    draft,
    feeUsdc: result.feeUsdc,
    derived: result.derived,
    unsignedTransaction: result.unsignedTransaction,
    simulatedSignature: { signerPublicKey: signed.signerPublicKey, note: signed.note },
  }, null, 2));
  printFooter();
}

main().catch((error: unknown) => {
  // Print the stack for unexpected faults. Without this, a TypeError deep in a
  // dependency surfaces as one opaque line and costs a debugging round trip.
  if (process.env.PANTA_PULSE_DEBUG === '1' && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
