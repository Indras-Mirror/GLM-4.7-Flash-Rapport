#!/usr/bin/env node
/**
 * Enhanced GoogleSearch Proxy Server with Auto-Execution
 *
 * This is a standalone proxy that injects GoogleSearch functionality into ANY LLM wrapper.
 * It works by sitting between Claude Code and the LLM API, intercepting requests to:
 * 1. Inject GoogleSearch tool into the tools array
 * 2. Auto-execute GoogleSearch when the model uses it
 * 3. Inject search results back into the conversation
 * 4. Continue the conversation automatically
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
import https from 'https';
import { URL } from 'url';
import { performGoogleSearch, formatSearchResults } from './search-google.js';

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
Enhanced GoogleSearch Proxy Server with Auto-Execution

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

Features:
  • Auto-injects GoogleSearch tool into requests
  • Auto-executes GoogleSearch when model uses it
  • Injects search results back into conversation
  • Continues conversation automatically
  • Works with ANY LLM that supports tools
    `);
    process.exit(0);
  }
}

// Validate required environment variables
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || '';
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX || '';

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
║  🌐 Enhanced GoogleSearch Proxy - Auto-Execution Enabled       ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  • Port: ${PORT}
  • Backend: ${BACKEND_URL}
  • Google API Key: ${GOOGLE_API_KEY.substring(0, 10)}...
  • Google CX: ${GOOGLE_CX}

Features:
  ✅ Auto-inject GoogleSearch tool
  ✅ Auto-execute searches
  ✅ Inject results back
  ✅ Continue conversation

Starting server...
`);

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
 * Detect if this is a search query
 */
function isSearchQuery(messages) {
  const searchKeywords = /\b(search|find|look up|latest|news|recent|current|today|google|information about)\b/i;

  for (const msg of messages || []) {
    if (msg.role === 'user') {
      const msgContent = typeof msg?.content === 'string'
        ? msg.content
        : Array.isArray(msg?.content)
          ? msg.content.map(c => typeof c === 'string' ? c : (c.type === 'text' ? c.text : '')).join(' ')
          : '';
      if (searchKeywords.test(msgContent)) {
        return true;
      }
    }
  }
  return false;
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

    let modified = false;

    // Inject GoogleSearch tool
    if (data.tools && Array.isArray(data.tools)) {
      const isSearch = isSearchQuery(data.messages);
      const originalLength = data.tools.length;

      data.tools = injectGoogleSearchTool(data.tools);

      if (data.tools.length !== originalLength || isSearch) {
        // Also filter out more tools for search queries
        if (isSearch) {
          data.tools = data.tools.filter(t =>
            t.name !== 'WebFetch' &&
            t.name !== 'EnterPlanMode' &&
            t.name !== 'ExitPlanMode'
          );
        }

        console.error(`[Request ${requestId}] Injected GoogleSearch tool (${data.tools.length} tools total)`);
        modified = true;
      }
    }

    return { shouldModify: modified, modifiedBody: JSON.stringify(data) };
  } catch (error) {
    console.error(`[Request ${requestId}] Error processing request:`, error.message);
    return { shouldModify: false, modifiedBody: body };
  }
}

/**
 * Parse SSE (Server-Sent Events) stream - async generator
 */
async function* parseSSE(stream) {
  const buffer = [];

  for await (const chunk of stream) {
    buffer.push(chunk);
    const data = Buffer.concat(buffer).toString('utf8');

    const lines = data.split('\n');
    const remainder = lines.pop(); // Save incomplete line
    buffer.length = 0; // Clear buffer
    if (remainder) buffer.push(Buffer.from(remainder));

    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        if (jsonStr.trim() === '[DONE]') {
          yield { type: 'done' };
          continue;
        }
        try {
          const event = JSON.parse(jsonStr);
          // Also treat message_stop as done for Ollama compatibility
          if (event.type === 'message_stop') {
            yield event;
            yield { type: 'done' };
            continue;
          }
          yield event;
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Format SSE event
 */
function formatSSEEvent(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(urlString, options, body) {
  const urlParsed = new URL(urlString);
  const protocol = urlParsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.request({
      hostname: urlParsed.hostname,
      port: urlParsed.port || (urlParsed.protocol === 'https:' ? 443 : 80),
      path: urlParsed.pathname + urlParsed.search,
      ...options
    }, (res) => {
      resolve(res);
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Create the proxy server with auto-execution
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

      // Determine if this is a streaming request
      const isStreaming = body.includes('"stream":true') || body.includes('"stream": true');

      if (!isStreaming) {
        // Non-streaming - simple proxy
        const backendUrl = new URL(BACKEND_URL);
        const options = {
          hostname: backendUrl.hostname,
          port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
          path: req.url,
          method: req.method,
          headers: req.headers
        };
        delete options.headers['host'];
        options.headers['host'] = backendUrl.host;
        options.headers['content-length'] = Buffer.byteLength(modifiedBody);

        const backendRes = await makeRequest(BACKEND_URL, options, modifiedBody);
        let backendData = '';
        backendRes.on('data', chunk => backendData += chunk);
        backendRes.on('end', () => {
          res.writeHead(backendRes.statusCode, backendRes.headers);
          res.end(backendData);
        });
        backendRes.on('error', (err) => {
          res.writeHead(502);
          res.end(JSON.stringify({ error: 'Bad Gateway' }));
        });
        return;
      }

      // ========================================================================
      // STREAMING WITH AUTO-EXECUTION
      // ========================================================================

      console.error(`[Request ${requestId}] Streaming request detected`);

      // Forward to backend
      const backendUrl = new URL(BACKEND_URL);
      const options = {
        hostname: backendUrl.hostname,
        port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: req.headers
      };
      delete options.headers['host'];
      options.headers['host'] = backendUrl.host;
      options.headers['content-length'] = Buffer.byteLength(modifiedBody);

      const backendRes = await makeRequest(BACKEND_URL, options, modifiedBody);

      // Set up streaming response to client
      res.writeHead(backendRes.statusCode, {
        'Content-Type': backendRes.headers['content-type'],
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Parse backend stream
      const streamGenerator = parseSSE(backendRes);

      // State for detecting GoogleSearch (tool_use OR thinking-based)
      let detectedWebSearch = false;
      let currentToolUse = null;
      let toolUseInputJson = '';

      // NEW: State for thinking-based search detection
      let thinkingContent = '';
      let thinkingIndex = -1;
      let searchTriggeredFromThinking = false;

      // Buffer for events
      const bufferedEvents = [];

      // Search intent detection patterns (improved to match within longer text)
      const searchPatterns = [
        /\b(?:search|find|look up|google|search\s+for)\s+(?:for\s+)?(.{5,100})/i,
        /\b(?:latest|recent|current)\s+([a-z][a-z\s]{5,50})/i,
        /\b(?:latest|recent|current)\s+(.{5,50}?)(?:\s|$|version|released|update)/i,
        /\bwhat'?s\s+(?:the\s+)?(?:latest|new|current)\s+(.{5,100})/i,
        /\b(?:news|updates?|information)\s+(?:about|on|for)\s+(.{5,100})/i,
        /\b(?:need|want|looking\s+for)\s+(?:to\s+)?(?:search|find|look\s+up)\s+(?:for\s+)?(.{5,100})/i
      ];

      function detectSearchInThinking(text) {
        for (const pattern of searchPatterns) {
          const match = text.match(pattern);
          if (match) {
            return match[2] || match[1] || match[0];
          }
        }
        return null;
      }

      for await (const event of streamGenerator) {
        if (event.type === 'done') {
          // Check if we need to trigger search from thinking
          if (!searchTriggeredFromThinking && !detectedWebSearch && thinkingContent) {
            const searchQuery = detectSearchInThinking(thinkingContent);
            if (searchQuery) {
              console.error(`[Request ${requestId}] Detected search in thinking: "${searchQuery}"`);
              detectedWebSearch = true;
              searchTriggeredFromThinking = true;

              // Show searching indicator
              res.write(formatSSEEvent({
                type: 'content_block_delta',
                index: thinkingIndex,
                delta: { type: 'text_delta', text: '\n\n🔍 Searching Google...' }
              }));

              // Execute search
              try {
                const searchResults = await performGoogleSearch(searchQuery, 5);
                console.error(`[Request ${requestId}] Got ${searchResults.results.length} results`);

                // Inject results
                res.write(formatSSEEvent({
                  type: 'content_block_delta',
                  index: thinkingIndex,
                  delta: { type: 'text_delta', text: `\n✓ Found ${searchResults.results.length} results\n\n` }
                }));

                // Make follow-up with search results
                const originalBody = JSON.parse(modifiedBody);
                const followUpMessages = [
                  ...originalBody.messages,
                  {
                    role: 'assistant',
                    content: `I need to search for: ${searchQuery}`
                  },
                  {
                    role: 'user',
                    content: `## 🔥 GOOGLE SEARCH COMPLETE - RESULTS BELOW\n\nUse these search results to answer the user:\n\n${formatSearchResults(searchResults)}\n\nNow provide a concise summary.`
                  }
                ];

                const followUpBody = JSON.stringify({
                  ...originalBody,
                  messages: followUpMessages,
                  stream: true
                });

                const followUpRes = await makeRequest(BACKEND_URL, {
                  ...options,
                  method: 'POST',
                  headers: {
                    ...req.headers,
                    'host': backendUrl.host,
                    'content-length': Buffer.byteLength(followUpBody)
                  }
                }, followUpBody);

                // Stream follow-up
                const followUpStream = parseSSE(followUpRes);
                for await (const fe of followUpStream) {
                  if (fe.type === 'done') {
                    res.write('data: [DONE]\n\n');
                    break;
                  }
                  res.write(formatSSEEvent(fe));
                }
                console.error(`[Request ${requestId}] Thinking-based search complete`);
                res.end();
                return;
              } catch (error) {
                console.error(`[Request ${requestId}] Search from thinking failed:`, error.message);
                // Continue with original response
              }
            }
          }
          res.write('data: [DONE]\n\n');
          break;
        }

        // Only buffer tool_use events for GoogleSearch - forward everything else immediately
        if (event.type === 'content_block_start' &&
            event.content_block &&
            event.content_block.type === 'tool_use' &&
            event.content_block.name === 'GoogleSearch') {
          bufferedEvents.push(event);
        } else {
          // Forward all other events immediately
          res.write(formatSSEEvent(event));
        }

        // NEW: Capture thinking content for search intent detection
        if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
          thinkingIndex = event.index;
          thinkingContent = '';
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
          thinkingContent += event.delta.thinking || '';

          // Check for search intent in thinking - TRIGGER IMMEDIATELY if found
          if (!searchTriggeredFromThinking && !detectedWebSearch) {
            const potentialQuery = detectSearchInThinking(thinkingContent);
            if (potentialQuery && thinkingContent.length > 15) {
              // Trigger earlier (lowered from 30 to 15 chars)
              console.error(`[Request ${requestId}] *** TRIGGERING SEARCH FROM THINKING: "${potentialQuery}" ***`);
              detectedWebSearch = true;
              searchTriggeredFromThinking = true;

              // Show searching indicator
              res.write(formatSSEEvent({
                type: 'content_block_delta',
                index: thinkingIndex,
                delta: { type: 'text_delta', text: '\n\n🔍 Searching Google...' }
              }));

              // Execute search
              try {
                const searchResults = await performGoogleSearch(potentialQuery, 5);
                console.error(`[Request ${requestId}] Got ${searchResults.results.length} results`);

                // Inject results
                res.write(formatSSEEvent({
                  type: 'content_block_delta',
                  index: thinkingIndex,
                  delta: { type: 'text_delta', text: `\n✓ Found ${searchResults.results.length} results\n\n` }
                }));

                // Make follow-up with search results
                const originalBody = JSON.parse(modifiedBody);
                const followUpMessages = [
                  ...originalBody.messages,
                  {
                    role: 'assistant',
                    content: `I need to search for information about: ${potentialQuery}`
                  },
                  {
                    role: 'user',
                    content: `## 🔥 GOOGLE SEARCH COMPLETE - RESULTS BELOW\n\nThe user asked about: "${potentialQuery}"\n\nUse these search results to provide a helpful answer:\n\n${formatSearchResults(searchResults)}\n\nNow summarize the key findings for the user.`
                  }
                ];

                const followUpBody = JSON.stringify({
                  ...originalBody,
                  messages: followUpMessages,
                  stream: true
                });

                const followUpRes = await makeRequest(BACKEND_URL, {
                  ...options,
                  method: 'POST',
                  headers: {
                    ...req.headers,
                    'host': backendUrl.host,
                    'content-length': Buffer.byteLength(followUpBody)
                  }
                }, followUpBody);

                // Stream follow-up
                const followUpStream = parseSSE(followUpRes);
                for await (const fe of followUpStream) {
                  if (fe.type === 'done') {
                    res.write('data: [DONE]\n\n');
                    break;
                  }
                  res.write(formatSSEEvent(fe));
                }
                console.error(`[Request ${requestId}] Thinking-based search complete`);
                res.end();
                return;
              } catch (error) {
                console.error(`[Request ${requestId}] Search from thinking failed:`, error.message);
                // Continue with original response
              }
            }
          }
        }

        // NEW: When thinking block ends, reset state
        if (event.type === 'content_block_stop' && thinkingIndex >= 0) {
          thinkingIndex = -1;
          thinkingContent = '';
        }

        // Original tool_use detection (for models that do support it)
        if (event.type === 'content_block_start' &&
            event.content_block &&
            event.content_block.type === 'tool_use' &&
            event.content_block.name === 'GoogleSearch') {

          detectedWebSearch = true;
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: {}
          };

          console.error(`[Request ${requestId}] Detected GoogleSearch: ${currentToolUse.id}`);

          // Show user that search is happening
          res.write(formatSSEEvent({
            type: 'content_block_start',
            index: bufferedEvents.filter(e => e.type === 'content_block_start' || e.type === 'text').length,
            content_block: { type: 'text', text: '' }
          }));
          res.write(formatSSEEvent({
            type: 'content_block_delta',
            index: bufferedEvents.filter(e => e.type === 'content_block_start' || e.type === 'text').length,
            delta: { type: 'text_delta', text: '\n🔍 Searching Google...\n' }
          }));
          res.write(formatSSEEvent({
            type: 'content_block_stop',
            index: bufferedEvents.filter(e => e.type === 'content_block_start' || e.type === 'text').length
          }));

          continue; // Don't forward this to client yet
        }

        // Capture tool input JSON
        if (currentToolUse &&
            event.type === 'content_block_delta' &&
            event.delta &&
            event.delta.type === 'input_json_delta') {
          toolUseInputJson += event.delta.partial_json;
          continue; // Don't forward input_json_delta to client
        }

        // When tool_use ends, execute the search
        if (currentToolUse && event.type === 'content_block_stop') {
          console.error(`[Request ${requestId}] Executing Google search...`);
          console.error(`[Request ${requestId}] Raw JSON: "${toolUseInputJson}"`);

          try {
            // Parse the query with better error handling
            let query = null;

            // Try direct JSON parse first
            try {
              const parsed = JSON.parse(toolUseInputJson);
              query = parsed?.query;
            } catch (e) {
              // If that fails, try extracting with regex
              const match = toolUseInputJson.match(/"query"\s*:\s*"([^"]+)"/);
              if (match) {
                query = match[1];
                console.error(`[Request ${requestId}] Extracted query via regex: ${query}`);
              }
            }

            if (query && typeof query === 'string') {
              // Execute search
              const searchResults = await performGoogleSearch(query, 5);
              console.error(`[Request ${requestId}] Got ${searchResults.results.length} results`);

              // Show result count to user
              const textIndex = bufferedEvents.filter(e => e.type === 'content_block_start' || e.type === 'text').length;
              res.write(formatSSEEvent({
                type: 'content_block_delta',
                index: textIndex,
                delta: { type: 'text_delta', text: `✓ Found ${searchResults.results.length} results\n\n` }
              }));

              // Now make follow-up request with search results
              console.error(`[Request ${requestId}] Making follow-up request...`);

              // Build follow-up messages
              const originalBody = JSON.parse(modifiedBody);
              const followUpMessages = [
                ...originalBody.messages,
                {
                  role: 'assistant',
                  content: [{
                    type: 'tool_use',
                    id: currentToolUse.id,
                    name: 'GoogleSearch',
                    input: currentToolUse.input
                  }]
                },
                {
                  role: 'user',
                  content: [{
                    type: 'text',
                    text: `## 🔥 GOOGLE SEARCH COMPLETE - RESULTS BELOW

You asked for a search and I got the results. NOW ANSWER THE USER using these results.

### 🚨 STOP - READ THIS FIRST:

✅ DO: Answer directly using the search results below
✅ DO: Synthesize information from multiple results
✅ DO: Provide a concise summary with key points
✅ DO: Cite the sources from the search results

❌ DO NOT: Try to get "more details" - summarize what you have
❌ DO NOT: Say "let me search" or "let me fetch"
❌ DO NOT: Ignore these results

The search results ARE the answer. Use them. Summarize now.

---

SEARCH RESULTS:\n\n${formatSearchResults(searchResults)}`
                  }]
                }
              ];

              const followUpBody = JSON.stringify({
                ...originalBody,
                messages: followUpMessages
              });

              // Make follow-up request
              const followUpRes = await makeRequest(BACKEND_URL, {
                ...options,
                method: 'POST',
                headers: {
                  ...req.headers,
                  'host': backendUrl.host,
                  'content-length': Buffer.byteLength(followUpBody)
                }
              }, followUpBody);

              // Stream follow-up response to client
              let followUpData = '';
              const followUpStream = parseSSE(followUpRes);

              for await (const followUpEvent of followUpStream) {
                if (followUpEvent.type === 'done') {
                  res.write('data: [DONE]\n\n');
                  break;
                }

                // Forward all follow-up events
                res.write(formatSSEEvent(followUpEvent));
              }

              console.error(`[Request ${requestId}] Follow-up complete`);
              res.end();
              return;
            }
          } catch (error) {
            console.error(`[Request ${requestId}] Search failed:`, error.message);
            // Return error as tool result
            const errorResult = `Search failed: ${error.message}`;
            // Continue with error...
          }

          // Clear tool use state
          currentToolUse = null;
          toolUseInputJson = '';
          continue;
        }

        // Forward non-tool_use events to client
        res.write(formatSSEEvent(event));
      }

      res.end();
    } catch (error) {
      console.error(`[Request ${requestId}] Request error:`, error.message);
      if (!res.headersSent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad Request', message: error.message }));
      } else {
        // Can't send error response, just end the stream
        res.end();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Enhanced GoogleSearch Proxy running on http://localhost:${PORT}`);
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
