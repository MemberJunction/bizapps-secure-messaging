# SM-WORLD

Committed integration-test inbox. **Not** app metadata. **Not** `test/seed-test-data.sql`.

`LoadWorld()` upserts through `BaseEntity.Save()` — the same path Explorer uses. Natural keys: person `Email`, thread `Subject`, session `ContactID`, message HTML comment marker, file-request `Title`. Re-running is idempotent and refreshes relative dates so the Executive Inbox stays current.

## How it loads

- **`messaging-world` / CW1–CW6** — the first bundle. COMMITS. Later bundles (when added) should roll back.
- Types / channel providers live in `metadata/` (and optional `metadata-channel-optional/`) and are **looked up**, never invented here.
- People share `com-world.test` with the common/orders directory when that world has run. Missing people are created.

## Contacts and threads

| Contact | Thread | Why it is in the world |
|---|---|---|
| Nora Calhoun | Active — 2026 membership dues | Unread inbound (Inbox / New) + active session |
| Elena Voss | Active — children's catalog standing order | Back-and-forth (Sent + Read inbound) |
| Grace Hopper | Active — engagement letter and W-9 | Pending file request |
| Jordan Blake | Active — switch to secure channel | Promoted from Email (`SourceChannel`, imported history) |
| Alan Turing | Closed — desk copy | Closed lifecycle |
| Marcus Webb | Archived — bulk quote | Archived lifecycle |
| James Whitaker | Active — invoice #4412 | Expired session + pending magic link |
| Ada Lovelace | Active — Style Handbook 4e | Starred inbound + fulfilled file request + PDF |

## Widget tokens

Raw tokens are **not** stored. SHA-256 hashes are. For local widget poking:

| Contact | Raw token | Kind |
|---|---|---|
| Nora | `sm_world_nora_active` | Active session |
| James | `sm_ml_world_james_pending` | Pending magic link (14 min TTL, refreshed on re-run) |
