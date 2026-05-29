/**
 * Создаёт "письмо" в локальном инбоксе (симуляция почты).
 *
 * Запуск:
 *   npm run simulate-email
 */
import { pushSimulatedEmail } from '../email/simulated-inbox.js';

const msg = await pushSimulatedEmail({
  to: 'registrations@example.com',
  from: 'catalog <no-reply@catalog.test>',
  subject: 'Код подтверждения',
  text: 'Ваш код подтверждения: 123456',
});

console.log('OK: создано письмо:');
console.log('  subject:', msg.subject);
console.log('  text:', msg.text);

