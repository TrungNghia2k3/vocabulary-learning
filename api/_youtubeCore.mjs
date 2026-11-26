// Shared zero-dependency YouTube channel feed & timed English transcript fetcher
// Used by Vercel (/api/youtube.mjs), Netlify (netlify/functions/youtube.mjs), and Vite dev server.

export const CURATED_CHANNELS = [
  { key: 'ted-ed', name: 'TED-Ed', category: 'Education & Science', id: 'UCsooa4yRKGN_zEE8iknghZA' },
  { key: 'bbc-learning', name: 'BBC Learning English', category: 'English & News', id: 'UCHaHD477h-FeBbVh9Sh7syA' },
  { key: 'vox', name: 'Vox', category: 'Explainers & World', id: 'UCLXo7UDZvByw2ixzpQCufnA' },
  { key: 'natgeo', name: 'National Geographic', category: 'Nature & Culture', id: 'UCpVm7bg6pXKo1Pr6k5kxG9A' },
  { key: 'bbc-earth', name: 'BBC Earth', category: 'Wildlife & Science', id: 'UCwmZiChSryoWQCZMIQezgTg' },
  { key: 'kurzgesagt', name: 'Kurzgesagt', category: 'Science & Philosophy', id: 'UCsXVk37bltHxD1rDPwtNM8Q' },
  { key: 'ted', name: 'TED Talks', category: 'Ideas & Speaking', id: 'UCAuUUnT6oDeKwE6v1NGQxug' },
];

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IOS_UA =
  'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)';
const ANDROID_UA =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip';

function decodeXmlEntities(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractVideoId(input = '') {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return '';
}

function parseAtomFeed(xml, channel) {
  const items = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  for (const block of entries.slice(0, 10)) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? decodeXmlEntities(m[1]) : '';
    };
    const videoId = pick('yt:videoId');
    const title = pick('title');
    const publishedAt = pick('published') || new Date().toISOString();
    const descMatch = block.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i);
    const description = descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 260) : '';
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const link = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;

    if (!videoId || !title) continue;
    // Skip very short vertical shorts stubs if clearly tagged /shorts/
    if (/\/shorts\//i.test(link)) continue;

    items.push({
      videoId,
      title,
      channelKey: channel.key,
      channelName: channel.name,
      category: channel.category,
      publishedAt,
      description,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return items;
}

export async function fetchYoutubeFeed(channelKey = 'all') {
  const key = String(channelKey || 'all').toLowerCase();
  const targets =
    key === 'all'
      ? CURATED_CHANNELS
      : CURATED_CHANNELS.filter((c) => c.key === key);
  const selected = targets.length > 0 ? targets : CURATED_CHANNELS;

  const settled = await Promise.allSettled(
    selected.map(async (ch) => {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
        headers: { 'User-Agent': 'VocabStudio/1.0' },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return [];
      const xml = await res.text();
      return parseAtomFeed(xml, ch);
    })
  );

  const seen = new Set();
  const videos = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const v of r.value) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      videos.push(v);
    }
  }

  videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return {
    channel: key,
    channels: CURATED_CHANNELS.map(({ key: k, name, category }) => ({ key: k, name, category })),
    fetchedAt: new Date().toISOString(),
    videos: videos.slice(0, 30),
  };
}

function parseCaptionXml(xml = '') {
  const rawCues = [];

  // Format A (IOS): <text start="7.086" dur="5.089">...</text>
  const textMatches = xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi);
  for (const m of textMatches) {
    const attrs = m[1] || '';
    const startM = attrs.match(/start=["']([\d.]+)["']/i);
    const durM = attrs.match(/dur=["']([\d.]+)["']/i);
    const text = decodeXmlEntities((m[2] || '').replace(/<[^>]+>/g, ' '));
    if (!text) continue;
    rawCues.push({
      start: startM ? parseFloat(startM[1]) : 0,
      dur: durM ? parseFloat(durM[1]) : 3,
      text,
    });
  }

  if (rawCues.length > 0) return rawCues;

  // Format B (ANDROID srv3): <p t="7086" d="5089">...</p>
  const pMatches = xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi);
  for (const m of pMatches) {
    const attrs = m[1] || '';
    const tM = attrs.match(/\bt=["'](\d+)["']/i);
    const dM = attrs.match(/\bd=["'](\d+)["']/i);
    const text = decodeXmlEntities((m[2] || '').replace(/<[^>]+>/g, ' '));
    if (!text) continue;
    rawCues.push({
      start: tM ? parseInt(tM[1], 10) / 1000 : 0,
      dur: dM ? parseInt(dM[1], 10) / 1000 : 3,
      text,
    });
  }

  return rawCues;
}

/**
 * Merge fragmented 1-2s auto-captions into clean sentence-length subtitle chunks
 * for smooth reading, phrase selection, and shadowing.
 */
function mergeSubtitleCues(cues) {
  if (cues.length === 0) return [];
  const merged = [];
  let cur = { ...cues[0] };

  for (let i = 1; i < cues.length; i++) {
    const nxt = cues[i];
    const span = nxt.start + nxt.dur - cur.start;
    const gap = nxt.start - (cur.start + cur.dur);
    const endsSentence = /[.!?]["'”’]?$/.test(cur.text);

    if (!endsSentence && span <= 11 && gap <= 1.4 && (cur.text.length + nxt.text.length) <= 170) {
      cur.text = `${cur.text} ${nxt.text}`.replace(/\s+/g, ' ').trim();
      cur.dur = Math.max(cur.dur, nxt.start + nxt.dur - cur.start);
    } else {
      merged.push(cur);
      cur = { ...nxt };
    }
  }
  merged.push(cur);
  return merged;
}

async function fetchPlayerCaptionTracks(videoId, apiKey) {
  const clients = [
    { name: 'IOS', version: '20.10.4', ua: IOS_UA },
    { name: 'ANDROID', version: '20.10.38', ua: ANDROID_UA },
  ];

  for (const cl of clients) {
    try {
      const r = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': cl.ua },
          body: JSON.stringify({
            videoId,
            context: { client: { clientName: cl.name, clientVersion: cl.version, hl: 'en', gl: 'US' } },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!r.ok) continue;
      const j = await r.json();
      const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length > 0) {
        return {
          ua: cl.ua,
          tracks,
          videoDetails: j?.videoDetails || {},
        };
      }
    } catch {
      // Try next client
    }
  }
  return { ua: IOS_UA, tracks: [], videoDetails: {} };
}

export async function fetchYoutubeTranscript(videoIdOrUrl) {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) {
    throw new Error('Link hoặc ID video YouTube không hợp lệ.');
  }

  // Fetch watch page to grab INNERTUBE_API_KEY + fallback title/author
  const wr = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(10000),
  });
  const html = wr.ok ? await wr.text() : '';
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || '';

  const fallbackTitle = decodeXmlEntities(
    html.match(/<meta\s+name="title"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s*-\s*YouTube$/i, '') ||
      ''
  );
  const fallbackAuthor = decodeXmlEntities(
    html.match(/"ownerChannelName":"([^"]+)"/)?.[1] || ''
  );

  if (!apiKey) {
    return {
      videoId,
      title: fallbackTitle || `YouTube Video (${videoId})`,
      channelName: fallbackAuthor || 'YouTube',
      durationSeconds: 0,
      hasTranscript: false,
      isAutoGenerated: false,
      cues: [],
      note: 'Không lấy được khóa phụ đề từ YouTube lúc này. Bạn vẫn có thể xem video kèm phụ đề CC trực tiếp trong trình phát.',
    };
  }

  const { ua, tracks, videoDetails } = await fetchPlayerCaptionTracks(videoId, apiKey);

  const title = videoDetails?.title || fallbackTitle || `YouTube Video (${videoId})`;
  const channelName = videoDetails?.author || fallbackAuthor || 'YouTube';
  const durationSeconds = parseInt(videoDetails?.lengthSeconds || '0', 10) || 0;

  // Pick best English track (prefer manual over auto-generated ASR)
  const enTrack =
    tracks.find((t) => /^en(-[A-Za-z]+)?$/i.test(t.languageCode) && t.kind !== 'asr') ||
    tracks.find((t) => /^en/i.test(t.languageCode));

  // Optional official Vietnamese track if creator uploaded one
  const viTrack =
    tracks.find((t) => /^vi/i.test(t.languageCode) && t.kind !== 'asr') ||
    tracks.find((t) => /^vi/i.test(t.languageCode));

  if (!enTrack?.baseUrl) {
    return {
      videoId,
      title,
      channelName,
      durationSeconds,
      hasTranscript: false,
      isAutoGenerated: false,
      cues: [],
      note: 'Video này chưa có phụ đề tiếng Anh (EN). Bạn vẫn có thể xem video hoặc dán transcript thủ công.',
    };
  }

  const [enRes, viRes] = await Promise.allSettled([
    fetch(enTrack.baseUrl, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(9000) }),
    viTrack?.baseUrl
      ? fetch(viTrack.baseUrl, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(9000) })
      : Promise.resolve(null),
  ]);

  const enXml =
    enRes.status === 'fulfilled' && enRes.value && enRes.value.ok ? await enRes.value.text() : '';
  const viXml =
    viRes.status === 'fulfilled' && viRes.value && viRes.value.ok ? await viRes.value.text() : '';

  const rawEnCues = parseCaptionXml(enXml);
  const enCues = mergeSubtitleCues(rawEnCues);
  const viCues = viXml ? parseCaptionXml(viXml) : [];

  // Align official Vietnamese captions if available
  const alignedCues = enCues.map((cue) => {
    let vi = '';
    if (viCues.length > 0) {
      const overlapping = viCues.filter(
        (v) => v.start >= cue.start - 1.2 && v.start <= cue.start + cue.dur + 0.5
      );
      if (overlapping.length > 0) {
        vi = overlapping.map((v) => v.text).join(' ').trim();
      }
    }
    return {
      start: Number(cue.start.toFixed(2)),
      dur: Number(cue.dur.toFixed(2)),
      text: cue.text,
      vi: vi || undefined,
    };
  });

  return {
    videoId,
    title,
    channelName,
    durationSeconds,
    hasTranscript: alignedCues.length > 0,
    hasOfficialVi: viCues.length > 0,
    isAutoGenerated: enTrack.kind === 'asr',
    cues: alignedCues,
  };
}
