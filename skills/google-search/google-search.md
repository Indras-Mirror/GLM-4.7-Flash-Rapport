# Google Search Skill (Fallback/Alternative)

You have access to Google Custom Search via the `googlesearch` MCP server with the tool `google_search`.

## When to Use This Skill

Use Google Search as a **fallback** or **alternative** when:
- The built-in `WebSearch` tool is unavailable or failing
- User explicitly asks for Google Search with `/google-search`
- You're running on a local model wrapper without WebSearch
- User specifically requests Google results

## Preference Order

1. **First**: Try built-in `WebSearch` tool (if available)
2. **Second**: Use this Google Search skill (if WebSearch fails or unavailable)
3. **Never**: Answer from training data for current information

## How to Use

1. **Immediately** call the `google_search` tool from the `googlesearch` MCP server
2. Use the query parameter with the user's search intent
3. Set num_results to 5-10 depending on how much info is needed

Example:
```json
{
  "name": "google_search",
  "arguments": {
    "query": "latest AI developments 2026",
    "num_results": 10
  }
}
```

## After Getting Results

1. **Synthesize** the information from multiple results
2. **Answer directly** using the search results
3. **Cite sources** with URLs from the results
4. **Don't** say "let me search" or "let me fetch more" - just answer with what you have

## Important Notes

- The tool returns titles, snippets, and URLs
- Results are already formatted and ready to use
- This is MUCH faster than using WebFetch or Task agents
- Always prefer this over other search methods

## Example Usage

User: "What's the latest news about Claude AI?"