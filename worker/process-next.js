import { takeNextCatalogRunForSite } from './take-next.js';
import { runCatalogJob } from './run-catalog.js';

/**
 * Берёт задачу и запускает сценарий каталога (или тест example.com).
 */
export async function processNextCatalogRunForSite(db, siteId) {
  const job = takeNextCatalogRunForSite(db, siteId);
  if (!job) return null;

  const now = () => new Date().toISOString();

  try {
    const result = await runCatalogJob({ db, job });

    db.prepare(
      `UPDATE catalog_runs
       SET status = @status,
           profile_url = @note,
           login = @login,
           password = @password,
           verification_code = COALESCE(verification_code, @verificationCode),
           error = NULL,
           updated_at = @updatedAt
       WHERE id = @id`
    ).run({
      id: job.id,
      status: result.status,
      note: result.note || null,
      login: result.login ?? null,
      password: result.password ?? null,
      verificationCode: result.verificationCode ?? null,
      updatedAt: now(),
    });

    return {
      ...job,
      status: result.status,
      note: result.note,
      login: result.login,
      password: result.password,
    };
  } catch (err) {
    const message = err?.message || String(err);
    db.prepare(
      `UPDATE catalog_runs
       SET status = 'ошибка',
           error = @error,
           updated_at = @updatedAt
       WHERE id = @id`
    ).run({ id: job.id, error: message, updatedAt: now() });

    return { ...job, status: 'ошибка', error: message };
  }
}
