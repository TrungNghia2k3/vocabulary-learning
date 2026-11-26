import { fetchYoutubeFeed, fetchYoutubeTranscript } from './_youtubeCore.mjs';

export default async function handler(req, res) {
  try {
    const video = typeof req.query?.video === 'string' ? req.query.video : '';
    const channel = typeof req.query?.channel === 'string' ? req.query.channel : 'all';

    if (video) {
      const payload = await fetchYoutubeTranscript(video);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).json(payload);
    }

    const feed = await fetchYoutubeFeed(channel);
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json(feed);
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Không tải được dữ liệu YouTube lúc này.',
    });
  }
}
