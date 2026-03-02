# MJ Secure Messaging

A free MemberJunction Open App that adds a **Secure Web** channel for encrypted, token-based conversations with external contacts. Installs as a native MJ Explorer application — staff manage messages from a full inbox view inside MJ Explorer, while external contacts interact through an embeddable widget on your website.

## The Problem

When an MJ-powered AI agent handles customer interactions via email or SMS, sensitive conversations — renewals, document collection, PII exchange — present a security risk. Email content lives on external mail servers, SMS is inherently insecure, and neither provides a controlled audit trail. Organizations need a way to redirect sensitive conversations to a secure, auditable channel where data stays in their own database.

## How It Works

```
AI agent detects sensitive conversation
  → Server creates PortalSession + generates token
  → Contact receives secure link via email/SMS
  → Contact clicks link → widget validates token
  → Conversation continues securely in the browser
  → Messages flow through MJ's standard AI pipeline
  → Staff manage and reply from the MJ Explorer inbox
```

**Key benefits over email:**
- Sensitive content stays in your database, not scattered across email servers
- Session tokens expire and can be revoked
- No passwords — token-based and magic link authentication
- Messages flow through MJ's standard ChannelMessage pipeline (AI, approvals, audit)

## Executive Inbox (MJ Explorer)

After installation, **Secure Messages** appears as a first-class application in the MJ Explorer app switcher. Staff see a 3-pane inbox — sidebar navigation, message list, and full message detail with reply — built on MJ's design tokens so it automatically inherits your organization's light/dark theme.

![Secure Messages Executive Inbox](docs/images/executive-view.png)

**Features:**
- Unread indicators and badge counts
- Status badges: NEW, DELIVERED, NEEDS REVIEW, REPLIED
- Starred messages
- Search and sort (by date, sender, or status)
- End-to-end encryption indicator per message
- Attachment display
- Inline reply bar

## Installation

```bash
mj app install https://github.com/MJ-Central/app-secure-messaging
```

This will:
1. Create the `secure_messaging` database schema
2. Run migrations (PortalSession, PortalMagicLink tables)
3. Register the "Secure Web" channel type and communication provider
4. Register the Secure Messages application in MJ Explorer
5. Install server and client bootstrap packages

## Embedding the Contact Widget

For external contacts to initiate and continue secure conversations, embed the Angular Element widget on your website:

```html
<script src="mj-secure-messaging.js"></script>
<mj-secure-messaging
  api-base-url="https://yoursite.com/secure-messaging/api/v1"
  brand-color="#1a73e8"
></mj-secure-messaging>
```

Build the widget bundle:

```bash
cd packages/ng-secure-messaging
npm install
npm run build:bundle
```

### Widget Theming

```css
mj-secure-messaging {
  --sm-brand-color: #0076B6;
  --sm-text-color: #333;
  --sm-bg-color: #fff;
  --sm-header-bg: #F4F4F4;
  --sm-border-color: #D9D9D9;
  --sm-bubble-inbound-bg: #F4F4F4;
}
```

### Widget API

| Attribute | Description | Default |
|-----------|-------------|---------|
| `api-base-url` | Base URL for the Secure Messaging API | Inferred from current origin |
| `token` | Session token (or reads from URL `?token=` param) | — |
| `brand-color` | Hex color for header and buttons | `#1a73e8` |

| Event | Detail | Description |
|-------|--------|-------------|
| `session-ready` | `{ sessionId, contactEmail, threadId }` | Auth succeeded |
| `session-expired` | — | Token invalid or expired |
| `message-sent` | `{ messageId }` | User sent a message |

## REST API

Mounted at `/secure-messaging/api/v1`.

**Auth (public):**
- `POST /auth/validate` — Validate a session token
- `POST /auth/magic-link` — Request a magic link
- `POST /auth/magic-link/redeem` — Redeem a magic link

**Messages (protected — `Authorization: Bearer sm_*`):**
- `GET /threads/:threadId/messages` — Get thread messages
- `POST /threads/:threadId/messages` — Send a message

**Attachments (protected):**
- `GET /threads/:threadId/attachments` — List attachments
- `POST /threads/:threadId/attachments` — Upload an attachment

## Authentication Model

**No passwords, no OAuth, no user accounts required.**

- **Session tokens** (`sm_*`): 256-bit random, SHA-256 hashed in DB, 7-day sliding TTL
- **Magic links** (`sm_ml_*`): Single-use re-auth, 15-minute TTL, redeemed into a fresh session token
- Raw tokens are never stored — only SHA-256 hashes exist in the database

## Architecture

```
mj-secure-messaging/
├── mj-app.json                    # Open App manifest
├── migrations/                    # Skyway SQL migrations
├── metadata/
│   ├── applications/              # Registers Secure Messages in MJ Explorer
│   ├── entities/                  # PortalSession, PortalMagicLink entities
│   ├── channel-types/             # Secure Web channel type
│   └── communication-providers/   # Secure Web provider
├── packages/
│   ├── server/                    # Auth service, REST API, communication provider
│   ├── server-bootstrap/          # Server startup registration
│   ├── ng-secure-messaging/       # Angular Element widget (external contacts)
│   └── ng-bootstrap/              # MJ Explorer Executive inbox + app registration
└── test/                          # Demo page, API test scripts, UI previews
```

## Requirements

- MemberJunction >= 5.0.0
- SQL Server (for `secure_messaging` schema)
- Node.js >= 20

## License

MIT
