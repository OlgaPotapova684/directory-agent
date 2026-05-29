import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'app.db');

export function openDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY,
      site_url TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ожидает',
      created_at TEXT NOT NULL,
      scraped_title TEXT,
      scraped_description TEXT,
      scraped_logo_url TEXT,
      logo_path TEXT,
      scraped_at TEXT
    );
  `);

  const cols = db.prepare(`PRAGMA table_info('sites')`).all().map((r) => r.name);
  const ensureColumn = (name, type) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE sites ADD COLUMN ${name} ${type}`);
  };

  ensureColumn('scraped_title', 'TEXT');
  ensureColumn('scraped_description', 'TEXT');
  ensureColumn('scraped_logo_url', 'TEXT');
  ensureColumn('logo_path', 'TEXT');
  ensureColumn('scraped_at', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS catalogs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      register_url TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      catalog_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ожидает',
      login TEXT,
      password TEXT,
      verification_code TEXT,
      profile_url TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (site_id, catalog_id),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id)
    );
  `);

  // на случай уже существующей таблицы
  const crCols = db.prepare(`PRAGMA table_info('catalog_runs')`).all().map((r) => r.name);
  if (!crCols.includes('verification_code')) {
    db.exec(`ALTER TABLE catalog_runs ADD COLUMN verification_code TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS training_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      code TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      verified_at TEXT
    );
  `);

  seedCatalogs(db);
  pruneExtraCatalogs(db);
}

export const TEST_CATALOGS = [
  { id: 'catalog-01', name: 'Тестовый каталог 1' },
  { id: 'catalog-02', name: 'Тестовый каталог 2' },
  { id: 'catalog-03', name: 'Тестовый каталог 3' },
  { id: 'catalog-04', name: 'Тестовый каталог 4' },
  { id: 'catalog-05', name: 'Тестовый каталог 5' },
];

export function seedCatalogs(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO catalogs (id, name, register_url) VALUES (@id, @name, '')`
  );
  for (const c of TEST_CATALOGS) insert.run(c);
}

/** Удаляет каталоги 6–10, если остались от старой версии. */
export function pruneExtraCatalogs(db) {
  const keepIds = TEST_CATALOGS.map((c) => c.id);
  const placeholders = keepIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM catalog_runs WHERE catalog_id NOT IN (${placeholders})`).run(...keepIds);
  db.prepare(`DELETE FROM catalogs WHERE id NOT IN (${placeholders})`).run(...keepIds);
}

export function initCatalogRunsForSite(db, siteId) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO catalog_runs (site_id, catalog_id, status, updated_at)
     VALUES (?, ?, 'ожидает', ?)`
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const c of TEST_CATALOGS) insert.run(siteId, c.id, now);
  });
  tx();
  return TEST_CATALOGS.length;
}

