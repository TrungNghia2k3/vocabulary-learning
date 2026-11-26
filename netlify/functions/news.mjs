import { fetchFullArticle, fetchLiveNewsFeed } from '../../api/_newsCore.mjs';

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  try {
    const params = event.queryStringParameters || {};
    if (params.articleUrl) {
      const data = await fetchFullArticle(params.articleUrl);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }
    const feed = await fetchLiveNewsFeed(params.category || 'all');
    return { statusCode: 200, headers, body: JSON.stringify(feed) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'Không tải được tin tức.',
      }),
    };
  }
}
