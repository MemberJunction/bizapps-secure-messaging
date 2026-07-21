# MJ Secure Messaging — Technical Overview

## What Is It?

MJ Secure Messaging is a free, open-source MemberJunction OpenApp that adds a "Secure Web" channel type for encrypted, token-based conversations with external contacts. It provides an embeddable Angular Element widget (`<mj-secure-messaging>`) that any website can drop in to offer secure messaging — no passwords, no email, no SMS — with full integration into MJ's AI processing and approval workflows.

## The Problem

When an MJ-powered AI agent handles customer support via email or SMS, sensitive conversations (PII exchange, renewal requests, document collection, financial discussions) present a security risk. Email content lives on external mail servers, SMS is inherently insecure, and neither provides a controlled audit trail. Organizations need a way to redirect sensitive conversations to a secure, auditable channel where data stays in their own database.

## How It Works

### End-to-End Flow

```
1. AI agent detects sensitive conversation
   ↓
2. Server creates PortalSession → generates token (sm_*)
   ↓
3. Contact receives link: https://yoursite.com/secure?token=sm_abc123...
   ↓
4. Contact clicks link → page loads <mj-secure-messaging> widget
   ↓
5. Widget validates token via REST API → session established
   ↓
6. Contact types message → POST /threads/:threadId/messages
   ↓
7. ChannelMessage created with GenerationStatus='Read', IsSecure=true
   ↓
8. MJ's standard pipeline: AI agent processes → generates reply
   ↓
9. Approval workflow (if enabled): human reviews → approves/rejects
   ↓
10. Approved reply visible in widget via GET /threads/:threadId/messages
```

### Authentication Model

The app uses **opaque token authentication** — no passwords, no OAuth, no user accounts required.

**Session Tokens (`sm_*` prefix):**
- 256-bit cryptographically random, base64url-encoded
- 7-day TTL, extended on each access (sliding window)
- Stored as SHA-256 hashes only — raw tokens never persisted
- Delivered once to the contact (via link), never retrievable again

**Magic Links (`sm_ml_*` prefix):**
- For re-authentication when a session has expired
- 15-minute TTL, single-use
- Redeemed into a fresh session token
- Marked as 'Used' after redemption — cannot be replayed

**Lifecycle:**
```
Token created → Active (7 days, sliding)
                 ↓ expires
              Expired → Magic link requested → Pending (15 min)
                                                ↓ redeemed
                                             Used → New session token
                 ↓ admin action
              Revoked (permanent)
```

---

## Architecture

```
mj-secure-messaging/
├── mj-app.json                     # OpenApp manifest (install config)
├── migrations/                     # SQL schema (Skyway engine)
│   └── V202602230000__v1.0.x__Initial_Schema.sql
├── metadata/                       # MJ entity/channel registrations
│   ├── entities/                   # Portal Sessions, Portal Magic Links
│   ├── channel-types/              # "Secure Web" channel type
│   └── communication-providers/    # "Secure Web" provider
├── packages/
│   ├── server/                     # Core server logic
│   │   ├── services/
│   │   │   ├── PortalAuthService.ts
│   │   │   └── SecureWebCommunicationProvider.ts
│   │   ├── handlers/
│   │   │   ├── auth.ts
│   │   │   ├── messages.ts
│   │   │   ├── attachments.ts
│   │   │   └── middleware.ts
│   │   └── routes.ts
│   ├── server-bootstrap/           # MJ startup registration
│   ├── ng-secure-messaging/        # Angular Element widget
│   │   ├── src/app/
│   │   │   ├── components/
│   │   │   │   ├── secure-messaging/   # Root (<mj-secure-messaging>)
│   │   │   │   ├── conversation/       # Message list + compose
│   │   │   │   ├── auth-view/          # Loading/expired/error states
│   │   │   │   ├── message-bubble/     # Individual message display
│   │   │   │   └── compose-box/        # Message input
│   │   │   └── services/
│   │   │       ├── api.service.ts      # HTTP client
│   │   │       └── auth.service.ts     # Auth state management
│   │   ├── build_element.sh            # Bundles into single JS file
│   │   └── dist/mj-secure-messaging.js # Output: embeddable widget
│   └── ng-bootstrap/               # Staff UI + client bootstrap (MJ Explorer)
│       └── src/lib/
│           ├── secure-messaging-executive.resource.ts  # MJ resource + two-lens coordinator
│           ├── secure-messaging-executive.component.ts  # Inbox (triage)
│           ├── secure-messaging-client-workspace.component.ts  # Contact 360 (embeddable)
│           ├── secure-messaging-action-panel.component.ts  # Shared request/signature panel
│           └── secure-messaging.contracts.ts           # @Input/@Output contract types
└── test/
    ├── demo.html                   # Widget demo page
    ├── test-endpoints.sh           # Integration test suite (12 tests)
    └── seed-test-data.sql          # Test data setup
```

### Staff Surfaces (two lenses)

Staff get two complementary surfaces, both rendered through the single `SecureMessagingResource` MJ entry point:

- **Executive Inbox** (`secure-messaging-executive.component`) — message-centric triage across all contacts.
- **Client Workspace** (`secure-messaging-client-workspace.component`) — contact-centric 360 for one contact (threads, requests, signatures, documents, session/security, audit), with a basic/advanced toggle.

`SecureMessagingResource` is the **coordinator**: it swaps between the two and persists view state (`view`/`contactId`/`threadId`) to its query params, so refresh and browser back/forward restore the right lens. Navigation flow: inbox → (click contact) → workspace → (click thread) → inbox focused on that thread → (Back) → workspace. All internal — the app registers **one** nav item ("Inbox") and stays drop-in.

**Two consumption modes, one contract.** The components expose a host-agnostic `@Input`/`@Output` contract (`secure-messaging.contracts.ts`). In the standalone OpenApp, `SecureMessagingResource` is the host. Any other MJ Angular app can instead embed `<mj-secure-messaging-client-workspace>` directly (import `SecureMessagingModule` from `@mj-biz-apps/secure-messaging-ng-bootstrap`), binding `contactId` and reacting to `openThreadRequested`/`actionCompleted`/`modeChanged`. See the README "Client Workspace" section for the embed contract.

---

## Database Schema

Created in the `__mj_BizAppsSecureMessaging` schema.

### PortalSession

Tracks active secure messaging sessions between a contact and a channel/thread.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER (PK) | Session identifier |
| ChannelID | UNIQUEIDENTIFIER (FK) | The MJ Channel this session belongs to |
| ContactID | UNIQUEIDENTIFIER (FK) | The external contact |
| ThreadID | NVARCHAR(255) | Conversation grouping key |
| TokenHash | NVARCHAR(128) | SHA-256 hash of the `sm_*` token |
| Status | VARCHAR(20) | `Active`, `Expired`, `Revoked` |
| ExpiresAt | DATETIMEOFFSET | When the session expires (7-day sliding window) |
| LastAccessedAt | DATETIMEOFFSET | Last time the token was validated |

### PortalMagicLink

Single-use re-authentication links for expired sessions.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER (PK) | Magic link identifier |
| PortalSessionID | UNIQUEIDENTIFIER (FK) | Parent session |
| TokenHash | NVARCHAR(128) | SHA-256 hash of the `sm_ml_*` token |
| Status | VARCHAR(20) | `Pending`, `Used`, `Expired` |
| ExpiresAt | DATETIMEOFFSET | 15-minute TTL |
| UsedAt | DATETIMEOFFSET | Timestamp when redeemed (null if unused) |

### Security Properties

- **No plaintext tokens in the database** — only SHA-256 hashes stored
- **Tokens are generated once and delivered** — cannot be retrieved from the database
- **Sessions can be revoked** by setting `Status = 'Revoked'`
- **Magic links are single-use** — marked `Used` after redemption

---

## REST API

Mounted at `/secure-messaging/api/v1` on the MJ API server.

### Public Routes (No Auth Required)

#### POST /auth/validate
Validates a session token from the initial redirect URL.

```
Request:  { "token": "sm_abc123..." }
Response: { "sessionId": "uuid", "contactEmail": "...", "channelId": "uuid", "threadId": "...", "token": "sm_abc123..." }
Status:   200 (valid) | 401 (invalid/expired) | 400 (missing)
```

Side effect: Extends session TTL by 7 days on success.

#### POST /auth/magic-link
Requests a new magic link for an expired session.

```
Request:  { "sessionId": "uuid" }
Response: { "success": true, "magicLinkToken": "sm_ml_..." }
Status:   200 (success) | 400 (invalid session) | 500 (error)
```

#### POST /auth/magic-link/redeem
Redeems a magic link into a fresh session token.

```
Request:  { "token": "sm_ml_..." }
Response: { "sessionId": "uuid", "contactEmail": "...", "channelId": "uuid", "threadId": "...", "token": "sm_new..." }
Status:   200 (success) | 401 (invalid/expired/used) | 500 (error)
```

Side effect: Marks magic link as `Used`, generates new session token, extends TTL.

### Protected Routes (Require `Authorization: Bearer sm_*`)

#### GET /threads/:threadId/messages
Fetches all messages in a thread, ordered by `ReceivedAt ASC`.

```
Response: { "messages": [{ "id": "uuid", "sender": "...", "subject": "...", "content": "...", "receivedAt": "...", "generationStatus": "...", "approvedReply": "..." }] }
Status:   200 (success) | 403 (wrong thread) | 500 (error)
```

#### POST /threads/:threadId/messages
Creates a new inbound message from the contact.

```
Request:  { "content": "...", "subject": "..." }
Response: { "messageId": "uuid", "status": "created" }
Status:   201 (created) | 400 (empty content) | 403 (wrong thread) | 500 (error)
```

The created ChannelMessage has `GenerationStatus = 'Read'` and `IsSecure = true`, so it enters MJ's standard AI processing pipeline immediately.

#### GET /threads/:threadId/attachments
Lists all attachments for messages in the thread.

```
Response: { "attachments": [{ "id": "uuid", "messageId": "uuid", "filename": "...", "contentType": "...", "size": 1234 }] }
Status:   200 (success) | 403 (wrong thread) | 500 (error)
```

#### POST /threads/:threadId/attachments
File upload endpoint (currently returns 501 — not yet implemented).

---

## Server Components

### PortalAuthService

Static singleton that manages all session and magic link operations.

**Key methods:**
- `createSession(channelId, contactId, threadId, systemUser)` — Generates token, stores hash, returns raw token (one-time delivery)
- `validateSessionToken(rawToken, systemUser)` — Hashes token, looks up active session, extends TTL, returns session context
- `generateMagicLink(sessionId, systemUser)` — Creates single-use re-auth link with 15-minute TTL
- `redeemMagicLink(rawToken, systemUser)` — Validates and consumes magic link, generates fresh session token

**Configuration (overridable for BCSaaS):**
- `contactEntityName` — Default `'Contacts'`, set to `'BC: Contacts'` for BCSaaS
- `contactEmailField` — Default `'Email'`

### SecureWebCommunicationProvider

Implements MJ's `BaseCommunicationProvider` interface, registered as `@RegisterClass(BaseCommunicationProvider, 'Secure Web')`.

This is a **minimal provider by design** — messages live in MJ's database and are served to the widget via the REST API. No external service integration (no SMTP, no Twilio, no MS Graph).

**Supported operations:**
- `SendSingleMessage` — Creates a ChannelMessage record
- `GetMessages` — Returns empty (messages come via REST API)
- `ReplyToMessage` — Creates outbound ChannelMessage for approved replies

### Express Routes

```
/secure-messaging/api/v1/
├── POST /auth/validate              (public)
├── POST /auth/magic-link            (public)
├── POST /auth/magic-link/redeem     (public)
├── [portalAuthMiddleware]           (bearer token validation)
├── GET  /threads/:threadId/messages (protected)
├── POST /threads/:threadId/messages (protected)
├── GET  /threads/:threadId/attachments (protected)
└── POST /threads/:threadId/attachments (protected)
```

CORS allows all origins — the widget is designed to be embedded on external sites. Security is enforced via opaque bearer tokens, not origin restrictions.

---

## Client Widget

### Embedding

The widget bundles into a single JavaScript file with zero external dependencies:

```html
<script src="https://cdn.example.com/mj-secure-messaging.js"></script>
<mj-secure-messaging
  api-base-url="https://api.example.com/secure-messaging/api/v1"
  brand-color="#1a73e8"
></mj-secure-messaging>
```

The `<mj-secure-messaging>` element is a Web Component (Angular Element), so it works on any website regardless of framework — React, Vue, static HTML, WordPress, etc.

### Widget Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `api-base-url` | REST API base URL | `${window.location.origin}/secure-messaging/api/v1` |
| `token` | Session token (if not in URL) | Reads from `?token=` URL param |
| `brand-color` | Header/button color (hex) | `#1a73e8` |

### Widget Events (CustomEvent)

| Event | Payload | When |
|-------|---------|------|
| `session-ready` | `{ sessionId, contactEmail, threadId }` | Auth succeeds |
| `session-expired` | — | Token invalid or expired |
| `message-sent` | `{ messageId }` | User sends a message |

### Client Auth Flow

```
Page loads → read ?token= from URL
  ↓
POST /auth/validate
  ↓ success                    ↓ failure (401)
Clear token from URL           Show "Session Expired" view
Store token in memory only     Offer magic link re-auth
Show conversation view
  ↓
GET /threads/:threadId/messages → display messages
  ↓
User types → POST /threads/:threadId/messages → refresh list
```

### Build Process

```bash
cd packages/ng-secure-messaging
npm run build:bundle    # → dist/mj-secure-messaging.js
```

The `build_element.sh` script:
1. Runs `ng build` (Angular AOT compilation)
2. Wraps polyfills and main bundles in IIFEs (prevents global collisions)
3. Injects CSS as a `<style>` tag via JavaScript
4. Outputs a single self-contained JS file

---

## Integration with MJ's Channel Pipeline

The key design principle: **secure web messages are just ChannelMessages.** They flow through the exact same pipeline as email and SMS messages.

### Inbound Message

When a contact sends a message through the widget:

```
Widget → POST /threads/:threadId/messages
  ↓
Handler creates ChannelMessage:
  - ChannelID = session's channel
  - ContactID = session's contact
  - MessageContent = user's message
  - GenerationStatus = 'Read'    ← triggers AI processing
  - IsSecure = true              ← marks as sensitive
  - ThreadID = session's thread
  ↓
MJ pipeline picks up:
  - Izzy - Single Message agent runs
  - LLM generates reply
  - Confidence evaluation
  - Auto-approve or queue for human review
  ↓
ChannelMessage updated:
  - GenerationStatus = 'Generated'
  - GeneratedReplyContent = AI's reply
  - ApprovalStatus = 'Approved' or 'Pending'
```

### Outbound Reply

When a reply is approved (automatically or by a human):

```
ApprovalStatus → 'Approved'
  ↓
SecureWebCommunicationProvider.ReplyToMessage()
  ↓
Creates outbound ChannelMessage with approved content
  ↓
Widget polls GET /threads/:threadId/messages
  ↓
Contact sees the reply in the conversation
```

### What "Secure Web" Channels Share with Email/SMS

- AI agent processing (same agents, same prompts)
- Approval workflows (same approval UI, same rules)
- Confidence scoring and auto-approval
- Skip/rejection logic
- Audit trail (AIAgentRun, AIAgentRunStep records)
- Organization settings inheritance
- Channel actions

### What's Different

- No external API (no MS Graph, no Twilio) — messages stay in the database
- Token-based auth instead of email credentials
- `IsSecure = true` flag on all messages
- No email sending on approval — reply is served via REST API instead

---

## Metadata Registration

The app registers itself with MJ via metadata JSON files:

### Entities
- **Portal Sessions** → `__mj_BizAppsSecureMessaging.PortalSession`
  - Available via GraphQL (`IncludeInAPI: true`)
  - Create/Update allowed, Delete disabled (sessions must expire naturally)
  - Change tracking enabled
- **Portal Magic Links** → `__mj_BizAppsSecureMessaging.PortalMagicLink`
  - Same API settings as Portal Sessions

### Channel Type
- **Secure Web** — new channel type alongside Email, SMS, etc.
  - Linked to the "Secure Web" communication provider
  - `ActionInheritMode: 'Combined'` — inherits org-level actions

### Communication Provider
- **Secure Web** — registered via `@RegisterClass(BaseCommunicationProvider, 'Secure Web')`
  - No external credentials required
  - Messages stored and served from MJ's database

---

## Installation

As an MJ OpenApp, installation is handled by MJ's app loader:

```bash
mj app install https://github.com/MemberJunction/bizapps-secure-messaging
```

This:
1. Creates the `__mj_BizAppsSecureMessaging` schema (if not exists)
2. Runs migrations (creates `PortalSession` and `PortalMagicLink` tables)
3. Syncs metadata (registers entities, channel type, communication provider)
4. Installs server bootstrap package (auto-registers on API startup)
5. Installs client bootstrap package (for MJ Explorer integration)

### Post-Install Setup

1. **Create a "Secure Web" channel** for your organization in MJ
2. **Build the widget**: `cd packages/ng-secure-messaging && npm run build:bundle`
3. **Host `mj-secure-messaging.js`** on your CDN or website
4. **Embed the widget** on your secure messaging page
5. **Configure your AI agent** to create PortalSessions when sensitive conversations are detected

---

## Testing

### Integration Tests (`test/test-endpoints.sh`)

12-endpoint test suite:
1. Validate valid token → 200
2. Validate invalid token → 401
3. Validate missing token → 400
4. Get messages without auth → 401
5. Get messages with auth → 200
6. Get messages from wrong thread → 403
7. Create message → 201
8. Create message with empty content → 400
9. Verify created message appears → 200
10. Get attachments → 200
11. Request magic link → 200
12. Redeem magic link → 200

### Demo Page (`test/demo.html`)

Loads the widget and listens for events — useful for visual testing during development.

### Test Data (`test/seed-test-data.sql`)

SQL template that creates test Contact, Channel, PortalSession, and PortalMagicLink records with known token hashes.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **SHA-256 hashed tokens, never plaintext** | Database breach doesn't expose session tokens |
| **Sliding 7-day session TTL** | Balances security (no indefinite sessions) with UX (no constant re-auth) |
| **Single-use magic links with 15-min TTL** | High security for re-auth; short window limits exposure |
| **CORS allows all origins** | Widget embedded on external sites; security via opaque tokens, not origin |
| **Token cleared from URL after validation** | Prevents exposure in browser history, referer headers, server logs |
| **Token in memory only (not localStorage)** | Prevents XSS from reading persisted tokens |
| **Standard ChannelMessage pipeline** | Reuses all existing AI, approval, and audit infrastructure |
| **Minimal communication provider** | No external API needed; simpler ops, faster, full data control |
| **Single JS bundle (Angular Element)** | Zero dependencies; trivial embed on any website, any framework |
| **OpenApp packaging** | One-command install; schema, migrations, metadata, and code ship together |
