# EMORA production deployment

## 1. GitHub

Create a repository and push this folder as the repository root.

```bash
git init
git add .
git commit -m "EMORA v1.0"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

Never commit `.env`.

## 2. PostgreSQL

Create a PostgreSQL service (Railway Postgres works) and set `DATABASE_URL` on the EMORA service. The app creates its initial `emora_state` table automatically on first request.

## 3. Cloudflare R2

Create an R2 bucket and a public/custom media hostname, then set:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=emora-media
R2_PUBLIC_BASE_URL=https://media.emora.uz
```

If these variables are absent, EMORA uses local disk. Do not use local disk for production media on ephemeral hosting.

## 4. Telegram

Set:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=<long random secret>
APP_URL=https://app.emora.uz
DEMO_MODE=false
```

Then run:

```bash
npm run set-webhook
```

## 5. Domain

Recommended DNS:

```text
app.emora.uz    -> Railway app
*.emora.uz      -> Railway app (Signature links)
media.emora.uz  -> Cloudflare R2 custom domain
```

Set `BASE_DOMAIN=emora.uz`.

## 6. OpenAI

Set `OPENAI_API_KEY` and `OPENAI_MODEL`. Without a key, the deterministic fallback engine is used.

## 7. Final check

Set all production environment variables and run:

```bash
npm run production-check
```

Then verify:

```text
GET /api/health
```

Expected production response includes:

```json
{"store":"postgres","storage":"r2"}
```

## 8. Telegram payment

Digital services sold inside Telegram use Telegram Stars. The webhook records successful payments and advances the project lifecycle.

## 9. Web checkout

Click/Payme are intentionally left as credential-driven integrations for the independent web checkout. Do not fake them in production. Connect them only after merchant credentials and callback requirements are issued.
