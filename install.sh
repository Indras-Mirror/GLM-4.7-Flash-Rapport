#!/bin/bash
# ============================================================================
# GLM-4.7-Flash-Rapport Installation Script
# ============================================================================

set -e

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_NAME="glm-flash"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GLM-4.7-Flash-Rapport Installer                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3 first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo "✅ Python 3 found: $(python3 --version)"
echo ""

# Install Node.js dependencies
echo "Installing MCP server dependencies..."
cd "$INSTALL_DIR/lib/mcp-servers/googlesearch/mcp-server"
npm install --silent

cd "$INSTALL_DIR/lib/mcp-servers/visionproxy/mcp-server"
npm install --silent

echo "✅ Node.js dependencies installed"
echo ""

# Install Python dependencies
echo "Checking Python dependencies..."

if ! python3 -c "import PIL" &> /dev/null; then
    echo "Installing Pillow..."
    pip install Pillow --quiet
fi

if ! python3 -c "import cv2" &> /dev/null; then
    echo "Installing opencv-python..."
    pip install opencv-python --quiet
fi

if ! python3 -c "import numpy" &> /dev/null; then
    echo "Installing numpy..."
    pip install numpy --quiet
fi

echo "✅ Python dependencies ready"
echo ""

# Make scripts executable
chmod +x "$INSTALL_DIR/wrapper/glm-flash"
chmod +x "$INSTALL_DIR/lib/base-wrapper.sh"
chmod +x "$INSTALL_DIR/lib/mcp-servers/visionproxy/scripts/"*.py

# Create symlink
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

if [ -L "$LOCAL_BIN/$WRAPPER_NAME" ]; then
    echo "Removing existing symlink..."
    rm "$LOCAL_BIN/$WRAPPER_NAME"
fi

ln -s "$INSTALL_DIR/wrapper/$WRAPPER_NAME" "$LOCAL_BIN/$WRAPPER_NAME"
echo "✅ Wrapper installed to: $LOCAL_BIN/$WRAPPER_NAME"
echo ""

# Install skills
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"
cp -r "$INSTALL_DIR/skills/"* "$SKILLS_DIR/"
echo "✅ Skills installed to: $SKILLS_DIR"
echo ""

# Create MCP config template
MCP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
MCP_TEMPLATE="$INSTALL_DIR/mcp-config-template.json"

cat > "$MCP_TEMPLATE" << EOF
{
  "mcpServers": {
    "googlesearch": {
      "command": "node",
      "args": [
        "$INSTALL_DIR/lib/mcp-servers/googlesearch/mcp-server/index.js"
      ],
      "env": {
        "GOOGLE_SEARCH_API_KEY": "your-google-api-key",
        "GOOGLE_SEARCH_CX": "your-custom-search-id"
      }
    },
    "visionproxy": {
      "command": "node",
      "args": [
        "$INSTALL_DIR/lib/mcp-servers/visionproxy/mcp-server/index.js"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-openrouter-api-key"
      }
    }
  }
}
EOF

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Installation Complete!                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "1. Set up environment variables in your ~/.bashrc:"
echo ""
echo "   export GLM_FLASH_SERVER_DIR=\"\$HOME/AI/GLM-4.7-Flash-PRISM\""
echo "   export GLM_FLASH_PORT=\"8082\""
echo "   export OPENROUTER_API_KEY=\"your-openrouter-api-key\""
echo "   export GOOGLE_SEARCH_API_KEY=\"your-google-api-key\""
echo "   export GOOGLE_SEARCH_CX=\"your-custom-search-id\""
echo ""
echo "2. Configure MCP servers - add this to ~/.config/Claude/claude_desktop_config.json:"
echo ""
cat "$MCP_TEMPLATE"
echo ""
echo "3. Source your bashrc or restart your terminal"
echo ""
echo "4. Run: glm-flash --skip 'Hello!'"
echo ""
