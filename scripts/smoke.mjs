const base = process.env.APP_URL || 'http://localhost:8787';
const r = await fetch(`${base}/api/health`); console.log('health', r.status, await r.text());
