# Secure Messaging — End-to-End Test Plan

> **Principle: real scenarios, no seeded data.** Every case below creates its own data through
> a real user-facing entry point — the staff UI (MJExplorer), the contact widget, or a real
> Izzy/add-in caller (signed REST / GraphQL `RunAction`). Nothing is inserted directly into the DB.
> Each test states its **entry point**, the **steps**, and the **pass criteria** (what you should
> see in the UI *and* what should be true in the data).

## 0. Prerequisites

| Service | URL | Notes |
|---|---|---|
| MJAPI | http://localhost:4101/ | GraphQL + REST; must be the latest build (promote route + secret) |
| MJExplorer (staff) | http://localhost:4301/ | log in as your MJ user |
| Element widget (contact) | http://localhost:4400/ | opened via `?ml=<magicLinkToken>` |

- `SECURE_MESSAGING_PROMOTE_SECRET` is set in `.env` (required for Test Group D).
- A storage provider (S3/Azure Blob) must be configured in the MJ instance for **file upload /
  download / signature document** tests (Groups E, F). If not configured, those specific cases are
  expected to fail with a storage error — note it as a deployment gap, not a code bug.
- An eSignature provider account (`MJ: Signature Account` — DocuSign/PandaDoc/Dropbox Sign) must
  exist for the signature send tests (Group F).

> **Test data convention:** use a unique contact email per run so threads don't collide, e.g.
> `e2e+<timestamp>@example.com`. Note each thread's ContactEmail / ThreadID as you go; later tests
> reuse the thread you created earlier.

---

## Group A — Staff originates a brand-new secure thread (Compose)

**Feature:** `Start Secure Thread` action via the staff Compose UI. Entry: MJExplorer.

1. MJExplorer → **Secure Messages** app → **Compose** (`onCompose`).
2. Enter a fresh ContactEmail (`e2e+A@example.com`), a contact name, and a first message body.
3. Submit (`submitCompose`).

**Pass:**
- A copyable **magic link** is shown (`?ml=sm_ml_…`).
- A new thread appears in the inbox under that contact, with your first (Outbound) message.
- **Data:** one `PortalSession` (Active) + one `PortalMagicLink` (Pending) + one `SecureMessage`
  (Direction=Outbound, Sender = your MJ user email, IsImported=0).

**Carry forward:** the magic link → Group B.

---

## Group B — Contact authenticates and round-trips (the widget)

**Feature:** magic-link redeem, thread read, contact send. Entry: the widget.

1. Open `http://localhost:4400/?ml=<magic link from Group A>`.
2. **Pass:** widget authenticates (no password) and shows the thread with your Group-A message.
3. Contact types a reply and sends.
   - **Pass:** message appears in the widget thread; **data:** new `SecureMessage`
     Direction=Inbound, Status=New, Sender = the contact email.
4. Reload the widget with the **same** URL.
   - **Pass:** still authenticated (session token persists), full thread still visible.
5. Back in MJExplorer, open the same thread.
   - **Pass:** the contact's reply is visible (Inbound, left side); the conversation shows both
     directions in order.

---

## Group C — Staff replies + triage features (MJExplorer)

All entry points are the staff inbox, operating on the thread from Groups A/B.

| # | Feature | Steps | Pass |
|---|---|---|---|
| C1 | **Reply** (`onSendReply` → `Send Secure Message`) | Open thread, type a reply, send | Outbound row added; appears in widget on next load (re-check Group B widget) |
| C2 | **Read-state** | Click an unread inbound message | Marked Read; **stays** Read after navigating to Client Workspace and back |
| C3 | **Star** (`toggleStar`) | Click the star on a message | Star fills; persists after full page reload; message appears under **Starred** category |
| C4 | **Archive** (`onArchive`) | Select thread → Archive | Thread leaves Inbox, appears under **Archived**; **data:** `PortalSession.IsArchived=1` |
| C5 | **Unarchive** | From Archived, un-archive | Returns to Inbox; `IsArchived=0` |
| C6 | **Soft-delete** (`onDelete`) | Select thread → Delete | Leaves Inbox + all categories except **Trash**; `PortalSession.IsDeleted=1` |
| C7 | **Restore** | From Trash, restore | Returns to Inbox; `IsDeleted=0`; **no row ever hard-deleted** |
| C8 | **Search / sort** (`onSearch`, `toggleSort`) | Search by sender; toggle Date/Sender/Status sort | List filters/reorders correctly |
| C9 | **Nav counts** | Watch category counts as you Star/Archive/Delete | Live counts track the moves in C3–C7 |

---

## Group D — The Izzy / Outlook bridge (promote) — REAL signed caller

**Feature:** `Promote Thread` — import an existing Email/SMS thread into a secure thread. This is
the backbone of both channel bridges (PRD §10). Two real entry points:

### D1 — Signed REST call (simulates Izzy / the Outlook add-in backend)

1. Run the signed test harness with a **fresh** contact email (edit the `contactEmail` in
   `scripts/test-promote.mjs`, or it reuses `promote-test@example.com`):
   ```bash
   SECURE_MESSAGING_PROMOTE_SECRET="<your secret>" \
   PROMOTE_AS_EMAIL="<your-mj-user-email>" \
   node scripts/test-promote.mjs
   ```
2. **Pass:** HTTP 200 with `{ threadId, magicLinkToken, importedCount: 2 }`.
3. **Data:** 2 `SecureMessage` rows for that thread, **IsImported=1, SourceChannel='Email'**,
   original Direction/Sender preserved, original timestamps preserved, Status=Read.
4. **Run-as attribution:** because `PROMOTE_AS_EMAIL` is a real MJ user, the promotion runs as that
   user (not the service account).

### D2 — Contact sees the imported history (the one-way rule)

1. Open the widget with the magic link from D1: `http://localhost:4400/?ml=<token>`.
2. **Pass:** the contact sees the **full prior Email history** (both imported messages) as the
   thread, then can reply securely.
3. **One-way check:** the secure reply the contact sends does **not** appear on any insecure side —
   there is no back-publish path. (We have no live email side here; the assertion is that imported
   messages are flagged `IsImported` and new secure messages are not, and nothing writes back out.)

### D3 — Same verb via GraphQL `RunAction` (the Izzy/MCP path)

1. From MJExplorer (or a GraphQL client), invoke the **Promote Thread** action with
   `ContactEmail`, `SourceChannel='SMS'`, `MessagesJSON=[…]`, optional `ContactName`.
2. **Pass:** returns `ThreadID`, `MagicLinkToken`, `ImportedCount`; same data outcome as D1 but
   `SourceChannel='SMS'`.

### D4 — Auth negative tests (the HMAC guard)

Re-run the harness with a tampered request (wrong secret / no signature / stale timestamp).
**Pass:** each returns **HTTP 401**. With the secret unset in `.env`, `/promote` returns **503**.

---

## Group E — Documents / attachments (contact + staff)

**Feature:** attachment upload/list/download (`MJ: Files` + `MJ: Artifacts`). Requires a configured
storage provider.

| # | Entry | Steps | Pass |
|---|---|---|---|
| E1 | Widget | Contact uploads a document to the thread | File listed; **data:** `MessageFile` row + bytes in storage provider (not in our schema) |
| E2 | Widget/Staff | Download that attachment | Correct bytes returned via pre-authed URL |
| E3 | Staff | View the thread's documents in Client Workspace | Uploaded file appears in the documents section |

---

## Group F — File requests + e-signatures

**Feature:** `File Request` lifecycle + `MJ: Signature Requests` via the eSignature engine.

| # | Entry | Steps | Pass |
|---|---|---|---|
| F1 | Staff | **Request Files** on a thread (title + description) | `FileRequest` row Status=Pending; visible to the contact in the widget |
| F2 | Widget | Contact **fulfills** the request by uploading | Request → Fulfilled; file linked to the thread |
| F3 | Staff | **Send for Signature** (pick a `MJ: Signature Account`, attach a doc) | Signature request created+sent (atomic); provider receives it |
| F4 | Widget | Contact completes the signature at the provider | Status reflects signed after F5 |
| F5 | Staff | **Refresh status** on the signature request | Status updates from the provider |
| F6 | Staff | **Download signed document** | Signed PDF returned |
| F7 | Staff | **Void** a signature request | Request → Voided |

> F3–F7 require a real eSignature provider account. Without one, F3 fails at send — note as a
> deployment gap.

---

## Group G — Session & security

| # | Entry | Steps | Pass |
|---|---|---|---|
| G1 | Widget | Let a session sit, then keep using it | Sliding expiry extends on use (`validateSessionToken`) |
| G2 | Staff | **Revoke** the portal session for a thread | Subsequent widget calls with that token → 401 |
| G3 | Widget | Try an already-used magic link | Rejected (single-use; Status=Used) |
| G4 | Widget | Try an expired magic link (wait > TTL, default 15 min) | Rejected |

---

## Group H — Deep-link / navigation integrity (staff)

| # | Steps | Pass |
|---|---|---|
| H1 | Open a contact's Client Workspace, then a thread; hit browser **Back** | Returns to workspace, then inbox (state in query params) |
| H2 | Deep-link directly to a thread URL; reload | Restores the focused-thread lens |
| H3 | Direct-navigate to the Secure Messages app by URL | Loads without hanging (NotifyLoadComplete fires) |

---

## Coverage matrix (what each group proves)

| Built feature | Covered by |
|---|---|
| Start Secure Thread (compose) | A |
| Magic-link redeem + session persistence | B, G |
| Contact read/send (widget) | B |
| Staff reply (Send Secure Message) | C1 |
| Read-state persistence | C2 |
| Star (per-message) | C3 |
| Archive / Unarchive (per-thread) | C4, C5 |
| Soft-delete / Restore (Trash) | C6, C7 |
| Search / sort / nav counts | C8, C9 |
| **Promote Thread (REST, signed)** | D1, D2, D4 |
| **Promote Thread (GraphQL RunAction)** | D3 |
| **Import provenance (IsImported/SourceChannel)** | D1, D3 |
| **One-way visibility** | D2 |
| Attachments (upload/list/download) | E |
| File requests | F1, F2 |
| E-signatures (send/refresh/void/download) | F3–F7 |
| Session revoke / magic-link single-use+expiry | G |
| Deep-link / back-forward / load-complete | H |
