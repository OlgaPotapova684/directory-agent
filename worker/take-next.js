/**
 * Берёт одну задачу из очереди и ставит статус «в работе».
 * Пока без Playwright — только проверка очереди.
 */
export function takeNextCatalogRunForSite(db, siteId) {
  const next = db
    .prepare(
      `SELECT cr.id, cr.site_id AS siteId, cr.catalog_id AS catalogId,
              c.name AS catalogName, cr.status
       FROM catalog_runs cr
       JOIN catalogs c ON c.id = cr.catalog_id
       WHERE cr.site_id = ? AND cr.status = 'ожидает'
       ORDER BY cr.id
       LIMIT 1`
    )
    .get(siteId);

  if (!next) return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE catalog_runs
     SET status = 'в работе', updated_at = @now
     WHERE id = @id`
  ).run({ id: next.id, now });

  return {
    ...next,
    status: 'в работе',
    updatedAt: now,
  };
}
