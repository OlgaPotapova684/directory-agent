import fs from 'fs/promises';
import path from 'path';

function guessExt(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg')) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/svg+xml')) return 'svg';
  if (ct.includes('image/gif')) return 'gif';

  try {
    const p = new URL(url).pathname.toLowerCase();
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif']) {
      if (p.endsWith('.' + ext)) return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {
    // ignore
  }
  return 'png';
}

export async function downloadLogo({ logoUrl, outDir, siteId }) {
  if (!logoUrl) throw new Error('На сайте не найден og:image (логотип)');

  await fs.mkdir(outDir, { recursive: true });

  const res = await fetch(logoUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Не удалось скачать логотип (HTTP ${res.status})`);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Логотип не картинка (content-type: ${contentType || 'unknown'})`);
  }

  const ext = guessExt(contentType, logoUrl);
  const filename = `${siteId}.${ext}`;
  const filePath = path.join(outDir, filename);

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);

  return { filePath, filename, contentType };
}

