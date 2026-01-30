/**
 * Google Custom Search Integration
 *
 * Uses Google Custom Search API v1 to perform web searches
 */

export async function performGoogleSearch(query, numResults = 5) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_SEARCH_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey) {
    throw new Error('GOOGLE_SEARCH_API_KEY environment variable is not set');
  }

  if (!cx) {
    throw new Error('GOOGLE_SEARCH_CX environment variable is not set');
  }

  const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
  searchUrl.searchParams.set('key', apiKey);
  searchUrl.searchParams.set('cx', cx);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('num', Math.min(numResults, 10).toString());

  const response = await fetch(searchUrl.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Search API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.items) {
    return {
      query,
      results: [],
      totalTime: 0,
    };
  }

  return {
    query,
    results: data.items.map((item, index) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      index: index + 1,
    })),
    totalTime: parseFloat(data.searchInformation?.searchTime || '0'),
  };
}

export function formatSearchResults(search) {
  const parts = [];

  parts.push(`### Query: "${search.query}"`);
  parts.push(`### Found ${search.results.length} results\n`);

  for (let i = 0; i < Math.min(search.results.length, 5); i++) {
    const result = search.results[i];
    parts.push(`**Result ${i + 1}**`);
    parts.push(`📌 Title: ${result.title}`);
    parts.push(`📝 Summary: ${result.snippet}`);
    parts.push(`🔗 URL: ${result.link}`);
    parts.push('');
  }

  parts.push('\nUse these search results to answer the user. For detailed information, use the Fetch tool on the provided URLs.');

  return parts.join('\n');
}
