import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INBOX_PATH = path.join(ROOT, 'data', 'simulated-inbox.json');

async function readInbox() {
  try {
    const raw = await fs.readFile(INBOX_PATH, 'utf-8');
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeInbox(items) {
  await fs.mkdir(path.dirname(INBOX_PATH), { recursive: true });
  await fs.writeFile(INBOX_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

export async function pushSimulatedEmail({ to, subject, from, text }) {
  const items = await readInbox();
  const msg = {
    id: Date.now(),
    to: to || null,
    from: from || 'simulator <no-reply@example.com>',
    subject: subject || '(no subject)',
    text: text || '',
    createdAt: new Date().toISOString(),
  };
  items.unshift(msg);
  await writeInbox(items);
  return msg;
}

export async function fetchLatestVerificationCandidateSimulated({ minutes = 180 } = {}) {
  const items = await readInbox();
  const since = Date.now() - minutes * 60_000;

  for (const msg of items) {
    const ts = Date.parse(msg.createdAt || '');
    if (!Number.isFinite(ts) || ts < since) continue;

    const code = extractCode(msg.text || '');
    const link = extractLink(msg.text || '');
    if (code || link) {
      return {
        id: msg.id,
        subject: msg.subject,
        from: msg.from,
        code,
        link,
        createdAt: msg.createdAt,
      };
    }
  }
  return null;
}

function extractCode(text) {
  const m = String(text).match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

function extractLink(text) {
  const m = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

