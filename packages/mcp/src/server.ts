#!/usr/bin/env node
import { PantaClient } from '@panta-pulse/core';
import { readStatus } from '@panta-pulse/pipeline';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

// The index signature is load-bearing: without it ToolDefinition is not
// assignable to JsonValue, and tools/list fails to typecheck.
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
  [key: string]: JsonValue;
}

interface ToolContext {
  client: PantaClient;
}

const tools: ToolDefinition[] = [
  {
    name: 'panta_list_markets',
    description: 'List Panta markets. Powered by Panta',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, category: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'panta_get_market',
    description: 'Fetch one Panta market by ID.',
    inputSchema: { type: 'object', properties: { marketId: { type: 'string' } }, required: ['marketId'], additionalProperties: false },
  },
  {
    name: 'panta_market_status',
    description: 'Return normalized lifecycle status for one Panta market. Powered by Panta',
    inputSchema: { type: 'object', properties: { marketId: { type: 'string' } }, required: ['marketId'], additionalProperties: false },
  },
  {
    name: 'panta_draft_market',
    description: 'Draft a market specification from a headline and source.',
    inputSchema: { type: 'object', properties: { headline: { type: 'string' }, sourceUrl: { type: 'string' }, category: { type: 'string' } }, required: ['headline', 'sourceUrl'], additionalProperties: false },
  },
  {
    name: 'panta_quote_market',
    description: 'Request a live Panta creation quote.',
    inputSchema: { type: 'object', properties: { headline: { type: 'string' }, sourceUrl: { type: 'string' }, wallet: { type: 'string' }, category: { type: 'string' } }, required: ['headline', 'sourceUrl', 'wallet'], additionalProperties: false },
  },
];

function requiredString(args: JsonObject, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} must be a non-empty string`);
  return value;
}

function optionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value;
}

function optionalInteger(args: JsonObject, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

export async function callTool(name: string, args: JsonObject, context: ToolContext): Promise<JsonObject> {
  const { client } = context;
  let result: unknown;
  switch (name) {
    case 'panta_list_markets':
      result = await client.listMarkets({ limit: optionalInteger(args, 'limit'), category: optionalString(args, 'category') });
      break;
    case 'panta_get_market':
      result = await client.getMarket(requiredString(args, 'marketId'));
      break;
    case 'panta_market_status':
      result = await readStatus(client, requiredString(args, 'marketId'));
      break;
    case 'panta_draft_market':
      result = { headline: requiredString(args, 'headline'), sourceUrl: requiredString(args, 'sourceUrl'), category: optionalString(args, 'category') };
      break;
    case 'panta_quote_market':
      result = { headline: requiredString(args, 'headline'), sourceUrl: requiredString(args, 'sourceUrl'), wallet: requiredString(args, 'wallet'), category: optionalString(args, 'category') };
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleRequest(request: JsonObject, context: ToolContext): Promise<JsonObject> {
  const method = request.method;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'panta-pulse-mcp', version: '1.0.0' } } };
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id: request.id, result: { tools } };
  }
  if (method === 'tools/call') {
    const params = request.params;
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return errorResponse(request.id, 'Invalid tools/call params');
    const name = (params as JsonObject).name;
    const args = (params as JsonObject).arguments;
    if (typeof name !== 'string' || typeof args !== 'object' || args === null || Array.isArray(args)) return errorResponse(request.id, 'Tool name and arguments are required');
    try {
      return await callTool(name, args, context);
    } catch (error: unknown) {
      return { jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } };
    }
  }
  return errorResponse(request.id, `Method not found: ${typeof method === 'string' ? method : 'missing'}`);
}

function errorResponse(id: JsonValue, message: string): JsonObject {
  return { jsonrpc: '2.0', id, error: { code: -32600, message } };
}

async function runStdio(): Promise<void> {
  const context: ToolContext = { client: new PantaClient({ apiKey: process.env.PANTA_API_KEY }) };
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += String(chunk);
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request: JsonObject;
      try {
        request = JSON.parse(line) as JsonObject;
      } catch (error: unknown) {
        process.stdout.write(`${JSON.stringify(errorResponse(null, 'Invalid JSON'))}\n`);
        continue;
      }
      const response = await handleRequest(request, context);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

if (process.argv[1]?.endsWith('server.ts')) void runStdio();
