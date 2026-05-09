const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const parser = new Parser();

const PORT = process.env.PORT || 3000;

// =========================
// PATH
// =========================

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const GEO_CACHE_FILE = path.join(__dirname, '.geo-cache.json');

// =========================
// MIDDLEWARE
// =========================

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// =========================
// GEO CACHE
// =========================

let geoCache = {};

try {
  geoCache = JSON.parse(
    fs.readFileSync(GEO_CACHE_FILE, 'utf8')
  );
} catch {
  geoCache = {};
}

// =========================
// APP STATE
// =========================

const state = {
  updatedAt: null,
  items: [],
  stats: {
    totalItems: 0,
    highRisk: 0,
    sources: 0
  }
};

// =========================
// RSS FEEDS
// =========================

const FEEDS = [
 {
    name: 'Google News Hantavirus',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=hantavirus+outbreak'
  },
  {
    name: 'Google News Virus',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=virus+outbreak'
  },
  {
    name: 'Google News Epidemic',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=epidemic'
  },
  {
    name: 'WHO News',
    type: 'rss',
    url: 'https://www.who.int/rss-feeds/news-english.xml'
  }
];

// =========================
// KNOWN PLACES
// =========================

const KNOWN_PLACES = [
  'Vietnam',
  'Việt Nam',
  'Hanoi',
  'Ha Noi',
  'Hà Nội',
  'Da Nang',
  'Đà Nẵng',
  'Hue',
  'Huế',
  'Tokyo',
  'Osaka',
  'Japan',
  'China',
  'Taiwan',
  'Korea',
  'South Korea',
  'Seoul',
  'Busan',
  'USA',
  'United States',
  'Canada',
  'Mexico',
  'Brazil',
  'Chile',
  'Argentina',
  'Peru',
  'France',
  'Germany',
  'Italy',
  'Spain',
  'England',
  'UK'
];

// =========================
// HELPERS
// =========================

function slugHash(text) {
  return crypto
    .createHash('sha1')
    .update(text)
    .digest('hex')
    .slice(0, 12);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim();
}

function extractCases(text) {

  const patterns = [
    /(\d+)\s+cases?/i,
    /(\d+)\s+patients?/i,
    /(\d+)\s+deaths?/i,
    /(\d+)\s+infected/i
  ];

  for (const p of patterns) {
    const m = text.match(p);

    if (m) {
      return Number(m[1]);
    }
  }

  return 0;
}

function extractRisk(text) {

  const lower = text.toLowerCase();

  if (
    lower.includes('death') ||
    lower.includes('fatal') ||
    lower.includes('critical') ||
    lower.includes('outbreak')
  ) {
    return 'Nguy hiểm';
  }

  if (
    lower.includes('spread') ||
    lower.includes('cluster') ||
    lower.includes('warning')
  ) {
    return 'Cao';
  }

  if (
    lower.includes('confirmed') ||
    lower.includes('reported')
  ) {
    return 'Trung bình';
  }

  return 'Thấp';
}

function extractPlace(text) {

  const normalized = cleanText(text);

  const places = [
    'China',
    'USA',
    'United States',
    'Canada',
    'Mexico',
    'Brazil',
    'Argentina',
    'Chile',
    'Peru',
    'Vietnam',
    'Japan',
    'Tokyo',
    'Seoul',
    'Taiwan',
    'Thailand',
    'Germany',
    'France',
    'Italy',
    'Spain',
    'London',
    'England',
    'Russia',
    'India'
  ];

  for (const place of places) {

    if (
      normalized
        .toLowerCase()
        .includes(place.toLowerCase())
    ) {
      return place;
    }
  }

  return 'USA';
}
function articleSummary(item) {

  return cleanText(
    `${item.title} ${item.snippet}`
  ).slice(0, 220);
}

// =========================
// RSS FETCH
// =========================

async function fetchRssFeed(feed) {

  try {

    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const xml = await res.text();

    const parsed = await parser.parseString(xml);

    return (parsed.items || [])
      .slice(0, 20)
      .map((item) => ({
        title: cleanText(item.title),
        url: item.link,
        publishedAt:
          item.isoDate ||
          item.pubDate ||
          null,
        snippet: cleanText(
          item.contentSnippet ||
          item.content ||
          item.summary ||
          ''
        ),
        source: feed.name
      }));

  } catch (err) {

    console.log(
      'RSS FETCH ERROR:',
      err.message
    );

    return [];
  }
}

// =========================
// GEOCODING
// =========================

async function geocodePlace(place) {

  if (!place) return null;

  if (geoCache[place]) {
    return geoCache[place];
  }

  try {

    const url = new URL(
      'https://nominatim.openstreetmap.org/search'
    );

    url.searchParams.set(
      'format',
      'jsonv2'
    );

    url.searchParams.set(
      'limit',
      '1'
    );

    url.searchParams.set(
      'q',
      place
    );

    const res = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'user-agent':
          'HantaRealtimeApp/1.0'
      }
    });

    const data = await res.json();

    if (!Array.isArray(data)) {
      return null;
    }

    if (data.length === 0) {
      return null;
    }

    const first = data[0];

    const result = {
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName:
        first.display_name || place
    };

    geoCache[place] = result;

    fs.writeFileSync(
      GEO_CACHE_FILE,
      JSON.stringify(geoCache, null, 2)
    );

    return result;

  } catch {

    return null;

  }
}

// =========================
// AI ENRICH
// =========================

async function enrichItem(item) {

  const text =
    `${item.title} ${item.snippet}`;

  const location =
    extractPlace(text);

  if (!location) {
    return null;
  }

  const geo =
    await geocodePlace(location);

  if (!geo) {
    return null;
  }

  return {
    id: slugHash(
      `${item.title}-${location}`
    ),

    title: item.title,

    url: item.url,

    source: item.source,

    publishedAt: item.publishedAt,

    location,

    displayName: geo.displayName,

    lat: geo.lat,

    lng: geo.lng,

    cases: extractCases(text),

    risk: extractRisk(text),

    summary: articleSummary(item)
  };
}

// =========================
// REFRESH DATA
// =========================

async function refreshData() {

  const raw = [];

  for (const feed of FEEDS) {

    try {

      const items =
        await fetchRssFeed(feed);

      raw.push(...items);

    } catch (err) {

      console.log(
        'Feed Error:',
        err.message
      );

    }
  }

  const dedup = new Map();

  for (const item of raw) {

    const key =
      item.url ||
      item.title;

    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  const enriched = [];

  for (const item of dedup.values()) {

    try {

      const result =
        await enrichItem(item);

      if (result) {
        enriched.push(result);
      }

    } catch (err) {

      console.log(
        'Enrich Error:',
        err.message
      );

    }
  }

  enriched.sort((a, b) => {

    const ta = a.publishedAt
      ? new Date(a.publishedAt).getTime()
      : 0;

    const tb = b.publishedAt
      ? new Date(b.publishedAt).getTime()
      : 0;

    return tb - ta;
  });

  state.items = enriched;

  state.updatedAt =
    new Date().toISOString();

  state.stats = {
    totalItems: enriched.length,

    highRisk:
      enriched.filter(
        x =>
          x.risk === 'Cao' ||
          x.risk === 'Nguy hiểm'
      ).length,

    sources: FEEDS.length
  };

  console.log(
    `Updated: ${enriched.length} outbreaks`
  );

  return state;
}

// =========================
// AUTO REFRESH
// =========================

let refreshing = false;

async function refreshIfNeeded(
  force = false
) {

  if (refreshing) {
    return state;
  }

  const stale =
    !state.updatedAt ||
    (
      Date.now() -
      new Date(state.updatedAt).getTime()
    ) > 10 * 60 * 1000;

  if (
    !force &&
    !stale &&
    state.items.length > 0
  ) {
    return state;
  }

  refreshing = true;

  try {

    await refreshData();

  } finally {

    refreshing = false;

  }

  return state;
}

// =========================
// API
// =========================

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

// =========================
// FRONTEND
// =========================

app.get('*', (req, res) => {

  res.sendFile(
    path.join(PUBLIC_DIR, 'index.html')
  );

});

// =========================
// START
// =========================

app.listen(PORT, async () => {

  console.log(
    `Server running on port ${PORT}`
  );

  await refreshIfNeeded(true);

  setInterval(() => {

    refreshIfNeeded(false)
      .catch(() => {});

  }, 10 * 60 * 1000);

});
