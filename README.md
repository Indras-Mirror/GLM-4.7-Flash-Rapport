# GLM-4.7-Flash-Rapport

Fast GLM-4.7-Flash-PRISM wrapper for Claude Code with Google Search MCP and Vision Proxy integration.

## Features

- **Fast GLM-4.7-Flash Model**: Optimized for RTX 4090 24GB with 198k context
- **Google Search MCP**: Fast web search via Google Custom Search API
- **Vision Proxy**: Image analysis via OpenRouter integration
- **Image Routing Proxy**: Automatic routing of image requests to vision backend
- **Separate Conversation History**: Isolated conversation data per wrapper
- **Auto Service Management**: Automatic server startup/shutdown

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
git clone https://github.com/YOUR_USERNAME/GLM-4.7-Flash-Rapport.git
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
# GLM-Flash Server Configuration
export GLM_FLASH_SERVER_DIR="$HOME/AI/GLM-4.7-Flash-PRISM"
export GLM_FLASH_PORT="8082"

# OpenRouter API Key (for vision)
export OPENROUTER_API_KEY="your-openrouter-api-key"

# Google Search API Credentials
export GOOGLE_SEARCH_API_KEY="your-google-api-key"
export GOOGLE_SEARCH_CX="your-custom-search-engine-id"

# Image Routing Proxy (optional)
export IMAGE_ROUTING_PROXY_PORT="9101"
export OPENROUTER_MODEL="z-ai/glm-4.6v"
```

### 4. Install the Wrapper

```bash
cd /path/to/GLM-4.7-Flash-Rapport
chmod +x wrapper/glm-flash
chmod +x lib/base-wrapper.sh

# Link to your bin directory
ln -s "$(pwd)/wrapper/glm-flash" ~/.local/bin/glm-flash
```

### 5. Configure MCP Servers

Add to your `~/.config/Claude/claude_desktop_config.json`:

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

Copy skills to your Claude skills directory:

```bash
mkdir -p ~/.claude/skills
cp -r skills/* ~/.claude/skills/
```

## Usage

### Basic Usage

```bash
# Using the wrapper
glm-flash --skip "your prompt here"

# Continue previous conversation
glm-flash --continue

# With image file (auto-routes to vision)
glm-flash --skip "analyze this image" screenshot.png
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GLM_FLASH_SERVER_DIR` | `$HOME/AI/GLM-4.7-Flash-PRISM` | Path to GLM model directory |
| `GLM_FLASH_PORT` | `8082` | Local server port |
| `OPENROUTER_API_KEY` | - | OpenRouter API key for vision |
| `GOOGLE_SEARCH_API_KEY` | - | Google Custom Search API key |
| `GOOGLE_SEARCH_CX` | - | Google Custom Search Engine ID |
| `IMAGE_ROUTING_PROXY_PORT` | `9101` | Image routing proxy port |
| `OPENROUTER_MODEL` | `z-ai/glm-4.6v` | Vision model to use |

### MCP Tools

#### Google Search (`google_search`)
- Fast web search via Google Custom Search API
- Returns titles, snippets, and URLs

#### Vision Proxy Tools
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
│   ├── image-routing-proxy.py # Image routing proxy
│   ├── google-search-mcp-settings.sh
│   └── mcp-servers/
│       ├── googlesearch/
│       │   └── mcp-server/
│       │       ├── index.js
│       │       └── package.json
│       └── visionproxy/
│           ├── mcp-server/
│           │   ├── index.js
│           │   └── package.json
│           └── scripts/
│               ├── analyze_image.py
│               ├── detect_faces.py
│               └── get_metadata.py
├── skills/
│   ├── google-search/
│   │   ├── google-search.md
│   │   └── skill.json
│   └── vision-analysis/
│       ├── vision-analysis.md
│       └── skill.json
└── CLAUDE.md.template         # Template for custom instructions
```

## Getting API Keys

### OpenRouter API Key
1. Visit https://openrouter.ai/
2. Create an account and generate an API key
3. Set `OPENROUTER_API_KEY` environment variable

### Google Custom Search API
1. Visit https://console.cloud.google.com/
2. Create a project and enable Custom Search API
3. Create credentials (API Key)
4. Create a Custom Search Engine at https://cse.google.com/
5. Set `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_CX`

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
- Test MCP server: `claude mcp list`

## License

MIT License
