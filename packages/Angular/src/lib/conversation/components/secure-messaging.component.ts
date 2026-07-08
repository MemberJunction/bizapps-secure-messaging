import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { SecureMessagingApiService } from '../services/api.service.js';
import { AuthService, AuthState } from '../services/auth.service.js';
import { ThreadSummary } from '../data-source.js';

/**
 * Root component for the <mj-secure-messaging> custom element.
 *
 * Handles the full lifecycle: reads token from URL or attribute, validates auth, then routes the
 * contact into either their single conversation or — when they have more than one thread — a
 * portal inbox (PRD §5). A magic link deep-links straight to its target thread.
 */
@Component({
    standalone: false,
    selector: 'sm-root',
    template: `
        <div class="sm-container" [style.--sm-brand-color]="brandColor">
            <!-- Auth / loading / error states -->
            <sm-auth-view
                *ngIf="authService.state !== 'authenticated'"
                [state]="displayState"
                [errorMessage]="authService.errorMessage"
            ></sm-auth-view>

            <ng-container *ngIf="authService.state === 'authenticated' && authService.session">
                <!-- Inbox: the contact's threads (shown only when there's more than one) -->
                <div class="sm-inbox" *ngIf="view === 'inbox'">
                    <div class="sm-inbox__head">
                        <div class="sm-inbox__title">Your secure conversations</div>
                        <div class="sm-inbox__sub">{{ authService.session!.contactEmail }}</div>
                    </div>
                    <div class="sm-inbox__list">
                        <button type="button" class="sm-thread" *ngFor="let t of threads" (click)="openThread(t)">
                            <div class="sm-thread__main">
                                <div class="sm-thread__subject">{{ t.subject }}</div>
                                <div class="sm-thread__time">{{ relativeTime(t.lastMessageAt) }}</div>
                            </div>
                            <span class="sm-thread__chip" [class.sm-thread__chip--closed]="t.status !== 'Active'">{{ t.status }}</span>
                        </button>
                    </div>
                </div>

                <!-- Conversation view -->
                <div class="sm-convo-wrap" *ngIf="view === 'conversation' && activeThreadId">
                    <button type="button" class="sm-back" *ngIf="threads.length > 1" (click)="backToInbox()">
                        ‹ All conversations
                    </button>
                    <div class="sm-closed-banner" *ngIf="activeThreadClosed">
                        This conversation has been closed. You can read it, but replies are disabled.
                    </div>
                    <sm-conversation
                        [threadId]="activeThreadId"
                        [contactEmail]="authService.session!.contactEmail"
                        [readOnly]="activeThreadClosed"
                        (fileUploaded)="fileUploadedEvent.emit($event)"
                    ></sm-conversation>
                </div>
            </ng-container>
        </div>
    `,
    styles: [`
        :host { display: block; height: 100%; }
        .sm-container {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100%;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .sm-inbox { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .sm-inbox__head { padding: 16px 18px; border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0); }
        .sm-inbox__title { font-size: 16px; font-weight: 700; color: var(--mat-sys-on-surface, #1f1f1f); }
        .sm-inbox__sub { font-size: 12px; color: var(--mat-sys-on-surface-variant, #666); margin-top: 2px; }
        .sm-inbox__list { flex: 1; overflow-y: auto; }
        .sm-thread {
            display: flex; align-items: center; gap: 10px; width: 100%;
            padding: 14px 18px; border: 0; border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
            background: transparent; cursor: pointer; text-align: left;
        }
        .sm-thread:hover { background: color-mix(in srgb, var(--sm-brand-color) 6%, transparent); }
        .sm-thread__main { flex: 1; min-width: 0; }
        .sm-thread__subject { font-size: 14px; font-weight: 600; color: var(--mat-sys-on-surface, #1f1f1f); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sm-thread__time { font-size: 12px; color: var(--mat-sys-on-surface-variant, #888); margin-top: 2px; }
        .sm-thread__chip {
            font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
            background: color-mix(in srgb, var(--sm-brand-color) 14%, transparent); color: var(--sm-brand-color);
        }
        .sm-thread__chip--closed { background: rgba(0,0,0,0.06); color: var(--mat-sys-on-surface-variant, #888); }
        .sm-convo-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .sm-back {
            border: 0; background: transparent; color: var(--sm-brand-color); cursor: pointer;
            font-size: 13px; font-weight: 600; padding: 10px 14px; text-align: left;
            border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
        }
        .sm-closed-banner {
            padding: 8px 14px; font-size: 12px; background: rgba(0,0,0,0.05);
            color: var(--mat-sys-on-surface-variant, #666); border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
        }
    `]
})
export class SecureMessagingComponent implements OnInit {
    /** Base URL for the Secure Messaging API */
    @Input('api-base-url') apiBaseUrl = '';

    /** Session token. If not provided, reads from URL ?token= param. */
    @Input() token = '';

    /** Brand color (hex) for header and buttons */
    @Input('brand-color') brandColor = '#1a73e8';

    @Output('session-ready') sessionReady = new EventEmitter<{
        sessionId: string; contactEmail: string; threadId?: string;
    }>();
    @Output('session-expired') sessionExpired = new EventEmitter<void>();
    @Output('message-sent') messageSentEvent = new EventEmitter<{ messageId: string }>();
    @Output('file-uploaded') fileUploadedEvent = new EventEmitter<{ attachmentId: string; filename: string }>();

    noToken = false;

    /** The contact's threads (their inbox). */
    threads: ThreadSummary[] = [];
    /** 'inbox' (list) or 'conversation' (a single thread open). */
    view: 'inbox' | 'conversation' = 'conversation';
    /** The thread currently open in conversation view. */
    activeThreadId: string | null = null;

    constructor(
        public authService: AuthService,
        private api: SecureMessagingApiService,
        private cdr: ChangeDetectorRef
    ) {}

    get displayState(): AuthState | 'no-token' {
        if (this.noToken) return 'no-token';
        return this.authService.state;
    }

    /** Whether the open thread is closed (drives the read-only banner + disabled compose). */
    get activeThreadClosed(): boolean {
        const t = this.threads.find(x => x.id === this.activeThreadId);
        return !!t && t.status !== 'Active';
    }

    async ngOnInit(): Promise<void> {
        // Read token from URL params if not provided as attribute
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = this.token || urlParams.get('token') || '';
        const mlParam = urlParams.get('ml') || '';

        // Determine API base URL: use attribute, or infer from current origin
        const baseUrl = this.apiBaseUrl || `${window.location.origin}/secure-messaging/api/v1`;
        this.api.configure(baseUrl, '');

        if (mlParam) {
            const success = await this.authService.redeemMagicLink(mlParam);
            await this.afterAuth(success);
        } else if (tokenParam) {
            const success = await this.authService.validateToken(tokenParam);
            await this.afterAuth(success);
        } else {
            this.noToken = true;
            this.cdr.detectChanges();
        }
    }

    /** After a successful auth, load the contact's threads and route into inbox or a conversation. */
    private async afterAuth(success: boolean): Promise<void> {
        if (!success) {
            this.sessionExpired.emit();
            this.cdr.detectChanges();
            return;
        }
        this.emitSessionReady();
        this.clearTokenFromUrl();
        await this.loadThreadsAndRoute();
        this.cdr.detectChanges();
    }

    /**
     * Route the contact: a magic-link deep-link opens its target thread; otherwise a lone thread
     * opens directly and multiple threads show the inbox (PRD §5 — the inbox is optional in practice).
     */
    private async loadThreadsAndRoute(): Promise<void> {
        const deepLink = this.authService.session?.threadId || null;
        try {
            const res = await this.api.listThreads();
            this.threads = res.threads || [];
        } catch {
            this.threads = [];
        }

        if (deepLink) {
            this.openThreadById(deepLink);
        } else if (this.threads.length === 1) {
            this.openThreadById(this.threads[0].id);
        } else if (this.threads.length > 1) {
            this.view = 'inbox';
        } else {
            // No threads resolvable — fall back to inbox (empty) rather than a broken conversation.
            this.view = 'inbox';
        }
    }

    openThread(t: ThreadSummary): void {
        this.openThreadById(t.id);
    }

    private openThreadById(id: string): void {
        this.activeThreadId = id;
        this.view = 'conversation';
        this.cdr.detectChanges();
    }

    backToInbox(): void {
        this.view = 'inbox';
        this.activeThreadId = null;
        this.cdr.detectChanges();
    }

    /** Human-friendly relative time for an inbox row. */
    relativeTime(iso: string | null): string {
        if (!iso) return 'No messages yet';
        const then = new Date(iso).getTime();
        if (isNaN(then)) return '';
        const mins = Math.round((Date.now() - then) / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.round(hrs / 24);
        return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
    }

    private emitSessionReady(): void {
        const session = this.authService.session;
        if (session) {
            this.sessionReady.emit({
                sessionId: session.sessionId,
                contactEmail: session.contactEmail,
                threadId: session.threadId,
            });
        }
    }

    /**
     * Remove the token from the URL after successful auth (security best practice).
     */
    private clearTokenFromUrl(): void {
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        url.searchParams.delete('ml');
        window.history.replaceState({}, '', url.toString());
    }
}
