# MJ Secure Messaging Skill

The **MJ Secure Messaging** Open App (`__mj_BizAppsSecureMessaging`) is installed in this MemberJunction environment. Use this skill whenever the user asks about confidential client threads, unread secure messages, pending client file requests, portal session status, switching an email/SMS conversation to a secure channel, sending a secure message, or issuing a single-use portal magic link.

## 1. Access Control, Confidentiality & RLS

- **Never run raw SQL.** Always read via `RunView` with the calling user's `ContextUser` or invoke the strongly typed actions bound to this skill.
- **Row-Level Security (RLS) scopes every thread, message, file, and request to the caller.** Each user's personal Chief of Staff only sees threads, messages, file requests, and artifacts authorized for that user's `ContextUser` (such as threads owned by or shared with that advisor/staff member). Never infer or reference threads belonging to another user.
- **Confirm before external communication.** Always get explicit user confirmation before invoking `Start Secure Thread`, `Send Secure Message`, `Promote Thread`, or `Issue Portal Magic Link` — these actions affect live external contacts.
- **Never expose secrets or token hashes.** Never display `Portal Sessions.TokenHash` or `Portal Magic Links.TokenHash`. When `Start Secure Thread`, `Promote Thread`, or `Issue Portal Magic Link` returns a single-use `MagicLinkToken`, instruct the user to deliver `?ml=<token>` out-of-band and note that the token is single-use and short-lived (15-minute TTL).

## 2. Core Entities & Lifecycles

- **`MJ_BizApps_SecureMessaging: Secure Threads`**: Subject-lined confidential conversations between staff and an external contact (`ContactID` -> `MJ_BizApps_Common: People`).
  - Key fields: `ContactID`, `Subject`, `Status` (`'Active' | 'Archived' | 'Closed'`), `SourceChannel`, `CreatedByUserID`, `LastMessageAt`, `IsDeleted`.
  - Always exclude soft-deleted threads (`IsDeleted = 0`) when listing inbox items.
- **`MJ_BizApps_SecureMessaging: Secure Messages`**: Individual inbound and outbound messages inside a thread.
  - Key fields: `PortalSessionID`, `ThreadID`, `PersonID`, `Direction` (`'Inbound' | 'Outbound'`), `Sender`, `Recipient`, `Subject`, `Content`, `IsSecure`, `Status` (`'New' | 'Read' | 'Replied' | 'Sent' | 'Failed'`), `ReceivedAt`, `IsStarred`, `IsImported`, `SourceChannel`.
  - Note: Promoted history rows have `IsImported = 1` and `Status = 'Read'`; unread inbound client replies have `Direction = 'Inbound'` and `Status = 'New'`.
- **`MJ_BizApps_SecureMessaging: File Requests`**: Document/upload checklists requested from an external contact within a thread.
  - Key fields: `PortalSessionID`, `ThreadID`, `Title`, `Instructions`, `Status` (`'Pending' | 'Fulfilled' | 'Cancelled' | 'Expired'`), `RequestedByUserID`, `DueAt`, `FulfilledAt`.
- **`MJ_BizApps_SecureMessaging: Message Files`**: Files attached to secure messages or uploaded to fulfill file requests (`SecureMessageID`, `ThreadID`, `ArtifactID`, `FileID`, `Filename`, `ContentType`, `Size`).
- **`MJ_BizApps_SecureMessaging: Portal Sessions`**: Active passwordless portal sessions per external contact (`ContactID`, `Status`: `'Active' | 'Expired' | 'Revoked'`, `ExpiresAt`, `LastAccessedAt`).
- **`MJ_BizApps_SecureMessaging: Portal Magic Links`**: Single-use entry links bound to a portal session (`PortalSessionID`, `Status`: `'Pending' | 'Used' | 'Expired'`, `ExpiresAt`, `UsedAt`, `DeepLinkThreadID`).

## 3. Typed Action Playbook

1. **Start a brand-new secure conversation**: Call `Start Secure Thread` (`ContactEmail`, `FirstMessage`, optional `ContactName`). Finds or creates the contact `Person`, creates a thread + portal session + single-use magic link, posts the opening outbound message, and returns `ThreadID`, `MessageID`, and `MagicLinkToken`.
2. **Reply inside an existing secure thread**: Call `Send Secure Message` (`ThreadID`, `Content`, optional `Subject`). Persists an outbound message as `params.ContextUser`, updates `Secure Threads.LastMessageAt`, and returns `MessageID`.
3. **Move an insecure email/SMS thread to the secure portal**: Call `Promote Thread` (`ContactEmail`, `SourceChannel`, `MessagesJSON`, optional `ContactName`). One-way import: copies prior messages into the new secure thread flagged `IsImported = true` without ever writing secure replies back to the insecure channel.
4. **Re-issue portal access for a contact**: Call `Issue Portal Magic Link` (`SessionID`). Generates and hashes a fresh single-use 15-minute magic link token server-side and returns `MagicLinkToken`.

## 4. Common Chief of Staff Workflows

- **"Do I have unread secure messages from clients?"** Query `MJ_BizApps_SecureMessaging: Secure Messages` via `RunView` where `Direction = 'Inbound' AND Status = 'New'` ordered by `ReceivedAt DESC`, joined conceptually to `Secure Threads` (`IsDeleted = 0`) for subjects.
- **"Which client file requests are pending or overdue?"** Query `MJ_BizApps_SecureMessaging: File Requests` where `Status = 'Pending'` ordered by `DueAt ASC`, highlighting overdue items (`DueAt < now`).
- **"Move this client email thread to a secure channel."** Confirm with the user, assemble the prior messages chronologically as `MessagesJSON`, and call `Promote Thread`.
- **"Send a fresh magic link to Contact X."** Find the contact's active row in `MJ_BizApps_SecureMessaging: Portal Sessions` (`Status = 'Active'`) via `RunView`, confirm with the user, and call `Issue Portal Magic Link`.
