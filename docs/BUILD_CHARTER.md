# Secure Messaging — Build Charter

> **One page. Read [PRD.md](PRD.md) for the *why*; this is the *what next* and *in what order*.**
> The PRD is the vision (year-one product). This charter is the shippable slice list. When they
> disagree, the charter wins on sequencing; the PRD wins on shape. Updated as slices land.

## The one sentence
Get the thread entity real, then fix the thing that actually annoyed us (requests piling up
forever), then give the contact a portal that feels right — everything else in PRD §11 is *later*.

## Where we are right now (honest state)
- PRD v2 committed (`d026a54`). Thread-per-conversation model decided.
- `SecureThread` migration **authored, uncommitted, untested**: `migrations/V202607050000__…SecureThread_Entity.sql`.
- **DB not yet provisioned.** `.env` still points at `SM_TEST_2`; the fresh-DB plan never ran.
- Everything built through v1 still works on the old (session==thread) model — nothing is broken,
  it's just on the model we're migrating *away* from.

## The slices (ship in this order — each is independently demoable)

### Slice 0 — Foundation: make the thread real  *(blocks everything)*
The migration + codegen + rewire from PRD §4/§11-phase-1. Unavoidable prerequisite.
- **User**: provision fresh DB (`__mj` core + `__mj_BizAppsCommon` bootstrap) → point `.env` at it →
  `mj migrate` → `mj codegen`. *(Or: run the existing migration on `SM_TEST_2` if we keep the DB —
  decide before starting; see Open Question 1.)*
- **Me (after codegen)**: rewire Core / Server / staff UI / widget off the dropped session columns
  (`ThreadID`/`ChannelID`/`IsArchived`/`IsDeleted`) onto `SecureThread`. Builds break by design here.
- **Done when**: staff inbox is thread-grouped, a magic link deep-links into a thread, and a
  round-trip message works on the new model.

### Slice 1 — Request lifecycles: the thing that started all this  *(highest user value)*
This was the original ask ("let me close out requests; only *new* ones should appear"). PRD §7.
- File Request: staff **Cancel**; `DueAt` **Expire**; **multi-file** fulfillment.
- Widget shows **only `Pending`** requests as callouts; terminal ones collapse to thread history.
- Signature: wire the **DocuSign Connect webhook receiver** (kills "awaiting signature forever") +
  **signed-doc auto-returns** to the thread.
- **Done when**: a staff member closes a request and it leaves the contact's action strip; a signed
  doc reappears in the thread without anyone polling.

### Slice 2 — Contact portal that feels right  *(PRD §5)*
- Inbox view **only when the contact has >1 thread** (one-thread contact never sees a list).
- Closed-thread read-only banner. Back-affordance from thread → inbox.
- **Done when**: a contact with two matters can move between them; a contact with one still lands
  straight in the conversation.

### Slice 3 — Lead with the differentiator: bridges front-end  *(PRD §9)*
Backbone is already built (`PromoteThread` + HMAC REST). This surfaces it.
- Outlook "Secure Send" add-in **or** the Izzy-side promotion trigger — whichever has a live
  consumer first.
- **Done when**: an insecure email/SMS thread promotes to a secure thread + magic-link nudge, live.

## Explicitly NOT now (parked in PRD §11-phase-5+ / §8 / §12)
Registration/password ladder · inbound staff nudge + safe-notification mode · owner/team scoping ·
watermarking · audit exports · retention · Secure-Submit intake form. None of these block a demo.

## Open questions to settle before Slice 0
1. **Fresh DB or reuse `SM_TEST_2`?** Fresh = clean install-path test (the real product story) but
   costs credential re-setup (encryption key, Box, DocuSign). Reuse = migration runs against real
   backfill data (better migration test) but keeps accumulated cruft. *Recommend: fresh — it's the
   install story we ship, and the backfill path is dev-only test data anyway.*
2. **Commit the migration now, or with the Slice-0 rewire?** *Recommend: with the rewire, as one
   coherent "move to SecureThread" commit, once codegen proves it's sound.*
