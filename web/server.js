/**
 * Простой веб-сервер: форма «сайт + email» и сохранение в SQLite (data/app.db)
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, initDb, initCatalogRunsForSite } from '../db/db.js';
import { scrapeSite } from '../scraper/scrape-site.js';
import { downloadLogo } from '../scraper/download-logo.js';
import { processNextCatalogRunForSite } from '../worker/process-next.js';
import { fetchLatestVerificationCandidateSimulated } from '../email/simulated-inbox.js';
import { pushSimulatedEmail } from '../email/simulated-inbox.js';
import { runToVerifiedForSite } from '../worker/run-to-verified.js';
import { getExportRows, rowsToCsv } from '../db/export-data.js';
import { getPublicBaseUrl, getTrainingRegisterUrl } from '../config/public-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/logos', express.static(path.join(ROOT, 'data', 'logos')));

const db = openDb();
initDb(db);
const listSitesStmt = db.prepare(
  `SELECT id, site_url AS siteUrl, email, status, created_at AS createdAt,
          scraped_title AS scrapedTitle,
          scraped_description AS scrapedDescription,
          scraped_logo_url AS scrapedLogoUrl,
          logo_path AS logoPath,
          scraped_at AS scrapedAt
   FROM sites
   ORDER BY created_at DESC`
);
const insertSiteStmt = db.prepare(
  `INSERT INTO sites (id, site_url, email, status, created_at)
   VALUES (@id, @siteUrl, @email, @status, @createdAt)`
);
const getSiteStmt = db.prepare(
  `SELECT id, site_url AS siteUrl, email, status, created_at AS createdAt
   FROM sites
   WHERE id = ?`
);
const updateScrapeStmt = db.prepare(
  `UPDATE sites
   SET scraped_title = @title,
       scraped_description = @description,
       scraped_logo_url = @logoUrl,
       scraped_at = @scrapedAt
   WHERE id = @id`
);
const setLogoPathStmt = db.prepare(
  `UPDATE sites
   SET logo_path = @logoPath
   WHERE id = @id`
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    baseUrl: getPublicBaseUrl(),
    trainingRegisterUrl: getTrainingRegisterUrl(),
  });
});

app.get('/api/catalogs', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, register_url AS registerUrl
         FROM catalogs
         ORDER BY id`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось прочитать каталоги' });
  }
});

app.patch('/api/catalogs/:id', (req, res) => {
  const { registerUrl } = req.body;
  if (!registerUrl) {
    return res.status(400).json({ error: 'Укажите registerUrl' });
  }

  try {
    const r = db
      .prepare(`UPDATE catalogs SET register_url = ? WHERE id = ?`)
      .run(String(registerUrl).trim(), req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Каталог не найден' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сохранить URL' });
  }
});

// --- Учебный каталог (локально) ---
function htmlPage(title, body) {
  return `<!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background:#f2f2f2; margin:0; }
      .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
      .card { background:#fff; border:1px solid #ccc; border-radius:6px; padding:16px; }
      label { display:block; margin: 10px 0; font-size: 0.9rem; }
      input { width:100%; padding:10px; border:1px solid #aaa; border-radius:4px; font-size: 1rem; }
      button { padding:12px 14px; background:#9e9e9e; border:1px solid #777; border-radius:4px; cursor:pointer; }
      .hint { color:#555; font-size:0.9rem; margin:8px 0 0; }
      code { background:#eee; padding: 2px 6px; border-radius: 4px; }
      a { color: #1a0dab; }
    </style>
  </head>
  <body><main class="wrap">${body}</main></body></html>`;
}

app.get('/training-catalog', (_req, res) => {
  res.send(
    htmlPage(
      'Учебный каталог',
      `<div class="card">
        <h2>Учебный каталог</h2>
        <p class="hint">Это локальная страница, имитирующая каталог. Регистрация отправит “письмо” в симуляцию, а подтверждение проверит код.</p>
        <p><a href="/training-catalog/register">Перейти к регистрации</a></p>
        <p><a href="/training-catalog/verify">Перейти к подтверждению кода</a></p>
      </div>`
    )
  );
});

app.get('/training-catalog/register', (_req, res) => {
  res.send(
    htmlPage(
      'Регистрация — учебный каталог',
      `<div class="card">
        <h2>Регистрация</h2>
        <form method="post" action="/training-catalog/register">
          <label>Email
            <input id="reg-email" name="email" type="email" required />
          </label>
          <label>Пароль
            <input id="reg-password" name="password" type="password" required />
          </label>
          <button id="reg-submit" type="submit">Зарегистрироваться</button>
        </form>
        <p class="hint">После регистрации появится код в симуляции “почты”.</p>
      </div>`
    )
  );
});

app.post('/training-catalog/register', express.urlencoded({ extended: false }), async (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '').trim();
  if (!email || !password) return res.status(400).send('email/password required');

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO training_registrations (email, password, code, verified, created_at)
     VALUES (?, ?, ?, 0, ?)`
  ).run(email, password, code, now);

  await pushSimulatedEmail({
    to: email,
    from: 'training-catalog <no-reply@training.local>',
    subject: 'Код подтверждения (учебный каталог)',
    text: `Ваш код подтверждения: ${code}`,
  });

  res.send(
    htmlPage(
      'Код отправлен',
      `<div class="card">
        <h2>Код отправлен</h2>
        <p class="hint">Код “отправлен” в симуляцию почты. Теперь можно подтвердить.</p>
        <p><a href="/training-catalog/verify">Перейти к вводу кода</a></p>
      </div>`
    )
  );
});

app.get('/training-catalog/verify', (_req, res) => {
  res.send(
    htmlPage(
      'Подтверждение — учебный каталог',
      `<div class="card">
        <h2>Подтверждение</h2>
        <form method="post" action="/training-catalog/verify">
          <label>Email
            <input id="ver-email" name="email" type="email" required />
          </label>
          <label>Код
            <input id="ver-code" name="code" inputmode="numeric" required />
          </label>
          <button id="ver-submit" type="submit">Подтвердить</button>
        </form>
        <p class="hint">Если вы прогоняли агента, код уже есть в таблице у каталога 1.</p>
      </div>`
    )
  );
});

app.post('/training-catalog/verify', express.urlencoded({ extended: false }), (req, res) => {
  const email = String(req.body.email || '').trim();
  const code = String(req.body.code || '').trim();
  if (!email || !code) return res.status(400).send('email/code required');

  const row = db
    .prepare(
      `SELECT id, verified
       FROM training_registrations
       WHERE email = ? AND code = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(email, code);

  if (!row) {
    return res.send(
      htmlPage(
        'Ошибка',
        `<div class="card"><h2>Неверный код</h2><p class="hint">Попробуйте ещё раз.</p><p><a href="/training-catalog/verify">Назад</a></p></div>`
      )
    );
  }

  db.prepare(
    `UPDATE training_registrations
     SET verified = 1, verified_at = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), row.id);

  res.send(
    htmlPage(
      'Готово',
      `<div class="card"><h2>Подтверждено</h2><p class="hint">Учётка подтверждена.</p><p><a href="/training-catalog">На главную учебного каталога</a></p></div>`
    )
  );
});

app.get('/api/sites', async (_req, res) => {
  try {
    const sites = listSitesStmt.all();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось прочитать список сайтов' });
  }
});

app.post('/api/sites', async (req, res) => {
  const { siteUrl, email } = req.body;

  if (!siteUrl || !email) {
    return res.status(400).json({ error: 'Укажите адрес сайта и email' });
  }

  const entry = {
    id: Date.now(),
    siteUrl: String(siteUrl).trim(),
    email: String(email).trim(),
    status: 'ожидает',
    createdAt: new Date().toISOString(),
  };

  try {
    insertSiteStmt.run(entry);
    res.json({
      ok: true,
      site: entry,
      message: 'Компания добавлена — нажмите «Собрать данные с сайта» у новой карточки',
    });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

app.post('/api/sites/:id/reset-catalog-runs', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(id);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const r = db
      .prepare(
        `UPDATE catalog_runs
         SET status = 'ожидает',
             login = NULL,
             password = NULL,
             verification_code = NULL,
             profile_url = NULL,
             error = NULL,
             updated_at = @now
         WHERE site_id = @siteId`
      )
      .run({ siteId: id, now: new Date().toISOString() });

    res.json({ ok: true, updated: r.changes });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сбросить очередь' });
  }
});

app.post('/api/sites/:id/clear-scraped', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(id);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    db.prepare(
      `UPDATE sites
       SET scraped_title = NULL,
           scraped_description = NULL,
           scraped_logo_url = NULL,
           logo_path = NULL,
           scraped_at = NULL
       WHERE id = ?`
    ).run(id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось очистить данные' });
  }
});

app.post('/api/sites/:id/scrape', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(id);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const scraped = await scrapeSite(site.siteUrl);
    updateScrapeStmt.run({
      id,
      title: scraped.title,
      description: scraped.description,
      logoUrl: scraped.logoUrl,
      scrapedAt: new Date().toISOString(),
    });

    res.json({ ok: true, scraped });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка сбора данных' });
  }
});

app.get('/api/sites/:id/catalog-runs', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const rows = db
      .prepare(
        `SELECT cr.id, cr.catalog_id AS catalogId, c.name AS catalogName,
                cr.status, cr.login, cr.password, cr.verification_code AS verificationCode,
                cr.profile_url AS profileUrl,
                cr.error, cr.updated_at AS updatedAt
         FROM catalog_runs cr
         JOIN catalogs c ON c.id = cr.catalog_id
         WHERE cr.site_id = ?
         ORDER BY c.id`
      )
      .all(id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось прочитать очередь каталогов' });
  }
});

app.post('/api/sites/:id/worker/pick-code', async (req, res) => {
  const siteId = Number(req.params.id);
  if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(siteId);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const run = db
      .prepare(
        `SELECT id, catalog_id AS catalogId
         FROM catalog_runs
         WHERE site_id = ? AND status = 'ожидает код'
         ORDER BY id
         LIMIT 1`
      )
      .get(siteId);

    if (!run) {
      return res.json({ ok: true, message: 'Нет задач со статусом «ожидает код»', code: null });
    }

    const found = await fetchLatestVerificationCandidateSimulated({ minutes: 180 });
    if (!found?.code && !found?.link) {
      return res.json({ ok: true, message: 'В симуляции нет письма с кодом/ссылкой', code: null });
    }

    const code = found.code || null;
    const note = found.link ? `link: ${found.link}` : null;
    db.prepare(
      `UPDATE catalog_runs
       SET verification_code = @code,
           status = 'код получен',
           profile_url = COALESCE(profile_url, @note),
           updated_at = @updatedAt
       WHERE id = @id`
    ).run({
      id: run.id,
      code,
      note,
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true, code, message: 'Код получен и сохранён' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка получения кода' });
  }
});

app.post('/api/sites/:id/worker/run-to-code', async (req, res) => {
  const siteId = Number(req.params.id);
  if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(siteId);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    // 1) запускаем одну задачу (обычно catalog-01) до «ожидает код»
    const job = await processNextCatalogRunForSite(db, siteId);
    if (!job) {
      return res.json({ ok: true, job: null, message: 'Нет задач со статусом «ожидает»' });
    }

    if (job.status !== 'ожидает код' && job.status !== 'код получен') {
      return res.json({
        ok: true,
        job,
        message: `Задача завершилась со статусом «${job.status}». До кода не дошли.`,
      });
    }

    // 2) если ждём код — забираем из симуляции и сохраняем
    const run = db
      .prepare(
        `SELECT id
         FROM catalog_runs
         WHERE site_id = ? AND status = 'ожидает код'
         ORDER BY id
         LIMIT 1`
      )
      .get(siteId);

    if (!run) {
      return res.json({ ok: true, job, message: 'Код уже получен или нечего забирать.' });
    }

    const found = await fetchLatestVerificationCandidateSimulated({ minutes: 180 });
    if (!found?.code && !found?.link) {
      return res.json({ ok: true, job, message: 'В симуляции нет письма с кодом/ссылкой.' });
    }

    const code = found.code || null;
    const note = found.link ? `link: ${found.link}` : null;
    db.prepare(
      `UPDATE catalog_runs
       SET verification_code = @code,
           status = 'код получен',
           profile_url = COALESCE(profile_url, @note),
           updated_at = @updatedAt
       WHERE id = @id`
    ).run({
      id: run.id,
      code,
      note,
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true, job, code, message: 'Готово: код получен.' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка автопрохождения' });
  }
});

app.post('/api/sites/:id/worker/run-to-verified', async (req, res) => {
  const siteId = Number(req.params.id);
  if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(siteId);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const result = await runToVerifiedForSite(db, siteId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка подтверждения' });
  }
});

app.post('/api/sites/:id/init-catalogs', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(id);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const count = initCatalogRunsForSite(db, id);
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Не удалось создать очередь' });
  }
});

app.post('/api/sites/:id/worker/run-once', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const site = getSiteStmt.get(id);
    if (!site) return res.status(404).json({ error: 'Сайт не найден' });

    const job = await processNextCatalogRunForSite(db, id);
    if (!job) {
      return res.json({
        ok: true,
        job: null,
        message:
          'Нет задач «ожидает». Возможно, они застряли в «в работе» — нажмите «Сбросить очередь».',
      });
    }
    res.json({ ok: true, job });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка воркера' });
  }
});

app.get('/api/export', (_req, res) => {
  try {
    const rows = getExportRows(db);
    res.json({ rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось собрать данные для экспорта' });
  }
});

app.get('/api/export.csv', (_req, res) => {
  try {
    const rows = getExportRows(db);
    const csv = rowsToCsv(rows);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="catalog-agent-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось выгрузить CSV' });
  }
});

app.post('/api/sites/:id/download-logo', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' });

  try {
    const row = db
      .prepare(
        `SELECT id, scraped_logo_url AS scrapedLogoUrl
         FROM sites
         WHERE id = ?`
      )
      .get(id);
    if (!row) return res.status(404).json({ error: 'Сайт не найден' });

    const outDir = path.join(ROOT, 'data', 'logos');
    const dl = await downloadLogo({ logoUrl: row.scrapedLogoUrl, outDir, siteId: id });

    // хранить относительный путь удобнее
    const relPath = path.relative(ROOT, dl.filePath);
    setLogoPathStmt.run({ id, logoPath: relPath });

    res.json({ ok: true, logoPath: relPath });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Ошибка скачивания логотипа' });
  }
});

app.listen(PORT, HOST, () => {
  const base = getPublicBaseUrl();
  console.log(`Сервер запущен: ${base}`);
  if (!process.env.PUBLIC_URL) {
    console.log('Для деплоя задайте PUBLIC_URL=https://ваш-домен');
  }
  console.log('Остановить: Ctrl+C');
});
