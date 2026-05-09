const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const parser = new Parser();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const GEO_CACHE_FILE = path.join(__dirname, '.geo-cache.json');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

let geoCache = {};
try {
  geoCache = JSON.parse(fs.readFileSync(GEO_CACHE_FILE, 'utf8'));
} catch (e) {
  geoCache = {};
}

const state = {
  updatedAt: null,
  items: [],
  stats: {
    totalItems: 0,
    highRisk: 0,
    sources: 0
  }
};

const FEEDS = [
  {
    name: 'WHO News',
    type: 'rss',
    url: 'https://www.who.int/rss-feeds/news-english.xml'
  },
  {
    name: 'GDELT',
    type: 'gdelt',
    query: 'hantavirus OR "hanta virus" OR "hantavirus outbreak"'
  }
];

const KNOWN_PLACES = [
  // Việt Nam / Châu Á
  'Việt Nam','Vietnam','Hà Nội','Ha Noi','Hanoi','Đà Nẵng','Da Nang','Hue','Huế',
  'TP.HCM','Ho Chi Minh City','Saigon','Seoul','Busan','Tokyo','Osaka','Taipei',
  'Beijing','Shanghai','Hong Kong','Taiwan','China','Japan','Korea','South Korea',
  'Mongolia','Mông Cổ','Thailand','Thailand','Laos','Cambodia',
  // Châu Âu / Mỹ
  'United States','USA','U.S.','US','Canada','Mexico','Chile','Argentina','Brazil',
  'Peru','Bolivia','Uruguay','Paraguay','Colombia','Ecuador',
  'Spain','France','Germany','Italy','UK','United Kingdom','England'
];

function slugHash(text) {
  return require('crypto').createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim();
}

function extractCases(text) {
  const m = text.match(/(\d{1,4})\s*(?:cases?|ca|người|patients?)/i);
  return m ? Number(m[1]) : null;
}

function extractRisk(text) {
  const lower = text.toLowerCase();
  if (/(fatal|death|deaths|lậy lan mạnh|severe|critical|nguy hiểm|outbreak)/i.test(lower)) return 'Nguy hiểm';
  if (/(cluster|spread|ổ dịch|widespread|cảnh báo|increase|rising|bùng phát)/i.test(lower)) return 'Cao';
  if (/(reported|detected|confirmed|phát hiện|ghi nhận)/i.test(lower)) return 'Trung bình';
  return 'Thấp';
}

function extractPlace(text) {
  const normalized = cleanText(text);

  for (const place of KNOWN_PLACES) {
    const regex = new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) return place;
  }

  const patterns = [
    /(?:in|at|from|near|around|ở|tại|từ)\s+([A-ZÀ-Ỵ][A-Za-zÀ-ỹ.'-]+(?:\s+[A-ZÀ-Ỵ][A-Za-zÀ-ỹ.'-]+){0,3})/i,
    /(?:province of|city of)\s+([A-ZÀ-Ỵ][A-Za-zÀ-ỹ.'-]+(?:\s+[A-ZÀ-Ỵ][A-Za-zÀ-ỹ.'-]+){0,3})/i
  ];

  for (const re of patterns) {
    const m = normalized.match(re);
    if (m) {
      return m[1].replace(/\b(of|the|and)\b/gi, '').trim();
    }
  }

  return null;
}

function articleSummary(item) {
  const parts = [item.title, item.snippet, item.source].filter(Boolean);
  return cleanText(parts.join(' — ')).slice(0, 220);
}

async function fetchRssFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  return (parsed.items || []).slice(0, 12).map((item) => ({
    title: cleanText(item.title),
    url: item.link,
    publishedAt: item.isoDate || item.pubDate || null,
    snippet: cleanText(item.contentSnippet || item.summary || item.content || ''),
    source: feed.name
  }));
}

async function fetchGdeltFeed(feed) {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', feed.query);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '25');
  url.searchParams.set('sort', 'HybridRel');

  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'Mozilla/5.0 HantaRealtimeApp/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`GDELT error ${res.status}`);
  }

  const data = await res.json();
  const articles = data.articles || data.article || [];
  return articles.slice(0, 15).map((item) => ({
    title: cleanText(item.title),
    url: item.url,
    publishedAt: item.seendate || item.datetime || item.publishedAt || null,
    snippet: cleanText(item.summary || item.description || ''),
    source: 'GDELT'
  }));
}

async function geocodePlace(place) {
  if (!place) return null;
  if (geoCache[place]) return geoCache[place];

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', place);

    const res = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'HantaRealtimeApp/1.0 (contact: local-demo)'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    const result = {
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName: first.display_name || place
    };

    geoCache[place] = result;
    fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify(geoCache, null, 2));
    return result;
  } catch (err) {
    return null;
  }
}

async function enrichItem(item) {
  const text = `${item.title} ${item.snippet} ${item.source}`.trim();
  const location = extractPlace(text);
  if (!location) return null;

  const geocode = await geocodePlace(location);
  if (!geocode) return null;

  const cases = extractCases(text) || 0;
  const risk = extractRisk(text);

  return {
    id: slugHash(`${item.url || item.title}-${location}`),
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    location,
    displayName: geocode.displayName,
    lat: geocode.lat,
    lng: geocode.lng,
    cases,
    risk,
    summary: articleSummary(item)
  };
}

async function refreshData() {
  const raw = [];

  for (const feed of FEEDS) {
    try {
      if (feed.type === 'rss') {
        const items = await fetchRssFeed(feed);
        raw.push(...items);
      } else if (feed.type === 'gdelt') {
        const items = await fetchGdeltFeed(feed);
        raw.push(...items);
      }
    } catch (err) {
      console.error(`Fetch failed for ${feed.name}:`, err.message);
    }
  }

  const dedup = new Map();
  for (const item of raw) {
    const key = item.url || `${item.title}-${item.source}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  const enriched = [];
  for (const item of dedup.values()) {
    try {
      const out = await enrichItem(item);
      if (out) enriched.push(out);
    } catch (err) {
      console.error('Enrich failed:', err.message);
    }
  }

  enriched.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });

  state.items = enriched;
  state.updatedAt = new Date().toISOString();
  state.stats = {
    totalItems: enriched.length,
    highRisk: enriched.filter((x) => x.risk === 'Cao' || x.risk === 'Nguy hiểm').length,
    sources: FEEDS.length
  };

  return state;
}

let refreshing = false;
async function refreshIfNeeded(force = false) {
  if (refreshing) return state;
  const stale = !state.updatedAt || (Date.now() - new Date(state.updatedAt).getTime()) > 10 * 60 * 1000;
  if (!force && !stale && state.items.length > 0) return state;

  refreshing = true;
  try {
    await refreshData();
  } finally {
    refreshing = false;
  }
  return state;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    updatedAt: state.updatedAt,
    items: state.items.length
  });
});

app.get('/api/outbreaks', async (req, res) => {
  await refreshIfNeeded(false);
  res.json(state);
});

app.post('/api/refresh', async (req, res) => {
  await refreshIfNeeded(true);
  res.json(state);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await refreshIfNeeded(true);
  setInterval(() => refreshIfNeeded(false).catch(() => {}), 10 * 60 * 1000);
});
