# Document storage — deploy steps (morning)

Full assembled-app esbuild build is **green**. All six files below were validated
together from the `FeltBodyCRM.jsx` entry point (no cross-module errors).

## File placement (into `C:\dev\FeltBodyCRM`)

| File in this folder        | Goes to repo path                  | Change          |
|----------------------------|------------------------------------|-----------------|
| `migration-files-documents.sql` | (run in Supabase, not committed) | new             |
| `mappers.js`               | `src/lib/mappers.js`               | + file mappers  |
| `dataLayer.js`             | `src/lib/dataLayer.js`             | + files module  |
| `documents.jsx`            | `src/components/documents.jsx`     | **new file**    |
| `views.jsx`                | `src/components/views.jsx`         | + 2 nav items   |
| `FeltBodyCRM.jsx`          | `src/FeltBodyCRM.jsx`              | state/handlers/routing |

(Adjust `src/` prefix to match your actual tree — paths shown are relative to
the import roots `./lib` and `./components`.)

## Order of operations

1. `git pull` (two-machine hazard — always first).
2. **Run the SQL migration** statement-by-statement in the Supabase SQL editor.
   Do NOT paste the whole file as one block (BEGIN/COMMIT silent-rollback). Run
   the audit queries at the bottom to confirm bucket + policies + view + GRANTs.
3. Copy the five code files into place.
4. `git diff --stat` — confirm exactly 5 files changed (4 modified, 1 new).
   Do NOT chain cp+add+commit; eyeball the diff first.
5. Local build to be doubly sure: `npm run build` (or `npx vite build`).
6. Commit + push (auto-deploys via Cloudflare Pages).

## Suggested commit

```
git add src/lib/mappers.js src/lib/dataLayer.js src/components/documents.jsx \
        src/components/views.jsx src/FeltBodyCRM.jsx
git commit -m "Add manual document storage + care-home resources

- files table + client-documents private bucket (50MB cap, owner-scoped RLS)
- fileFromDb/fileToDb mappers; active_files view loaded in loadAll
- data.files module: upload (storage+row, orphan rollback), signedUrl,
  update, remove (soft-delete row + hard-delete object)
- DocumentsView (list/filter/upload/open/delete; embedded mode for detail pages)
- CareHomeResourcesView: settings-backed pitch PDF link + copyable call scripts
- sidebar: Documents (client mode) + Care Home Resources (under Care Homes)"
git push
```

## Notes / decisions

- **Care-home links + scripts live in `settings` (`care_home_resources` key)**, not
  the files table — they're config, editable without redeploy, matching the
  `my_addresses` pattern. No migration needed for them; the key is created on
  first save.
- **`active_files` view**: if you ever ALTER `files` to add a column, DROP+CREATE
  the view and re-audit its column list against the mapper (known view-drift trap).
- **Backups**: storage objects are NOT covered by `pg_dump`. When documents
  become load-bearing, add a separate storage backup (Supabase CLI / S3 sync).
- **Embedded mode**: `DocumentsView` accepts `embedded` + `anchor={{personId}}` /
  `{{orgId}}` props — ready to drop onto PersonDetail/OrgDetail later with the
  same handlers, no new plumbing.
- **Not yet wired**: attachment send (Brevo, workflow 2) and inbound attachment
  capture (log-worker MIME parse, workflow 3) — separate builds as discussed.
