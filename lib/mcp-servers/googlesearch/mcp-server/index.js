#!/usr/bin/env node

/**
 * Google Custom Search MCP Server
 * Provides Google Search capability to Claude Code via MCP protocol
 *
 * CONFIGURATION:
 * Set these environment variables:
 *   GOOGLE_SEARCH_API_KEY - Your Google Custom Search API key
 *   GOOGLE_SEARCH_CX - Your Google Custom Search Engine ID
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Google Custom Search API credentials
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || '';
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX || '';
const SEARCH_TIMEOUT = 10000; // 10 seconds

/**
 * Perform Google Custom Search
 */
async function performGoogleSearch(query, numResults = 10) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', GOOGLE_API_KEY);
    url.searchParams.set('cx', GOOGLE_CX);
    url.searchParams.set('q', query);
    url.searchParams.set('num', Math.min(numResults, 10).toString());

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const results = (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));

    return {
      query,
      results,
      totalResults: data.searchInformation?.totalResults || '0',
      searchTime: data.searchInformation?.searchTime || 0,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Search timeout');
    }
    throw error;
  }
}

/**
 * Format search results as text
 */
function formatSearchResults(search) {
  if (search.results.length === 0) {
    return `No search results found for "${search.query}".`;
  }

  const parts = [];
  parts.push(`\n### Query: "${search.query}"`);
  parts.push(`### Found ${search.results.length} results (search time: ${search.searchTime.toFixed(2)}s):\n`);

  for (let i = 0; i < Math.min(search.results.length, 10); i++) {
    const result = search.results[i];
    parts.push(`**Result ${i + 1}**`);
    parts.push(`📌 Title: ${result.title}`);
    parts.push(`📝 Summary: ${result.snippet}`);
    parts.push(`🔗 URL: ${result.link}`);
    parts.push(``);
  }

  return parts.join('\n');
}

// Create MCP server
const server = new Server(
  {
    name: 'googlesearch-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'google_search',
        description: '🔥 FASTEST WEB SEARCH - Use this for ANY search query. When user asks to "search", "find", "look up", "latest", "news", "recent", "online", "web" - use THIS tool. Returns Google search results with titles, snippets, and URLs. Much faster than launching subagents or fetching individual URLs. After getting results, answer directly using them.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to execute',
            },
            num_results: {
              type: 'number',
              description: 'Number of results to return (1-10, default: 10)',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'google_search') {
    const query = args?.query;
    const numResults = args?.num_results || 10;

    if (!query || typeof query !== 'string') {
      throw new Error('Missing or invalid "query" parameter');
    }

    try {
      console.error(`[GoogleSearch MCP] Executing search: "${query}"`);
      const searchResults = await performGoogleSearch(query, numResults);
      const formatted = formatSearchResults(searchResults);
      console.error(`[GoogleSearch MCP] Got ${searchResults.results.length} results`);

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    } catch (error) {
      console.error(`[GoogleSearch MCP] Search failed: ${error.message}`);
      return {
        content: [
          {
            type: 'text',
            text: `Search failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    console.error('[GoogleSearch MCP] ERROR: GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX must be set');
    console.error('[GoogleSearch MCP] Set them as environment variables:');
    console.error('[GoogleSearch MCP]   export GOOGLE_SEARCH_API_KEY="your-key"');
    console.error('[GoogleSearch MCP]   export GOOGLE_SEARCH_CX="your-cx"');
    process.exit(1);
  }

  console.error('[GoogleSearch MCP] Starting Google Search MCP server...');
  console.error(`[GoogleSearch MCP] API Key: ${GOOGLE_API_KEY.substring(0, 10)}...`);
  console.error(`[GoogleSearch MCP] CX: ${GOOGLE_CX}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[GoogleSearch MCP] Google Search MCP server running on stdio');
}

main().catch((error) => {
  console.error('[GoogleSearch MCP] Fatal error:', error);
  process.exit(1);
});
