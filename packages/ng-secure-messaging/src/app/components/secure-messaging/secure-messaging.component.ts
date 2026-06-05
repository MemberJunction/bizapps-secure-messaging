import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { SecureMessagingApiService } from '../../services/api.service';
import { AuthService, AuthState } from '../../services/auth.service';

/**
 * Root component for the <mj-secure-messaging> custom element.
 *
 * Handles the full lifecycle: reads token from URL or attribute,
 * validates auth, and shows either the auth view or conversation view.
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

            <!-- Authenticated: show conversation -->
            <sm-conversation
                *ngIf="authService.state === 'authenticated' && authService.session"
                [threadId]="authService.session!.threadId"
                [channelId]="authService.session!.channelId"
                [contactEmail]="authService.session!.contactEmail"
                (fileUploaded)="fileUploadedEvent.emit($event)"
            ></sm-conversation>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
        }
        .sm-container {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100%;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
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
        sessionId: string; contactEmail: string; threadId: string;
    }>();
    @Output('session-expired') sessionExpired = new EventEmitter<void>();
    @Output('message-sent') messageSentEvent = new EventEmitter<{ messageId: string }>();
    @Output('file-uploaded') fileUploadedEvent = new EventEmitter<{ attachmentId: string; filename: string }>();

    noToken = false;

    constructor(
        public authService: AuthService,
        private api: SecureMessagingApiService,
        private cdr: ChangeDetectorRef
    ) {}

    get displayState(): AuthState | 'no-token' {
        if (this.noToken) return 'no-token';
        return this.authService.state;
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
            // Magic link redemption
            const success = await this.authService.redeemMagicLink(mlParam);
            this.cdr.detectChanges();
            if (success) {
                this.emitSessionReady();
                this.clearTokenFromUrl();
            } else {
                this.sessionExpired.emit();
            }
        } else if (tokenParam) {
            // Session token validation
            const success = await this.authService.validateToken(tokenParam);
            this.cdr.detectChanges();
            if (success) {
                this.emitSessionReady();
                this.clearTokenFromUrl();
            } else {
                this.sessionExpired.emit();
            }
        } else {
            this.noToken = true;
            this.cdr.detectChanges();
        }
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
