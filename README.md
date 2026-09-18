# EMORA — Premium Emotion Platform

**Xabar emas. Hissiyot yubor.**

This repository is a runnable EMORA MVP covering the full business flow discussed in the product specification:

- Telegram Mini App ready authentication
- Telegram Bot `/start` entry flow
- Telegram Stars invoices for digital services
- 3 plans: Standard / PRO AI / Signature
- Signature split payment: activation + final payment
- Smart brief
- Media uploads
- AI concept generation (OpenAI optional; built-in mock director works without a key)
- Concept selection
- Story / scene engine
- Mobile recipient preview
- Natural-language revision rounds
- **Preview → Edit → Finish → irreversible Lock** business rule
- Unique public emotion links
- Signature subdomain mapping
- Recipient analytics events
- Recipient text response
- Dashboard
- Duplicate-as-new-project after Finish

## Prices

| Plan | Web price | Telegram Stars | Revisions |
|---|---:|---:|---:|
| Standard | 129,000 UZS | 850 XTR | 1 |
| PRO AI | 349,000 UZS | 2,300 XTR | 3 |
| Signature | 899,000 UZS | 5,900 XTR total | 5 |

Signature is split in the MVP:

- Activation: 99,000 UZS / 650 Stars
- Final: 800,000 UZS / 5,250 Stars

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env
npm start
```

Open:

```text
http://localhost:8787
```

`DEMO_MODE=true` enables demo users and demo payments so the complete flow can be tested without Telegram or merchant credentials.

## Real Telegram setup

1. Create a bot with BotFather.
2. Add your HTTPS Mini App URL.
3. Put the token in `.env`:

```env
TELEGRAM_BOT_TOKEN=...
APP_URL=https://app.emora.uz
TELEGRAM_WEBHOOK_SECRET=some-long-random-string
```

4. Set webhook:

```bash
npm run set-webhook
```

Inside Telegram, digital services are paid using Telegram Stars (`XTR`). The server creates invoice links and listens for `pre_checkout_query` and `successful_payment` updates.

## OpenAI

Without an API key, the platform uses the deterministic local EMORA creative engine so all flows remain testable.

To activate AI:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
```

The server uses the Responses API with `store: false`. AI does **not** generate arbitrary site code. It returns a structured story/config that the EMORA renderer displays.

## Finish Lock — core business rule

Before Finish:

- customer sees full preview;
- customer can use remaining revision rounds;
- theme, copy and scenes can be revised.

After Finish:

- `lockedAt` is written;
- public link is published;
- update/revision API rejects further edits with HTTP 409;
- customer must use **Duplicate as new project**;
- duplicated project starts a new payment lifecycle.

This rule is enforced in the backend, not only in the UI.

## Current storage

The runnable MVP uses:

- JSON file persistence: `data/db.json`
- local media uploads: `data/uploads/`

This intentionally makes the project dependency-free and immediately runnable.

For production, replace the storage adapters with:

- PostgreSQL for data
- Cloudflare R2/S3 for media
- signed media URLs

The domain/business logic does not need to change.

## Public URL format

Standard:

```text
https://emora.uz/e/xP91mQ72
```

PRO AI:

```text
https://emora.uz/e/robiya-A92k
```

Signature:

```text
https://robiya.emora.uz
```

For Signature wildcard domains, configure DNS:

```text
*.emora.uz -> application
```

and set:

```env
BASE_DOMAIN=emora.uz
```

The server detects the Host header and maps the subdomain to a finalized Signature project.

## External Click / Payme

The Telegram Mini App itself should use Telegram Stars for this digital service. Click/Payme are intended for the independent web checkout outside Telegram.

The runnable MVP deliberately does not fake merchant credentials. Add your merchant integration when the EMORA merchant account is issued. Environment placeholders are already included.

## Main API

```text
GET    /api/config
GET    /api/me
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id/brief
POST   /api/projects/:id/media
POST   /api/projects/:id/payments/stars
POST   /api/projects/:id/payments/demo
POST   /api/projects/:id/concepts/generate
POST   /api/projects/:id/concept/select
POST   /api/projects/:id/build
POST   /api/projects/:id/revise
POST   /api/projects/:id/finish
POST   /api/projects/:id/duplicate
GET    /api/projects/:id/analytics
GET    /api/public/emotion/:slug
POST   /api/public/event
POST   /api/public/response
POST   /api/telegram/webhook
```

## Project lifecycle

```text
PAYMENT_REQUIRED
    ↓
BRIEF_READY
    ↓
CONCEPTS_READY
    ↓
CONCEPT_SELECTED
    ↓
PREVIEW
    ↓ revisions
PREVIEW
    ↓
READY_TO_FINISH (Signature after final payment)
    ↓
PUBLISHED + LOCKED
```

## Production hardening checklist

Before public launch:

- migrate JSON store to PostgreSQL;
- move uploads to Cloudflare R2;
- add virus/content scanning for uploads;
- set strict upload limits by plan;
- configure Telegram webhook secret;
- use HTTPS only;
- add CSRF strategy for web-account mode;
- add proper session auth for independent web users;
- rate-limit AI and public event APIs;
- add admin role/auth;
- connect Click/Payme on the external website;
- configure wildcard `*.emora.uz` and TLS;
- add backups and monitoring;
- add legal pages / refund terms / privacy policy.

## Structure

```text
emora_full/
├── server.mjs              # API, Telegram, static renderer, business rules
├── lib/
│   ├── ai.mjs              # EMORA AI / fallback creative engine
│   ├── payments.mjs        # plans and payment rules
│   ├── store.mjs           # persistence adapter
│   └── telegram.mjs        # Mini App validation + Bot API
├── public/
│   ├── index.html
│   ├── app.js              # full SPA
│   └── styles.css          # EMORA visual system
├── data/
│   ├── db.json
│   └── uploads/
├── scripts/
│   ├── set-webhook.mjs
│   └── smoke.mjs
├── .env.example
├── Dockerfile
├── railway.json
└── package.json
```

## Product direction

This is the first full runnable platform layer. The next production milestone is not a redesign; it is infrastructure hardening: PostgreSQL/R2, real web merchant payment credentials, admin operations, and richer scene components.

## Music policy (EMORA v1)

EMORA ichida tayyor musiqa katalogi yo‘q. Fon musiqasini mijozning o‘zi project ichida MP3 yoki M4A qilib yuklaydi. Audio ikki rolga ajratiladi:

- `music` — recipient experience davomida fon musiqasi;
- `voice` — alohida ovozli xabar scene’i.

Browser autoplay cheklovi sabab recipient sahifasida `♫ Musiqani yoqish` tugmasi chiqadi. User bosgandan keyin fon musiqa loop’da ijro etiladi.

---

## v1.0 production infrastructure layer

The repository now supports two runtime modes without changing the product flow:

### Database

- Local/dev: `data/db.json`
- Production: set `DATABASE_URL` and EMORA automatically persists the same atomic application state in PostgreSQL using a transaction + row lock.

This first-launch Postgres mode is deliberately migration-safe with the existing MVP business logic. When traffic grows, `sql/schema.sql` can be evolved into normalized event/project/payment tables without changing the customer UX.

### Media

- Local/dev: `data/uploads/`
- Production: configure all `R2_*` environment variables and uploads go to Cloudflare R2.
- The customer remains the source of background music. EMORA does not ship a music library.

### Enforced upload limits

- Standard: up to 5 images, 1 content video, no voice scene, 1 background music file.
- PRO AI: up to 15 images, 3 videos, 1 voice, 1 background music file.
- Signature: up to 30 images, 8 videos, 3 voice files, 1 background music file.
- Music/voice: MP3 or M4A only.

### Abuse protection

- Public analytics/reply endpoints have in-memory rate limiting.
- AI generate/build/revise endpoints have per-user rate limiting.
- Telegram webhook supports `X-Telegram-Bot-Api-Secret-Token` verification.
- Finish Lock remains enforced server-side.

### Production check

```bash
npm run production-check
```

For a real deploy set `DEMO_MODE=false` and configure Telegram, admin token, PostgreSQL, R2 and AI credentials.
