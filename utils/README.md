# Utils - Standalone Proxy Servers

This directory contains standalone proxy servers that were used before migrating to MCP (Model Context Protocol) servers.

## Why We Switched from Proxies to MCP

### Original Proxy Approach

We initially used standalone HTTP proxy servers that sat between Claude Code and the LLM APIs. These proxies would:

1. **Intercept API requests** and inject custom tools (GoogleSearch, Vision)
2. **Auto-execute** those tools when the model used them
3. **Inject results** back into the conversation
4. **Continue** the conversation automatically

### Problems with Proxies

While functional, the proxy approach had several issues:

- **Bloated conversation chain** - Each tool use added 2-3 extra turns (tool request → tool response → continuation)
- **More complex setup** - Required running separate HTTP servers
- **Slower response** - Added HTTP round-trip latency
- **Harder debugging** - Proxy logic was opaque and harder to trace

### MCP Approach (Current)

MCP servers integrate directly with Claude Code via stdio:

- **Cleaner conversation** - Tool results are inline, no extra turns
- **Faster** - Direct stdio communication, no HTTP overhead
- **Native integration** - Built specifically for Claude Code
- **Better error handling** - Native reconnection and state management
- **Less complex** - No separate server processes to manage

## When to Use Proxies Instead

The proxy servers in this directory are still useful for:

1. **Non-Claude Code integrations** - Use with other LLM clients
2. **Custom proxy logic** - Experiment with new injection/interception patterns
3. **Learning** - Understand how tool injection works
4. **Standalone HTTP servers** - Run as REST APIs for other applications

## Available Proxies

### Google Search Proxy (`standalone-googlesearch/)

Injects Google Custom Search functionality into any LLM that supports tools.

**Files:**
- `server.js` - Basic proxy for Anthropic API format
- `server-enhanced.js` - Enhanced version with thinking-based search detection
- `server-llamacpp.js` - Version for llama.cpp OpenAI-style format
- `search-google.js` - Google Search API integration module

**Usage:**
```bash
cd utils/standalone-googlesearch
export GOOGLE_SEARCH_API_KEY="your-key"
export GOOGLE_SEARCH_CX="your-cx"
node server-enhanced.js --port 9736 --backend http://localhost:8080
```

### Image Routing Proxy (`image-routing-proxy.py`)

Routes image requests to a vision-capable backend while text requests go to the main model.

**Usage:**
```bash
cd utils
export OPENROUTER_API_KEY="your-key"
python3 image-routing-proxy.py \
  --port 9101 \
  --original-api http://localhost:8080 \
  --vision-api-type openrouter \
  --openrouter-model z-ai/glm-4.6v
```

## Environment Variables

All proxies require these environment variables:

| Variable | Description |
|----------|-------------|
| `GOOGLE_SEARCH_API_KEY` | Google Custom Search API key |
| `GOOGLE_SEARCH_CX` | Google Custom Search Engine ID |
| `OPENROUTER_API_KEY` | OpenRouter API key (for vision) |
| `BACKEND_URL` | Backend LLM API URL |

## See Also

- **Main README** - For the current MCP-based setup
- **lib/mcp-servers/** - The MCP servers we use now
- **llama-cpp-settings.sh** - Reference llama.cpp configuration
