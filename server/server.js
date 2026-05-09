```js
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const parser = new Parser();

const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

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
    url: 'https://news.google.com/rss/search?q=hantavirus+outbreak'
  },
  {
    name: 'Google News Virus',
    url: 'https://news.google.com/rss/search?q=virus+outbreak'
  },
  {
    name: 'WHO News',
    url: 'https://www.who.int/rss-feeds/news-english.xml'
  }
];

// =========================
// STATIC MAP
// =========================

const GEO = {

  USA: {
    lat: 37.0902,
    lng: -95.7129
  },

  China: {
    lat: 35.8617,
    lng: 104.1954
  },

  Japan: {
    lat: 36.2048,
    lng: 138.2529
  },

  Vietnam: {
    lat: 14.0583,
    lng: 108.2772
  },

  Brazil: {
    lat: -14.2350,
    lng: -51.9253
  },

  Canada: {
    lat: 56.1304,
    lng: -106.3468
  },

  Russia: {
    lat: 61.5240,
    lng: 105.3188
  },

  Germany: {
    lat: 51.1657,
    lng: 10.4515
  },

  France: {
    lat: 46.2276,
    lng: 2.2137
  },

  India: {
    lat: 20.5937,
    lng: 78.9629
  },

  Spain: {
    lat: 40.4637,
    lng: -3.7492
  },

  Italy: {
    lat: 41.8719,
    lng: 12.5674
  },

  Australia: {
    lat: -25.2744,
    lng: 133.7751
  },

  Mexico: {
    lat: 23.6345,
    lng: -102.5528
  },

  Argentina: {
    lat: -38.4161,
    lng: -63.6167
  },

  Chile: {
    lat: -35.6751,
    lng: -71.5430
  },

  Peru: {
    lat: -9.1900,
    lng: -75.0152
  },

  Taiwan: {
    lat: 23.6978,
    lng: 120.9605
  },

  Thailand: {
    lat: 15.8700,
    lng: 100.9925
  },

  Sudan: {
    lat: 12.8628,
    lng: 30.2176
  }
};

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

  return 'Trung bình';
}

function extractPlace(text) {

  const lower =
    cleanText(text).toLowerCase();

  const places = [

    'USA',
    'United States',
    'China',
    'Japan',
    'Vietnam',
    'Brazil',
    'Canada',
    'Russia',
    'Germany',
    'France',
    'India',

    'Spain',
    'Italy',
    'Australia',
    'Mexico',
    'Argentina',
    'Chile',
    'Peru',
    'Taiwan',
    'Thailand',
    'Korea',
    'South Korea',
    'England',
    'UK',
    'Sudan'
  ];

  for (const place of places) {

    if (
      lower.includes(
        place.toLowerCase()
      )
    ) {
      return place;
    }
  }

  return null;
}

// =========================
// RSS FETCH
// =========================

async function fetchRssFeed(feed) {

  try {

    const parsed =
      await parser.parseURL(feed.url);

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
      'RSS ERROR:',
      err.message
    );

    return [];
  }
}

// =========================
// ENRICH
// =========================

async function enrichItem(item) {

  const text =
  `${item.title || ''} ${item.snippet || ''}`;

  const location =
    extractPlace(text);

  const geo =
    GEO[location] || {
      lat: 0,
      lng: 0
    };

  return {

    id: slugHash(
      `${item.title}-${location || 'unknown'}`
    ),

    title: item.title,

    url: item.url,

    source: item.source,

    publishedAt: item.publishedAt,

    location:
      location || 'Unknown',

    displayName:
      location || 'Unknown',

    lat: geo.lat,

    lng: geo.lng,

    cases: extractCases(text),

    risk: extractRisk(text),

    summary: cleanText(text)
      .slice(0, 220)
  };
}

// =========================
// REFRESH
// =========================

async function refreshData() {

  const raw = [];

  for (const feed of FEEDS) {

    try {

      const items =
        await fetchRssFeed(feed);

      raw.push(...items);

    } catch (err) {

      console.log(err.message);

    }
  }

  const dedup = new Map();

  for (const item of raw) {

    const key =
      item.url || item.title;

    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  const enriched = [];

  for (const item of dedup.values()) {

    const result =
      await enrichItem(item);

    enriched.push(result);
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

    sources:
      new Set(
        enriched.map(x => x.source)
      ).size
  };

  console.log(
    `Updated ${enriched.length} outbreaks`
  );

  return state;
}

// =========================
// API
// =========================

app.get('/api/outbreaks', async (req, res) => {

  await refreshData();

  res.json(state);
});

app.get('/api/health', (req, res) => {

  res.json({
    ok: true,
    updatedAt: state.updatedAt,
    total: state.items.length
  });
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
    `Server running on ${PORT}`
  );

  await refreshData();

  setInterval(() => {

    refreshData()
      .catch(console.error);

  }, 10 * 60 * 1000);
});
```
