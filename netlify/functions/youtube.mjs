import { fetchYoutubeFeed, fetchYoutubeTranscript } from '../../api/_youtubeCore.mjs';

export async function handler(event) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  try {
    const params = event.queryStringParameters || {};
    if (params.video) {
      const payload = await fetchYoutubeTranscript(params.video);
      return {
        statusCode: 200,
        headers: { ...headers, 'Cache-Control': 'public, max-age=1800' },
        body: JSON.stringify(payload),
      };
    }

    const feed = await fetchYoutubeFeed(params.channel || 'all');
    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'public, max-age=900' },
      body: JSON.stringify(feed),
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'Không tải được dữ liệu YouTube lúc này.',
      }),
    };
  }
}
