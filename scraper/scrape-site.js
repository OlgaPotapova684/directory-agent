import * as cheerio from 'cheerio';

function pickFirst(...values) {
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return null;
}

function absolutize(baseUrl, maybeUrl) {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function scrapeSite(siteUrl) {
  const res = await fetch(siteUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    throw new Error(`Не удалось скачать сайт (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = pickFirst(
    $('meta[property="og:site_name"]').attr('content'),
    $('title').text()
  );

  const description = pickFirst(
    $('meta[property="og:description"]').attr('content'),
    $('meta[name="description"]').attr('content')
  );

  const logoCandidate = pickFirst(
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="apple-touch-icon-precomposed"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    $('link[rel="shortcut icon"]').attr('href')
  );

  let logoUrl = absolutize(siteUrl, logoCandidate);
  if (!logoUrl) {
    try {
      logoUrl = new URL('/favicon.ico', siteUrl).toString();
    } catch {
      // ignore
    }
  }

  return {
    title,
    description,
    logoUrl,
  };
}

