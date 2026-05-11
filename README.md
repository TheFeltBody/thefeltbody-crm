# The Felt Body CRM

Staff-facing CRM for The Felt Body, backed by Supabase.

## What this is

A React app that talks to the `thefeltbody-crm` Supabase project. Replaces
the previous prototype which persisted to `window.storage`. Uses magic-link
auth via Supabase Auth; data access is owner-scoped via RLS.

Architecture in three layers:

- `src/lib/supabase.js` — client singleton, configured from env vars
- `src/lib/mappers.js` — pure functions translating between DB rows and the
  shape the UI expects (snake_case ↔ camelCase, `org_id`/`organisation_id`
  drift, flat/nested source fields, role junction table, line items)
- `src/lib/dataLayer.js` — `loadAll()` plus per-entity CRUD methods

The UI (`src/FeltBodyCRM.jsx`) is the original prototype with the storage
layer swapped out. Component code wasn't touched — only the root component's
state setup and mutation handlers.

## Local development

1. Install: `npm install`
2. Copy env template: `cp .env.example .env.local`
3. Fill in the publishable key from the Supabase dashboard
   (Project Settings → API → publishable key)
4. Run: `npm run dev`

Open `http://localhost:5173`. Sign in with your email; click the magic link.
Session persists in localStorage; `npm run dev` restarts won't kick you out.

## Deployment to Cloudflare Pages

1. Push to a GitHub repo (private)
2. Cloudflare Pages → Create project → Connect to repo
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output: `dist`
4. Environment variables (set both for Production and Preview):
   - `VITE_SUPABASE_URL` = `https://fysbgkcwfyanrpgtnzxx.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (from Supabase dashboard)
5. Custom domain: `crm.thefeltbody.com` → DNS will be auto-configured
6. Add the production domain to Supabase Auth's allowed redirect URLs:
   Supabase → Authentication → URL Configuration → add
   `https://crm.thefeltbody.com` to "Redirect URLs"

## What works

- Auth: magic-link sign-in, session persistence, sign-out
- Read: `loadAll()` fetches all 11 entities through `active_*` views and
  `packages_with_usage`
- Write: every mutation in the original UI now goes through the data layer.
  Modal saves wait for the server (so IDs and DB defaults are real before
  the UI updates). Toggles and quick-actions update optimistically with
  no rollback (next `loadAll()` reconciles on refresh).
- Errors surface as alerts. Replace with a toast component when one's worth
  building.

## Known follow-ups

Tracked in chat memory:

- `interactions` has duplicate permissive RLS policies that bypass
  owner-scoping. Doesn't matter for single-user; matters when a second user
  logs in.
- `payments.organisation_id` and `sessions.organisation_id` use long form
  while other tables use `org_id`. Data layer normalises to `orgId` at the
  boundary; tidy when convenient.

App-level:

- The error UI is a browser `alert()`. Build a toast.
- No realtime subscriptions yet — to see another tab's changes you have to
  refresh. Supabase Realtime can wire that up cheaply when needed.
- `package_uses` table exists but isn't read or written; the JSX still uses
  the legacy `attendance.packageId` link plus `packages.sessions_used` for
  manual offsets. That's fine for now; revisit if usage analytics matter.
- Built-in org types and person roles are still hard-coded in JSX as
  `ORG_META` and `PERSON_ROLES`. The DB has them in `org_type_meta` /
  `person_role_meta` (with `is_builtin = true`) but the UI doesn't read them.
  Consolidate one source of truth when you have a reason to.
