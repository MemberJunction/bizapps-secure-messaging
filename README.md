# MJ Secure Messaging

A free MemberJunction Open App that adds a **Secure Web** channel type for encrypted conversations with external contacts through an embeddable widget.

## What It Does

When an MJ-powered AI agent encounters a sensitive conversation (e.g., a renewal request, document collection, PII exchange), it can redirect the external contact from email/SMS to a secure web portal. The contact clicks a link, lands on the organization's website, and continues the conversation securely — with full AI processing, approval workflows, and file upload support.

**Key benefits over email:**
- Sensitive content stays in your database, not scattered across email servers
- Session tokens expire and can be revoked
- No passwords — token-based and magic link authentication
- Messages flow through MJ's standard ChannelMessage pipeline

## Installation

```bash
mj app install https://github.com/MJ-Central/app-secure-messaging
```

This will:
1. Create the `secure_messaging` database schema
2. Run migrations (PortalSession, PortalMagicLink tables)
3. Register the "Secure Web" channel type and communication provider
4. Install server and client bootstrap packages

## Usage

### 1. Create a Secure Web Channel

After installation, create a new channel with the "Secure Web" channel type for your organization.

### 2. Embed the Widget

Build the Angular Element and add it to any page on your website:

```html
<script src="mj-secure-messaging.js"></script>
<mj-secure-messaging
  api-base-url="https://yoursite.com/secure-messaging/api/v1"
  brand-color="#1a73e8"
></mj-secure-messaging>
```

### 3. Generate Session Links

When your AI agent needs to redirect a conversation to a secure channel, it creates a PortalSession and sends the contact a link:

```
https://yoursite.com/secure?token=sm_abc123...
```

The contact clicks the link, the widget validates the token, and the conversation continues securely.

## Widget Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `api-base-url` | Base URL for the Secure Messaging API | Inferred from current origin |
| `token` | Session token (or reads from URL `?token=` param) | — |
| `brand-color` | Hex color for header and buttons | `#1a73e8` |

## Widget Events

| Event | Detail | Description |
|-------|--------|-------------|
| `session-ready` | `{ sessionId, contactEmail, threadId }` | Auth succeeded |
| `session-expired` | — | Token invalid or expired |
| `message-sent` | `{ messageId }` | User sent a message |

## REST API

Mounted at `/secure-messaging/api/v1` (configurable).

**Auth (public):**
- `POST /auth/validate` — Validate a session token
- `POST /auth/magic-link` — Request a magic link
- `POST /auth/magic-link/redeem` — Redeem a magic link

**Messages (protected):**
- `GET /threads/:threadId/messages` — Get thread messages
- `POST /threads/:threadId/messages` — Send a message

**Attachments (protected):**
- `GET /threads/:threadId/attachments` — List attachments
- `POST /threads/:threadId/attachments` — Upload an attachment

## Building the Widget

```bash
cd packages/ng-secure-messaging
npm install
npm run build:bundle
```

Output: `dist/mj-secure-messaging.js` — a single JS file you can host anywhere.

## Architecture

```
mj-secure-messaging/
├── mj-app.json                    # Open App manifest
├── migrations/                    # Skyway SQL migrations
├── metadata/                      # Entity, channel type, provider registrations
├── packages/
│   ├── server/                    # Auth service, REST API, communication provider
│   ├── server-bootstrap/          # Server startup registration
│   ├── ng-secure-messaging/       # Angular Element widget
│   └── ng-bootstrap/              # Client startup registration
└── test/                          # Demo page and API test scripts
```

## Requirements

- MemberJunction >= 5.0.0
- SQL Server (for `secure_messaging` schema)
- Node.js >= 20

## License

MIT
