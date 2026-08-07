const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const urlModule = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Set up helper user agent
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Extensible scrapers configuration
const SCRAPERS = {
  tcbscans: {
    name: 'TCB Scans',
    match: (url) => url.includes('tcbonepiecechapters.com') || url.includes('onepiecechapters.com'),
    
    // Parse the main page of a manga to get the chapter list
    parseChapters: async (url) => {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(response.data);
        const chapters = [];
        
        const mangaTitle = $('main h1').text().trim() || $('title').text().replace('| TCB Scans', '').trim();

        // TCB Scans lists chapters as anchors containing "/chapters/"
        $('a[href*="/chapters/"]').each((i, el) => {
          const href = $(el).attr('href');
          const fullUrl = href.startsWith('http') ? href : `https://tcbonepiecechapters.com${href}`;
          
          const titleDiv = $(el).find('.text-lg.font-bold');
          const title = titleDiv.length ? titleDiv.text().trim() : $(el).text().trim();
          
          const descDiv = $(el).find('.text-gray-500');
          const description = descDiv.length ? descDiv.text().trim() : '';

          // De-duplicate if the same URL is found
          if (!chapters.some(c => c.url === fullUrl)) {
            chapters.push({
              title,
              description,
              url: fullUrl
            });
          }
        });

        return {
          mangaTitle,
          chapters
        };
      } catch (error) {
        console.error('TCB Scans parseChapters error:', error.message);
        throw error;
      }
    },

    // Parse a specific chapter page to get image URLs
    parsePages: async (url) => {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(response.data);
        const pages = [];
        
        // Title of the chapter
        const chapterTitle = $('h1').text().trim() || $('title').text().replace('| TCB Scans', '').trim();

        // Extract reader images
        $('img.fixed-ratio-content, picture img').each((i, el) => {
          const src = $(el).attr('src');
          if (src && !pages.includes(src)) {
            pages.push(src);
          }
        });

        // If no images found with classes, fall back to any img tags in the main section matching known CDN
        if (pages.length === 0) {
          $('img').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.includes('cdn.onepiecechapters.com') && !pages.includes(src)) {
              pages.push(src);
            }
          });
        }

        // Parse Prev/Next links
        let prevUrl = null;
        let nextUrl = null;
        
        $('a').each((i, el) => {
          const text = $(el).text().toLowerCase().trim();
          const href = $(el).attr('href');
          if (href && href.includes('/chapters/')) {
            const fullHref = href.startsWith('http') ? href : `https://tcbonepiecechapters.com${href}`;
            if (text === 'prev' || text.includes('previous')) {
              prevUrl = fullHref;
            } else if (text === 'next') {
              nextUrl = fullHref;
            }
          }
        });

        return {
          chapterTitle,
          pages,
          prevUrl,
          nextUrl
        };
      } catch (error) {
        console.error('TCB Scans parsePages error:', error.message);
        throw error;
      }
    }
  },

  // MangaDex — uses their public REST API (no scraping needed)
  mangadex: {
    name: 'MangaDex',
    match: (url) => url.includes('mangadex.org'),

    parseChapters: async (url) => {
      try {
        // Extract manga ID from URL like https://mangadex.org/title/<uuid>/<slug>
        const match = url.match(/title\/([a-f0-9-]{36})/);
        if (!match) throw new Error('Could not find MangaDex manga ID in URL');
        const mangaId = match[1];

        // Fetch manga metadata
        const metaRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}`, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const mangaTitle = metaRes.data.data.attributes.title.en
          || Object.values(metaRes.data.data.attributes.title)[0]
          || 'Unknown Manga';

        // Fetch chapters (English, ordered by chapter number desc)
        let chapters = [];
        let offset = 0;
        const limit = 100;

        while (true) {
          const chapRes = await axios.get('https://api.mangadex.org/chapter', {
            params: {
              manga: mangaId,
              translatedLanguage: ['en'],
              limit,
              offset,
              order: { chapter: 'desc' },
              'includes[]': 'scanlation_group'
            },
            headers: { 'User-Agent': USER_AGENT }
          });

          const data = chapRes.data;
          for (const ch of data.data) {
            const attrs = ch.attributes;
            const chapterNum = attrs.chapter ? `Chapter ${attrs.chapter}` : 'Oneshot';
            const title = attrs.title ? `${chapterNum}: ${attrs.title}` : chapterNum;
            chapters.push({
              title,
              description: `Vol. ${attrs.volume || '?'} • ${attrs.pages || '?'} pages`,
              url: `https://mangadex.org/chapter/${ch.id}`
            });
          }

          if (data.data.length < limit || chapters.length >= 500) break;
          offset += limit;
        }

        return { mangaTitle, chapters };
      } catch (error) {
        console.error('MangaDex parseChapters error:', error.message);
        throw error;
      }
    },

    parsePages: async (url) => {
      try {
        // Extract chapter ID
        const match = url.match(/chapter\/([a-f0-9-]{36})/);
        if (!match) throw new Error('Could not find MangaDex chapter ID in URL');
        const chapterId = match[1];

        // Get chapter metadata
        const metaRes = await axios.get(`https://api.mangadex.org/chapter/${chapterId}`, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const attrs = metaRes.data.data.attributes;
        const chapterNum = attrs.chapter ? `Chapter ${attrs.chapter}` : 'Oneshot';
        const chapterTitle = attrs.title ? `${chapterNum}: ${attrs.title}` : chapterNum;

        // Get server + hash for images
        const serverRes = await axios.get(`https://api.mangadex.org/at-home/server/${chapterId}`, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const { baseUrl, chapter: chData } = serverRes.data;
        const hash = chData.hash;

        const pages = chData.data.map(
          filename => `${baseUrl}/data/${hash}/${filename}`
        );

        return { chapterTitle, pages, prevUrl: null, nextUrl: null };
      } catch (error) {
        console.error('MangaDex parsePages error:', error.message);
        throw error;
      }
    }
  },

  // Generic / Fallback Scraper for basic pages
  generic: {
    name: 'Generic Web Page',
    match: () => true, // Fallback match
    parseChapters: async (url) => {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(response.data);
        const chapters = [];
        
        const mangaTitle = $('h1').first().text().trim() || $('title').text().trim();

        // Find any links containing "chapter" in text or href
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          const text = $(el).text().trim();
          const hrefLower = href.toLowerCase();
          const textLower = text.toLowerCase();
          
          if (hrefLower.includes('chapter') || textLower.includes('chapter') || /\bch\b|\bch\.\d+/.test(textLower)) {
            const resolvedUrl = urlModule.resolve(url, href);
            if (!chapters.some(c => c.url === resolvedUrl)) {
              chapters.push({
                title: text || `Chapter at ${href}`,
                description: '',
                url: resolvedUrl
              });
            }
          }
        });

        return {
          mangaTitle,
          chapters: chapters.slice(0, 150) // Cap it to prevent overflow
        };
      } catch (error) {
        console.error('Generic parseChapters error:', error.message);
        throw error;
      }
    },
    parsePages: async (url) => {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(response.data);
        const pages = [];
        
        const chapterTitle = $('h1').first().text().trim() || $('title').text().trim();

        // Find images that are likely manga pages (large images inside main containers)
        $('img').each((i, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
          if (!src) return;
          
          const resolvedSrc = urlModule.resolve(url, src);
          
          // Filter out header, footer, avatar, logo, tracking images
          const ignoreKeywords = ['logo', 'avatar', 'icon', 'banner', 'loading', 'spinner', 'theme', 'header', 'footer', 'widget', 'facebook', 'twitter'];
          const shouldIgnore = ignoreKeywords.some(kw => resolvedSrc.toLowerCase().includes(kw));
          
          if (!shouldIgnore && !pages.includes(resolvedSrc)) {
            pages.push(resolvedSrc);
          }
        });

        return {
          chapterTitle,
          pages,
          prevUrl: null,
          nextUrl: null
        };
      } catch (error) {
        console.error('Generic parsePages error:', error.message);
        throw error;
      }
    }
  }
};

// Find matching scraper
function getScraper(url) {
  for (const key in SCRAPERS) {
    if (SCRAPERS[key].match(url)) {
      return SCRAPERS[key];
    }
  }
  return SCRAPERS.generic;
}

// API: Get chapters of a manga series
app.get('/api/chapters', async (req, res) => {
  const mangaUrl = req.query.url;
  if (!mangaUrl) {
    return res.status(400).json({ error: 'Manga URL is required' });
  }

  try {
    const scraper = getScraper(mangaUrl);
    console.log(`Using scraper [${scraper.name}] for chapters request: ${mangaUrl}`);
    const data = await scraper.parseChapters(mangaUrl);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `Failed to load chapters: ${error.message}` });
  }
});

// API: Get image page URLs for a specific chapter
app.get('/api/pages', async (req, res) => {
  const chapterUrl = req.query.url;
  if (!chapterUrl) {
    return res.status(400).json({ error: 'Chapter URL is required' });
  }

  try {
    const scraper = getScraper(chapterUrl);
    console.log(`Using scraper [${scraper.name}] for pages request: ${chapterUrl}`);
    const data = await scraper.parsePages(chapterUrl);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `Failed to load pages: ${error.message}` });
  }
});

// API: Image Proxy to bypass hotlink protection (Referer requirement) & CORS
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }

  try {
    const parsedUrl = urlModule.parse(imageUrl);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    
    // Select referer based on where the image is hosted
    let referer = origin;
    if (imageUrl.includes('cdn.onepiecechapters.com') || imageUrl.includes('onepiecechapters.com')) {
      referer = 'https://tcbonepiecechapters.com/';
    }

    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 15000
    });

    // Set cache headers to avoid re-fetching manga pages on page flips
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'image/png'); // Default fallback
    }

    response.data.pipe(res);
  } catch (error) {
    console.error(`Proxy error for image ${imageUrl}:`, error.message);
    res.status(500).send('Failed to proxy image: ' + error.message);
  }
});

// Serve frontend for all other requests (SPA Routing support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Manga Book Reader server started at http://localhost:${PORT}`);
  console.log(`==================================================`);
});
