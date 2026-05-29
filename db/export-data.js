const EXPORT_COLUMNS = [
  { key: 'siteId', header: 'ID компании' },
  { key: 'siteUrl', header: 'Сайт' },
  { key: 'email', header: 'Email' },
  { key: 'scrapedTitle', header: 'Название' },
  { key: 'scrapedDescription', header: 'Описание' },
  { key: 'logoPath', header: 'Логотип (файл)' },
  { key: 'catalogName', header: 'Каталог' },
  { key: 'status', header: 'Статус' },
  { key: 'login', header: 'Логин' },
  { key: 'password', header: 'Пароль' },
  { key: 'verificationCode', header: 'Код' },
  { key: 'profileUrl', header: 'Результат' },
  { key: 'error', header: 'Ошибка' },
  { key: 'updatedAt', header: 'Обновлено' },
];

export function getExportRows(db) {
  return db
    .prepare(
      `SELECT s.id AS siteId,
              s.site_url AS siteUrl,
              s.email AS email,
              s.scraped_title AS scrapedTitle,
              s.scraped_description AS scrapedDescription,
              s.logo_path AS logoPath,
              c.name AS catalogName,
              cr.status AS status,
              cr.login AS login,
              cr.password AS password,
              cr.verification_code AS verificationCode,
              cr.profile_url AS profileUrl,
              cr.error AS error,
              cr.updated_at AS updatedAt
       FROM sites s
       LEFT JOIN catalog_runs cr ON cr.site_id = s.id
       LEFT JOIN catalogs c ON c.id = cr.catalog_id
       ORDER BY s.created_at DESC, c.id`
    )
    .all();
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows) {
  const headerLine = EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    EXPORT_COLUMNS.map((c) => csvCell(row[c.key])).join(',')
  );
  // BOM для корректного открытия кириллицы в Excel
  return '\uFEFF' + [headerLine, ...dataLines].join('\n');
}

export { EXPORT_COLUMNS };
