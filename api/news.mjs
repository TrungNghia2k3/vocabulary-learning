import { fetchFullArticle, fetchLiveNewsFeed } from './_newsCore.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const articleUrl = urlObj.searchParams.get('articleUrl');
    const category = urlObj.searchParams.get('category') || 'all';

    if (articleUrl) {
      const data = await fetchFullArticle(articleUrl);
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
      return res.status(200).json(data);
    }

    const feed = await fetchLiveNewsFeed(category);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(feed);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Không tải được tin tức.',
    });
  }
}
