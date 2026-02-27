const fs = require('fs');
const path = require('path');
const express = require('express');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const TZ = process.env.TZ || 'Asia/Kuala_Lumpur';
const SITE_URL = process.env.SITE_URL || 'https://tipsmega888.com';
const DAILY_CRON = process.env.DAILY_CRON || '30 10 * * *';
const WEEKLY_CRON = process.env.WEEKLY_CRON || '0 21 * * 0';

const BASE = path.join(__dirname, '..');
const CALENDAR_FILE = path.join(BASE, 'data', 'calendar.json');
const STATE_FILE = path.join(BASE, 'data', 'state.json');
const OUT_DIR = path.join(BASE, 'out');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function nowInTz() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function isoDateTz() {
  const d = nowInTz();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadCalendar() {
  return JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { currentIndex: 0, lastDailyRunDate: null, updatedAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { currentIndex: 0, lastDailyRunDate: null, updatedAt: null };
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function makePostCopy(title, cta) {
  return {
    telegram: `🔥 ${title}\n\nArtikel baru untuk bantu player main lebih smart (bukan hentam nasib).\n\n👉 ${cta}\n${SITE_URL}/blog`,
    facebook: `${title}\n\nPanduan practical + ringkas untuk improve decision masa main.\n\n✅ ${cta}\n#mega888 #tipsmega888 #slotstrategy`,
    tiktokHook: `${title} — 30 saat terus faham point paling penting!`
  };
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'TELEGRAM_NOT_CONFIGURED' };

  const body = {
    chat_id: chatId,
    text: text.slice(0, 3900),
    disable_web_page_preview: true
  };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${t.slice(0, 500)}`);
  }
  const json = await res.json();
  return { sent: true, messageId: json?.result?.message_id || null };
}

function writeDailyFiles(pack) {
  const jsonPath = path.join(OUT_DIR, `daily-pack-${pack.date}.json`);
  const mdPath = path.join(OUT_DIR, `daily-pack-${pack.date}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(pack, null, 2));

  const md = [
    `# SEO Daily Pack — ${pack.date}`,
    '',
    `## Topic`,
    `- ${pack.topic}`,
    '',
    `## Checklist`,
    ...pack.checklist.map((x) => `- ${x}`),
    '',
    `## Telegram Copy`,
    pack.posts.telegram,
    '',
    `## Facebook Copy`,
    pack.posts.facebook,
    '',
    `## TikTok Hook`,
    `- ${pack.posts.tiktokHook}`,
    ''
  ].join('\n');

  fs.writeFileSync(mdPath, md);
  return { jsonPath, mdPath };
}

async function runDaily({ force = false } = {}) {
  const date = isoDateTz();
  const calendar = loadCalendar();
  const state = loadState();

  if (!force && state.lastDailyRunDate === date) {
    return { skipped: true, reason: 'Already generated for today', date };
  }

  const idx = state.currentIndex % calendar.length;
  const topic = calendar[idx];
  const posts = makePostCopy(topic.title, topic.cta);

  const pack = {
    date,
    timezone: TZ,
    day: topic.day,
    topic: topic.title,
    checklist: [
      `Draft article: ${topic.title}`,
      'Optimize title (50-60 chars) + meta description (140-155 chars)',
      'Add 2-4 internal links to related articles',
      'Add FAQ section (2-3 Q&A) near end of article',
      'Publish + submit URL in Google Search Console',
      'Distribute to Telegram + Facebook + short video caption'
    ],
    posts
  };

  const files = writeDailyFiles(pack);
  state.currentIndex = (idx + 1) % calendar.length;
  state.lastDailyRunDate = date;
  saveState(state);

  const shouldNotify = String(process.env.NOTIFY_DAILY || 'true').toLowerCase() === 'true';
  let notify = { sent: false, reason: 'disabled' };
  if (shouldNotify) {
    const msg = `✅ SEO Daily Pack Ready (${date})\n\nTopic: ${pack.topic}\nDay: ${pack.day}/30\n\nTelegram:\n${pack.posts.telegram}`;
    notify = await sendTelegram(msg).catch((err) => ({ sent: false, error: err.message }));
  }

  return { skipped: false, date, pack, files, notify };
}

async function runWeekly({ force = false } = {}) {
  const date = isoDateTz();
  const weekFiles = fs.readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('daily-pack-') && f.endsWith('.json'))
    .sort()
    .slice(-7);

  const packs = weekFiles.map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')));
  const topics = packs.map((p) => `- [Day ${p.day}] ${p.topic}`).join('\n') || '- No packs generated yet';

  const report = {
    date,
    timezone: TZ,
    totalDailyPacksLast7Days: packs.length,
    topicsLast7Days: packs.map((p) => ({ day: p.day, topic: p.topic, date: p.date })),
    nextFocus: [
      'Refresh top 5 pages with highest impressions but low CTR',
      'Ship at least 3 comparison articles next week',
      'Strengthen internal links from homepage to fresh posts'
    ]
  };

  const jsonPath = path.join(OUT_DIR, `weekly-report-${date}.json`);
  const mdPath = path.join(OUT_DIR, `weekly-report-${date}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Weekly SEO Report — ${date}`,
    '',
    `## Generated`,
    `- Daily packs (last 7 days): ${packs.length}`,
    '',
    `## Topics covered`,
    topics,
    '',
    `## Next focus`,
    ...report.nextFocus.map((x) => `- ${x}`),
    ''
  ].join('\n');
  fs.writeFileSync(mdPath, md);

  const shouldNotify = String(process.env.NOTIFY_WEEKLY || 'true').toLowerCase() === 'true';
  let notify = { sent: false, reason: 'disabled' };
  if (shouldNotify) {
    const msg = `📊 Weekly SEO Report (${date})\n\nDaily packs (7 days): ${packs.length}\n\nTopik:\n${topics}\n\nNext focus:\n- ${report.nextFocus.join('\n- ')}`;
    notify = await sendTelegram(msg).catch((err) => ({ sent: false, error: err.message }));
  }

  return { date, report, files: { jsonPath, mdPath }, notify, force };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tipsmega-seo-autopilot', timezone: TZ, now: new Date().toISOString() });
});

app.get('/latest', (_req, res) => {
  const files = fs.readdirSync(OUT_DIR).sort().reverse().slice(0, 20);
  res.json({ ok: true, files });
});

app.post('/run/daily', async (req, res) => {
  try {
    const force = !!(req.query.force || req.body?.force);
    const result = await runDaily({ force });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/run/weekly', async (req, res) => {
  try {
    const force = !!(req.query.force || req.body?.force);
    const result = await runWeekly({ force });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

cron.schedule(DAILY_CRON, async () => {
  try {
    const result = await runDaily({ force: false });
    console.log('[daily]', JSON.stringify({ date: isoDateTz(), skipped: result.skipped }));
  } catch (err) {
    console.error('[daily] failed', err.message);
  }
}, { timezone: TZ });

cron.schedule(WEEKLY_CRON, async () => {
  try {
    const result = await runWeekly({ force: false });
    console.log('[weekly]', JSON.stringify({ date: isoDateTz(), sent: result.notify?.sent || false }));
  } catch (err) {
    console.error('[weekly] failed', err.message);
  }
}, { timezone: TZ });

app.listen(PORT, () => {
  console.log(`tipsmega-seo-autopilot running on :${PORT} (${TZ})`);
  console.log(`daily cron=${DAILY_CRON} weekly cron=${WEEKLY_CRON}`);
});
