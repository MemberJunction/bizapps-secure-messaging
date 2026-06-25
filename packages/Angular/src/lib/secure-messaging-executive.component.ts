import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, Optional, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Metadata, RunView } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { GraphQLDataProvider, GraphQLFileStorageClient, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { mjBizAppsSecureMessagingSecureMessageEntity } from '@mj-biz-apps/secure-messaging-entities';
import { ContactSelection } from './secure-messaging.contracts';

/* ─── Interfaces ─── */

interface SecureMessageNavItem {
  id: string;
  label: string;
  icon: string;
  count?: number;
}

interface StatusBadge {
  type: 'new' | 'escalated' | 'delivered' | 'system' | 'replied';
  label: string;
}

interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

interface SecureMessageItem {
  id: string;
  senderName: string;
  senderEmail: string;
  personId?: string;
  subject: string;
  preview: string;
  bodyHtml: SafeHtml;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  isSecure: boolean;
  statusBadge?: StatusBadge;
  attachmentCount: number;
  attachments: MessageAttachment[];
  threadId?: string;
  replyCount?: number;
  /** 'Inbound' (from contact) or 'Outbound' (reply to contact). Drives the Sent/Inbox nav split. */
  direction: 'Inbound' | 'Outbound';
}

/** A per-person workspace grouping derived from the loaded messages. */
interface WorkspaceNavItem {
  /** Stable key: PersonID when present, otherwise the sender email. */
  key: string;
  label: string;
  count: number;
}

@Component({
  standalone: false,
  selector: 'mj-secure-messaging-executive',
  template: `
<div class="sm-layout" [class.sidebar-collapsed]="isSidebarCollapsed">

  <!-- LEFT SIDEBAR -->
  <aside class="sm-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-brand">
        <i class="fa-solid fa-shield-halved"></i>
        <span class="brand-text">Secure Messages</span>
      </div>
      <button class="sidebar-toggle" (click)="toggleSidebar()" title="Toggle sidebar">
        <i class="fa-solid" [class.fa-chevron-left]="!isSidebarCollapsed" [class.fa-chevron-right]="isSidebarCollapsed"></i>
      </button>
    </div>

    <div class="sidebar-profile">
      @if (avatarUrl) {
        <img class="profile-avatar profile-avatar-img" [src]="avatarUrl" [alt]="userName" />
      } @else if (avatarIconClass) {
        <div class="profile-avatar"><i [class]="avatarIconClass"></i></div>
      } @else {
        <div class="profile-avatar">{{ getInitials(userName) }}</div>
      }
      <div class="profile-info">
        <div class="profile-name">{{ userName }}</div>
        <div class="profile-email">{{ userEmail }}</div>
      </div>
    </div>

    <button class="compose-btn" (click)="onCompose()">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>Compose</span>
    </button>

    <div class="sidebar-section">
      <div class="sidebar-section-label">Messages</div>
      <nav class="sidebar-nav">
        @for (item of primaryNavItems; track item.id) {
          <div class="sidebar-item" [class.active]="activeNav === item.id" (click)="selectNav(item.id)">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
            @if (item.count) {
              <div class="badge">{{ item.count }}</div>
            }
          </div>
        }
      </nav>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-label">Categories</div>
      <nav class="sidebar-nav">
        @for (item of categoryNavItems; track item.id) {
          <div class="sidebar-item" [class.active]="activeNav === item.id" (click)="selectNav(item.id)">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
            @if (item.count) {
              <div class="badge">{{ item.count }}</div>
            }
          </div>
        }
      </nav>
    </div>

    @if (workspaceNavItems.length > 0) {
      <div class="sidebar-section">
        <div class="sidebar-section-label">Workspaces</div>
        <nav class="sidebar-nav">
          <div class="sidebar-item" [class.active]="activeWorkspace === null" (click)="selectWorkspace(null)">
            <i class="fa-solid fa-users"></i>
            <span>All contacts</span>
          </div>
          @for (ws of workspaceNavItems; track ws.key) {
            <div class="sidebar-item" [class.active]="activeWorkspace === ws.key" (click)="selectWorkspace(ws.key)">
              <i class="fa-solid fa-user"></i>
              <span>{{ ws.label }}</span>
              <div class="badge">{{ ws.count }}</div>
            </div>
          }
        </nav>
      </div>
    }

    <div class="sidebar-spacer"></div>

    <div class="sidebar-footer">
      <i class="fa-solid fa-lock"></i>
      <span>End-to-end encrypted</span>
    </div>
  </aside>

  <!-- MIDDLE: MESSAGE LIST -->
  <div class="sm-message-list">
    <div class="list-header">
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          type="text"
          placeholder="Search messages..."
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
        >
        @if (searchQuery) {
          <button class="search-clear" (click)="clearSearch()">
            <i class="fa-solid fa-xmark"></i>
          </button>
        }
      </div>
      <div class="list-sort">
        <span>Sort:</span>
        <button class="sort-option" [class.active]="sortMode === 'date'" (click)="toggleSort('date')">Date</button>
        <span class="sort-sep">&middot;</span>
        <button class="sort-option" [class.active]="sortMode === 'sender'" (click)="toggleSort('sender')">Sender</button>
        <span class="sort-sep">&middot;</span>
        <button class="sort-option" [class.active]="sortMode === 'status'" (click)="toggleSort('status')">Status</button>
      </div>
    </div>

    <div class="list-body">
      @for (msg of filteredMessages; track msg.id) {
        <div
          class="msg-item"
          [class.unread]="!msg.isRead"
          [class.active]="selectedMessage?.id === msg.id"
          (click)="selectMessage(msg)"
        >
          <div class="msg-row-top">
            <div class="msg-sender">{{ msg.senderName }}</div>
            <div class="msg-time">{{ formatTime(msg.receivedAt) }}</div>
          </div>
          <div class="msg-preview">{{ msg.preview }}</div>
          <div class="msg-meta">
            @if (msg.statusBadge) {
              <span class="status-badge" [ngClass]="'status-' + msg.statusBadge.type">
                {{ msg.statusBadge.label }}
              </span>
            }
            @if (msg.replyCount) {
              <span class="msg-indicator"><i class="fa-solid fa-comment"></i> {{ msg.replyCount }}</span>
            }
            @if (msg.attachmentCount > 0) {
              <span class="msg-indicator"><i class="fa-solid fa-paperclip"></i></span>
            }
            <div class="msg-indicators">
              <i
                class="msg-star"
                [class.fa-solid]="msg.isStarred"
                [class.fa-regular]="!msg.isStarred"
                [class.starred]="msg.isStarred"
                class="fa-star"
                (click)="toggleStar(msg, $event)"
              ></i>
            </div>
          </div>
        </div>
      }

      @if (filteredMessages.length === 0 && !isLoading) {
        <div class="empty-state">
          <i class="fa-solid fa-inbox"></i>
          <p>No messages found</p>
        </div>
      }
    </div>
  </div>

  <!-- RIGHT: DETAIL PANEL -->
  <div class="sm-detail-panel">
    @if (selectedMessage) {
      <div class="detail-header">
        <div class="detail-header-top">
          <div class="detail-avatar">{{ getInitials(selectedMessage.senderName) }}</div>
          <div class="detail-header-info">
            <div class="detail-subject">{{ selectedMessage.senderName }}</div>
            <div class="detail-from">
              &lt;{{ selectedMessage.senderEmail }}&gt;
              @if (selectedMessage.statusBadge) {
                <span class="status-badge" [ngClass]="'status-' + selectedMessage.statusBadge.type">
                  {{ selectedMessage.statusBadge.label }}
                </span>
              }
            </div>
            <div class="detail-date">{{ formatDetailDate(selectedMessage.receivedAt) }}</div>
          </div>
          <div class="detail-actions">
            <button class="detail-action-btn" title="Reply" (click)="onReply()">
              <i class="fa-solid fa-reply"></i>
            </button>
            <button class="detail-action-btn" title="Request files" (click)="openRequestFiles()">
              <i class="fa-solid fa-folder-plus"></i>
            </button>
            <button class="detail-action-btn" title="Send for signature" (click)="openSendForSignature()">
              <i class="fa-solid fa-file-signature"></i>
            </button>
            <button class="detail-action-btn" title="Archive" (click)="onArchive()">
              <i class="fa-solid fa-box-archive"></i>
            </button>
            <button class="detail-action-btn" title="Star" (click)="toggleStar(selectedMessage, $event)">
              <i [class.fa-solid]="selectedMessage.isStarred" [class.fa-regular]="!selectedMessage.isStarred" class="fa-star"></i>
            </button>
            <button class="detail-action-btn" title="More">
              <i class="fa-solid fa-ellipsis"></i>
            </button>
          </div>
        </div>
      </div>

      @if (selectedMessage.isSecure) {
        <div class="security-bar">
          <i class="fa-solid fa-shield-check"></i>
          <span>This message is end-to-end encrypted</span>
        </div>
      }

      @if (actionPanel && selectedMessage.threadId) {
        <mj-secure-messaging-action-panel
          [mode]="actionPanel"
          [threadId]="selectedMessage.threadId"
          [contactEmail]="selectedMessage.senderEmail"
          (done)="closeActionPanel()"
          (cancel)="closeActionPanel()">
        </mj-secure-messaging-action-panel>
      }

      <div class="detail-body">
        <!-- Full conversation thread, oldest-first. Outbound (staff) align right; inbound (contact) left. -->
        @for (m of threadMessages; track m.id) {
          <div class="thread-msg" [class.thread-msg--out]="m.direction === 'Outbound'">
            <div class="thread-msg__meta">
              <span class="thread-msg__sender">{{ m.direction === 'Outbound' ? (m.senderName || 'You') : m.senderName }}</span>
              <span class="thread-msg__time">{{ formatDetailDate(m.receivedAt) }}</span>
            </div>
            <div class="thread-msg__bubble" [innerHTML]="m.bodyHtml"></div>
          </div>
        }

        @if (selectedMessage.attachments.length > 0) {
          <div class="attachments-section">
            <div class="attachments-header">
              <i class="fa-solid fa-paperclip"></i>
              {{ selectedMessage.attachments.length }} attachment{{ selectedMessage.attachments.length > 1 ? 's' : '' }}
            </div>
            @for (att of selectedMessage.attachments; track att.id) {
              <div class="attachment-item">
                <i [class]="getFileIcon(att.contentType)"></i>
                <div class="attachment-info">
                  <div class="attachment-name">{{ att.filename }}</div>
                  <div class="attachment-size">{{ formatFileSize(att.size) }}</div>
                </div>
                <button class="attachment-download" title="Download" (click)="downloadAttachment(att)">
                  <i class="fa-solid fa-download"></i>
                </button>
              </div>
            }
          </div>
        }
      </div>

      <div class="reply-bar">
        <button class="reply-attach" title="Attach file">
          <i class="fa-solid fa-paperclip"></i>
        </button>
        <div class="reply-input-wrap">
          <input
            class="reply-input"
            type="text"
            placeholder="Write a reply..."
            [(ngModel)]="replyText"
            (keyup.enter)="onSendReply()"
          >
        </div>
        <button class="reply-send" (click)="onSendReply()" [disabled]="!replyText.trim() || sendingReply">
          <i class="fa-solid fa-paper-plane"></i>
          Send
        </button>
      </div>
    } @else {
      <div class="no-selection">
        <i class="fa-solid fa-envelope-open-text"></i>
        <h3>Select a message to view</h3>
        <p>Choose from the message list on the left</p>
      </div>
    }
  </div>

</div>
  `,
  styles: [`
/* ============================================================ */
/* SECURE MESSAGING — EXECUTIVE VIEW                            */
/* Uses --mat-sys-* design tokens from MJ Explorer              */
/* ============================================================ */

:host {
  display: block;
  height: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ─── THREE-COLUMN LAYOUT ─── */

.sm-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-sunken));
}

/* ─── LEFT SIDEBAR (always dark) ─── */

.sm-sidebar {
  width: 240px;
  min-width: 240px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 0.2s ease, min-width 0.2s ease;
}

.sidebar-collapsed .sm-sidebar {
  width: 64px;
  min-width: 64px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-brand i {
  font-size: 16px;
  color: var(--mat-sys-primary, var(--mj-brand-primary));
}

.brand-text {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.sidebar-collapsed .brand-text {
  display: none;
}

.sidebar-toggle {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

/* Profile */

.sidebar-profile {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-collapsed .sidebar-profile {
  justify-content: center;
}

.profile-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  color: #ffffff;
}

.profile-avatar-img {
  background: none;
  object-fit: cover;
}

.profile-info {
  min-width: 0;
}

.sidebar-collapsed .profile-info {
  display: none;
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-email {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Compose button */

.compose-btn {
  margin: 16px;
  padding: 11px 0;
  background: var(--mat-sys-primary, var(--mj-brand-primary));
  border: none;
  border-radius: 10px;
  color: var(--mat-sys-on-primary, var(--mj-brand-on-primary));
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.compose-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.sidebar-collapsed .compose-btn span {
  display: none;
}

.sidebar-collapsed .compose-btn {
  padding: 11px;
}

/* Sidebar navigation */

.sidebar-section {
  padding: 16px 0 4px;
}

.sidebar-section-label {
  padding: 0 16px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #64748b;
}

.sidebar-collapsed .sidebar-section-label {
  display: none;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.sidebar-item.active {
  background: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
  color: var(--mj-brand-primary);
}

.sidebar-item.active i {
  color: var(--mj-brand-primary);
}

.sidebar-item i {
  width: 18px;
  text-align: center;
  font-size: 14px;
  color: #94a3b8;
  flex-shrink: 0;
}

.sidebar-item .badge {
  margin-left: auto;
  background: var(--mat-sys-primary, var(--mj-brand-primary));
  color: var(--mj-brand-on-primary);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.sidebar-collapsed .sidebar-item {
  justify-content: center;
  padding: 12px;
}

.sidebar-collapsed .sidebar-item span {
  display: none;
}

.sidebar-collapsed .sidebar-item .badge {
  position: absolute;
  top: 4px;
  right: 8px;
  margin-left: 0;
  font-size: 9px;
  padding: 1px 5px;
}

/* Sidebar footer */

.sidebar-spacer {
  flex: 1;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
}

.sidebar-footer i {
  font-size: 12px;
  color: var(--mj-status-success);
}

.sidebar-collapsed .sidebar-footer span {
  display: none;
}

.sidebar-collapsed .sidebar-footer {
  justify-content: center;
}

/* ─── MIDDLE: MESSAGE LIST ─── */

.sm-message-list {
  width: 380px;
  min-width: 380px;
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-right: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  display: flex;
  flex-direction: column;
}

.list-header {
  padding: 16px;
  border-bottom: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  flex-shrink: 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-sunken));
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-color: var(--mat-sys-primary, var(--mj-brand-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
}

.search-box i {
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  font-size: 14px;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  font-family: inherit;
}

.search-box input::placeholder {
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.search-clear {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  transition: all 0.15s;
}

.search-clear:hover {
  background: var(--mat-sys-surface-container-high, var(--mj-bg-surface-hover));
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
}

.list-sort {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 0 0;
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.list-sort > span {
  margin-right: 4px;
  font-weight: 500;
}

.sort-option {
  padding: 3px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
  font-family: inherit;
  font-size: 12px;
}

.sort-option:hover {
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
}

.sort-option.active {
  color: var(--mat-sys-primary, var(--mj-brand-primary));
  font-weight: 600;
}

.sort-sep {
  color: var(--mat-sys-outline-variant, var(--mj-border-default));
}

/* Message list body */

.list-body {
  flex: 1;
  overflow-y: auto;
}

.list-body::-webkit-scrollbar {
  width: 4px;
}

.list-body::-webkit-scrollbar-thumb {
  background: var(--mat-sys-outline, var(--mj-border-strong));
  border-radius: 4px;
}

/* Message item */

.msg-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--mat-sys-surface-container, var(--mj-border-default));
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.msg-item:hover {
  background: var(--mat-sys-surface-container-low, var(--mj-bg-surface-hover));
}

.msg-item.active {
  background: var(--mat-sys-primary-container, color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)));
  border-left: 3px solid var(--mat-sys-primary, var(--mj-brand-primary));
  padding-left: 13px;
}

.msg-item.unread .msg-sender {
  font-weight: 700;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
}

.msg-item.unread::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 18px;
  width: 8px;
  height: 8px;
  background: var(--mat-sys-primary, var(--mj-brand-primary));
  border-radius: 50%;
}

.msg-item.unread {
  padding-left: 32px;
}

.msg-item.active.unread {
  padding-left: 29px;
}

.msg-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}

.msg-sender {
  font-size: 13px;
  font-weight: 600;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
}

.msg-time {
  font-size: 11px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  flex-shrink: 0;
}

.msg-subject {
  font-size: 13px;
  font-weight: 500;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg-preview {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Status badges */

.status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--mat-sys-corner-extra-small, 4px);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.status-new {
  background: var(--mj-status-info-bg);
  color: var(--mj-status-info-text);
}

.status-escalated {
  background: var(--mj-status-warning-bg);
  color: var(--mj-status-warning-text);
}

.status-delivered {
  background: var(--mj-status-success-bg);
  color: var(--mj-status-success-text);
}

.status-system {
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-sunken));
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
}

.status-replied {
  background: #ede9fe;
  color: #7c3aed;
}

.msg-indicators {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.msg-indicator {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.msg-indicator i {
  font-size: 11px;
}

.msg-star {
  color: var(--mat-sys-outline, var(--mj-border-strong));
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s;
}

.msg-star:hover {
  color: var(--mj-status-warning);
}

.msg-star.starred {
  color: var(--mj-status-warning);
}

/* Empty state */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.empty-state i {
  font-size: 2.5rem;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

/* ─── RIGHT: DETAIL PANEL ─── */

.sm-detail-panel {
  flex: 1;
  background: var(--mat-sys-surface-container-low, var(--mj-bg-surface-card));
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail-header {
  padding: 20px 28px;
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-bottom: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  flex-shrink: 0;
}

.detail-header-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.detail-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mj-text-inverse);
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.detail-header-info {
  flex: 1;
  min-width: 0;
}

.detail-subject {
  font-size: 18px;
  font-weight: 700;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  margin-bottom: 4px;
  line-height: 1.3;
}

.detail-from {
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-from strong {
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  font-weight: 600;
}

.detail-from .status-badge {
  font-size: 9px;
  padding: 1px 6px;
}

.detail-date {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  margin-top: 2px;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.detail-action-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  border-radius: var(--mat-sys-corner-small, 8px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  transition: all 0.15s;
}

.detail-action-btn:hover {
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-hover));
  color: var(--mat-sys-on-surface, var(--mj-text-secondary));
}

/* Security bar */

.security-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 28px;
  background: var(--mj-status-success-bg);
  border-bottom: 1px solid var(--mj-status-success-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--mj-status-success-text);
}

/* ─── Action panel (Request files / Send for signature) ─── */

.action-panel {
  margin: 12px 28px 0;
  padding: 16px;
  background: var(--mat-sys-surface-container-low, var(--mj-bg-surface-card));
  border: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  border-radius: var(--mat-sys-corner-medium, 12px);
}

.action-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  margin-bottom: 12px;
}

.action-panel-header i {
  color: var(--mat-sys-primary, var(--mj-brand-primary));
}

.action-panel-close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  cursor: pointer;
  font-size: 14px;
}

.action-panel-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  border-radius: var(--mat-sys-corner-small, 8px);
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}

.action-panel-input:focus {
  outline: none;
  border-color: var(--mat-sys-primary, var(--mj-brand-primary));
}

.action-panel-error {
  font-size: 12px;
  color: var(--mat-sys-error, var(--mj-status-error-text));
  margin-bottom: 8px;
}

.action-panel-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
  margin-bottom: 4px;
}

.action-panel-hint {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
  margin-bottom: 8px;
}

.action-panel-footer {
  display: flex;
  justify-content: flex-end;
}

.action-panel-submit {
  padding: 8px 16px;
  border: none;
  border-radius: var(--mat-sys-corner-small, 8px);
  background: var(--mat-sys-primary, var(--mj-brand-primary));
  color: var(--mat-sys-on-primary, var(--mj-brand-on-primary));
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}

.action-panel-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.security-bar i {
  font-size: 13px;
}

/* Detail body */

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}

.detail-body::-webkit-scrollbar {
  width: 4px;
}

.detail-body::-webkit-scrollbar-thumb {
  background: var(--mat-sys-outline, var(--mj-border-strong));
  border-radius: 4px;
}

/* Conversation thread bubbles in the detail pane */
.thread-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 16px;
  max-width: 78%;
}
.thread-msg--out {
  align-items: flex-end;
  margin-left: auto;
}
.thread-msg__meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
  padding: 0 4px;
}
.thread-msg__sender {
  font-size: 12px;
  font-weight: 700;
  color: var(--mj-text-secondary);
}
.thread-msg__time {
  font-size: 11px;
  color: var(--mj-text-muted);
}
.thread-msg__bubble {
  background: var(--mj-bg-surface-card);
  border: 1px solid var(--mj-border-default);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--mj-text-primary);
}
.thread-msg--out .thread-msg__bubble {
  background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
  border-color: color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
}

.message-content {
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-radius: var(--mat-sys-corner-medium, 12px);
  padding: 28px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  font-size: 14px;
  line-height: 1.7;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  max-width: 720px;
}

:host ::ng-deep .message-content p {
  margin-bottom: 16px;
}

:host ::ng-deep .message-content p:last-child {
  margin-bottom: 0;
}

:host ::ng-deep .message-content ol {
  margin: 12px 0 16px 20px;
}

:host ::ng-deep .message-content ol li {
  margin-bottom: 6px;
}

:host ::ng-deep .message-content .signature {
  margin-top: 20px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
}

:host ::ng-deep .message-content .signature em {
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  font-style: italic;
}

/* Attachments */

.attachments-section {
  margin-top: 20px;
  max-width: 720px;
}

.attachments-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-muted));
  margin-bottom: 12px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  border-radius: var(--mat-sys-corner-small, 8px);
  margin-bottom: 8px;
  transition: all 0.15s;
}

.attachment-item:hover {
  border-color: var(--mat-sys-outline, var(--mj-border-strong));
}

.attachment-item > i {
  font-size: 20px;
  color: var(--mat-sys-primary, var(--mj-brand-primary));
  width: 24px;
  text-align: center;
}

.attachment-info {
  flex: 1;
  min-width: 0;
}

.attachment-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-size {
  font-size: 11px;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.attachment-download {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  border-radius: var(--mat-sys-corner-small, 8px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.15s;
}

.attachment-download:hover {
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-hover));
  color: var(--mat-sys-primary, var(--mj-brand-primary));
}

/* Reply bar */

.reply-bar {
  padding: 16px 28px;
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-top: 1px solid var(--mat-sys-outline-variant, var(--mj-border-default));
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.reply-attach {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
  border-radius: var(--mat-sys-corner-small, 8px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.15s;
}

.reply-attach:hover {
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-hover));
  color: var(--mat-sys-on-surface, var(--mj-text-secondary));
}

.reply-input-wrap {
  flex: 1;
  padding: 10px 16px;
  background: var(--mat-sys-surface-container, var(--mj-bg-surface-sunken));
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.reply-input-wrap:focus-within {
  background: var(--mat-sys-surface-container-lowest, var(--mj-bg-surface));
  border-color: var(--mat-sys-primary, var(--mj-brand-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
}

.reply-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  font-family: inherit;
}

.reply-input::placeholder {
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.reply-send {
  padding: 10px 20px;
  background: var(--mat-sys-primary, var(--mj-brand-primary));
  border: none;
  border-radius: 10px;
  color: var(--mat-sys-on-primary, var(--mj-brand-on-primary));
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.reply-send:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.reply-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reply-send i {
  font-size: 12px;
}

/* No-selection state */

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--mat-sys-on-surface-variant, var(--mj-text-disabled));
}

.no-selection i {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.3;
}

.no-selection h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--mat-sys-on-surface, var(--mj-text-primary));
  margin: 0 0 4px;
}

.no-selection p {
  font-size: 13px;
  margin: 0;
}

/* ─── RESPONSIVE ─── */

@media (max-width: 1100px) {
  .sm-message-list {
    width: 320px;
    min-width: 320px;
  }
}

@media (max-width: 1024px) {
  .sm-sidebar {
    width: 64px;
    min-width: 64px;
  }

  .sidebar-profile,
  .sidebar-section-label,
  .sidebar-item span,
  .sidebar-footer span,
  .compose-btn span,
  .brand-text {
    display: none;
  }

  .sidebar-item {
    justify-content: center;
    padding: 12px;
  }

  .sidebar-item .badge {
    position: absolute;
    top: 4px;
    right: 8px;
    margin-left: 0;
    font-size: 9px;
    padding: 1px 5px;
  }

  .compose-btn {
    padding: 11px;
  }

  .sidebar-footer {
    justify-content: center;
  }

  .sidebar-toggle {
    display: none;
  }
}

@media (max-width: 768px) {
  .sm-message-list {
    display: none;
  }
}
  `]
})
export class SecureMessagingExecutiveComponent implements OnInit, OnChanges {
  @Input() navigationConfig: Record<string, unknown> | null = null;

  /** When set, the inbox loads + selects this thread (used to focus a thread opened from the workspace). */
  @Input() focusThreadId: string | null = null;

  /** Emitted when a contact is chosen to open their 360 workspace (consumed by the coordinator/host). */
  @Output() contactSelected = new EventEmitter<ContactSelection>();

  /* ─── Sidebar state ─── */
  isSidebarCollapsed = false;
  activeNav = 'inbox';

  primaryNavItems: SecureMessageNavItem[] = [
    { id: 'inbox', label: 'Inbox', icon: 'fa-solid fa-inbox' },
    { id: 'starred', label: 'Starred', icon: 'fa-solid fa-star' },
    { id: 'sent', label: 'Sent', icon: 'fa-solid fa-paper-plane' },
    { id: 'drafts', label: 'Drafts', icon: 'fa-solid fa-file' }
  ];

  categoryNavItems: SecureMessageNavItem[] = [
    { id: 'escalated', label: 'Escalated', icon: 'fa-solid fa-triangle-exclamation' },
    { id: 'documents', label: 'Documents', icon: 'fa-solid fa-folder' },
    { id: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' }
  ];

  /* ─── Staff user — the signed-in MJ user (resolved from the metadata provider + auth). ─── */
  userName = '';
  userEmail = '';
  /** Profile picture (cached UserImageURL, else auth-provider photo); empty falls back to icon/initials. */
  avatarUrl = '';
  /** Font Awesome class from the user record (UserImageIconClass); used when there's no image. */
  avatarIconClass = '';

  /* ─── Message list state ─── */
  messages: SecureMessageItem[] = [];
  filteredMessages: SecureMessageItem[] = [];
  searchQuery = '';
  sortMode: 'date' | 'sender' | 'status' = 'date';

  /* ─── Workspaces (per-person grouping) ─── */
  workspaceNavItems: WorkspaceNavItem[] = [];
  /** Currently selected workspace key, or null for "all". */
  activeWorkspace: string | null = null;

  /* ─── Detail panel state ─── */
  selectedMessage: SecureMessageItem | null = null;
  /** All messages in the selected message's thread, oldest-first (the conversation view). */
  threadMessages: SecureMessageItem[] = [];
  replyText = '';
  /** True while an outbound reply is being sent (disables the Send control). */
  sendingReply = false;

  /* ─── Action panel (Request files / Send for signature) ─── */
  // Which mode the shared <mj-secure-messaging-action-panel> opens in (null = closed).
  actionPanel: 'request' | 'signature' | null = null;

  /* ─── Loading ─── */
  isLoading = true;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    @Optional() private authService: MJAuthBase | null = null,
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    void this.loadMessages();
  }

  /**
   * Resolve the signed-in staff member. Name/email come synchronously from the metadata
   * provider's CurrentUser (cached in memory at bootstrap) so the header renders instantly.
   * The avatar is loaded in the background from the cached MJ: Users record (UserImageURL /
   * UserImageIconClass), with the auth provider's photo as a last-resort fallback — it never
   * blocks the header, and re-renders explicitly when it arrives (mirrors the MJ shell).
   */
  private loadCurrentUser(): void {
    const user = Metadata.Provider?.CurrentUser;
    if (!user) return;
    this.userName = user.FirstLast || user.Name || user.Email || '';
    this.userEmail = user.Email || '';
    void this.loadAvatar(user.ID);
  }

  /** Background avatar resolution — DB-cached image/icon first, auth-provider photo as fallback. */
  private async loadAvatar(userId: string): Promise<void> {
    try {
      const md = new Metadata();
      const userEntity = await md.GetEntityObject<MJUserEntity>('MJ: Users');
      if (await userEntity.Load(userId)) {
        if (userEntity.UserImageURL) {
          this.avatarUrl = userEntity.UserImageURL;
        } else if (userEntity.UserImageIconClass) {
          this.avatarIconClass = userEntity.UserImageIconClass;
        }
      }
      // No DB-cached avatar — fall back to the auth provider's profile photo.
      if (!this.avatarUrl && !this.avatarIconClass && this.authService) {
        const url = await this.authService.getProfilePictureUrl();
        if (url) this.avatarUrl = url;
      }
    } catch {
      /* no avatar available — initials fallback */
    } finally {
      this.cdr.detectChanges();
    }
  }

  /* ─── Sidebar ─── */

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  selectNav(navId: string): void {
    this.activeNav = navId;
    this.applyFilter();
  }

  onCompose(): void {
    // Phase 2: open compose view
  }

  /* ─── Search & Sort ─── */

  onSearch(): void {
    this.applyFilter();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilter();
  }

  toggleSort(mode: 'date' | 'sender' | 'status'): void {
    this.sortMode = mode;
    this.applyFilter();
  }

  selectWorkspace(key: string | null): void {
    // "All contacts" (null) clears the in-inbox filter.
    if (key === null) {
      this.activeWorkspace = null;
      this.applyFilter();
      return;
    }

    // A specific contact: if it resolves to a real PersonID, ask the coordinator/host to open
    // that contact's 360 workspace. Email-only groups (no PersonID) can't be workspace-scoped,
    // so they fall back to the original in-inbox filter behavior.
    const rep = this.messages.find(m => this.workspaceKeyOf(m) === key);
    if (rep?.personId && this.contactSelected.observed) {
      this.contactSelected.emit({
        contactId: rep.personId,
        contactName: rep.senderName,
        contactEmail: rep.senderEmail,
      });
      return;
    }

    this.activeWorkspace = this.activeWorkspace === key ? null : key;
    this.applyFilter();
  }

  applyFilter(): void {
    let result = [...this.messages];

    // Nav category filter (Inbox / Starred / Sent / Drafts / Escalated / Documents / Notifications).
    result = result.filter(m => this.matchesNavCategory(m));

    if (this.activeWorkspace) {
      result = result.filter(m => this.workspaceKeyOf(m) === this.activeWorkspace);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(
        m =>
          m.senderName.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q) ||
          m.preview.toLowerCase().includes(q)
      );
    }

    switch (this.sortMode) {
      case 'date':
        result.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
        break;
      case 'sender':
        result.sort((a, b) => a.senderName.localeCompare(b.senderName));
        break;
      case 'status':
        const order: Record<string, number> = { escalated: 0, new: 1, delivered: 2, replied: 3, system: 4 };
        result.sort((a, b) => {
          const aOrder = a.statusBadge ? (order[a.statusBadge.type] ?? 5) : 5;
          const bOrder = b.statusBadge ? (order[b.statusBadge.type] ?? 5) : 5;
          return aOrder - bOrder;
        });
        break;
    }

    this.filteredMessages = result;
  }

  /**
   * Whether a message belongs in the currently-selected left-nav category.
   * - inbox: everything from contacts (Inbound)
   * - sent: replies to contacts (Outbound)
   * - starred: user-starred messages
   * - drafts: unsent drafts (none in the owned store yet — empty by design)
   * - escalated: messages whose status badge flags review (Failed)
   * - documents: threads that have a file request or an attachment
   * - notifications: system messages (none in the owned store yet — empty by design)
   */
  private matchesNavCategory(m: SecureMessageItem): boolean {
    switch (this.activeNav) {
      case 'inbox':
        return m.direction === 'Inbound';
      case 'sent':
        return m.direction === 'Outbound';
      case 'starred':
        return m.isStarred;
      case 'drafts':
        return false;
      case 'escalated':
        return m.statusBadge?.type === 'escalated';
      case 'documents':
        return m.attachmentCount > 0 || (!!m.threadId && this.fileRequestThreadIds.has(m.threadId));
      case 'notifications':
        return m.statusBadge?.type === 'system';
      default:
        return true;
    }
  }

  /** Thread IDs that have at least one file request — drives the Documents nav category. */
  private fileRequestThreadIds = new Set<string>();

  /* ─── Message selection ─── */

  selectMessage(message: SecureMessageItem): void {
    this.selectedMessage = message;
    if (!message.isRead) {
      message.isRead = true;
      this.updateInboxCount();
      void this.persistRead(message);
    }
    this.replyText = '';
    this.closeActionPanel();
    // Seed the conversation view with the clicked message, then load the full thread.
    this.threadMessages = message.threadId ? [message] : [];
    void this.loadThread(message);
    void this.loadAttachments(message);
  }

  /** Load every message in the selected message's thread (oldest-first) for the conversation view. */
  private async loadThread(message: SecureMessageItem): Promise<void> {
    if (!message.threadId) { this.threadMessages = [message]; return; }
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
        ExtraFilter: `ThreadID = '${message.threadId.replace(/'/g, "''")}'`,
        OrderBy: 'ReceivedAt ASC',
        ResultType: 'simple',
      });
      if (result.Success && result.Results && this.selectedMessage?.id === message.id) {
        this.threadMessages = result.Results.map(r => this.mapToMessageItem(r as Record<string, unknown>));
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error('Failed to load thread', e);
    }
  }

  /**
   * Persist the read state to the owned SecureMessage record so it survives navigation/reload.
   * Only promotes a brand-new inbound message (Status 'New') to 'Read'; never overwrites a
   * 'Replied'/'Sent'/'Failed' status.
   */
  private async persistRead(message: SecureMessageItem): Promise<void> {
    try {
      const md = new Metadata();
      const rec = await md.GetEntityObject<mjBizAppsSecureMessagingSecureMessageEntity>('MJ_BizApps_SecureMessaging: Secure Messages');
      if (!(await rec.Load(message.id))) return;
      if (rec.Status !== 'New') return;
      rec.Status = 'Read';
      await rec.Save();
    } catch (e) {
      console.error('Failed to persist read state', e);
    }
  }

  /** Loads the files attached to a message's thread from the owned MessageFile entity. */
  private async loadAttachments(message: SecureMessageItem): Promise<void> {
    if (!message.threadId) return;
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
        ExtraFilter: `ThreadID = '${message.threadId.replace(/'/g, "''")}'`,
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'simple',
      });
      if (result.Success && result.Results) {
        const atts = (result.Results as Record<string, unknown>[]).map(r => ({
          id: r['ID'] as string,
          filename: (r['Filename'] as string) ?? 'file',
          contentType: (r['ContentType'] as string) ?? '',
          size: Number(r['Size'] ?? 0),
        }));
        // Only mutate if this message is still selected (avoid races on quick switches).
        if (this.selectedMessage?.id === message.id) {
          message.attachments = atts;
          message.attachmentCount = atts.length;
        }
      }
    } catch (e) {
      console.error('Failed to load attachments', e);
    }
  }

  toggleStar(message: SecureMessageItem, event: Event): void {
    event.stopPropagation();
    message.isStarred = !message.isStarred;
  }

  markAsRead(message: SecureMessageItem): void {
    if (!message.isRead) {
      message.isRead = true;
      this.updateInboxCount();
    }
  }

  /* ─── Detail actions (stubs for Phase 1) ─── */

  onReply(): void { /* Phase 2 */ }
  onForward(): void { /* Phase 2 */ }
  onArchive(): void { /* Phase 2 */ }
  onDelete(): void { /* Phase 2 */ }

  /**
   * Send a staff reply into the selected thread. Invokes the server-side 'Send Secure Message'
   * MJ Action (which persists the outbound row in Core's MessageStore + fires the notify hook),
   * then optimistically appends it to the conversation view. The contact's widget shows it on
   * its next load.
   */
  async onSendReply(): Promise<void> {
    const body = this.replyText.trim();
    const threadId = this.selectedMessage?.threadId;
    if (!body || !threadId || this.sendingReply) return;

    this.sendingReply = true;
    try {
      const actionId = await this.resolveActionId('Send Secure Message');
      if (!actionId) {
        console.error('Send Secure Message action is not available in this environment.');
        return;
      }
      const client = new GraphQLActionClient(Metadata.Provider as unknown as GraphQLDataProvider);
      const result = await client.RunAction(actionId, [
        { Name: 'ThreadID', Value: threadId, Type: 'Input' },
        { Name: 'Content', Value: body, Type: 'Input' },
      ]);
      if (!result?.Success) {
        console.error('Failed to send reply:', result?.Message);
        return;
      }

      // Optimistically append the sent message to the open conversation.
      const me = Metadata.Provider?.CurrentUser;
      this.threadMessages = [...this.threadMessages, {
        id: (result.Params?.find(p => p.Name === 'MessageID')?.Value as string) || `tmp-${threadId}-${this.threadMessages.length}`,
        senderName: me?.FirstLast || me?.Name || 'You',
        senderEmail: me?.Email || '',
        subject: '',
        preview: body,
        bodyHtml: this.sanitizer.bypassSecurityTrustHtml(body),
        receivedAt: new Date(),
        isRead: true,
        isStarred: false,
        isSecure: true,
        attachmentCount: 0,
        attachments: [],
        threadId,
        direction: 'Outbound',
      }];
      this.replyText = '';
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to send reply', e);
    } finally {
      this.sendingReply = false;
      this.cdr.detectChanges();
    }
  }

  /** Resolve an Action's ID by name. */
  private async resolveActionId(name: string): Promise<string | null> {
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name = '${name.replace(/'/g, "''")}'`,
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (!res.Success || res.Results.length === 0) return null;
    return String((res.Results as Record<string, unknown>[])[0].ID);
  }

  /* ─── File request / signature actions ─── */

  // The request/signature panel itself (state, pickers, submit) lives in the shared
  // SecureMessagingActionPanelComponent; these just toggle which mode it opens in.
  openRequestFiles(): void { this.actionPanel = 'request'; }
  openSendForSignature(): void { this.actionPanel = 'signature'; }
  closeActionPanel(): void { this.actionPanel = null; }

  async downloadAttachment(att: MessageAttachment): Promise<void> {
    try {
      const rv = new RunView();

      // 1. MessageFile (att.id) → underlying MJ: Files ID
      const linkResult = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
        ExtraFilter: `ID = '${att.id}'`,
        Fields: ['ID', 'FileID'],
        MaxRows: 1,
        ResultType: 'simple',
      });
      const fileId = linkResult.Success && linkResult.Results?.length
        ? ((linkResult.Results[0] as Record<string, unknown>)['FileID'] as string)
        : null;
      if (!fileId) {
        console.error('No underlying file for attachment', att.id);
        return;
      }

      // 2. MJ: Files → ProviderID + ProviderKey
      const fileResult = await rv.RunView({
        EntityName: 'MJ: Files',
        ExtraFilter: `ID = '${fileId}'`,
        Fields: ['ID', 'Name', 'ProviderID', 'ProviderKey'],
        MaxRows: 1,
        ResultType: 'simple',
      });
      if (!fileResult.Success || !fileResult.Results?.length) {
        console.error('File record not found', fileId);
        return;
      }
      const file = fileResult.Results[0] as Record<string, unknown>;
      const providerId = file['ProviderID'] as string;
      const objectName = (file['ProviderKey'] as string) || (file['Name'] as string);

      // 3. Resolve a storage account on that provider (first active)
      const acctResult = await rv.RunView({
        EntityName: 'MJ: File Storage Accounts',
        ExtraFilter: `ProviderID = '${providerId}'`,
        Fields: ['ID', 'ProviderID'],
        MaxRows: 1,
        ResultType: 'simple',
      });
      if (!acctResult.Success || !acctResult.Results?.length) {
        console.error('No storage account configured for provider', providerId);
        return;
      }
      const accountId = (acctResult.Results[0] as Record<string, unknown>)['ID'] as string;

      // 4. Pre-auth download URL via the storage client, then open it
      const client = new GraphQLFileStorageClient(Metadata.Provider as unknown as GraphQLDataProvider);
      const url = await client.CreatePreAuthDownloadUrl(accountId, objectName);
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      console.error('Failed to download attachment', e);
    }
  }

  /* ─── Helpers ─── */

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatDetailDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getFileIcon(contentType: string): string {
    if (contentType.includes('pdf')) return 'fa-solid fa-file-pdf';
    if (contentType.includes('image')) return 'fa-solid fa-file-image';
    if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'fa-solid fa-file-excel';
    if (contentType.includes('word') || contentType.includes('document')) return 'fa-solid fa-file-word';
    return 'fa-solid fa-file';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /* ─── Private helpers ─── */

  private updateInboxCount(): void {
    const setCount = (items: SecureMessageNavItem[], id: string, n: number) => {
      const item = items.find(i => i.id === id);
      if (item) item.count = n || undefined;
    };
    // Inbox badge = unread inbound; Sent = outbound; Escalated = needs-review.
    setCount(this.primaryNavItems, 'inbox', this.messages.filter(m => m.direction === 'Inbound' && !m.isRead).length);
    setCount(this.primaryNavItems, 'sent', this.messages.filter(m => m.direction === 'Outbound').length);
    setCount(this.categoryNavItems, 'documents', this.fileRequestThreadIds.size);
    setCount(this.categoryNavItems, 'escalated', this.messages.filter(m => m.statusBadge?.type === 'escalated').length);
  }

  private async loadMessages(): Promise<void> {
    this.isLoading = true;
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
        ExtraFilter: `IsSecure=1`,
        OrderBy: 'ReceivedAt DESC',
        MaxRows: 100,
        ResultType: 'simple'
      });
      if (result.Success && result.Results) {
        this.messages = result.Results.map(r => this.mapToMessageItem(r as Record<string, unknown>));
        await this.resolvePersonNames();
        await this.loadFileRequestThreads();
        this.buildWorkspaces();
        this.updateInboxCount();
      }
    } catch (e) {
      console.error('Failed to load secure messages', e);
    } finally {
      this.isLoading = false;
      this.applyFilter();
      // The load is async (outside Angular's initial CD pass), so re-render explicitly —
      // otherwise the list/badges/workspaces stay blank until the next user interaction.
      this.cdr.detectChanges();
      // Honor a pending focus request (deep-link or workspace→inbox jump) once data is present.
      if (this.focusThreadId) void this.tryFocusThread(this.focusThreadId);
    }
  }

  /** Load the set of thread IDs that have at least one file request (drives the Documents nav). */
  private async loadFileRequestThreads(): Promise<void> {
    this.fileRequestThreadIds = new Set<string>();
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: File Requests',
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 500,
        ResultType: 'simple',
      });
      if (result.Success && result.Results) {
        for (const r of result.Results) {
          const tid = (r as Record<string, unknown>)['ThreadID'] as string;
          if (tid) this.fileRequestThreadIds.add(tid);
        }
      }
    } catch (e) {
      console.error('Failed to load file requests for Documents nav', e);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['focusThreadId'] && this.focusThreadId) {
      void this.tryFocusThread(this.focusThreadId);
    }
  }

  /**
   * Select the thread's message in the list; if it isn't in the currently-loaded set
   * (e.g. older/archived), load that one thread's newest message and select it.
   */
  private async tryFocusThread(threadId: string): Promise<void> {
    if (this.isLoading) return; // loadMessages() re-invokes this in its finally block
    let msg = this.messages.find(m => m.threadId === threadId);
    if (!msg) {
      const loaded = await this.loadSingleThreadMessage(threadId);
      if (loaded) {
        this.messages = [loaded, ...this.messages];
        this.applyFilter();
        msg = loaded;
      }
    }
    if (msg) this.selectMessage(msg);
  }

  /** Load the newest message for a single thread (for threads not in the main IsSecure list). */
  private async loadSingleThreadMessage(threadId: string): Promise<SecureMessageItem | null> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
        ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
        OrderBy: 'ReceivedAt DESC',
        MaxRows: 1,
        ResultType: 'simple',
      });
      if (result.Success && result.Results && result.Results.length > 0) {
        return this.mapToMessageItem(result.Results[0] as Record<string, unknown>);
      }
    } catch (e) {
      console.error('Failed to load single thread message', e);
    }
    return null;
  }

  /**
   * Resolves friendly person names from the BizAppsCommon People entity for messages
   * that carry a PersonID. Best-effort — falls back to the sender email on failure.
   */
  private async resolvePersonNames(): Promise<void> {
    const personIds = [...new Set(this.messages.map(m => m.personId).filter((id): id is string => !!id))];
    if (personIds.length === 0) return;

    try {
      const rv = new RunView();
      const inList = personIds.map(id => `'${id}'`).join(', ');
      const result = await rv.RunView<mjBizAppsCommonPersonEntity>({
        EntityName: 'MJ_BizApps_Common: People',
        ExtraFilter: `ID IN (${inList})`,
        ResultType: 'simple',
      });
      if (result.Success && result.Results) {
        const nameById = new Map<string, string>();
        for (const p of result.Results) {
          const display = p.DisplayName
            || [p.FirstName, p.LastName].filter(Boolean).join(' ').trim()
            || (p.Email ?? '');
          if (display) nameById.set(p.ID, display);
        }
        for (const m of this.messages) {
          if (m.personId && nameById.has(m.personId)) {
            m.senderName = nameById.get(m.personId)!;
          }
        }
      }
    } catch (e) {
      console.error('Failed to resolve person names', e);
    }
  }

  /** Builds the per-person workspace list from loaded messages. */
  private buildWorkspaces(): void {
    const byKey = new Map<string, WorkspaceNavItem>();
    for (const m of this.messages) {
      const key = m.personId || m.senderEmail || 'unknown';
      const existing = byKey.get(key);
      if (existing) {
        existing.count++;
      } else {
        byKey.set(key, { key, label: m.senderName || m.senderEmail || 'Unknown', count: 1 });
      }
    }
    this.workspaceNavItems = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  /** The key used to group a message into a workspace. */
  private workspaceKeyOf(m: SecureMessageItem): string {
    return m.personId || m.senderEmail || 'unknown';
  }

  private mapToMessageItem(r: Record<string, unknown>): SecureMessageItem {
    const content = (r['Content'] as string) ?? '';
    const personId = (r['PersonID'] as string) || undefined;
    const status = (r['Status'] as string) ?? '';
    const direction = (r['Direction'] as string) ?? 'Inbound';
    return {
      id: r['ID'] as string,
      senderName: (r['Sender'] as string) ?? 'Unknown',
      senderEmail: (r['Sender'] as string) ?? '',
      personId,
      subject: (r['Subject'] as string) ?? '(no subject)',
      preview: content.replace(/<[^>]*>/g, '').substring(0, 120),
      bodyHtml: this.sanitizer.bypassSecurityTrustHtml(content),
      receivedAt: new Date(r['ReceivedAt'] as string),
      isRead: status === 'Read' || status === 'Replied' || direction === 'Outbound',
      isStarred: false,
      isSecure: !!(r['IsSecure']),
      statusBadge: this.resolveStatusBadge(status, direction),
      attachmentCount: 0,
      attachments: [],
      threadId: r['ThreadID'] as string,
      direction: direction === 'Outbound' ? 'Outbound' : 'Inbound',
    };
  }

  /**
   * Map our owned SecureMessage Status/Direction onto the inbox status badge.
   * SecureMessage.Status values: 'New' | 'Read' | 'Replied' | 'Sent' | 'Failed'.
   */
  private resolveStatusBadge(
    status: string,
    direction: string
  ): StatusBadge | undefined {
    if (status === 'Failed') return { type: 'escalated', label: 'FAILED' };
    if (status === 'Replied') return { type: 'replied', label: 'REPLIED' };
    if (direction === 'Outbound' || status === 'Sent') return { type: 'delivered', label: 'DELIVERED' };
    if (!status || status === 'New') return { type: 'new', label: 'NEW' };
    return undefined;
  }

}