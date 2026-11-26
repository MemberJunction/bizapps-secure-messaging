# SM-WORLD

Committed multi-organization integration-test inbox. **Not** app metadata. **Not** `test/seed-test-data.sql`.

`LoadWorld()` upserts **90 realistic multi-entity records** through strongly-typed `BaseEntity` subclasses (zero `any`, zero `BaseEntity.Get()/Set()`). Natural keys: organization `Name`, person `Email`, thread `Subject`, session `ContactID`, message HTML comment marker, artifact `Name`, artifact version `(ArtifactID, VersionNumber)`, message file `Filename`, file-request `Title`, and magic-link `TokenHash`. Re-running is idempotent and refreshes relative dates so the Executive Inbox and Client Workspace stay current.

## How it loads

- **`messaging-world` / `CW1`–`CW7`** — commits the 4-organization, multi-period world including 6 versioned MJ Doc artifacts (10 versions), 6 artifact-linked `MessageFile` attachments, and 4 binary fallback files.
- **`messaging-artifacts-rls` / `AR1`–`AR6`** — verifies batched `ArtifactFileStore` + `MessageFile.ArtifactID` resolution (`ResultType: 'simple'`, chunked `ID IN (...)`) and adversarial cross-tenant RLS isolation between Organization A (`Northstar Legal Advisory`) and Organization B (`Meridian Health Systems`).
- Artifact types and channel providers live in `metadata/` and are **looked up**, never invented here.
- People share `com-world.test` with the common/orders directory when that world has run. Missing people are created.

## Organizations, Contacts, Threads & Artifacts

| Organization | Contact (Role) | Thread (Period / Status) | Attachments / Why it is in the world |
|---|---|---|---|
| Blue Cypress Press | Nora Calhoun (`PortalRecipient`) | Active (`2026-Q4`) — 2026 membership dues | Unread inbound (Inbox / New) + active session |
| Blue Cypress Press | Elena Voss (`ExternalContact`) | Active (`2026-Q4`) — children's catalog standing order | Back-and-forth (Sent + Read inbound) |
| Blue Cypress Press | Grace Hopper (`CaseReviewer`) | Active (`2026-Q4`) — engagement letter and W-9 | Pending file request + `W-9 Engagement Summary` MJ Doc (`ArtifactID`) |
| Blue Cypress Press | Jordan Blake (`PortalRecipient`) | Active (`2026-Q3`) — switch to secure channel | Promoted from Email (`SourceChannel`, imported history) |
| Summit Academic Press | Alan Turing (`ExternalContact`) | Closed (`2026-Q2`) — desk copy | Closed lifecycle |
| Summit Academic Press | Marcus Webb (`ExternalContact`) | Archived (`2026-Q1`) — bulk quote | Archived lifecycle |
| Blue Cypress Press | James Whitaker (`PortalRecipient`) | Active (`2026-Q4`) — invoice #4412 | Expired session + pending magic link + binary PDF fallback (`ArtifactID = null`) |
| Blue Cypress Press | Ada Lovelace (`Admin`) | Active (`2026-Q4`) — Style Handbook 4e | Starred inbound + fulfilled request + `Editorial Brief` MJ Doc v2 (`ArtifactID`) + binary PDF fallback |
| Northstar Legal Advisory (Org A) | Priya Nair (`CaseReviewer`) | Active (`2026-Q4`) — Northstar MSA & Q4 Addendum | `Northstar MSA Deliverable` MJ Doc v1→v2 (`ArtifactID`) + wet-ink PNG fallback (`ArtifactID = null`) + pending COI request + used magic link |
| Northstar Legal Advisory (Org A) | Derek Okafor (`ExternalContact`) | Active (`2026-Q3`) — Northstar SOC-2 Control Matrix | `Northstar SOC-2 Control Matrix` JSON MJ Doc v1→v2 (`ArtifactID`) |
| Meridian Health Systems (Org B) | Samantha Chen (`Admin`) | Active (`2026-Q4`) — Meridian HIPAA BAA | `Meridian HIPAA BAA Deliverable` MJ Doc v1→v2 (`ArtifactID`) + encrypted ZIP fallback (`ArtifactID = null`) + expired attestation request |
| Meridian Health Systems (Org B) | Omar Haddad (`PortalRecipient`) | Closed (`2026-Q1`) — Clinical Data Sharing Protocol | Revoked session + `Meridian Clinical Data Protocol` MJ Doc v1 (`ArtifactID`) |

## Widget tokens

Raw tokens are **not** stored. SHA-256 hashes are. For local widget poking:

| Contact | Organization | Raw token | Kind |
|---|---|---|---|
| Nora Calhoun | Blue Cypress Press | `sm_world_nora_active` | Active session |
| Priya Nair | Northstar Legal Advisory (Org A) | `sm_world_priya_northstar_active` | Active session (with MJ Doc + binary attachments) |
| Samantha Chen | Meridian Health Systems (Org B) | `sm_world_samantha_meridian_active` | Active session (adversarial cross-tenant boundary peer) |
| James Whitaker | Blue Cypress Press | `sm_ml_world_james_pending` | Pending magic link (14 min TTL, refreshed on re-run) |
