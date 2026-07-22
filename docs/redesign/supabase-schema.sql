-- ══════════════════════════════════════════════════════════════════════
--  TradeOS · Supabase (Postgres) — סכמה מוצעת · טיוטה לאישור
--  לא הורץ עדיין. זה רק לתצוגה. שום דבר לא נוגע בדאטה הקיימת ב-Firestore.
-- ══════════════════════════════════════════════════════════════════════
--  עקרונות:
--   • כל טבלה שייכת למשתמש דרך user_id → auth.users(id)
--   • RLS מופעל על הכל: משתמש רואה/עורך רק את השורות שלו
--   • כל האגרגציות של המאמן (win-rate לפי סשן/מטבע/שעה) רצות פה ב-SQL
-- ══════════════════════════════════════════════════════════════════════


-- ── 1) פרופילים (מראה של auth.users) ──────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  locale        text default 'he',                 -- he / en (דו-לשוני)
  plan          text default 'free',               -- free / premium
  premium_until timestamptz,
  role          text default 'user',               -- user / admin
  app_version   text,
  created_at    timestamptz default now(),
  deleted_at    timestamptz,                        -- מי מחק את החשבון ומתי
  deleted_reason text
);


-- ── 2) חיבורי בורסה (Bybit וכו') ──────────────────────────────────────
-- מפתחות ה-API עצמם נשמרים מוצפנים בצד-שרת (Vault/Secrets), לא כאן בגלוי.
create table exchange_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  exchange       text not null,                     -- bybit / binance / ...
  label          text,
  status         text default 'active',             -- active / error
  last_synced_at timestamptz,
  created_at     timestamptz default now()
);


-- ── 3) עסקאות (הליבה) ─────────────────────────────────────────────────
create table trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references exchange_connections(id) on delete set null,
  source       text default 'manual',              -- manual / synced
  external_id  text,                                -- מזהה מהבורסה (למניעת כפילויות)

  symbol       text not null,                       -- BTCUSDT
  side         text not null,                       -- long / short
  entry_price  numeric,
  exit_price   numeric,
  quantity     numeric,
  leverage     numeric,
  pnl          numeric,                             -- רווח/הפסד נטו
  fees         numeric,

  opened_at    timestamptz,
  closed_at    timestamptz,
  status       text default 'closed',               -- open / closed
  session      text,                                -- asian / london / newyork (מחושב בהזנה)
  setup        text,                                -- שם הסטאפ/אסטרטגיה
  notes        text,

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
-- אינדקסים לחתכים שהמאמן שואל עליהם הכי הרבה:
create index trades_user_time   on trades (user_id, opened_at desc);
create index trades_user_symbol on trades (user_id, symbol);
create index trades_user_session on trades (user_id, session);
-- מניעת כפל בסנכרון:
create unique index trades_ext_uniq on trades (user_id, external_id) where external_id is not null;


-- ── 4) יומן (כוונות בוקר, סקירות, רגשות) ─────────────────────────────
create table journal_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trade_id       uuid references trades(id) on delete set null,   -- אופציונלי
  kind           text not null,                     -- morning_intention / trade_review / reflection / note
  content        text,
  emotion        text,                              -- calm / fear / greed / fomo / revenge ...
  rules_followed boolean,                           -- האם עמד בתוכנית
  created_at     timestamptz default now()
);
create index journal_user_time on journal_entries (user_id, created_at desc);


-- ── 5) תובנות המאמן AI ────────────────────────────────────────────────
create table ai_insights (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null,                   -- pattern / daily_briefing / warning / answer
  title            text,
  body             text,
  severity         text default 'info',             -- info / warn / critical
  cost_impact      numeric,                          -- כמה הדפוס עלה, למשל -184
  evidence         jsonb,                            -- האגרגציות שמאחורי התובנה
  related_trade_ids uuid[],
  model            text,                             -- איזה מודל Claude ניסח
  created_at       timestamptz default now(),
  dismissed_at     timestamptz
);
create index insights_user_time on ai_insights (user_id, created_at desc);


-- ── 6) מצב משמעת/טילט (סנאפשוט יומי) ──────────────────────────────────
create table discipline_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  score       int,                                  -- 0..100
  tilt_state  text,                                 -- focused / warning / tilt
  streak_days int,
  metrics     jsonb,
  created_at  timestamptz default now(),
  unique (user_id, date)
);


-- ── 7) בק-טסטים ───────────────────────────────────────────────────────
create table backtests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  symbol     text,
  params     jsonb,
  result     jsonb,
  created_at timestamptz default now()
);


-- ── 8) ווטצ'ליסט (קומודיטי — נשאר ב"עוד") ─────────────────────────────
create table watchlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  created_at timestamptz default now(),
  unique (user_id, symbol)
);


-- ── 9) התראות Push (Web Push) ─────────────────────────────────────────
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text,
  auth       text,
  created_at timestamptz default now(),
  unique (user_id, endpoint)
);


-- ══════════════════════════════════════════════════════════════════════
--  מיגרציה 2 (22.07) — פיצ'רים שהוחלט לשמור
--  תוכניות מסחר + תהליכים → מתקפלים לתוך journal_entries (kind='plan'/'process')
-- ══════════════════════════════════════════════════════════════════════

-- ── 10) אסטרטגיות (win-rate לפי אסטרטגיה למאמן) ───────────────────────
create table strategies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  rules       jsonb,
  created_at  timestamptz default now()
);
create index strategies_user on strategies (user_id);
-- קישור עסקה לאסטרטגיה:
alter table trades add column strategy_id uuid references strategies(id) on delete set null;

-- ── 11) סיגנלים (סטאפים במעקב) ────────────────────────────────────────
create table signals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  side         text,
  status       text default 'waiting',   -- waiting / active / hit / missed
  entry_zone   text,
  target_price numeric,
  stop_price   numeric,
  notes        text,
  created_at   timestamptz default now()
);
create index signals_user on signals (user_id, status);

-- ── 12) מעקב DCA (קומודיטי — יושב בתפריט "עוד") ───────────────────────
create table dca_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  config     jsonb,
  created_at timestamptz default now()
);
create index dca_user on dca_plans (user_id);

-- RLS למיגרציה 2:
alter table strategies enable row level security;
alter table signals    enable row level security;
alter table dca_plans  enable row level security;
create policy "own rows" on strategies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on signals    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on dca_plans  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
--  RLS — כל משתמש רואה רק את שלו (חובה לפני פרודקשן)
-- ══════════════════════════════════════════════════════════════════════
alter table profiles              enable row level security;
alter table exchange_connections  enable row level security;
alter table trades                enable row level security;
alter table journal_entries       enable row level security;
alter table ai_insights           enable row level security;
alter table discipline_snapshots  enable row level security;
alter table backtests             enable row level security;
alter table watchlist_items       enable row level security;
alter table push_subscriptions    enable row level security;

-- פרופיל: המשתמש = השורה
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- כל שאר הטבלאות: user_id = המשתמש המחובר
create policy "own rows" on exchange_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on trades               for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on journal_entries      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on ai_insights          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on discipline_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on backtests            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on watchlist_items      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on push_subscriptions   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
--  דוגמה: זה מה שהמאמן ירוץ (win-rate לפי סשן) — שורה אחת, זול, מהיר.
--  ב-Firestore זה היה סיוט. ב-Postgres:
-- ══════════════════════════════════════════════════════════════════════
--   select session,
--          count(*)                                   as trades,
--          round(100.0 * count(*) filter (where pnl > 0) / count(*), 1) as win_rate,
--          round(avg(pnl), 2)                          as avg_pnl
--   from trades
--   where user_id = auth.uid() and status = 'closed'
--   group by session
--   order by win_rate desc;
