const token = process.env.TELEGRAM_BOT_TOKEN;
const app = process.env.APP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !app) throw new Error('TELEGRAM_BOT_TOKEN and APP_URL required');
const url = `https://api.telegram.org/bot${token}/setWebhook`;
const r = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:`${app}/api/telegram/webhook`,secret_token:secret||undefined})});
console.log(await r.json());
