import { generatePassword } from '../worker/password.js';
import { tryFillEmail, tryFillPassword } from './form-fill.js';

function isTrainingCatalog(registerUrl) {
  return String(registerUrl || '').includes('/training-catalog');
}

/**
 * Каталог 1: регистрация — email, пароль, сохранение в таблицу.
 */
export async function run({ page, site, catalog }) {
  if (!catalog.registerUrl) {
    throw new Error(
      'Не указан URL регистрации для «Тестовый каталог 1». Нажмите «Использовать учебный каталог».'
    );
  }

  const login = site.email;
  const password = generatePassword();

  await page.goto(catalog.registerUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

  if (isTrainingCatalog(catalog.registerUrl)) {
    await page.fill('#reg-email', login);
    await page.fill('#reg-password', password);
    await page.click('#reg-submit');
    await page.waitForLoadState('domcontentloaded');

    const body = await page.locator('body').innerText();
    if (!body.includes('Код отправлен')) {
      throw new Error('Учебный каталог: не удалось зарегистрироваться');
    }

    return {
      status: 'ожидает код',
      note: 'Учебный каталог: регистрация отправлена, код в симуляции почты',
      login,
      password,
    };
  }

  const title = await page.title();
  const emailFilled = await tryFillEmail(page, login);
  const passwordFilled = await tryFillPassword(page, password);

  if (emailFilled && passwordFilled) {
    return {
      status: 'ожидает код',
      note: 'Email и пароль введены в форму. Теперь ждём код подтверждения.',
      login,
      password,
    };
  }

  if (emailFilled) {
    return {
      status: 'ожидает код',
      note: 'Email введён; пароль сохранён. Теперь ждём код подтверждения.',
      login,
      password,
    };
  }

  return {
    status: 'ожидает код',
    note: `${catalog.registerUrl} — ${title}. Поля формы не найдены (демо-страница).`,
    login,
    password,
  };
}
