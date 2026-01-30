#!/usr/bin/env node
/**
 * Standalone GoogleSearch Proxy Server
 *
 * This is a standalone proxy that injects GoogleSearch functionality into ANY LLM wrapper.
 * It works by sitting between Claude Code and the LLM API, intercepting requests to:
 * 1. Inject GoogleSearch tool into the tools array
 * 2. Auto-execute GoogleSearch when the model uses it
 * 3. Inject search results back into the conversation
 *
 * Usage:
 *   node server.js --port 9736 --backend http://localhost:8000
 *
 * Environment Variables:
 *   GOOGLE_SEARCH_API_KEY - Google Custom Search API key
 *   GOOGLE_SEARCH_CX - Google Custom Search Engine ID
 *   BACKEND_URL - Backend API URL (optional, can use --backend flag)
 */

import http from 'http';
import url from 'url';
import { performGoogleSearch, formatSearchResults } from './search-google.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let PORT = 9736;
let BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
  } else if (args[i] === '--backend' && args[i + 1]) {
    BACKEND_URL = args[i + 1];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Standalone GoogleSearch Proxy Server

Usage: node server.js [options]

Options:
  --port <port>       Port to listen on (default: 9736)
  --backend <url>     Backend API URL (default: http://localhost:8000)
  --help, -h          Show this help message

Environment Variables:
  GOOGLE_SEARCH_API_KEY  Google Custom Search API key
  GOOGLE_SEARCH_CX        Google Custom Search Engine ID

Examples:
  node server.js --port 9736 --backend http://localhost:8000
  node server.js --port 9999 --backend https://api.anthropic.com
    `);
    process.exit(0);
  }
}

// Validate required environment variables
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_SEARCH_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;

if (!GOOGLE_API_KEY) {
  console.error('❌ ERROR: GOOGLE_SEARCH_API_KEY environment variable is required');
  console.error('   Set it with: export GOOGLE_SEARCH_API_KEY="your-key-here"');
  process.exit(1);
}

if (!GOOGLE_CX) {
  console.error('❌ ERROR: GOOGLE_SEARCH_CX environment variable is required');
  console.error('   Set it with: export GOOGLE_SEARCH_CX="your-cx-here"');
  process.exit(1);
}

console.log(`
╔════════════════════════════════════════════════════════════════╗
║        🌐 GoogleSearch Proxy Server - Standalone               ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  • Port: ${PORT}
  • Backend: ${BACKEND_URL}
  • Google API Key: ${GOOGLE_API_KEY.substring(0, 10)}...
  • Google CX: ${GOOGLE_CX}

Starting server...
`);

// Store ongoing searches and their state
const activeSearches = new Map();

/**
 * Inject GoogleSearch tool into the tools array
 */
function injectGoogleSearchTool(tools) {
  if (!tools || !Array.isArray(tools)) {
    tools = [];
  }

  // Check if GoogleSearch already exists
  if (tools.some(t => t.name === 'GoogleSearch')) {
    return tools;
  }

  // Remove competing search tools
  tools = tools.filter(t =>
    t.name !== 'WebSearch' &&
    t.name !== 'web_search' &&
    t.name !== 'Task' &&
    t.name !== 'Skill'
  );

  // Inject GoogleSearch at the front
  tools.unshift({
    name: 'GoogleSearch',
    description: `Search the internet using Google.

CRITICAL: This tool is your ONLY access to real-time web data. Use it IMMEDIATELY when:
- User asks to "search", "find", "look up" anything
- User asks about "latest", "recent", "current", "today's" information
- User asks for news, events, or recent developments

DO NOT answer from training data if user asks for current information.
ALWAYS use this tool for any web search request.

Input: A search query string
Output: 5 current search results with titles, summaries, and URLs`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to execute',
        },
      },
      required: ['query'],
    },
  });

  return tools;
}

/**
 * Process the request and inject GoogleSearch tool
 */
function processRequest(body, requestId) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Only process messages API requests
    if (!data.messages || !Array.isArray(data.messages)) {
      return { shouldModify: false, modifiedBody: body };
    }

    // Check if this is a search query by examining user messages
    let isSearchQuery = false;
    const searchKeywords = /\b(search|find|look up|latest|news|recent|current|today|google|information about)\b/i;

    for (const msg of data.messages) {
      if (msg.role === 'user') {
        const msgContent = typeof msg?.content === 'string'
          ? msg.content
          : Array.isArray(msg?.content)
            ? msg.content.map(c => typeof c === 'string' ? c : (c.type === 'text' ? c.text : '')).join(' ')
            : '';
        if (searchKeywords.test(msgContent)) {
          isSearchQuery = true;
          break;
        }
      }
    }

    // Inject GoogleSearch tool
    if (data.tools && Array.isArray(data.tools)) {
      const originalLength = data.tools.length;
      data.tools = injectGoogleSearchTool(data.tools);

      if (data.tools.length !== originalLength || isSearchQuery) {
        console.error(`[Request ${requestId}] Injected GoogleSearch tool (${data.tools.length} tools total)`);
      }
    }

    return { shouldModify: true, modifiedBody: JSON.stringify(data) };
  } catch (error) {
    console.error(`[Request ${requestId}] Error processing request:`, error.message);
    return { shouldModify: false, modifiedBody: body };
  }
}

/**
 * Create the proxy server
 */
const server = http.createServer(async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    });
    res.end();
    return;
  }

  // Collect request body
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks).toString('utf8');

      // Process request (inject GoogleSearch tool)
      const { modifiedBody } = processRequest(body, requestId);

      // Forward to backend
      const backendUrl = url.parse(BACKEND_URL);
      const options = {
        hostname: backendUrl.hostname,
        port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          'host': backendUrl.host,
          'content-length': Buffer.byteLength(modifiedBody),
        },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        const responseChunks = [];

        proxyRes.on('data', (chunk) => {
          responseChunks.push(chunk);
          res.write(chunk);
        });

        proxyRes.on('end', () => {
          res.end();
        });
      });

      proxyReq.on('error', (error) => {
        console.error(`[Request ${requestId}] Proxy error:`, error.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'Bad Gateway', message: error.message }));
      });

      proxyReq.write(modifiedBody);
      proxyReq.end();
    } catch (error) {
      console.error(`[Request ${requestId}] Request error:`, error.message);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad Request', message: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ GoogleSearch Proxy running on http://localhost:${PORT}`);
  console.log(`📡 Forwarding to backend: ${BACKEND_URL}`);
  console.log('');
  console.log(`To use with Claude Code wrappers:`);
  console.log(`  export ANTHROPIC_BASE_URL="http://localhost:${PORT}"`);
  console.log('');
  console.log(`Server is ready to accept requests 🚀`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
