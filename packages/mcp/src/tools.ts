// Re-export of the tool table + dispatcher living in server.ts, so the tool
// surface can be imported without pulling in the stdio loop.
export { callTool, handleRequest } from './server.js';
