# Adopting MJ's Entity Action workflow extensions

> **Status:** Tracking doc — nothing to build here yet.
> **Upstream:** MemberJunction/MJ **[#3408](https://github.com/MemberJunction/MJ/pull/3408)** · [design plan](https://github.com/MemberJunction/MJ/blob/claude/sales-deal-management-app-ueporb/plans/entity-action-workflow-extensions.md)
> **Blocked on:** that PR merging *and* its engine work landing (the PR ships schema + plan only).

---

## 1. What is changing in MJ core

`EntityAction` — MJ's generalized hook for running an Action off an entity's
create / update / delete / validate — is becoming the **workflow-hook substrate for every app on
the platform**, so no app needs to invent its own.

It already does more than its schema suggests, and this is worth knowing regardless of this PR:

| Invocation | Where it fires | Semantics |
|---|---|---|
| `Validate` | `OnValidateBeforeSave` | **A real blocking gate** — a non-`Success` result fails the save |
| `Before*` | `OnBeforeSaveExecute` | Awaited, result discarded (cannot veto) |
| `After*` | `OnAfterSaveExecute` | Fire-and-forget |

And because **`Execute Agent` is just an Action**, any binding can already run an agent — a
deterministic **flow agent** (visual editor, `Action`/`Prompt`/`Sub-Agent`/`ForEach`/`While` steps,
per-step retry and error behaviour) or a **loop agent** where judgement is genuinely needed. The
house shape is a flow agent with a `Sub-Agent` step calling a loop agent.

**What #3408 adds:**

- **`EntityAction.ScopeEntityID` + `ScopeRecordID`** — bind a workflow to *one configuration record*
  rather than to every record of an entity. This is the important one: it means **no app ever grows
  a column per type per event**, and a configuration record can surface "the workflows bound to me"
  as a real relationship instead of something buried in filter code.
- **`EntityAction.Sequence`** — deterministic ordering when several bindings share an event.
- **`EntityActionParam.ValueType = 'Entity Object Data'`** — passes `entity.GetAll()` instead of the
  live `BaseEntity`. Use it for anything that serializes, above all `Execute Agent`'s `Data` payload:
  a `BaseEntity` serializes to `{}` because its fields are getters, so the agent silently receives
  an empty payload with no error anywhere.
- Two seeded reusable `ActionFilter`s — **"field changed"** and **"field changed *to* value"** — so
  transition detection stops being hand-rolled. Without them `AfterUpdate` fires on *every* update,
  and "status *is* X" instead of "status *changed to* X" re-fires on every later save.
- `After*` routed through `QueueManager` so failures are durable and retryable rather than logged
  and swallowed.

**Authoring is pure metadata** — `metadata/entity-actions/`, with `relatedEntities` for invocations,
filters and params. No schema and no code in the consuming app.

---

## 2. What this means for BizApps Secure Messaging

Secure Messaging's interest is narrower than most apps here, and deliberately so: the whole point of
the app is that message content is confidential. **Most bindings should react to message *metadata*,
never message *bodies*.**

Within that boundary there is real value — thread lifecycle, delivery and read receipts, retention
and escalation policy — and those differ by the *kind* of thread, which is what scope binding is for.

## 3. Suggested bindings

| Entity + invocation | Scope | Work | Purpose |
|---|---|---|---|
| Thread · `AfterCreate` | a thread/channel **type** | Action | Notify the recipient through their preferred channel; start the response clock |
| Thread · `AfterUpdate` (status changed to closed/resolved) | a thread type | Action | Retention policy, archive, notify the case owner |
| Message · `AfterCreate` | a thread type | Action | **Metadata only** — "a new message arrived", never the body |
| Thread · `Validate` | a thread type | Action | Refuse closure while required acknowledgements are outstanding |

## 4. Notes specific to this repo — read before authoring any binding

**`ValueType` choice is a confidentiality decision here, not a convenience one.** `'Entity Object'`
and `'Entity Object Data'` both hand the *whole record* to the Action — and if that Action is
`Execute Agent`, the whole record goes into an agent run, which is logged and may leave the tenant
depending on the model vendor. For a message entity that means the body.

**Default to `'Entity Field'`** and pass only the identifiers the downstream work genuinely needs.
Reserve the whole-object value types for entities where the content is not sensitive.

**This is the app where the ethics use case lands** — Secure Messaging is named as the respondent
channel in the BizApps Ethics design. Bindings authored here will be operating on
discipline-case correspondence, which raises the bar further: any agent-backed binding on a message
entity should be an explicit, reviewed decision rather than something an administrator can switch on
casually.

Worth considering a repo convention: **no `Execute Agent` bindings on message-bearing entities
without a documented review.** Cheap to state now, expensive to retrofit.

---

## 5. What to do now

**Nothing.** This is a tracking doc so the idea is not lost and so this repo's plans reflect where
workflow hooks are going. When #3408 merges and its engine work lands:

1. Confirm the bindings in §3 are still the right ones.
2. Author them as metadata under `metadata/entity-actions/`.
3. Build the flow agents they dispatch to.
4. Delete this file, or fold it into the repo's main plan.

## 6. Two rules to carry into the design

- **Synchronous bindings should be Actions, never agents.** `Validate` and `Before*` run inside the
  caller's transaction. A loop agent's duration is unbounded and holding a transaction open for it
  is not acceptable. Agents belong on `After*`, which is async.
- **A flow agent should create human work and finish** — it should not hold a run open waiting for
  a person. Use `MJ: AI Agent Requests` when the answer resumes the same run (minutes to hours), and
  a **bizapps-tasks** Task when it is durable, assignable work someone owns (days to weeks).

---
_Generated by [Claude Code](https://claude.ai/code)_
