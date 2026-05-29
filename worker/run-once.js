/**
 * Запуск из терминала: npm run worker:once -- <id_сайта>
 */
import { openDb, initDb } from '../db/db.js';
import { processNextCatalogRunForSite } from './process-next.js';

const siteId = Number(process.argv[2]);
if (!Number.isFinite(siteId)) {
  console.error('Укажите id сайта. Пример: npm run worker:once -- 1779871345760');
  process.exit(1);
}

const db = openDb();
initDb(db);

const job = await processNextCatalogRunForSite(db, siteId);
db.close();

if (!job) {
  console.log('Нет задач со статусом «ожидает» для этого сайта.');
  process.exit(0);
}

const okStatuses = ['тест пройден', 'страница открыта', 'email введён', 'учётные данные', 'форма заполнена'];
if (okStatuses.includes(job.status)) {
  console.log('OK:', job.status, '—', job.catalogName);
  if (job.note) console.log('  ', job.note);
  if (job.testUrl) console.log('  страница:', job.testUrl, '—', job.testTitle);
} else {
  console.log('Ошибка для', job.catalogName + ':', job.error || job.status);
  process.exit(1);
}
