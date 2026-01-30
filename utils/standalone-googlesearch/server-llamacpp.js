#!/usr/bin/env node
/**
 * Enhanced GoogleSearch Proxy Server for llama.cpp
 *
 * This version handles llama.cpp's OpenAI-style streaming format
 * instead of Anthropic's SSE format.
 *
 * Usage:
 *   node server-llamacpp.js --port 9736 --backend http://localhost:8081
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { performGoogleSearch, formatSearchResults } from './search-google.js';

// Parse command line arguments
const args = process.argv.slice(2);
let PORT = 9736;
let BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
  } else if (args[i] === '--backend' && args[i + 1]) {
    BACKEND_URL = args[i + 1];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Enhanced GoogleSearch Proxy for llama.cpp

Usage: node server-llamacpp.js [options]

Options:
  --port <port>       Port to listen on (default: 9736)
  --backend <url>     Backend API URL (default: http://localhost:8080)
  --help, -h          Show this help message

Features:
  • Auto-injects GoogleSearch tool (OpenAI/llama.cpp format)
  • Detects tool_calls in responses
  • Auto-executes searches
  • Continues conversation with results
`);
    process.exit(0);
  }
}

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
║  🌐 GoogleSearch Proxy for llama.cpp - Auto-Execution          ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  • Port: ${PORT}
  • Backend: ${BACKEND_URL}
  • Google API Key: ${GOOGLE_API_KEY.substring(0, 10)}...
  • Google CX: ${GOOGLE_CX}

Starting server...
`);

/**
 * Inject GoogleSearch tool into OpenAI-format tools array
 */
function injectGoogleSearchTool(tools) {
  if (!tools || !Array.isArray(tools)) {
    tools = [];
  }

  // Check if GoogleSearch already exists
  if (tools.some(t => t.function?.name === 'GoogleSearch' || t.name === 'GoogleSearch')) {
    return tools;
  }

  // Remove competing search tools
  tools = tools.filter(t =>
    t.function?.name !== 'WebSearch' &&
    t.function?.name !== 'web_search' &&
    t.function?.name !== 'Task' &&
    t.function?.name !== 'Skill'
  );

  // Inject GoogleSearch at the front (OpenAI format)
  tools.unshift({
    type: 'function',
    function: {
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
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
        },
        required: ['query'],
      },
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

    let modified = false;

    // Inject GoogleSearch tool (OpenAI format)
    if (data.tools && Array.isArray(data.tools)) {
      const originalLength = data.tools.length;
      data.tools = injectGoogleSearchTool(data.tools);

      if (data.tools.length !== originalLength) {
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
 * Parse OpenAI-style SSE stream (llama.cpp format)
 */
async function* parseOpenAIStream(stream) {
  const buffer = [];

  for await (const chunk of stream) {
    buffer.push(chunk);
    const data = Buffer.concat(buffer).toString('utf8');

    const lines = data.split('\n');
    const remainder = lines.pop();
    buffer.length = 0;
    if (remainder) buffer.push(Buffer.from(remainder));

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        yield { type: 'done' };
        continue;
      }

      try {
        const event = JSON.parse(jsonStr);
        yield event;
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}

/**
 * Format OpenAI-style SSE event
 */
function formatOpenAIEvent(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
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
 * Create the proxy server
 */
const server = http.createServer(async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
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

      // Determine if streaming
      const isStreaming = body.includes('"stream":true') || body.includes('"stream": true');

      if (!isStreaming) {
        // Non-streaming
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
        backendRes.on('error', () => {
          res.writeHead(502);
          res.end(JSON.stringify({ error: 'Bad Gateway' }));
        });
        return;
      }

      // ========================================================================
      // STREAMING WITH AUTO-EXECUTION (llama.cpp/OpenAI format)
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

      res.writeHead(backendRes.statusCode, {
        'Content-Type': backendRes.headers['content-type'],
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Parse OpenAI-style stream
      const streamGenerator = parseOpenAIStream(backendRes);

      // State for detecting GoogleSearch tool calls
      let detectedToolCall = false;
      let currentToolCall = null;
      let toolCallBuffer = '';
      let bufferedEvents = [];
      let hasContent = false;

      for await (const event of streamGenerator) {
        if (event.type === 'done') {
          res.write('data: [DONE]\n\n');
          break;
        }

        // Buffer all events
        bufferedEvents.push(event);

        // Check for tool calls in delta
        const delta = event.choices?.[0]?.delta;

        // Track if we have regular content
        if (delta?.content || delta?.reasoning_content) {
          hasContent = true;
        }

        // Detect tool_use start (OpenAI/llama.cpp format)
        if (delta?.tool_calls && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          const toolCall = delta.tool_calls[0];

          if (toolCall.function?.name === 'GoogleSearch' || toolCall.type === 'function') {
            detectedToolCall = true;
            currentToolCall = {
              index: toolCall.index || 0,
              id: toolCall.id || event.id,
              name: toolCall.function?.name || 'GoogleSearch',
              arguments: toolCall.function?.arguments || ''
            };

            console.error(`[Request ${requestId}] Detected GoogleSearch: ${currentToolCall.id}`);

            // Show user that search is happening
            res.write(formatOpenAIEvent({
              choices: [{
                index: 0,
                delta: { content: '\n🔍 Searching Google...\n' },
                finish_reason: null
              }],
              created: event.created,
              id: event.id,
              model: event.model,
              object: 'chat.completion.chunk'
            }));

            continue;
          }

          // Accumulate function arguments
          if (currentToolCall && toolCall.function?.arguments) {
            toolCallBuffer += toolCall.function.arguments;
            continue;
          }
        }

        // When we detect a complete tool call (finish_reason or delta without tool_calls)
        if (currentToolCall && (event.choices?.[0]?.finish_reason || !delta?.tool_calls)) {
          console.error(`[Request ${requestId}] Executing Google search...`);

          try {
            // Parse the query from arguments
            let args = {};
            try {
              args = JSON.parse(toolCallBuffer);
            } catch {
              // Try extracting from partial JSON
              const match = toolCallBuffer.match(/"query"\s*:\s*"([^"]+)"/);
              if (match) {
                args = { query: match[1] };
              }
            }

            const query = args?.query;

            if (query && typeof query === 'string') {
              // Execute search
              const searchResults = await performGoogleSearch(query, 5);
              console.error(`[Request ${requestId}] Got ${searchResults.results.length} results`);

              // Show result count
              res.write(formatOpenAIEvent({
                choices: [{
                  index: 0,
                  delta: { content: `✓ Found ${searchResults.results.length} results\n\n` },
                  finish_reason: null
                }],
                created: event.created,
                id: event.id,
                model: event.model,
                object: 'chat.completion.chunk'
              }));

              // Make follow-up request with search results
              console.error(`[Request ${requestId}] Making follow-up request...`);

              const originalBody = JSON.parse(modifiedBody);
              const followUpMessages = [
                ...originalBody.messages,
                {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: currentToolCall.id,
                    type: 'function',
                    function: {
                      name: 'GoogleSearch',
                      arguments: toolCallBuffer
                    }
                  }]
                },
                {
                  role: 'tool',
                  tool_call_id: currentToolCall.id,
                  content: `## 🔥 GOOGLE SEARCH COMPLETE - RESULTS BELOW

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

              // Stream follow-up response
              const followUpStream = parseOpenAIStream(followUpRes);

              for await (const followUpEvent of followUpStream) {
                if (followUpEvent.type === 'done') {
                  res.write('data: [DONE]\n\n');
                  break;
                }

                res.write(formatOpenAIEvent(followUpEvent));
              }

              console.error(`[Request ${requestId}] Follow-up complete`);
              res.end();
              return;
            }
          } catch (error) {
            console.error(`[Request ${requestId}] Search failed:`, error.message);
          }

          // Clear tool call state
          currentToolCall = null;
          toolCallBuffer = '';
          continue;
        }

        // Forward non-tool_call events
        if (!detectedToolCall || !currentToolCall) {
          res.write(formatOpenAIEvent(event));
        }
      }

      res.end();
    } catch (error) {
      console.error(`[Request ${requestId}] Request error:`, error.message);
      if (!res.headersSent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad Request', message: error.message }));
      } else {
        res.end();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ GoogleSearch Proxy for llama.cpp running on http://localhost:${PORT}`);
  console.log(`📡 Forwarding to: ${BACKEND_URL}`);
  console.log(`\nTo use with minimax-prism wrapper:`);
  console.log(`  The wrapper is already configured to use this proxy`);
  console.log(`\nServer ready 🚀`);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
