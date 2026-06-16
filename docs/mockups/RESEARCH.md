# Secure Messaging — Mockup Research & Design Rationale

These three navigable HTML mockups were produced **after** studying (1) the current
app, (2) competing products, and (3) MemberJunction's current styling system. This
note records what was learned and why the designs look the way they do.

## How to view

Open `index.html` in a browser (no build step, no server required). Every screen is
clickable; the dark bar at the top of each prototype links between them.

| File | Surface | Audience |
|------|---------|----------|
| `index.html` | Launcher + competitive matrix | — |
| `1-executive-inbox.html` | 3-pane inbox, AI reply, audit | Staff (inside MJ Explorer) |
| `2-client-portal.html` | Chat + to-do + docs + e-sign | External contact |
| `3-client-workspace.html` | Client 360 + session + audit | Staff |

---

## 1. Study of the current tool

Source: `README.md`, `OVERVIEW.md`, the migrations, and the live Angular components
(`secure-messaging-executive.component.ts`, `conversation.component.ts`).

**What exists today:**

- **Executive Inbox** (staff): dark slate sidebar, message list, detail pane with
  reply bar, plus *Request files* and *Send for signature* action panels.
- **Contact widget** (`<mj-secure-messaging>`): chat-style conversation, compose box,
  file-request banners, signature-request banners, attachment chips.
- **Data model** (schema `__mj_BizAppsSecureMessaging`): `PortalSession`, `PortalMagicLink`,
  `SecureMessage`, `MessageFile`, `FileRequest`. E-signature is handled by the core MJ
  eSignature subsystem (`@memberjunction/esignature` + DocuSign / PandaDoc / Dropbox Sign
  drivers); signature requests live in `MJ: Signature Requests`, linked back to a portal
  session via the engine's polymorphic `EntityID`/`RecordID`.
- **Auth**: opaque `sm_*` session tokens (SHA-256 hashed, 7-day sliding TTL) and
  single-use `sm_ml_*` magic links — **passwordless**.
- **Pipeline**: inbound messages enter MJ's standard `ChannelMessage` flow → AI agent
  drafts a reply → confidence scoring → auto-approve or human review.
- **Audit**: every change is captured by MJ Record Changes + `AIAgentRun` steps —
  but this is **not surfaced in the UI** today.

**Conclusion:** the backend already supports far more than the UI shows. The biggest
wins are *surfacing* existing capability (audit trail, AI drafts, file/signature
requests, per-client grouping) rather than building new infrastructure.

## 2. Study of competitors

### TitanFile (the "Titan")
A secure file-sharing + client-collaboration platform for legal, accounting, and
financial services. Key patterns:

- **Per-client / per-matter secure workspaces** — files *and* messages organized
  together in one place ("access files and messages in one centralized location").
- **Email-like simplicity** — clients click "Access Files" from a notification and are
  collaborating in under 60 seconds, no IT, no installs.
- **Two-way collaboration** — send *and* receive unlimited files + messages.
- **Secure Submit** — a custom link where clients fill a form and attach files
  (directly analogous to our `FileRequest`).
- **Audit trails as a headline feature** — timestamped records of all activity,
  **proof of delivery** and **proof of access**, exportable reports.
- **Compliance badges everywhere** — SOC 2 Type II, HIPAA, GDPR, PIPEDA, AES-256,
  2FA, data-residency choice (US / Canada / Europe).

### Liscio
Client communication + document platform for accounting firms:

- **Mobile-first secure messaging** in a closed network.
- **Built-in e-signature** with a **guided** signing experience that coaches the
  client through each step.
- **Tasks / follow-ups** integrated into the conversation (smart tax organizer).
- **AI assistant** for firms.

### Common table stakes across the category
1. Per-client workspaces unifying messages + files.
2. Two-way secure exchange in one surface.
3. File requests / secure submit.
4. Guided e-signature.
5. **Audit trail with proof of delivery + access** (the compliance differentiator).
6. Prominent security/compliance badges.
7. Client-side tasks / to-do.
8. Zero-friction client onboarding; responsive/mobile.

## 3. Study of MJ styling

Source: `packages/Angular/Generic/shared/src/lib/_tokens.scss` and the Dashboard /
Explorer chrome guides.

- Font: **Inter** (`-apple-system` fallback).
- Brand primary `#0076b6`; slate-dark sidebar gradient `#1e293b → #0f172a` is the
  app's existing signature and was preserved.
- Surfaces `#ffffff / #f8fafc / #f1f5f9`; borders `#e2e8f0 / #cbd5e1`;
  text `#1e293b / #475569 / #64748b / #94a3b8`.
- Status colors: success `#22c55e`, warning `#f59e0b`, error `#ef4444`, info `#3b82f6`.
- Radii 4 / 8 / 12 / 16; shadow scale sm→xl; the staff app maps these through
  Material 3 `--mat-sys-*` tokens.

All of these are inlined in `shared.css` so the mockups render natively-looking
without the MJ runtime. In the real components they'd reference the live tokens and
inherit dark mode automatically.

---

## Design decisions per mockup

**1 · Executive Inbox** keeps the familiar 3-pane layout but adds:
- an **AI-drafted reply card** (confidence bar, Approve / Edit / Regenerate) that makes
  the existing AI + approval pipeline visible and actionable;
- **Conversation / Files / Activity** tabs, where *Activity* is the per-message audit
  timeline with proof-of-delivery / proof-of-access chips (TitanFile parity);
- a **Workflows** nav section (File Requests, Documents, Signatures) so those
  entities become first-class.

**2 · Client Portal** turns the embeddable widget into a friendly hosted experience:
- **Messages / To-Do / Documents** tabs — the To-Do list is the Liscio-style task
  surface, driven by open `FileRequest` / `MJ: Signature Requests` rows;
- **guided e-signature** modal (review → sign → submit) and a secure **upload** modal;
- **live brand-color theming** (matches the widget's `brand-color` / `--sm-brand-color`);
- the **session-expired → magic-link** state, showcasing passwordless re-auth.

**3 · Client Workspace** is the differentiator and leans into our strengths:
- a **per-client 360** unifying threads, requests, signatures, and documents
  (TitanFile workspace pattern, but staff-side);
- a **Session & Security** panel exposing token status, sliding expiry, data
  residency, and **revoke** / **send new link** controls;
- a complete, **exportable audit trail** — the compliance story regulators ask for.

## Suggested next steps

1. Pick a direction (or merge — the three are complementary, not mutually exclusive).
2. Wire the AI-reply card to the real approval workflow surfaced from `AIAgentRun`.
3. Surface the audit timeline from MJ Record Changes / `AIAgentRunStep`.
4. Promote `FileRequest` / `MJ: Signature Requests` into the client To-Do list.
5. Add compliance badges + a per-session "revoke / re-issue" admin control.
