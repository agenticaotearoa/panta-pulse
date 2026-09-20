import { describe, expect, it, vi } from 'vitest';
import { callTool, handleRequest } from '../src/server.js';

/**
 * The server's JSON-RPC handler is exercised in-process; nothing here touches stdio
 * or the network. The Panta client is replaced with a spy so the assertions are
 * about the protocol layer, which is what can actually break.
 */

const client = {
  listMarkets: vi.fn().mockResolvedValue({ items: [] }),
  getMarket: vi.fn().mockResolvedValue({ marketId: 'market-1', title: 'Market' }),
};

/** handleRequest is async because tools/call awaits the client. */
const context = () => ({ client }) as never;

interface ToolShape {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Narrow a JSON-RPC envelope without sprinkling unsafe casts through the file. */
function asToolsList(response: unknown): ToolShape[] {
  const shaped = response as { result?: { tools?: ToolShape[] } };
  return shaped.result?.tools ?? [];
}

function textOf(content: unknown): string {
  const first = (content as Array<{ type: string; text: string }>)[0];
  return first?.text ?? '';
}

describe('MCP JSON-RPC', () => {
  it('initializes with a protocol version and server name', async () => {
    await expect(
      handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, context()),
    ).resolves.toMatchObject({
      result: { protocolVersion: '2024-11-05', serverInfo: { name: 'panta-pulse-mcp' } },
    });
  });

  it('lists exactly five tools', async () => {
    const tools = asToolsList(
      await handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, context()),
    );
    expect(tools).toHaveLength(5);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'panta_draft_market',
        'panta_get_market',
        'panta_list_markets',
        'panta_market_status',
        'panta_quote_market',
      ].sort(),
    );
  });

  it('carries the legally-required attribution in the descriptions that display market data', async () => {
    const tools = asToolsList(
      await handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, context()),
    );
    for (const name of ['panta_list_markets', 'panta_market_status']) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool?.description).toContain('Powered by Panta');
    }
  });

  it('returns a JSON-RPC error for an unknown tool', async () => {
    await expect(
      handleRequest(
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'missing', arguments: {} } },
        context(),
      ),
    ).resolves.toMatchObject({ error: { message: 'Unknown tool: missing' } });
  });

  it('returns text content for list markets', async () => {
    const result = await callTool('panta_list_markets', {}, context());
    expect(textOf(result.content)).toBe('{"items":[]}');
  });

  it('returns text content for get market', async () => {
    const result = await callTool('panta_get_market', { marketId: 'market-1' }, context());
    expect(textOf(result.content)).toBe('{"marketId":"market-1","title":"Market"}');
  });

  it('validates required tool arguments', async () => {
    await expect(callTool('panta_get_market', {}, context())).rejects.toThrow('marketId');
  });

  it('reports malformed tools/call params', async () => {
    await expect(
      handleRequest({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: null }, context()),
    ).resolves.toMatchObject({ error: { code: -32600 } });
  });

  it('reports an unknown JSON-RPC method', async () => {
    await expect(
      handleRequest({ jsonrpc: '2.0', id: 9, method: 'does/not/exist' }, context()),
    ).resolves.toMatchObject({ error: { code: -32600 } });
  });
});
