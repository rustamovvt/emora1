import crypto from 'node:crypto';

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const digest = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Math.abs(Date.now()/1000 - authDate) > maxAgeSeconds) return null;
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  return { user, queryId: params.get('query_id'), authDate };
}

export async function tgApi(token, method, payload = {}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || `Telegram ${method} failed`);
  return j.result;
}

export async function createStarsInvoice({ token, title, description, payload, stars }) {
  return tgApi(token, 'createInvoiceLink', {
    title: title.slice(0,32),
    description: description.slice(0,255),
    payload: payload.slice(0,128),
    currency: 'XTR',
    prices: [{ label: title.slice(0,32), amount: Math.round(stars) }]
  });
}

export async function sendBotStart({token, chatId, appUrl}) {
  return tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text: 'EMORA — Xabar emas. Hissiyot yubor. 💗\n\nMini App orqali personal digital sovg‘a yarating.',
    reply_markup: { inline_keyboard: [[{ text:'EMORA’ni ochish', web_app:{ url: appUrl } }]] }
  });
}
