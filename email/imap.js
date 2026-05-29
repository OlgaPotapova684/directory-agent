import { ImapFlow } from 'imapflow';

export function makeImapClientFromEnv(env) {
  const host = env.IMAP_HOST;
  const user = env.IMAP_USER;
  const pass = env.IMAP_PASS;
  if (!host || !user || !pass) {
    throw new Error('Не заполнены IMAP_HOST / IMAP_USER / IMAP_PASS в .env');
  }

  const port = env.IMAP_PORT ? Number(env.IMAP_PORT) : 993;
  const secure = env.IMAP_SECURE ? env.IMAP_SECURE !== 'false' : true;
  const mailbox = env.IMAP_MAILBOX || 'INBOX';

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
  });

  return { client, mailbox };
}

export async function fetchLatestVerificationCandidate({ client, mailbox, minutes = 60 }) {
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const since = new Date(Date.now() - minutes * 60_000);
      // Ищем письма за последний час, от новых к старым
      const uids = await client.search({ since });
      if (!uids.length) return null;

      const latest = uids.slice(-20).reverse(); // берём до 20 самых свежих
      for await (const msg of client.fetch(latest, { envelope: true, source: true })) {
        const from = msg.envelope?.from?.[0];
        const fromText = from ? `${from.name || ''} <${from.address || ''}>`.trim() : '';
        const subject = msg.envelope?.subject || '';

        const text = msg.source?.toString('utf8') || '';
        const code = extractCode(text);
        const link = extractLink(text);

        if (code || link) {
          return {
            uid: msg.uid,
            subject,
            from: fromText,
            code,
            link,
          };
        }
      }

      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function extractCode(text) {
  // Частые варианты: 4–8 цифр
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

function extractLink(text) {
  // Берём первую ссылку вида http(s)://...
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

