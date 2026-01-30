#!/bin/bash
# ============================================================================
# GLM-4.7-Flash-Rapport Wrapper
# ============================================================================
# Quick-launch wrapper for GLM-4.7-Flash with MCP integrations
#
# Usage:
#   ./GLM-4.7-Flash-Rapport.sh "your prompt here"
#   ./GLM-4.7-Flash-Rapport.sh --skip "your prompt"
#   ./GLM-4.7-Flash-Rapport.sh --continue
#
# Environment Variables (set before running):
#   GLM_FLASH_SERVER_DIR - Path to GLM model directory
#   GLM_FLASH_PORT       - Server port (default: 8082)
#   OPENROUTER_API_KEY   - For vision/image analysis
#   GOOGLE_SEARCH_API_KEY - Google Custom Search API key
#   GOOGLE_SEARCH_CX     - Google Custom Search Engine ID
# ============================================================================

set -e

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default configuration
export GLM_FLASH_SERVER_DIR="${GLM_FLASH_SERVER_DIR:-$HOME/AI/GLM-4.7-Flash-PRISM}"
export GLM_FLASH_PORT="${GLM_FLASH_PORT:-8082}"
export GLM_FLASH_CONTEXT_SIZE="${GLM_FLASH_CONTEXT_SIZE:-198000}"
export IMAGE_ROUTING_PROXY_PORT="${IMAGE_ROUTING_PROXY_PORT:-9101}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-z-ai/glm-4.6v}"

# Show banner
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ⚡ GLM-4.7-Flash-Rapport Wrapper                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check required environment
if [[ -z "$OPENROUTER_API_KEY" ]]; then
    echo -e "${YELLOW}⚠️  OPENROUTER_API_KEY not set${NC}"
    echo "   Vision features will be disabled"
    echo "   Set with: export OPENROUTER_API_KEY='your-key'"
    echo ""
fi

if [[ -z "$GOOGLE_SEARCH_API_KEY" ]] || [[ -z "$GOOGLE_SEARCH_CX" ]]; then
    echo -e "${YELLOW}⚠️  Google Search API credentials not set${NC}"
    echo "   Google Search will be disabled"
    echo "   Set with: export GOOGLE_SEARCH_API_KEY='your-key'"
    echo "           export GOOGLE_SEARCH_CX='your-cx'"
    echo ""
fi

# Check server directory
if [[ ! -d "$GLM_FLASH_SERVER_DIR" ]]; then
    echo -e "${RED}❌ Server directory not found: $GLM_FLASH_SERVER_DIR${NC}"
    echo "   Set GLM_FLASH_SERVER_DIR to your model directory"
    exit 1
fi

# Show configuration
echo -e "${BLUE}Configuration:${NC}"
echo "  Server Directory: $GLM_FLASH_SERVER_DIR"
echo "  Server Port: $GLM_FLASH_PORT"
echo "  Context Size: $GLM_FLASH_CONTEXT_SIZE tokens"
echo "  Image Proxy Port: $IMAGE_ROUTING_PROXY_PORT"
echo ""

# Run the wrapper
exec "$INSTALL_DIR/wrapper/glm-flash" "$@"
