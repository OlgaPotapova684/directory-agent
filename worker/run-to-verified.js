import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { processNextCatalogRunForSite } from './process-next.js';
import { fetchLatestVerificationCandidateSimulated } from '../email/simulated-inbox.js';
import { verifyTrainingCode } from '../catalogs/training-verify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function trainingBaseUrl(registerUrl) {
  try {
    const u = new URL(registerUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

/**
 * Полный учебный цикл: регистрация → код из симуляции → подтверждение.
 */
export async function runToVerifiedForSite(db, siteId) {
  const job = await processNextCatalogRunForSite(db, siteId);
  if (!job) {
    return { ok: true, message: 'Нет задач со статусом «ожидает»' };
  }

  if (job.status !== 'ожидает код') {
    return {
      ok: true,
      job,
      message: `Задача завершилась со статусом «${job.status}». Нужен учебный каталог и «ожидает код».`,
    };
  }

  const run = db
    .prepare(
      `SELECT cr.id, cr.login, cr.password, c.register_url AS registerUrl
       FROM catalog_runs cr
       JOIN catalogs c ON c.id = cr.catalog_id
       WHERE cr.site_id = ? AND cr.status = 'ожидает код'
       ORDER BY cr.id
       LIMIT 1`
    )
    .get(siteId);

  if (!run) {
    return { ok: true, job, message: 'Нет задачи «ожидает код».' };
  }

  const found = await fetchLatestVerificationCandidateSimulated({ minutes: 180 });
  if (!found?.code) {
    return { ok: true, job, message: 'В симуляции нет письма с кодом. Сначала зарегистрируйтесь в учебном каталоге.' };
  }

  const code = found.code;
  const baseUrl = trainingBaseUrl(run.registerUrl || 'http://localhost:3000/training-catalog/register');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const verify = await verifyTrainingCode({
      page,
      email: run.login,
      code,
      baseUrl,
    });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE catalog_runs
       SET verification_code = @code,
           status = 'подтверждено',
           profile_url = @note,
           updated_at = @updatedAt
       WHERE id = @id`
    ).run({
      id: run.id,
      code,
      note: verify.note,
      updatedAt: now,
    });

    return {
      ok: true,
      job: { ...job, status: 'подтверждено', login: run.login, verificationCode: code },
      code,
      message: 'Готово: регистрация подтверждена в учебном каталоге.',
    };
  } finally {
    await browser.close();
  }
}
