import { chromium } from 'playwright';

/**
 * Тестовый заход в браузер (пока не настоящий каталог).
 * Проверяем, что Playwright может открыть страницу.
 */
export async function runExampleComCheck() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://example.com', { timeout: 30000 });
    const title = await page.title();
    return { ok: true, url: 'https://example.com', title };
  } finally {
    await browser.close();
  }
}
