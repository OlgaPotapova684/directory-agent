/**
 * Ввод кода на странице учебного каталога.
 */
import { getPublicBaseUrl } from '../config/public-url.js';

export async function verifyTrainingCode({ page, email, code, baseUrl = getPublicBaseUrl() }) {
  await page.goto(`${baseUrl}/training-catalog/verify`, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });

  await page.fill('#ver-email', email);
  await page.fill('#ver-code', code);
  await page.click('#ver-submit');
  await page.waitForLoadState('domcontentloaded');

  const body = await page.locator('body').innerText();
  if (body.includes('Подтверждено')) {
    return { ok: true, note: 'Учебный каталог: регистрация подтверждена' };
  }
  if (body.includes('Неверный код')) {
    throw new Error('Неверный код на странице учебного каталога');
  }
  throw new Error('Не удалось подтвердить код (неизвестный ответ страницы)');
}
