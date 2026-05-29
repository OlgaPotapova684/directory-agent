import * as catalog01 from './catalog-01.js';

const handlers = {
  'catalog-01': catalog01,
};

export function getCatalogHandler(catalogId) {
  return handlers[catalogId] || null;
}
