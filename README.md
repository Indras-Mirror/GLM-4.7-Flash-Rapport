# GLM-4.7-Flash-Rapport

Fast GLM-4.7-Flash-PRISM wrapper for Claude Code with Google Search and Vision integration.

## Features

- **Fast GLM-4.7-Flash Model**: Optimized for RTX 4090 24GB with 198k context
- **Google Search**: Fast web search via Google Custom Search API (MCP)
- **Vision Support**: Image analysis via OpenRouter integration (auto-routing proxy)
- **Separate Conversation History**: Isolated conversation data per wrapper
- **Auto Service Management**: Automatic server startup/shutdown

### Image Routing

The wrapper uses an HTTP proxy that intercepts Claude Code API requests:

1. **Text requests** → forwarded to local GLM-4.7-Flash model
2. **Image requests** → detected by checking for `type: "image"` blocks → converted to OpenAI format → sent to OpenRouter vision API → response converted back to Anthropic format

```python
# Image routing logic
if has_image_content(request):
    # Route to OpenRouter (with format conversion)
    target_url = "https://openrouter.ai/api/v1/chat/completions"
else:
    # Route to local GLM model
    target_url = local_api_url
```

![Image Routing](assets/Image-Routing-Rapport.png)

### Google Search Integration

The wrapper disables Claude's built-in WebSearch and replaces it with Google Search via MCP:

1. `"disallowedTools": ["WebSearch"]` → disables Claude's internal search
2. System prompt injection → tells Claude about `google_search` MCP tool
3. When search needed → Claude uses `google_search` MCP tool instead
4. MCP server (stdio) → calls Google API → returns results directly

```json
// Wrapper settings
"disallowedTools": ["WebSearch"],  // Disable built-in
"appendSystemPrompt": "Use 'google_search' tool when..."  // Add MCP tool
```

![Google Search](assets/WebSearch-Rapport.png)

## System Requirements

- Linux system
- NVIDIA GPU with 24GB VRAM (tested on RTX 4090)
- llama.cpp built and configured for GLM-4.7-Flash
- Node.js 18+ for MCP servers
- Python 3 with PIL, OpenCV, and numpy for vision scripts

## Installation

### 1. Clone and Install

```bash
cd /path/to/your/AI/directory
git clone https://github.com/Indras-Mirror/GLM-4.7-Flash-Rapport.git
cd GLM-4.7-Flash-Rapport
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies for MCP servers
cd lib/mcp-servers/googlesearch/mcp-server
npm install

cd ../../visionproxy/mcp-server
npm install

# Install Python dependencies for vision scripts
pip install Pillow opencv-python numpy
```

### 3. Configure Environment Variables

Create a `~/.glm-flash-env` file or add to your `~/.bashrc`:

```bash
# ============================================================================
# REQUIRED - GLM-4.7-Flash Model
# ============================================================================
export GLM_FLASH_SERVER_DIR="$HOME/AI/GLM-4.7-Flash-PRISM"
export GLM_FLASH_PORT="8082"

# ============================================================================
# OPTIONAL - Vision Support (for image analysis)
# ============================================================================
# Get key at: https://openrouter.ai/
export OPENROUTER_API_KEY="your-openrouter-api-key"
export OPENROUTER_MODEL="z-ai/glm-4.6v"
export IMAGE_ROUTING_PROXY_PORT="9101"

# ============================================================================
# OPTIONAL - Google Search (for web search)
# ============================================================================
# See "Getting API Keys" section below for setup instructions
export GOOGLE_SEARCH_API_KEY="your-google-api-key"
export GOOGLE_SEARCH_CX="your-custom-search-engine-id"
```

**Note**: The wrapper works without Vision or Google Search, but you'll only have text generation. Add both for full functionality.

### 4. Install the Wrapper

```bash
cd /path/to/GLM-4.7-Flash-Rapport
chmod +x wrapper/glm-flash
chmod +x lib/base-wrapper.sh

# Link to your bin directory
ln -s "$(pwd)/wrapper/glm-flash" ~/.local/bin/glm-flash
```

### 5. Configure MCP Servers

**Option A: Automatic Setup (Recommended)**

```bash
cd /path/to/GLM-4.7-Flash-Rapport/claude-code-config
./claude-code-mcp-setup.sh
```

This script automatically:
- Finds your Claude Code config directory
- Adds googlesearch and visionproxy MCP servers
- Installs the skills to `~/.claude/skills/`
- Creates a backup of your existing config

**Option B: Manual Setup**

Add to your `~/.config/Claude/claude_desktop_config.json` (or `~/.config/claude-code/settings.json`):

```json
{
  "mcpServers": {
    "googlesearch": {
      "command": "node",
      "args": [
        "/path/to/GLM-4.7-Flash-Rapport/lib/mcp-servers/googlesearch/mcp-server/index.js"
      ],
      "env": {
        "GOOGLE_SEARCH_API_KEY": "your-google-api-key",
        "GOOGLE_SEARCH_CX": "your-cx-id"
      }
    },
    "visionproxy": {
      "command": "node",
      "args": [
        "/path/to/GLM-4.7-Flash-Rapport/lib/mcp-servers/visionproxy/mcp-server/index.js"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-openrouter-api-key"
      }
    }
  }
}
```

### 6. Install Skills

```bash
mkdir -p ~/.claude/skills
cp -r skills/* ~/.claude/skills/
```

## Getting API Keys

### OpenRouter API Key (for Vision)

1. Visit https://openrouter.ai/
2. Create an account and generate an API key
3. Set `OPENROUTER_API_KEY` environment variable

### Google Custom Search API (Detailed Setup)

#### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click on the project dropdown at the top
4. Click "New Project"
5. Enter a project name (e.g., "Claude Code Search")
6. Click "Create"

#### Step 2: Enable Custom Search API

1. In the Google Cloud Console, navigate to:
   **APIs & Services > Library**
2. Search for "Custom Search API"
3. Click on it and press "Enable"

#### Step 3: Create API Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click "Create Credentials"
3. Select "API Key"
4. Copy the generated API key
5. (Optional) Restrict the key:
   - Click "Edit API key"
   - Under "Application restrictions", select "None" for local testing
   - Under "API restrictions", select only "Custom Search API"
   - Click "Save"

#### Step 4: Create Custom Search Engine

1. Go to [Google Custom Search](https://cse.google.com/)
2. Click "Add"
3. Enter the sites to search (e.g., `*.www.google.com` to search the entire web)
4. Give your search engine a name
5. Click "Create"

#### Step 5: Configure Search Engine

1. After creation, click "Control Panel" for your search engine
2. Under "Setup", find "Search engine ID"
3. Copy your CX ID (Search engine ID)
4. **Important**: Under "Setup", enable "Search the entire web" toggle
   - This allows searching beyond just your specified sites
5. Click "Save" if needed

#### Step 6: Test Your Setup

```bash
# Test the API directly
curl "https://www.googleapis.com/customsearch/v1?key=$GOOGLE_SEARCH_API_KEY&cx=$GOOGLE_SEARCH_CX&q=test&num=1"
```

You should see JSON results with search data.

## Usage

```bash
# Text generation
glm-flash --skip "your prompt here"

# With image (auto-routes to vision)
glm-flash --skip "analyze this image" screenshot.png

# With search (uses Google Search MCP)
glm-flash --skip "what's the latest news about AI?"

# Continue previous conversation
glm-flash --continue
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GLM_FLASH_SERVER_DIR` | Yes | Path to GLM model directory |
| `GLM_FLASH_PORT` | No | Local server port (default: 8082) |
| `OPENROUTER_API_KEY` | For vision | OpenRouter API key for image analysis |
| `GOOGLE_SEARCH_API_KEY` | For search | Google Custom Search API key |
| `GOOGLE_SEARCH_CX` | For search | Google Custom Search Engine ID |
| `IMAGE_ROUTING_PROXY_PORT` | No | Image routing proxy port (default: 9101) |
| `OPENROUTER_MODEL` | No | Vision model to use (default: z-ai/glm-4.6v) |

## MCP Tools

### Google Search (`google_search`)
- Fast web search via Google Custom Search API
- Returns titles, snippets, and URLs

### Vision Tools
- `describe_image`: Natural language image description
- `analyze_image`: Technical image properties (dimensions, colors)
- `detect_faces`: Face detection and analysis
- `get_image_metadata`: EXIF data extraction

## Project Structure

```
GLM-4.7-Flash-Rapport/
├── wrapper/
│   └── glm-flash              # Main wrapper script
├── lib/
│   ├── base-wrapper.sh        # Base wrapper framework
│   ├── image-routing-proxy.py # Image routing HTTP proxy
│   └── mcp-servers/
│       ├── googlesearch/      # Google Search MCP server
│       └── visionproxy/       # Vision MCP server + Python scripts
├── skills/                    # Claude Code skills (google-search, vision-analysis)
├── claude-code-config/        # Claude Code MCP setup script + templates
├── utils/                     # Standalone proxy servers (alternative)
├── assets/                    # Screenshots
├── llama-cpp-settings.sh      # Reference llama.cpp configuration
├── GLM-4.7-Flash-Rapport.sh   # Quick-launch script
└── install.sh                 # Installation script
```

## Troubleshooting

### Server fails to start
- Verify `GLM_FLASH_SERVER_DIR` points to valid llama.cpp model directory
- Check that `start-local-server.sh` exists in the model directory
- Review logs: `tail -f /tmp/glm-flash-server.log`

### Vision not working
- Verify `OPENROUTER_API_KEY` is set
- Check image routing proxy logs: `tail -f /tmp/glm-flash-image-routing-proxy.log`

### Google Search not working
- Verify `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_CX` are set
- Ensure Custom Search API is enabled in Google Cloud Console
- Ensure your search engine is configured to "Search the entire web"
- Test MCP server: `claude mcp list`

## Architecture Notes

### Why MCP Instead of HTTP Proxies?

This wrapper initially used HTTP proxy servers (included in `utils/`) that intercepted API requests. While functional, proxies caused bloated conversation chains and added latency.

MCP servers solve this with direct stdio integration, cleaner conversations, and faster responses. The proxy servers remain in `utils/` for experimentation or non-Claude Code integrations.

See `utils/README.md` for details on the standalone proxy servers.

---

## Google Search Setup Help

**This was the hardest part to get working. Here are some tips:**

### Common Issues and Fixes

#### Issue: "Search returns no results"

**Most likely cause**: "Search the entire web" toggle not enabled.

**Fix**:
1. Go to https://cse.google.com/
2. Click your search engine → "Control Panel"
3. Under "Setup" → Look for "Search the entire web"
4. Toggle it **ON**
5. Click "Save"

#### Issue: "API key errors" or "forbidden"

**Most likely cause**: API restrictions or Custom Search API not enabled.

**Fix**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Library → Search "Custom Search API"
3. Click it and press "Enable" if not already enabled
4. APIs & Services → Credentials → Edit your API key
5. Under "API restrictions", select ONLY "Custom Search API"
6. Under "Application restrictions", select "None" (for local testing)

#### Issue: "Getting same few results only"

**Most likely cause**: Search engine configured for specific sites only.

**Fix**:
1. Go to https://cse.google.com/
2. Your search engine → "Setup" tab
3. Under "Sites to search", add: `*.www.google.com` (or remove site restrictions)
4. Enable "Search the entire web" toggle
5. Save

#### Issue: "CX ID not found"

**Most likely cause**: Looking in wrong place or not created yet.

**Fix**:
1. Go to https://cse.google.com/ (not Google Cloud Console)
2. You MUST create a Custom Search Engine first
3. After creating, click "Control Panel"
4. Under "Setup" → "Search engine ID" is your CX
5. It looks like: `017576662512468239146:abc123def45`

#### Issue: "Daily limit exceeded"

**Cause**: Google Custom Search API has free tier limits (100 searches/day).

**Solutions**:
- The free tier should be plenty for testing
- If you hit this, wait 24 hours or enable billing (you won't be charged much for personal use)

### Quick Test Command

```bash
# Test your API keys directly
curl "https://www.googleapis.com/customsearch/v1?key=$GOOGLE_SEARCH_API_KEY&cx=$GOOGLE_SEARCH_CX&q=test+query&num=5"
```

**Expected response**: JSON with `"items"` array containing search results.

**If you get errors**:
- `400` → API key invalid or restrictions wrong
- `403` → Custom Search API not enabled
- No `"items"` → "Search the entire web" not enabled

### Minimum Viable Setup

If you just want to test quickly:

1. **API Key**: Get from https://console.cloud.google.com/apis/credentials
2. **CX ID**: Get from https://cse.google.com/ (create ANY search engine, then enable "Search the entire web")
3. **Test**: Run the curl command above

Don't overthink the search engine configuration — the "Search the entire web" toggle is the magic setting that makes it work like normal Google.

## License

MIT License
