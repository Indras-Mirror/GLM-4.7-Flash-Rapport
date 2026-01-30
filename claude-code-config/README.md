# Claude Code Configuration for GLM-Flash Wrapper

This directory contains template configuration files for integrating GLM-Flash with Claude Code.

## Important Note

**The GLM-Flash wrapper automatically handles most of this configuration!** The wrapper injects:

- `disallowedTools: ["WebSearch"]` - Disables Claude's built-in WebSearch
- System prompt with `google_search` and vision tool instructions

You only need to manually configure Claude Code if you want to use the MCP servers with Claude Code directly (without the wrapper).

## Files Included

### `mcp-config-template.json`

Template for configuring MCP servers in Claude Code's settings.

### `claude-code-mcp-setup.sh`

Script that automatically:
1. Finds your Claude Code config directory
2. Adds the googlesearch and visionproxy MCP servers
3. Points to the MCP servers within this project

## Manual Setup

If you prefer to configure manually:

### 1. Find Your Claude Code Config

```bash
# Linux/macOS
~/.config/claude-code/settings.json

# Or check where Claude Code stores settings
ls -la ~/.config/claude-code/
```

### 2. Add MCP Servers

Add to your `settings.json`:

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

### 3. Install Skills (Optional)

The skills are already in this repo at `skills/`. Copy them to Claude Code:

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/GLM-4.7-Flash-Rapport/skills/* ~/.claude/skills/
```

## Wrapper vs Direct Claude Code

### Using the Wrapper (Recommended)

The wrapper handles everything:
```bash
glm-flash --skip "search for latest AI news"
```

### Using Claude Code Directly

If you want to use Claude Code's native interface with MCP:
1. Configure MCP servers (above)
2. Set environment variables
3. The MCP tools will be available automatically

## Troubleshooting

### MCP servers not showing

Run: `claude mcp list`

Should show:
```
googlesearch        ✓
visionproxy         ✓
```

### Skills not loading

Check skills are in: `~/.claude/skills/`

Each skill needs:
- `skill.json` - metadata
- `[skill-name].md` - the actual skill prompt

### Environment variables not working

Make sure to set them before starting Claude Code:

```bash
export GOOGLE_SEARCH_API_KEY="..."
export GOOGLE_SEARCH_CX="..."
export OPENROUTER_API_KEY="..."
claude
```

Or add to your `~/.bashrc` and restart terminal.
