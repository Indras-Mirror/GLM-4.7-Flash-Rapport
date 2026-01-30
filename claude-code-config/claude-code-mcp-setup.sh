#!/bin/bash
# ============================================================================
# Claude Code MCP Setup Script for GLM-Flash Wrapper
# ============================================================================
# This script automatically configures Claude Code to use the MCP servers
# included with GLM-Flash-Wrapper.
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Claude Code MCP Setup for GLM-Flash Wrapper                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Find Claude Code config directory
echo -e "${BLUE}Finding Claude Code configuration...${NC}"

CLAUDE_CONFIG_DIR=""
CONFIG_PATHS=(
    "$HOME/.config/claude-code/settings.json"
    "$HOME/.claude/settings.json"
    "$HOME/Library/Application Support/claude-code/Settings/settings.json"  # macOS
)

for path in "${CONFIG_PATHS[@]}"; do
    if [[ -f "$path" ]]; then
        CLAUDE_CONFIG_DIR="$(dirname "$path")"
        CLAUDE_CONFIG_FILE="$path"
        echo -e "${GREEN}✓ Found at: $CLAUDE_CONFIG_FILE${NC}"
        break
    fi
done

if [[ -z "$CLAUDE_CONFIG_DIR" ]]; then
    echo -e "${YELLOW}⚠️  Could not find Claude Code config file${NC}"
    echo -e "${YELLOW}  Creating new config at: ~/.config/claude-code/settings.json${NC}"
    CLAUDE_CONFIG_DIR="$HOME/.config/claude-code"
    mkdir -p "$CLAUDE_CONFIG_DIR"
    CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/settings.json"
    echo "{}" > "$CLAUDE_CONFIG_FILE"
fi

# Backup existing config
BACKUP_FILE="$CLAUDE_CONFIG_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp "$CLAUDE_CONFIG_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✓ Backed up existing config to: $BACKUP_FILE${NC}"

# Read existing config or start fresh
if [[ -s "$CLAUDE_CONFIG_FILE" ]]; then
    EXISTING_CONFIG=$(cat "$CLAUDE_CONFIG_FILE")
else
    EXISTING_CONFIG="{}"
fi

# Build MCP server paths
MCP_GOOGLESEARCH="$PROJECT_ROOT/lib/mcp-servers/googlesearch/mcp-server/index.js"
MCP_VISIONPROXY="$PROJECT_ROOT/lib/mcp-servers/visionproxy/mcp-server/index.js"

# Verify MCP servers exist
if [[ ! -f "$MCP_GOOGLESEARCH" ]]; then
    echo -e "${RED}❌ MCP server not found: $MCP_GOOGLESEARCH${NC}"
    echo -e "${RED}   Have you installed dependencies? Run: cd lib/mcp-servers/googlesearch/mcp-server && npm install${NC}"
    exit 1
fi

if [[ ! -f "$MCP_VISIONPROXY" ]]; then
    echo -e "${RED}❌ MCP server not found: $MCP_VISIONPROXY${NC}"
    echo -e "${RED}   Have you installed dependencies? Run: cd lib/mcp-servers/visionproxy/mcp-server && npm install${NC}"
    exit 1
fi

# Create merged config
echo ""
echo -e "${BLUE}Configuring MCP servers...${NC}"

# Use Python to merge JSON properly
python3 << PYTHON_SCRIPT
import json
import os
import sys

existing = json.loads("""$EXISTING_CONFIG""")

# Add/update MCP servers
if "mcpServers" not in existing:
    existing["mcpServers"] = {}

existing["mcpServers"]["googlesearch"] = {
    "command": "node",
    "args": ["$MCP_GOOGLESEARCH"],
    "env": {
        "GOOGLE_SEARCH_API_KEY": os.environ.get("GOOGLE_SEARCH_API_KEY", "your-google-api-key-here"),
        "GOOGLE_SEARCH_CX": os.environ.get("GOOGLE_SEARCH_CX", "your-cx-id-here")
    }
}

existing["mcpServers"]["visionproxy"] = {
    "command": "node",
    "args": ["$MCP_VISIONPROXY"],
    "env": {
        "OPENROUTER_API_KEY": os.environ.get("OPENROUTER_API_KEY", "your-openrouter-api-key-here")
    }
}

# Write merged config
with open("$CLAUDE_CONFIG_FILE", "w") as f:
    json.dump(existing, f, indent=2)

print(json.dumps(existing, indent=2))
PYTHON_SCRIPT

echo -e "${GREEN}✓ MCP servers configured${NC}"
echo ""
echo -e "${BLUE}Configured MCP servers:${NC}"
echo "  • googlesearch → $MCP_GOOGLESEARCH"
echo "  • visionproxy  → $MCP_VISIONPROXY"
echo ""

# Install skills
echo -e "${BLUE}Installing Claude Code skills...${NC}"

SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

# Copy skills
cp -r "$PROJECT_ROOT/skills/"* "$SKILLS_DIR/" 2>/dev/null || true

echo -e "${GREEN}✓ Skills installed to: $SKILLS_DIR${NC}"
echo ""

# Show summary
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo ""
echo "1. Set your API keys in the config file or as environment variables:"
echo "   export GOOGLE_SEARCH_API_KEY='your-key'"
echo "   export GOOGLE_SEARCH_CX='your-cx'"
echo "   export OPENROUTER_API_KEY='your-key'"
echo ""
echo "2. Restart Claude Code"
echo ""
echo "3. Verify MCP servers are running:"
echo "   claude mcp list"
echo ""
echo "4. Test the wrapper:"
echo "   cd $PROJECT_ROOT"
echo "   ./GLM-4.7-Flash-Rapport.sh --skip 'test search'"
echo ""
