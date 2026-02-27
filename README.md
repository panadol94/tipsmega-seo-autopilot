# tipsmega-seo-autopilot

Background SEO worker for `tipsmega888.com`.

## Features
- Daily content pack generator (30-day rotating calendar)
- Weekly SEO summary report generator
- Optional Telegram push notifications
- HTTP endpoints for manual trigger
- Cron scheduler in-app

## Endpoints
- `GET /health`
- `GET /latest`
- `POST /run/daily`
- `POST /run/daily?force=1`
- `POST /run/weekly`

## Local run
```bash
npm install
cp .env.example .env
npm start
```

## Docker
```bash
docker build -t tipsmega-seo-autopilot .
docker run -p 3001:3001 --env-file .env tipsmega-seo-autopilot
```

## Required env
- `SITE_URL`
- `TZ`
- `DAILY_CRON`
- `WEEKLY_CRON`

Optional (for Telegram push):
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
