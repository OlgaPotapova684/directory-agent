/**
 * Проверка "почты": читает локальный инбокс и ищет свежее письмо с кодом/ссылкой.
 *
 * Запуск:
 *   npm run simulate-email
 *   npm run test-email
 */
import { fetchLatestVerificationCandidateSimulated } from '../email/simulated-inbox.js';

const found = await fetchLatestVerificationCandidateSimulated({ minutes: 180 });

if (!found) {
  console.log('Не нашла письма с кодом/ссылкой за последние 3 часа.');
  process.exit(0);
}

console.log('Нашла письмо:');
console.log('  from:', found.from || '—');
console.log('  subject:', found.subject || '—');
console.log('  code:', found.code || '—');
console.log('  link:', found.link || '—');

