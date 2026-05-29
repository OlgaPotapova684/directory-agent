import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { getCatalogHandler } from '../catalogs/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export async function runCatalogJob({ db, job }) {
  const handler = getCatalogHandler(job.catalogId);
  if (!handler) return runExampleFallback(job);

  const site = db
    .prepare(
      `SELECT id, site_url AS siteUrl, email,
              scraped_title AS scrapedTitle,
              scraped_description AS scrapedDescription,
              logo_path AS logoPath
       FROM sites WHERE id = ?`
    )
    .get(job.siteId);

  const catalog = db
    .prepare(
      `SELECT id, name, register_url AS registerUrl
       FROM catalogs WHERE id = ?`
    )
    .get(job.catalogId);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const result = await handler.run({
      page,
      site,
      catalog,
      paths: { root: ROOT, logos: path.join(ROOT, 'data', 'logos') },
    });
    return result;
  } finally {
    await browser.close();
  }
}

async function runExampleFallback(job) {
  const { runExampleComCheck } = await import('./browser-check.js');
  const r = await runExampleComCheck();
  return {
    status: 'тест пройден',
    note: `${r.url} — ${r.title}`,
  };
}
