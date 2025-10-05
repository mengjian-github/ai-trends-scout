# AI Trends Scout

Internal dashboard and ingestion pipeline to track emerging AI-related demand keywords across developed markets. Built with Next.js (App Router) on Vercel, Supabase for storage, Upstash Redis for caching, and Cloudflare Workers for Google Trends ingestion via DataForSEO.

## Tech Stack

- **Next.js 15 + App Router** for the dashboard UI and API routes
- **Supabase/Postgres** stores keywords, historical snapshots, news items, notification rules, and audit events
- **Upstash Redis** caches hotlists and overview payloads for low-latency loading
- **Cloudflare Workers + Scheduler** run ingestion tasks against DataForSEO, then fan out results to Supabase and Redis
- **Zod / TypeScript** provide type-safe environment handling and service modules

## Getting Started

1. Install dependencies:
   `ash
   npm install
   `
2. Copy .env.example to .env.local (for Vercel) and populate Supabase, Upstash, and DataForSEO credentials.
3. Run the dev server:
   `ash
   npm run dev
   `
4. Open http://localhost:3000 to view the dashboard (redirects to /overview).

> **Note**: Supabase and Redis credentials are required for server components to render data. When not available, the UI falls back to mock payloads defined in lib/mock-data.ts.

## Database Schema

SQL definition lives in supabase/schema.sql. Apply it to Supabase via the dashboard or psql:

`sql
\i supabase/schema.sql
`

Key tables:
- i_trends_roots 每 seed keywords/phrases to expand via DataForSEO
- i_trends_keywords 每 aggregated metrics per keyword ℅ timeframe ℅ locale
- i_trends_snapshots 每 historical time series for charts
- i_trends_news 每 external news snippets tied to keywords
- i_trends_notifications 每 alerting rules
- i_trends_events 每 ingestion/debug audit log

## Worker Ingestion Flow

Cloudflare Worker source: workers/src/index.ts

- Fetch active roots from Supabase (i_trends_roots)
- Build DataForSEO Google Trends tasks per root/timeframe/market
- Submit batched POST /keywords_data/google_trends/live requests
- Write raw results into i_trends_events (placeholder) and update Upstash Redis (ts:last-sync)
- Scheduled trigger is configured in Cloudflare dashboard (e.g., hourly)

Before deploying the worker:

`ash
cd workers
npm install wrangler --save-dev
wrangler login
wrangler deploy
`

> Secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATAFORSEO_LOGIN, etc.) must be added via wrangler secret put or the Cloudflare dashboard.

## Frontend Pages

- /overview 每 KPI cards, hotlists, and alert log (uses Redis/Supabase fallback)
- /keywords 每 Expanded tables per timeframe (supabase-backed)
- /news 每 Latest AI news items (Supabase i_trends_news)
- /settings 每 Environment-derived configuration overview + placeholders for management forms

Shared components live under components/ and reusable services under lib/.

## Next Steps

- Flesh out worker post-processing (write to i_trends_keywords and Redis hotlists)
- Add brand-filter management UI and server actions (Supabase writes)
- Wire notification rules to email/Slack/Feishu webhooks
- Implement charts based on i_trends_snapshots
- Add integration tests/lints when business logic stabilizes
