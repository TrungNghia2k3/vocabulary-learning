// Shared zero-dependency live English news fetcher & clean article extractor
// Used by Vercel (/api/news.mjs), Netlify (netlify/functions/news.mjs), and Vite dev server.

const NEWS_USER_AGENT = 'VocabStudioNews/1.0 (+https://github.com/TrungNghia2k3/vocabulary-learning)';

const FEEDS = {
  world: [
    { source: 'The Guardian', category: 'World', url: 'https://www.theguardian.com/world/rss' },
    { source: 'NPR News', category: 'World', url: 'https://feeds.npr.org/1004/rss.xml' },
  ],
  technology: [
    { source: 'The Guardian', category: 'Technology', url: 'https://www.theguardian.com/technology/rss' },
    { source: 'NPR News', category: 'Technology', url: 'https://feeds.npr.org/1019/rss.xml' },
  ],
  science: [
    { source: 'The Guardian', category: 'Science', url: 'https://www.theguardian.com/science/rss' },
    { source: 'NPR News', category: 'Science', url: 'https://feeds.npr.org/1007/rss.xml' },
  ],
  business: [
    { source: 'The Guardian', category: 'Business', url: 'https://www.theguardian.com/business/rss' },
    { source: 'NPR News', category: 'Business', url: 'https://feeds.npr.org/1006/rss.xml' },
  ],
  environment: [
    { source: 'The Guardian', category: 'Environment', url: 'https://www.theguardian.com/environment/rss' },
    { source: 'NPR News', category: 'Environment', url: 'https://feeds.npr.org/1025/rss.xml' },
  ],
};

const ALLOWED_ARTICLE_HOSTS = new Set([
  'www.theguardian.com',
  'theguardian.com',
  'www.npr.org',
  'npr.org',
  'www.bbc.co.uk',
  'bbc.co.uk',
  'www.bbc.com',
  'bbc.com',
]);

function decodeEntities(str = '') {
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}

function stripTags(html = '') {
  // Decode entities first in case RSS feeds wrap HTML inside encoded entities (&lt;p&gt;)
  const decodedOnce = decodeEntities(html);
  const withoutTags = decodedOnce.replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutTags)
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestImage(block) {
  let bestUrl = '';
  let bestWidth = -1;
  const mediaMatches = block.matchAll(/<media:(?:thumbnail|content)([^>]+)>/gi);
  for (const m of mediaMatches) {
    const attrs = m[1] || '';
    const urlM = attrs.match(/url=["']([^"']+)["']/i);
    if (!urlM) continue;
    const widthM = attrs.match(/width=["'](\d+)["']/i);
    const width = widthM ? parseInt(widthM[1], 10) : 0;
    if (width >= bestWidth) {
      bestWidth = width;
      bestUrl = decodeEntities(urlM[1]);
    }
  }
  if (bestUrl) return bestUrl;
  const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
  if (enc && !/pixel|tracking/i.test(enc[1])) return decodeEntities(enc[1]);
  const imgSrc = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgSrc && !/pixel|tracking/i.test(imgSrc[1])) return decodeEntities(imgSrc[1]);
  return '';
}

function parseRssItems(xml, source, category) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of itemMatches.slice(0, 14)) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1] : '';
    };
    const title = stripTags(pick('title'));
    const link = stripTags(pick('link'));
    const pubDate = stripTags(pick('pubDate'));
    const rawDesc = pick('description');
    const summary = stripTags(rawDesc)
      .replace(/\s*Continue reading\.\.\.\s*$/i, '')
      .slice(0, 300);

    const imageUrl = pickBestImage(block);

    if (!title || !link) continue;
    // Skip video, live-blog, or shopping-review stubs that lack standard news prose
    if (/\/live\/|\/videos\/|\/av\/|\/thefilter\/|\/gallery\//i.test(link)) continue;

    let isoDate;
    try {
      const d = pubDate ? new Date(pubDate) : new Date();
      isoDate = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      isoDate = new Date().toISOString();
    }

    items.push({
      id: `${source.toLowerCase().replace(/\s+/g, '-')}-${Buffer.from(link).toString('base64url').slice(0, 18)}`,
      title,
      url: link,
      source,
      category,
      publishedAt: isoDate,
      summary,
      imageUrl: imageUrl || undefined,
    });
  }
  return items;
}

export async function fetchLiveNewsFeed(category = 'all') {
  const key = (category || 'all').toLowerCase();
  const feedList =
    key === 'all'
      ? [
          FEEDS.world[0],
          FEEDS.world[1],
          FEEDS.technology[0],
          FEEDS.science[0],
          FEEDS.business[1],
          FEEDS.environment[0],
        ]
      : FEEDS[key] || FEEDS.world;

  const settled = await Promise.allSettled(
    feedList.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': NEWS_USER_AGENT,
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const xml = await res.text();
      return parseRssItems(xml, feed.source, feed.category);
    })
  );

  const seen = new Set();
  const merged = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
  }

  merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return {
    category: key,
    fetchedAt: new Date().toISOString(),
    articles: merged.slice(0, 24),
  };
}

function extractParagraphsFromScope(scopeHtml) {
  const cleaned = scopeHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, ' ');

  const pMatches = cleaned.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  const boilerplateRe =
    /^(sign up|subscribe|newsletter|follow us|copyright|bbc is not responsible|this article is more than|reuse this content|get our|download the|read more:|watch:|listen:|skip past|image source|image caption|hide caption|toggle caption|enlarge this image|npr transcripts|npr does not offer|sponsor message|become an npr|support the guardian|the guardian is editorially)/i;

  const paragraphs = [];
  const seen = new Set();
  for (const pHtml of pMatches) {
    const text = stripTags(pHtml);
    if (text.length < 40) continue;
    if (boilerplateRe.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    paragraphs.push(text);
    if (paragraphs.length >= 30) break;
  }
  return paragraphs;
}

export async function fetchFullArticle(articleUrl) {
  let parsed;
  try {
    parsed = new URL(articleUrl);
  } catch {
    throw new Error('URL bài báo không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !ALLOWED_ARTICLE_HOSTS.has(parsed.hostname)) {
    throw new Error('Nguồn báo này chưa nằm trong danh sách đọc trực tiếp (The Guardian / NPR / BBC).');
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': NEWS_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`Không tải được nội dung bài báo (HTTP ${res.status}).`);
  }
  const html = await res.text();

  // Try semantic article containers in priority order
  const scopes = [];
  const nprStory = html.match(/<div[^>]+id=["']storytext["'][\s\S]*?(?=<div[^>]+class=["'][^"']*tags|<div[^>]+id=["']callout|<\/article>)/i);
  if (nprStory) scopes.push(nprStory[0]);

  const guardianBody = html.match(/<div[^>]+id=["']maincontent["'][\s\S]*?<\/article>/i);
  if (guardianBody) scopes.push(guardianBody[0]);

  const articleMatch = html.match(/<article\b[\s\S]*?<\/article>/i);
  if (articleMatch) scopes.push(articleMatch[0]);

  const mainMatch = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (mainMatch) scopes.push(mainMatch[0]);

  scopes.push(html);

  let paragraphs = [];
  for (const scope of scopes) {
    const candidate = extractParagraphsFromScope(scope);
    if (candidate.length >= 3) {
      paragraphs = candidate;
      break;
    }
    if (candidate.length > paragraphs.length) {
      paragraphs = candidate;
    }
  }

  const wordCount = paragraphs.join(' ').trim().split(/\s+/).filter(Boolean).length;

  return {
    url: parsed.toString(),
    paragraphs,
    wordCount,
    fetchedAt: new Date().toISOString(),
  };
}
