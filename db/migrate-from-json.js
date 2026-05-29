/**
 * Одноразовая миграция: перенос данных из data/sites.json в SQLite (data/app.db).
 * Запуск: node db/migrate-from-json.js
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'sites.json');

const db = openDb();
initDb(db);

const raw = await fs.readFile(JSON_PATH, 'utf-8');
const sites = JSON.parse(raw);

const insert = db.prepare(
  `INSERT OR IGNORE INTO sites (id, site_url, email, status, created_at)
   VALUES (@id, @siteUrl, @email, @status, @createdAt)`
);

const tx = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});

tx(sites);

const count = db.prepare('SELECT COUNT(*) AS c FROM sites').get().c;
db.close();

console.log(`OK: перенесено. Сейчас в SQLite записей: ${count}`);

