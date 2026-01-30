#!/bin/bash
# ============================================================================
# Google Search MCP Settings Helper
# ============================================================================
# Common function to generate Google Search MCP settings for wrappers
# This replaces proxy-based search with clean MCP integration
# ============================================================================

# Generate Google Search MCP settings JSON
# Usage: google_search_mcp_settings "$API_BASE_URL" "$API_AUTH_TOKEN" "$API_TIMEOUT_MS" "$DEFAULT_MODEL"
google_search_mcp_settings() {
    local base_url="$1"
    local auth_token="$2"
    local timeout="$3"
    local haiku_model="$4"
    local sonnet_model="$5"
    local opus_model="$6"
    local context_size="${7:-128000}"

    cat << EOF
{
    "env": {
        "ANTHROPIC_AUTH_TOKEN": "$auth_token",
        "ANTHROPIC_BASE_URL": "$base_url",
        "API_TIMEOUT_MS": "$timeout",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "$haiku_model",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "$sonnet_model",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "$opus_model",
        "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "$context_size"
    },
    "disallowedTools": ["WebSearch"],
    "appendSystemPrompt": "\\n\\n# Google Search Integration\\n\\nYou have access to Google Custom Search via the 'googlesearch' MCP server.\\n\\n## When to Use\\n\\nUse the 'google_search' tool when:\\n- User asks to search, find, or look up current information\\n- User asks for latest, recent, or today's information\\n- User needs real-time web data\\n- User explicitly requests a web search\\n\\n## How to Use\\n\\nCall the 'google_search' tool:\\n\\n{\\n  \\"name\\": \\"google_search\\",\\n  \\"arguments\\": {\\n    \\"query\\": \\"your search query\\",\\n    \\"num_results\\": 10\\n  }\\n}\\n\\nThe tool returns formatted results with titles, snippets, and URLs. Synthesize the information and cite sources.\\n\\n**Important**: This is your PRIMARY web search tool. Use it immediately when current information is needed."
}
EOF
}

export -f google_search_mcp_settings
