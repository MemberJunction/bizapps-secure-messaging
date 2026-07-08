import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLFileStorageClient, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { ActionResult, ActionParam } from '@memberjunction/actions-base';
import { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { mjBizAppsSecureMessagingPortalSessionEntity, mjBizAppsSecureMessagingFileRequestEntity } from '@mj-biz-apps/secure-messaging-entities';
import { OpenThreadRequest, WorkspaceActionRequest } from './secure-messaging.contracts';

/* ─────────────────────────── Interfaces ─────────────────────────── */

interface ThreadRow {
  threadId: string;
  title: string;
  sub: string;
  time: string;
  badge?: { cls: string; label: string };
}

interface RequestRow {
  id: string;
  title: string;
  sub: string;
  time: string;
  kind: 'file' | 'signature';
  status: string;
  badge: { cls: string; label: string };
}

interface DocRow {
  id: string;
  filename: string;
  sub: string;
  fileId: string | null;
  iconClass: string;
}

interface SessionInfo {
  id: string | null;
  status: 'Active' | 'Expired' | 'Revoked' | 'None';
  tokenMasked: string;
  expiresLabel: string;
  lastAccessLabel: string;
}

interface AuditEvent {
  kind: 'ok' | 'info' | 'ai' | 'warn' | 'sign';
  icon: string;
  title: string;
  desc: string;
  time: string;
}

type WorkspaceMode = 'basic' | 'advanced';
type WorkspaceTab = 'overview' | 'threads' | 'requests' | 'docs' | 'audit';

/* The advanced-only tabs — hidden in the basic (default) view. */
const ADVANCED_TABS: WorkspaceTab[] = ['overview', 'requests', 'docs', 'audit'];
const ADV_PREF_KEY = 'sm.workspace.advanced';

/**
 * Client Workspace (client-360) — a staff-side surface unifying one contact's threads,
 * requests, signatures, documents, session state, and audit trail.
 *
 * Progressive disclosure: the **basic** view (default) is intentionally minimal — the
 * client header, the three actions, and the conversation list. **Advanced mode** (a
 * per-user-sticky toggle) reveals the stats, Overview, Requests & Signatures, Documents,
 * Session & Security, Compliance, and the Audit Trail. The preference is persisted per
 * user in localStorage.
 *
 * Sibling to {@link SecureMessagingExecutiveComponent}; the inbox can navigate into this
 * per-contact. Data is read live from the owned `MJ_BizApps_SecureMessaging:` entities,
 * the core `MJ: Signature Requests`, and `MJ: Record Changes` for the audit timeline.
 */
@Component({
  standalone: false,
  selector: 'mj-secure-messaging-client-workspace',
  template: `
<div class="ws" [attr.data-mode]="mode">
  <div class="ws-inner">

    <!-- CLIENT HEADER -->
    <div class="client-head">
      <button class="ch-back" (click)="back()" title="Back to inbox">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="avatar">{{ initials }}</div>
      <div class="ch-id">
        <div class="ch-name">{{ contactName || 'Contact' }}</div>
        <div class="ch-meta">
          @if (contactTitle) { <span><i class="fa-solid fa-briefcase"></i> {{ contactTitle }}</span> }
          @if (contactEmail) { <span><i class="fa-solid fa-envelope"></i> {{ contactEmail }}</span> }
          @if (contactPhone) { <span><i class="fa-solid fa-phone"></i> {{ contactPhone }}</span> }
        </div>
      </div>
      <div class="ch-actions">
        <div class="adv-toggle" (click)="toggleMode()" title="Show session, compliance & audit detail">
          <span class="sw"></span> Advanced
        </div>
        <div class="ch-session" [ngClass]="sessionPillClass">
          @if (session.status === 'Active') { <span class="pulse"></span> }
          <i class="fa-solid" [ngClass]="sessionIcon"></i> {{ sessionPillLabel }}
        </div>
        <button class="btn btn-primary btn-sm" (click)="act('message')"><i class="fa-solid fa-pen-to-square"></i> Message</button>
        <button class="btn btn-secondary btn-sm" (click)="act('request')"><i class="fa-solid fa-folder-plus"></i> Request files</button>
        <button class="btn btn-secondary btn-sm" (click)="act('signature')"><i class="fa-solid fa-file-signature"></i> Send for signature</button>
      </div>
    </div>

    <!-- Shared action panel (Request files / Send for signature) -->
    @if (actionPanel && activeThreadId) {
      <mj-secure-messaging-action-panel
        [mode]="actionPanel"
        [threadId]="activeThreadId"
        [contactEmail]="contactEmail"
        [contactName]="contactName"
        (done)="onActionDone()"
        (cancel)="closeActionPanel()">
      </mj-secure-messaging-action-panel>
    }

    <!-- STATS (advanced only) -->
    <div class="stats adv">
      <div class="stat accent"><div class="v">{{ stats.openThreads }}</div><div class="l"><i class="fa-solid fa-comments"></i> Open threads</div></div>
      <div class="stat warn"><div class="v">{{ stats.pendingRequests }}</div><div class="l"><i class="fa-solid fa-folder-plus"></i> Pending requests</div></div>
      <div class="stat violet"><div class="v">{{ stats.awaitingSignature }}</div><div class="l"><i class="fa-solid fa-file-signature"></i> Awaiting signature</div></div>
      <div class="stat"><div class="v">{{ stats.filesShared }}</div><div class="l"><i class="fa-solid fa-paperclip"></i> Files shared</div></div>
      <div class="stat"><div class="v">{{ session.lastAccessLabel }}</div><div class="l"><i class="fa-solid fa-clock"></i> Last access</div></div>
    </div>

    <!-- TABS (Overview/Requests/Documents/Audit are advanced; basic shows only Conversations) -->
    <div class="ws-tabs">
      <div class="ws-tab adv" [class.active]="tab === 'overview'" (click)="setTab('overview')"><i class="fa-solid fa-layer-group"></i> Overview</div>
      <div class="ws-tab" [class.active]="tab === 'threads'" (click)="setTab('threads')"><i class="fa-solid fa-comments"></i> Conversations <span class="count-pill">{{ threads.length }}</span></div>
      <div class="ws-tab adv" [class.active]="tab === 'requests'" (click)="setTab('requests')"><i class="fa-solid fa-list-check"></i> Requests &amp; Signatures <span class="count-pill">{{ requests.length }}</span></div>
      <div class="ws-tab adv" [class.active]="tab === 'docs'" (click)="setTab('docs')"><i class="fa-solid fa-folder"></i> Documents <span class="count-pill">{{ docs.length }}</span></div>
      <div class="ws-tab adv" [class.active]="tab === 'audit'" (click)="setTab('audit')"><i class="fa-solid fa-shield-halved"></i> Audit Trail</div>
    </div>

    <!-- OVERVIEW (advanced) -->
    <div class="pane" [class.active]="tab === 'overview'">
      <div class="grid">
        <div>
          <div class="panel">
            <div class="panel-head"><i class="fa-solid fa-comments accent-i"></i><h3>Recent conversations</h3><button class="btn btn-ghost btn-sm" (click)="setTab('threads')">View all</button></div>
            <div class="panel-body">
              @for (t of threads.slice(0, 4); track t.threadId) {
                <div class="row" (click)="openThread(t)">
                  <div class="ic ic-msg"><i class="fa-solid fa-message"></i></div>
                  <div class="row-main"><div class="row-title">{{ t.title }}</div><div class="row-sub">{{ t.sub }}</div></div>
                  <div class="row-right">@if (t.badge) { <span class="badge" [ngClass]="t.badge.cls">{{ t.badge.label }}</span> }<span class="row-time">{{ t.time }}</span></div>
                </div>
              }
              @if (threads.length === 0 && !loading) { <div class="empty">No conversations yet.</div> }
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><i class="fa-solid fa-list-check warn-i"></i><h3>Open requests &amp; signatures</h3><button class="btn btn-ghost btn-sm" (click)="setTab('requests')">View all</button></div>
            <div class="panel-body">
              @for (r of openRequests().slice(0, 4); track r.id) {
                <div class="row">
                  <div class="ic" [ngClass]="r.kind === 'signature' ? 'ic-sign' : 'ic-file'"><i class="fa-solid" [ngClass]="r.kind === 'signature' ? 'fa-file-signature' : 'fa-folder-plus'"></i></div>
                  <div class="row-main"><div class="row-title">{{ r.title }}</div><div class="row-sub">{{ r.sub }}</div></div>
                  <div class="row-right"><span class="badge" [ngClass]="r.badge.cls">{{ r.badge.label }}</span><span class="row-time">{{ r.time }}</span></div>
                </div>
              }
              @if (openRequests().length === 0 && !loading) { <div class="empty">Nothing outstanding.</div> }
            </div>
          </div>
        </div>
        <div class="adv">
          <div class="panel">
            <div class="panel-head"><i class="fa-solid fa-key accent-i"></i><h3>Session &amp; security</h3></div>
            <div class="sec-item"><span class="k">Status</span><span class="v" [ngClass]="sessionTextClass"><i class="fa-solid" [ngClass]="sessionIcon"></i> {{ session.status }}</span></div>
            <div class="sec-item"><span class="k">Token</span><span class="v"><span class="sec-key">{{ session.tokenMasked }}</span></span></div>
            <div class="sec-item"><span class="k">Auth method</span><span class="v">Magic link (passwordless)</span></div>
            <div class="sec-item"><span class="k">Expires</span><span class="v">{{ session.expiresLabel }}</span></div>
            <div class="sec-item"><span class="k">Last access</span><span class="v">{{ session.lastAccessLabel }}</span></div>
            <div class="sec-actions">
              <button class="btn btn-secondary btn-sm" [disabled]="!session.id || sessionBusy" (click)="sendNewLink()"><i class="fa-solid fa-wand-magic-sparkles"></i> Send new link</button>
              <button class="btn btn-sm btn-danger" [disabled]="!session.id || session.status === 'Revoked' || sessionBusy" (click)="revoke()"><i class="fa-solid fa-ban"></i> Revoke</button>
            </div>
            @if (newLink) {
              <div class="sec-link-row">
                <input class="sec-link" type="text" [value]="newLink" readonly (focus)="$any($event.target).select()">
                <button class="btn btn-secondary btn-sm" (click)="copyNewLink()"><i class="fa-solid fa-copy"></i> Copy</button>
              </div>
              <p class="sec-link-hint">Send this single-use link to the contact. It re-activates their secure session.</p>
            }
          </div>
          <div class="panel">
            <div class="panel-head"><i class="fa-solid fa-certificate ok-i"></i><h3>Compliance</h3></div>
            <div class="compliance">
              <span class="comp-badge"><i class="fa-solid fa-lock"></i> AES-256 at rest</span>
              <span class="comp-badge"><i class="fa-solid fa-shield"></i> SOC 2 Type II</span>
              <span class="comp-badge"><i class="fa-solid fa-user-shield"></i> HIPAA</span>
              <span class="comp-badge"><i class="fa-solid fa-globe"></i> GDPR</span>
              <span class="comp-badge"><i class="fa-solid fa-clock-rotate-left"></i> Full audit</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CONVERSATIONS (basic + advanced) -->
    <div class="pane" [class.active]="tab === 'threads'">
      <div class="panel">
        <div class="panel-head"><i class="fa-solid fa-comments accent-i"></i><h3>All conversations</h3><button class="btn btn-primary btn-sm" (click)="act('message')"><i class="fa-solid fa-plus"></i> New</button></div>
        <div class="panel-body">
          @for (t of threads; track t.threadId) {
            <div class="row" (click)="openThread(t)">
              <div class="ic ic-msg"><i class="fa-solid fa-message"></i></div>
              <div class="row-main"><div class="row-title">{{ t.title }}</div><div class="row-sub">{{ t.sub }}</div></div>
              <div class="row-right">@if (t.badge) { <span class="badge" [ngClass]="t.badge.cls">{{ t.badge.label }}</span> }<span class="row-time">{{ t.time }}</span><i class="fa-solid fa-chevron-right chev"></i></div>
            </div>
          }
          @if (threads.length === 0 && !loading) { <div class="empty">No conversations yet.</div> }
          @if (loading) { <div class="empty">Loading…</div> }
        </div>
      </div>
    </div>

    <!-- REQUESTS & SIGNATURES (advanced) -->
    <div class="pane" [class.active]="tab === 'requests'">
      <div class="panel">
        <div class="panel-head"><i class="fa-solid fa-list-check warn-i"></i><h3>Requests &amp; signatures</h3></div>
        <div class="panel-body">
          @for (r of requests; track r.id) {
            <div class="row">
              <div class="ic" [ngClass]="r.kind === 'signature' ? 'ic-sign' : 'ic-file'"><i class="fa-solid" [ngClass]="r.kind === 'signature' ? 'fa-file-signature' : 'fa-folder-plus'"></i></div>
              <div class="row-main"><div class="row-title">{{ r.title }}</div><div class="row-sub">{{ r.sub }}</div></div>
              <div class="row-right">
                <span class="badge" [ngClass]="r.badge.cls">{{ r.badge.label }}</span>
                <span class="row-time">{{ r.time }}</span>
                @if (r.kind === 'file' && r.status === 'Pending') {
                  <button class="btn btn-sm btn-danger" [disabled]="cancellingId === r.id" (click)="cancelRequest(r)" title="Cancel this request">
                    <i class="fa-solid" [ngClass]="cancellingId === r.id ? 'fa-spinner fa-spin' : 'fa-ban'"></i>
                  </button>
                }
              </div>
            </div>
          }
          @if (requests.length === 0 && !loading) { <div class="empty">No requests or signatures.</div> }
        </div>
      </div>
    </div>

    <!-- DOCUMENTS (advanced) -->
    <div class="pane" [class.active]="tab === 'docs'">
      <div class="panel">
        <div class="panel-head"><i class="fa-solid fa-folder accent-i"></i><h3>All documents</h3></div>
        <div class="panel-body">
          @for (d of docs; track d.id) {
            <div class="row" (click)="downloadDoc(d)">
              <div class="ic" [ngClass]="d.iconClass"><i class="fa-solid" [ngClass]="docIcon(d)"></i></div>
              <div class="row-main"><div class="row-title">{{ d.filename }}</div><div class="row-sub">{{ d.sub }}</div></div>
              <div class="row-right"><i class="fa-solid fa-download chev"></i></div>
            </div>
          }
          @if (docs.length === 0 && !loading) { <div class="empty">No documents shared yet.</div> }
        </div>
      </div>
    </div>

    <!-- AUDIT TRAIL (advanced) -->
    <div class="pane" [class.active]="tab === 'audit'">
      <div class="panel">
        <div class="panel-head"><i class="fa-solid fa-shield-halved ok-i"></i><h3>Complete chain of custody</h3></div>
        <div class="audit-note"><i class="fa-solid fa-circle-info"></i> Every delivery, access, message, and document action is timestamped via MJ Record Changes — immutable and exportable for regulators.</div>
        <div class="timeline">
          @for (a of audit; track $index) {
            <div class="tl-item">
              <div class="tl-dot" [ngClass]="a.kind"><i class="fa-solid" [ngClass]="a.icon"></i></div>
              <div class="tl-title">{{ a.title }}</div>
              <div class="tl-desc">{{ a.desc }}</div>
              <div class="tl-time">{{ a.time }}</div>
            </div>
          }
          @if (audit.length === 0 && !loading) { <div class="empty">No recorded activity yet.</div> }
        </div>
      </div>
    </div>

  </div>

  <div class="toast" [class.show]="toastShown"><i class="fa-solid fa-circle-check"></i><span>{{ toastMsg }}</span></div>
</div>
`,
  styles: [`
:host { display:block; height:100%; font-family:Inter,-apple-system,system-ui,sans-serif; color:var(--mj-text-primary); }
.ws { height:100%; overflow-y:auto; padding:22px 26px 40px; box-sizing:border-box; background:var(--mj-bg-page); }
.ws-inner { max-width:1240px; margin:0 auto; }

.avatar { width:64px; height:64px; border-radius:50%; background:var(--mj-status-warning); color:var(--mj-text-inverse); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; flex-shrink:0; }
.client-head { background:var(--mj-bg-surface); border:1px solid var(--mj-border-default); border-radius:16px; box-shadow:0 1px 2px rgba(0,0,0,.04); padding:22px 24px; display:flex; align-items:center; gap:20px; }
.ch-back { flex-shrink:0; width:36px; height:36px; border-radius:50%; border:1px solid var(--mj-border-default); background:var(--mj-bg-surface); color:var(--mj-text-secondary); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:15px; }
.ch-back:hover { background:var(--mj-bg-surface-hover); color:var(--mj-text-primary); }
.ch-name { font-size:22px; font-weight:800; letter-spacing:-.01em; }
.ch-meta { display:flex; align-items:center; gap:16px; margin-top:6px; font-size:13px; color:var(--mj-text-muted); flex-wrap:wrap; }
.ch-meta span { display:inline-flex; align-items:center; gap:6px; }
.ch-actions { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
.ch-session { display:flex; align-items:center; gap:8px; background:var(--mj-status-success-bg); border:1px solid var(--mj-status-success-border); color:var(--mj-status-success-text); padding:7px 13px; border-radius:999px; font-size:12px; font-weight:700; }
.ch-session.revoked { background:var(--mj-status-error-bg); border-color:var(--mj-status-error-border); color:var(--mj-status-error-text); }
.ch-session.expired { background:var(--mj-status-warning-bg); border-color:var(--mj-status-warning-border); color:var(--mj-status-warning-text); }
.pulse { width:8px; height:8px; border-radius:50%; background:var(--mj-status-success); box-shadow:0 0 0 0 color-mix(in srgb, var(--mj-status-success) 50%, transparent); animation:pulse 2s infinite; }
@keyframes pulse { 0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--mj-status-success) 50%, transparent)} 70%{box-shadow:0 0 0 7px color-mix(in srgb, var(--mj-status-success) 0%, transparent)} 100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--mj-status-success) 0%, transparent)} }

/* Advanced toggle */
.adv-toggle { display:inline-flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:var(--mj-text-muted); cursor:pointer; user-select:none; padding:6px 11px; border:1px solid var(--mj-border-default); border-radius:999px; background:var(--mj-bg-surface); transition:all .15s; }
.adv-toggle:hover { color:var(--mj-text-primary); border-color:var(--mj-border-strong); }
.adv-toggle .sw { position:relative; width:30px; height:17px; border-radius:999px; background:var(--mj-border-strong); transition:background .15s; flex-shrink:0; }
.adv-toggle .sw::after { content:''; position:absolute; top:2px; left:2px; width:13px; height:13px; border-radius:50%; background:var(--mj-bg-surface); box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .15s; }
.ws[data-mode="advanced"] .adv-toggle { color:var(--mj-brand-primary); border-color:var(--mj-brand-primary); background:color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface)); }
.ws[data-mode="advanced"] .adv-toggle .sw { background:var(--mj-brand-primary); }
.ws[data-mode="advanced"] .adv-toggle .sw::after { transform:translateX(13px); }

/* Hide advanced-only surfaces in basic mode */
.ws:not([data-mode="advanced"]) .adv { display:none !important; }
.ws:not([data-mode="advanced"]) .grid { grid-template-columns:1fr; }

/* Stats */
.stats { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-top:16px; }
.stat { background:var(--mj-bg-surface); border:1px solid var(--mj-border-default); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,.04); padding:16px 18px; }
.stat .v { font-size:26px; font-weight:800; letter-spacing:-.02em; }
.stat .l { font-size:12px; color:var(--mj-text-muted); margin-top:2px; display:flex; align-items:center; gap:6px; }
.stat.accent .v { color:var(--mj-brand-primary); } .stat.warn .v { color:var(--mj-status-warning-text); } .stat.violet .v { color:var(--mj-brand-tertiary); }

/* Tabs */
.ws-tabs { display:flex; gap:2px; margin-top:22px; border-bottom:1px solid var(--mj-border-default); }
.ws-tab { padding:11px 18px; font-size:13.5px; font-weight:600; color:var(--mj-text-muted); cursor:pointer; border-bottom:2px solid transparent; display:flex; align-items:center; gap:8px; }
.ws-tab:hover { color:var(--mj-text-primary); }
.ws-tab.active { color:var(--mj-brand-primary); border-bottom-color:var(--mj-brand-primary); }
.count-pill { background:var(--mj-bg-surface-sunken); color:var(--mj-text-secondary); font-size:11px; padding:1px 7px; border-radius:999px; }

.grid { display:grid; grid-template-columns:1.7fr 1fr; gap:20px; margin-top:20px; align-items:start; }
.pane { display:none; } .pane.active { display:block; }
.panel { background:var(--mj-bg-surface); border:1px solid var(--mj-border-default); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,.04); margin-bottom:20px; overflow:hidden; }
.panel-head { display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--mj-border-default); }
.panel-head h3 { margin:0; font-size:14px; font-weight:700; }
.panel-head .btn { margin-left:auto; }
.accent-i { color:var(--mj-brand-primary); } .warn-i { color:var(--mj-status-warning-text); } .ok-i { color:var(--mj-status-success); }
.panel-body { padding:6px 0; }
.empty { padding:18px; font-size:13px; color:var(--mj-text-disabled); text-align:center; }

.row { display:flex; align-items:center; gap:14px; padding:13px 18px; border-bottom:1px solid var(--mj-border-subtle); cursor:pointer; transition:background .15s; }
.row:last-child { border-bottom:none; }
.row:hover { background:var(--mj-bg-surface-hover); }
.row .ic { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.ic-msg { background:var(--mj-status-info-bg); color:var(--mj-status-info-text); } .ic-file { background:var(--mj-status-info-bg); color:var(--mj-brand-primary); } .ic-sign { background:var(--mj-status-warning-bg); color:var(--mj-status-warning-text); }
.ic-pdf { background:var(--mj-status-error-bg); color:var(--mj-status-error-text); } .ic-xls { background:var(--mj-status-success-bg); color:var(--mj-status-success-text); } .ic-img { background:color-mix(in srgb, var(--mj-brand-tertiary) 12%, var(--mj-bg-surface)); color:var(--mj-brand-tertiary); } .ic-word { background:var(--mj-status-info-bg); color:var(--mj-status-info-text); } .ic-generic { background:var(--mj-bg-surface-sunken); color:var(--mj-text-muted); }
.row-main { min-width:0; flex:1; }
.row-title { font-size:13.5px; font-weight:600; }
.row-sub { font-size:12px; color:var(--mj-text-muted); margin-top:2px; }
.row-right { margin-left:auto; display:flex; align-items:center; gap:12px; flex-shrink:0; }
.row-time { font-size:11px; color:var(--mj-text-disabled); }
.chev { color:var(--mj-text-disabled); font-size:11px; }

.badge { font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; }
.badge-review { background:var(--mj-status-warning-bg); color:var(--mj-status-warning-text); } .badge-replied { background:var(--mj-status-success-bg); color:var(--mj-status-success-text); } .badge-delivered { background:var(--mj-status-info-bg); color:var(--mj-status-info-text); }
.badge-pending { background:var(--mj-status-warning-bg); color:var(--mj-status-warning-text); } .badge-sent { background:var(--mj-status-warning-bg); color:var(--mj-status-warning-text); } .badge-done { background:var(--mj-status-success-bg); color:var(--mj-status-success-text); } .badge-cancelled { background:var(--mj-bg-surface-sunken); color:var(--mj-text-muted); }

/* Session & security */
.sec-item { display:flex; align-items:center; gap:12px; padding:12px 18px; border-bottom:1px solid var(--mj-border-subtle); font-size:13px; }
.sec-item:last-of-type { border-bottom:none; }
.sec-item .k { color:var(--mj-text-muted); }
.sec-item .v { margin-left:auto; font-weight:600; color:var(--mj-text-primary); display:flex; align-items:center; gap:6px; }
.sec-item .v.ok { color:var(--mj-status-success-text); } .sec-item .v.bad { color:var(--mj-status-error-text); } .sec-item .v.warn { color:var(--mj-status-warning-text); }
.sec-key { font-family:ui-monospace,Consolas,monospace; font-size:11px; background:var(--mj-bg-surface-sunken); padding:2px 7px; border-radius:4px; color:var(--mj-text-secondary); }
.sec-actions { display:flex; gap:8px; padding:14px 18px; }
.btn-danger { background:var(--mj-status-error-bg); color:var(--mj-status-error-text); border:1px solid var(--mj-status-error-border); }
.sec-link-row { display:flex; gap:8px; padding:0 18px 6px; }
.sec-link { flex:1; min-width:0; font-family:monospace; font-size:12px; padding:7px 10px; border:1px solid var(--mj-border-default); border-radius:6px; background:var(--mj-bg-surface-sunken); color:var(--mj-text-primary); }
.sec-link-hint { margin:0; padding:0 18px 14px; font-size:11px; color:var(--mj-text-muted); }

.compliance { display:flex; flex-wrap:wrap; gap:8px; padding:14px 18px; }
.comp-badge { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--mj-status-success-text); background:var(--mj-status-success-bg); border:1px solid var(--mj-status-success-border); padding:5px 10px; border-radius:999px; }

/* Audit timeline */
.audit-note { padding:12px 18px; font-size:12px; color:var(--mj-text-muted); border-bottom:1px solid var(--mj-border-subtle); }
.timeline { position:relative; padding:14px 18px 14px 44px; }
.timeline::before { content:''; position:absolute; left:27px; top:18px; bottom:18px; width:2px; background:var(--mj-border-default); }
.tl-item { position:relative; padding-bottom:20px; }
.tl-item:last-child { padding-bottom:0; }
.tl-dot { position:absolute; left:-26px; top:0; width:20px; height:20px; border-radius:50%; background:var(--mj-bg-surface); border:2px solid var(--mj-border-strong); display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--mj-text-muted); }
.tl-dot.ok{border-color:var(--mj-status-success);color:var(--mj-status-success)} .tl-dot.info{border-color:var(--mj-status-info);color:var(--mj-status-info)} .tl-dot.ai{border-color:var(--mj-brand-primary);color:var(--mj-brand-primary)} .tl-dot.warn{border-color:var(--mj-status-warning);color:var(--mj-status-warning)} .tl-dot.sign{border-color:var(--mj-brand-tertiary);color:var(--mj-brand-tertiary)}
.tl-title { font-size:13px; font-weight:600; }
.tl-desc { font-size:12px; color:var(--mj-text-muted); margin-top:2px; }
.tl-time { font-size:11px; color:var(--mj-text-disabled); margin-top:3px; }

/* Buttons */
.btn { display:inline-flex; align-items:center; gap:6px; font-family:inherit; font-weight:600; border-radius:8px; cursor:pointer; border:1px solid transparent; transition:all .15s; }
.btn-sm { font-size:12.5px; padding:7px 12px; }
.btn-primary { background:var(--mj-brand-primary); color:var(--mj-brand-on-primary); } .btn-primary:hover { background:var(--mj-brand-primary-hover); }
.btn-secondary { background:var(--mj-bg-surface); color:var(--mj-text-primary); border-color:var(--mj-border-default); } .btn-secondary:hover { border-color:var(--mj-border-strong); }
.btn-ghost { background:transparent; color:var(--mj-brand-primary); }
.btn:disabled { opacity:.5; cursor:not-allowed; }

.toast { position:fixed; bottom:22px; left:22px; background:var(--mj-text-primary); color:var(--mj-text-inverse); padding:11px 16px; border-radius:10px; font-size:13px; display:flex; align-items:center; gap:9px; opacity:0; transform:translateY(8px); pointer-events:none; transition:all .2s; z-index:50; }
.toast.show { opacity:1; transform:translateY(0); }
.toast i { color:var(--mj-status-success); }

@media (max-width:1080px){ .stats{ grid-template-columns:repeat(2,1fr); } .grid{ grid-template-columns:1fr; } }
`]
})
export class SecureMessagingClientWorkspaceComponent implements OnInit {
  /** The contact (MJ_BizApps_Common: People.ID) this workspace is scoped to. */
  @Input() contactId = '';
  private _contactName = '';
  /** Avatar initials, precomputed in the contactName setter so the template binds a stable
   * value (avoids NG0100 when contactName resolves async from '' → a real name). */
  initials = '?';
  @Input()
  set contactName(value: string) {
    this._contactName = value || '';
    this.initials = this.computeInitials(this._contactName);
  }
  get contactName(): string { return this._contactName; }
  @Input() contactEmail = '';
  @Input() contactTitle = '';
  @Input() contactPhone = '';

  /** Embeddability knobs (defaults preserve standalone behavior). */
  @Input() initialMode: 'basic' | 'advanced' | null = null;   // overrides the persisted preference
  @Input() suppressToasts = false;                            // host owns user feedback
  @Input() persistModePreference = true;                      // disable localStorage when embedded multiple times

  /** Base URL where the contact-facing widget is hosted; magic links are built as `${this}/?ml=<token>`. */
  @Input() PortalBaseUrl = '';

  /** The most recently issued magic link (surfaced for staff to copy/send). Empty when none. */
  newLink = '';

  /** Host-coordination events (consumed by SecureMessagingResource in standalone, or an external host). */
  @Output() openThreadRequested = new EventEmitter<OpenThreadRequest>();
  @Output() actionRequested = new EventEmitter<WorkspaceActionRequest>();
  @Output() actionCompleted = new EventEmitter<WorkspaceActionRequest>();
  @Output() modeChanged = new EventEmitter<'basic' | 'advanced'>();
  @Output() closeRequested = new EventEmitter<void>();

  mode: WorkspaceMode = 'basic';
  tab: WorkspaceTab = 'threads';
  loading = true;

  threads: ThreadRow[] = [];
  requests: RequestRow[] = [];
  /** ID of the file request currently being cancelled (drives the button spinner). */
  cancellingId: string | null = null;
  docs: DocRow[] = [];
  audit: AuditEvent[] = [];

  session: SessionInfo = { id: null, status: 'None', tokenMasked: '—', expiresLabel: '—', lastAccessLabel: '—' };
  sessionBusy = false;

  /** Open mode for the shared action panel (Request files / Send for signature); null = closed. */
  actionPanel: 'request' | 'signature' | null = null;

  stats = { openThreads: 0, pendingRequests: 0, awaitingSignature: 0, filesShared: 0 };

  toastMsg = '';
  toastShown = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Thread IDs belonging to this contact's portal sessions. */
  private threadIds: string[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    // initialMode (host override) wins over the persisted preference.
    const advanced = this.initialMode != null ? this.initialMode === 'advanced' : this.readSavedAdvanced();
    this.applyMode(advanced);
    await this.loadAll();
    // loadAll() is async (outside the initial CD pass) — re-render so the populated
    // contact header, threads, requests, and session render without a user interaction.
    this.cdr.detectChanges();
  }

  /* ───────── Advanced mode (per-user sticky) ───────── */

  /** Per-contact key so multiple embedded instances don't fight over one global preference. */
  private get modePrefKey(): string {
    return this.contactId ? `${ADV_PREF_KEY}.${this.contactId}` : ADV_PREF_KEY;
  }
  private readSavedAdvanced(): boolean {
    if (!this.persistModePreference) return false;
    try { return localStorage.getItem(this.modePrefKey) === '1'; } catch { return false; }
  }
  private applyMode(advanced: boolean): void {
    this.mode = advanced ? 'advanced' : 'basic';
    if (!advanced && ADVANCED_TABS.includes(this.tab)) {
      this.tab = 'threads';
    } else if (advanced && this.tab === 'threads') {
      // Entering advanced lands on the richer Overview by default.
      this.tab = 'overview';
    }
  }
  toggleMode(): void {
    const advanced = this.mode !== 'advanced';
    if (this.persistModePreference) {
      try { localStorage.setItem(this.modePrefKey, advanced ? '1' : '0'); } catch { /* ignore */ }
    }
    this.applyMode(advanced);
    this.modeChanged.emit(advanced ? 'advanced' : 'basic');
    this.toast(advanced ? 'Advanced mode on — session, compliance & audit shown' : 'Back to the basic view');
  }
  setTab(t: WorkspaceTab): void {
    if (this.mode !== 'advanced' && ADVANCED_TABS.includes(t)) return; // guard hidden tabs
    this.tab = t;
  }

  /** Return to the Executive Inbox (the host/coordinator clears the contact context). */
  back(): void {
    this.closeRequested.emit();
  }

  /* ───────── Data loading ───────── */

  private async loadAll(): Promise<void> {
    this.loading = true;
    try {
      await Promise.all([
        this.loadContact(),                // typed Person + linked Organization
        this.loadSessions(),               // also populates threadIds + session info
      ]);
      await Promise.all([
        this.loadThreads(),
        this.loadRequestsAndSignatures(),
        this.loadDocuments(),
      ]);
      await this.loadAudit();              // depends on the record IDs gathered above
      this.computeStats();
    } catch (e) {
      console.error('Client workspace load failed', e);
      this.toast('Some workspace data could not be loaded.');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Resolve the contact as a typed BizAppsCommon Person, filling any contact display fields
   * (name/email/title/phone) not supplied via @Input.
   */
  private async loadContact(): Promise<void> {
    if (!this.contactId) return;
    try {
      const md = new Metadata();
      const person = await md.GetEntityObject<mjBizAppsCommonPersonEntity>('MJ_BizApps_Common: People');
      if (!(await person.Load(this.contactId))) return;

      this.contactName = this.contactName || person.DisplayName || [person.FirstName, person.LastName].filter(Boolean).join(' ').trim();
      this.contactEmail = this.contactEmail || (person.Email ?? '');
      this.contactTitle = this.contactTitle || (person.Title ?? '');
      this.contactPhone = this.contactPhone || (person.Phone ?? '');
    } catch (e) {
      console.error('loadContact failed', e);
    }
  }

  /** The thread the shared action panel targets — the contact's newest thread (v2: sessions are
   *  per-contact, so the action panel is scoped to a thread, not the session). */
  get activeThreadId(): string | null {
    return this.threadIds[0] ?? null;
  }

  /**
   * Load the contact's portal session (identity) and their threads. In v2 a session is per-contact
   * (one session spans all threads), and threads are their own rows — so the thread list comes from
   * SecureThread (by ContactID), not from session rows.
   */
  private async loadSessions(): Promise<void> {
    if (!this.contactId) return;
    const rv = new RunView();
    const [sessRes, threadRes] = await rv.RunViews([
      {
        EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
        ExtraFilter: `ContactID = '${this.esc(this.contactId)}'`,
        OrderBy: 'LastAccessedAt DESC',
        ResultType: 'simple',
      },
      {
        EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads',
        ExtraFilter: `ContactID = '${this.esc(this.contactId)}' AND IsDeleted = 0`,
        OrderBy: 'LastMessageAt DESC',
        ResultType: 'simple',
      },
    ]);

    if (threadRes.Success && threadRes.Results) {
      const trows = threadRes.Results as Record<string, unknown>[];
      this.threadIds = [...new Set(trows.map(r => String(r.ID)).filter(Boolean))];
    }

    if (sessRes.Success && sessRes.Results) {
      const newest = (sessRes.Results as Record<string, unknown>[])[0];
      if (newest) {
        const status = (newest.Status as SessionInfo['status']) || 'None';
        this.session = {
          id: String(newest.ID),
          status,
          tokenMasked: this.maskToken(newest.TokenHash as string),
          expiresLabel: this.relativeFuture(newest.ExpiresAt as string) + ' (sliding)',
          lastAccessLabel: this.relativePast(newest.LastAccessedAt as string),
        };
      }
    }
  }

  private async loadThreads(): Promise<void> {
    if (this.threadIds.length === 0) return;
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
      ExtraFilter: `ThreadID IN (${this.inList(this.threadIds)})`,
      OrderBy: 'ReceivedAt DESC',
      ResultType: 'simple',
    });
    if (!res.Success) return;
    const rows = res.Results as Record<string, unknown>[];

    // Group messages into threads; newest message drives the title/time/status.
    const byThread = new Map<string, Record<string, unknown>[]>();
    for (const m of rows) {
      const tid = String(m.ThreadID);
      (byThread.get(tid) ?? byThread.set(tid, []).get(tid)!).push(m);
    }
    this.threads = [...byThread.entries()].map(([tid, msgs]) => {
      const latest = msgs[0];
      const count = msgs.length;
      const status = String(latest.Status || 'New');
      return {
        threadId: tid,
        title: (latest.Subject as string) || 'Conversation',
        sub: `${count} message${count === 1 ? '' : 's'} · ${status.toLowerCase()}`,
        time: this.shortDate(latest.ReceivedAt as string),
        badge: this.threadBadge(status),
      };
    });
  }

  private async loadRequestsAndSignatures(): Promise<void> {
    if (this.threadIds.length === 0) return;
    const inThreads = this.inList(this.threadIds);

    // File requests (owned entity).
    const rvF = new RunView();
    const fRes = await rvF.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: File Requests',
      ExtraFilter: `ThreadID IN (${inThreads})`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'simple',
    });
    const fileRows: RequestRow[] = fRes.Success ? (fRes.Results as Record<string, unknown>[]).map(r => ({
      id: String(r.ID),
      title: String(r.Title || 'File request'),
      sub: 'File request' + (r.DueAt ? ` · due ${this.shortDate(r.DueAt as string)}` : ''),
      time: this.shortDate(r.__mj_CreatedAt as string),
      kind: 'file' as const,
      status: String(r.Status || 'Pending'),
      badge: this.fileRequestBadge(String(r.Status || 'Pending')),
    })) : [];

    // Signature requests (core MJ engine entity), linked to the thread via EntityID/RecordID (v2:
    // the SecureThread is the polymorphic owner — matches the server-side SendForSignature link).
    let sigRows: RequestRow[] = [];
    const entityId = this.entityIdOf('MJ_BizApps_SecureMessaging: Secure Threads');
    if (entityId && this.threadIds.length > 0) {
      const rvS = new RunView();
      const sRes = await rvS.RunView({
        EntityName: 'MJ: Signature Requests',
        ExtraFilter: `EntityID = '${this.esc(entityId)}' AND RecordID IN (${this.inList(this.threadIds)})`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
      });
      sigRows = sRes.Success ? (sRes.Results as Record<string, unknown>[]).map(r => ({
        id: String(r.ID),
        title: String(r.Name || 'Signature request'),
        sub: 'Signature' + (r.ExternalEnvelopeID ? ' · envelope sent' : ''),
        time: this.shortDate(r.__mj_CreatedAt as string),
        kind: 'signature' as const,
        status: String(r.Status || 'Draft'),
        badge: this.signatureBadge(String(r.Status || 'Draft')),
      })) : [];
    }

    this.requests = [...fileRows, ...sigRows];
  }

  /**
   * Staff close-out of a Pending file request (PRD §7). Sets Status = Cancelled via the entity
   * layer — the request then drops out of the contact's action strip and collapses to history.
   */
  async cancelRequest(r: RequestRow): Promise<void> {
    if (r.kind !== 'file' || r.status !== 'Pending' || this.cancellingId) return;
    if (!confirm(`Cancel the request "${r.title}"? The contact will no longer be asked for it.`)) return;
    this.cancellingId = r.id;
    this.cdr.detectChanges();
    try {
      const md = new Metadata();
      const fr = await md.GetEntityObject<mjBizAppsSecureMessagingFileRequestEntity>('MJ_BizApps_SecureMessaging: File Requests');
      const loaded = await fr.InnerLoad(CompositeKey.FromID(r.id));
      if (!loaded) {
        this.toast('Could not load the request to cancel.');
        return;
      }
      fr.Status = 'Cancelled';
      if (await fr.Save()) {
        await this.loadRequestsAndSignatures();
        this.computeStats();
        this.toast('Request cancelled.');
      } else {
        this.toast(fr.LatestResult?.CompleteMessage || 'Could not cancel the request.');
      }
    } catch (e) {
      console.error('cancelRequest failed', e);
      this.toast('Could not cancel the request.');
    } finally {
      this.cancellingId = null;
      this.cdr.detectChanges();
    }
  }

  private async loadDocuments(): Promise<void> {
    if (this.threadIds.length === 0) return;
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
      ExtraFilter: `ThreadID IN (${this.inList(this.threadIds)})`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'simple',
    });
    if (!res.Success) return;
    this.docs = (res.Results as Record<string, unknown>[]).map(r => {
      const filename = String(r.Filename || 'document');
      const size = r.Size ? Number(r.Size) : 0;
      return {
        id: String(r.ID),
        filename,
        sub: `${this.formatSize(size)} · ${this.shortDate(r.__mj_CreatedAt as string)}`,
        fileId: r.FileID ? String(r.FileID) : null,
        iconClass: this.docIconClass(filename, String(r.ContentType || '')),
      };
    });
  }

  /** Build the audit timeline from MJ: Record Changes across this contact's records. */
  private async loadAudit(): Promise<void> {
    const sessionEntityId = this.entityIdOf('MJ_BizApps_SecureMessaging: Portal Sessions');
    const sessionIds = await this.sessionIdsForContact();
    if (sessionIds.length === 0) return;

    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ: Record Changes',
      ExtraFilter: `EntityID = '${this.esc(sessionEntityId)}' AND RecordID IN (${this.inList(sessionIds)})`,
      OrderBy: 'ChangedAt DESC',
      MaxRows: 50,
      ResultType: 'simple',
    });
    if (!res.Success) return;
    this.audit = (res.Results as Record<string, unknown>[]).map(r => {
      const type = String(r.Type || 'Update');
      return {
        kind: type === 'Create' ? 'ok' : type === 'Delete' ? 'warn' : 'info',
        icon: type === 'Create' ? 'fa-circle-plus' : type === 'Delete' ? 'fa-trash' : 'fa-pen',
        title: (r.ChangesDescription as string) || `${type} · session`,
        desc: `${r.Entity || 'Portal Session'} · by ${r.User || 'system'}`,
        time: this.fullDateTime(r.ChangedAt as string),
      };
    });
  }

  private computeStats(): void {
    this.stats = {
      openThreads: this.threads.length,
      pendingRequests: this.requests.filter(r => r.kind === 'file' && r.badge.cls === 'badge-pending').length,
      awaitingSignature: this.requests.filter(r => r.kind === 'signature' && r.badge.cls === 'badge-sent').length,
      filesShared: this.docs.length,
    };
  }

  /* ───────── Session actions ───────── */

  async sendNewLink(): Promise<void> {
    if (!this.session.id) return;
    this.sessionBusy = true;
    try {
      // Issue a fresh single-use magic link via the server-side 'Issue Portal Magic Link'
      // Action. Token generation + hashing happen server-side (PortalAuthService); the staff
      // client never mints or stores a raw token. The Action returns the raw token as an
      // output param for out-of-band delivery to the contact.
      const actionId = await this.resolveActionId('Issue Portal Magic Link');
      if (!actionId) { this.toast('The magic-link action is not registered'); return; }

      const client = new GraphQLActionClient(Metadata.Provider as unknown as GraphQLDataProvider);
      const result = await client.RunAction(actionId, [
        { Name: 'SessionID', Value: this.session.id, Type: 'Input' },
      ]);

      if (result?.Success) {
        // Output params come back on result.Result (numeric-keyed), NOT result.Params.
        const token = this.extractOutputParams(result).find(p => p.Name === 'MagicLinkToken')?.Value as string | undefined;
        this.newLink = token ? `${this.portalBaseUrl()}/?ml=${encodeURIComponent(token)}` : '';
        this.toast(this.newLink ? 'New magic link issued — copy it to the contact' : 'Magic link issued');
        await this.loadAudit();
      } else {
        this.toast(result?.Message || 'Could not issue a magic link');
      }
    } catch (e) {
      console.error('sendNewLink failed', e);
      this.toast('Could not issue a magic link');
    } finally {
      this.sessionBusy = false;
      this.cdr.detectChanges();
    }
  }

  /** Resolve an Action's ID by name (RunView on MJ: Actions). */
  private async resolveActionId(name: string): Promise<string | null> {
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name = '${this.esc(name)}'`,
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (!res.Success || res.Results.length === 0) return null;
    return String((res.Results as Record<string, unknown>[])[0].ID);
  }

  async revoke(): Promise<void> {
    if (!this.session.id || this.session.status === 'Revoked') return;
    if (!confirm('Revoke this contact’s secure session? They will need a new magic link to return.')) return;
    this.sessionBusy = true;
    try {
      const md = new Metadata();
      const s = await md.GetEntityObject<mjBizAppsSecureMessagingPortalSessionEntity>('MJ_BizApps_SecureMessaging: Portal Sessions');
      const loaded = await s.Load(this.session.id);
      if (!loaded) { this.toast('Session not found'); return; }
      s.Status = 'Revoked';
      if (await s.Save()) {
        this.session = { ...this.session, status: 'Revoked' };
        this.toast('Session revoked — token invalidated');
        await this.loadAudit();
      } else {
        this.toast(s.LatestResult?.CompleteMessage || 'Could not revoke the session');
      }
    } catch (e) {
      console.error('revoke failed', e);
      this.toast('Could not revoke the session');
    } finally {
      this.sessionBusy = false;
      this.cdr.detectChanges();
    }
  }

  /** Copy the most recently issued magic link to the clipboard. */
  copyNewLink(): void {
    if (this.newLink && navigator.clipboard) {
      void navigator.clipboard.writeText(this.newLink);
      this.toast('Magic link copied');
    }
  }

  /**
   * Base URL of the contact-facing WIDGET (a separate app, served at its own origin root — NOT a
   * sub-path of the staff app). Magic links are built as `${base}/?ml=<token>`. Resolution order:
   *   1. PortalBaseUrl @Input (host wires it explicitly), else
   *   2. window.__SECURE_MESSAGING_PORTAL_URL__ global (host config, no code change), else
   *   3. dev default — the widget dev server on :4400.
   * Trailing slashes are trimmed so the link never doubles `//`.
   */
  private portalBaseUrl(): string {
    const w = window as unknown as { __SECURE_MESSAGING_PORTAL_URL__?: string };
    const base = this.PortalBaseUrl || w.__SECURE_MESSAGING_PORTAL_URL__ || 'http://localhost:4400';
    return base.replace(/\/+$/, '');
  }

  /**
   * Action output params are returned on result.Result as a numeric-keyed object (not result.Params).
   * Normalize to ActionParam[]. (Same helper as the executive component.)
   */
  private extractOutputParams(result: ActionResult): ActionParam[] {
    const raw: unknown = result.Result;
    if (Array.isArray(raw)) return raw as ActionParam[];
    if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw as object);
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        const obj = raw as Record<string, ActionParam>;
        return keys.sort((a, b) => +a - +b).map(k => obj[k]);
      }
    }
    return [];
  }

  /* ───────── Documents ───────── */

  async downloadDoc(d: DocRow): Promise<void> {
    if (!d.fileId) { this.toast('No stored file for this document'); return; }
    try {
      const md = new Metadata();
      const file = await md.GetEntityObject<MJFileEntity>('MJ: Files');
      if (!(await file.Load(d.fileId))) { this.toast('File record not found'); return; }
      const providerKey = file.ProviderKey || file.Name;

      // Resolve the storage account for this file's provider, then pre-auth a download URL.
      const rv = new RunView();
      const accRes = await rv.RunView({
        EntityName: 'MJ: File Storage Accounts',
        ExtraFilter: `ProviderID = '${this.esc(file.Get('ProviderID') as string)}'`,
        MaxRows: 1,
        ResultType: 'simple',
      });
      const account = accRes.Success ? (accRes.Results as Record<string, unknown>[])[0] : null;
      if (!account) { this.toast('No storage account configured'); return; }

      const client = new GraphQLFileStorageClient(Metadata.Provider as unknown as GraphQLDataProvider);
      const url = await client.CreatePreAuthDownloadUrl(String(account.ID), providerKey);
      window.open(url, '_blank');
    } catch (e) {
      console.error('downloadDoc failed', e);
      this.toast('Could not generate a download link');
    }
  }

  openThread(t: ThreadRow): void {
    // Hand the thread to the host (coordinator or external) to open in a conversation view.
    if (this.openThreadRequested.observed) {
      this.openThreadRequested.emit({ threadId: t.threadId, contactId: this.contactId, title: t.title });
    } else {
      this.toast(`Opening: ${t.title}`);
    }
  }

  act(kind: 'message' | 'request' | 'signature'): void {
    // Notify the host of the intent (lets it observe/override; harmless if unobserved).
    this.actionRequested.emit({ kind, contactId: this.contactId, threadId: this.activeThreadId });

    if (kind === 'message') {
      // Compose is a separate surface (Phase 2) — not part of the request/signature panel.
      this.toast('Opening compose…');
      return;
    }
    if (!this.activeThreadId) {
      this.toast('No active conversation thread to act on.');
      return;
    }
    this.actionPanel = kind; // 'request' | 'signature' — opens the shared action panel
  }

  /** Called when the shared action panel completes; refresh requests so the new row shows. */
  onActionDone(): void {
    const kind = this.actionPanel; // 'request' | 'signature'
    this.actionPanel = null;
    // Reload the affected data, then recompute stats + re-render so the Requests &
    // Signatures tab and the stat cards reflect the new record without a navigation.
    void (async () => {
      await this.loadRequestsAndSignatures();
      this.computeStats();
      this.cdr.detectChanges();
    })();
    if (kind) this.actionCompleted.emit({ kind, contactId: this.contactId, threadId: this.activeThreadId });
    this.toast('Done.');
  }

  closeActionPanel(): void {
    this.actionPanel = null;
  }

  /* ───────── Presentation helpers ───────── */

  get sessionPillClass(): string {
    return this.session.status === 'Revoked' ? 'revoked' : this.session.status === 'Expired' ? 'expired' : '';
  }
  get sessionPillLabel(): string {
    switch (this.session.status) {
      case 'Active': return 'Secure session active';
      case 'Revoked': return 'Session revoked';
      case 'Expired': return 'Session expired';
      default: return 'No active session';
    }
  }
  get sessionIcon(): string {
    return this.session.status === 'Active' ? 'fa-circle-check' : this.session.status === 'Revoked' ? 'fa-ban' : 'fa-clock';
  }
  get sessionTextClass(): string {
    return this.session.status === 'Active' ? 'ok' : this.session.status === 'Revoked' ? 'bad' : 'warn';
  }

  openRequests(): RequestRow[] {
    return this.requests.filter(r => r.badge.cls !== 'badge-done' && r.badge.cls !== 'badge-cancelled');
  }

  docIcon(d: DocRow): string {
    if (d.iconClass === 'ic-pdf') return 'fa-file-pdf';
    if (d.iconClass === 'ic-xls') return 'fa-file-excel';
    if (d.iconClass === 'ic-img') return 'fa-file-image';
    if (d.iconClass === 'ic-word') return 'fa-file-word';
    return 'fa-file';
  }

  private threadBadge(status: string): ThreadRow['badge'] {
    switch (status) {
      case 'Replied': case 'Sent': return { cls: 'badge-replied', label: 'Replied' };
      case 'Read': return { cls: 'badge-delivered', label: 'Delivered' };
      case 'New': return { cls: 'badge-review', label: 'Needs Review' };
      default: return { cls: 'badge-delivered', label: status };
    }
  }
  private fileRequestBadge(status: string): RequestRow['badge'] {
    switch (status) {
      case 'Fulfilled': return { cls: 'badge-done', label: 'Fulfilled' };
      case 'Cancelled': return { cls: 'badge-cancelled', label: 'Cancelled' };
      case 'Expired': return { cls: 'badge-cancelled', label: 'Expired' };
      default: return { cls: 'badge-pending', label: 'Pending' };
    }
  }
  private signatureBadge(status: string): RequestRow['badge'] {
    switch (status) {
      case 'Signed': case 'Completed': return { cls: 'badge-done', label: 'Signed' };
      case 'Declined': return { cls: 'badge-cancelled', label: 'Declined' };
      case 'Voided': return { cls: 'badge-cancelled', label: 'Cancelled' };
      case 'Draft': return { cls: 'badge-pending', label: 'Draft' };
      default: return { cls: 'badge-sent', label: 'Awaiting sig' };
    }
  }

  private docIconClass(filename: string, contentType: string): string {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || contentType.includes('pdf')) return 'ic-pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext) || contentType.includes('sheet')) return 'ic-xls';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || contentType.startsWith('image/')) return 'ic-img';
    if (['doc', 'docx'].includes(ext) || contentType.includes('word')) return 'ic-word';
    return 'ic-generic';
  }

  private computeInitials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  private maskToken(hash: string | null): string {
    if (!hash) return 'sm_•••••••';
    return 'sm_••••••' + hash.slice(-4);
  }

  private esc(s: string): string { return (s || '').replace(/'/g, "''"); }
  private inList(ids: string[]): string { return ids.map(id => `'${this.esc(id)}'`).join(', ') || "''"; }

  /** Resolve the MJ Entity ID for an entity name via the metadata provider. */
  private entityIdOf(name: string): string {
    const e = new Metadata().Entities.find(x => x.Name === name);
    return e ? e.ID : '';
  }

  /** Portal session IDs for this contact (used for signature + audit lookups). */
  private async sessionIdsForContact(): Promise<string[]> {
    if (!this.contactId) return [];
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
      ExtraFilter: `ContactID = '${this.esc(this.contactId)}'`,
      ResultType: 'simple',
    });
    if (!res.Success) return [];
    return (res.Results as Record<string, unknown>[]).map(r => String(r.ID));
  }

  /* ───────── Date formatting ───────── */

  private shortDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  private fullDateTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  private relativeFuture(iso: string | null): string {
    if (!iso) return '—';
    const ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms)) return '—';
    if (ms <= 0) return 'expired';
    const days = Math.round(ms / 86400000);
    if (days >= 1) return `in ${days} day${days === 1 ? '' : 's'}`;
    const hrs = Math.round(ms / 3600000);
    return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  private relativePast(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return '—';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return this.shortDate(iso);
  }
  private formatSize(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  private toast(msg: string): void {
    if (this.suppressToasts) return; // host owns user feedback when embedded
    this.toastMsg = msg;
    this.toastShown = true;
    this.cdr.detectChanges();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastShown = false; this.cdr.detectChanges(); }, 2600);
  }
}
