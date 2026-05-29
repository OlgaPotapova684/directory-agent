/**
 * Проверка: Playwright открывает страницу и закрывается.
 * Запуск: npm run test-browser
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://example.com');
const title = await page.title();
await browser.close();

console.log('OK: браузер работает. Заголовок страницы:', title);
