import { Component, Input } from '@angular/core';
import { AuthState } from '../../services/auth.service';

@Component({
    standalone: false,
    selector: 'sm-auth-view',
    template: `
        <div class="sm-auth-view">
            <div *ngIf="state === 'loading'" class="sm-auth-loading">
                <div class="sm-spinner"></div>
                <p>Verifying your session...</p>
            </div>

            <div *ngIf="state === 'expired'" class="sm-auth-expired">
                <h2>Session Expired</h2>
                <p>Your session has expired. Please check your email for a new link, or contact us for assistance.</p>
            </div>

            <div *ngIf="state === 'error'" class="sm-auth-error">
                <h2>Something Went Wrong</h2>
                <p>{{ errorMessage }}</p>
                <p>Please try again or contact us for assistance.</p>
            </div>

            <div *ngIf="state === 'no-token'" class="sm-auth-no-token">
                <h2>No Access Token</h2>
                <p>This page requires a valid access link. Please check the link in your email.</p>
            </div>
        </div>
    `,
    styles: [`
        :host {
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .sm-auth-view {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            text-align: center;
            padding: 2rem;
            color: var(--mat-sys-on-surface, #333);
        }
        .sm-auth-loading p {
            margin-top: 1rem;
            color: var(--mat-sys-on-surface-variant, #666);
        }
        .sm-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-top-color: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
            margin: 0 auto;
        }
        @keyframes sm-spin {
            to { transform: rotate(360deg); }
        }
        h2 {
            margin: 0 0 0.5rem;
            font-size: 1.25rem;
        }
        p {
            margin: 0.25rem 0;
            color: var(--mat-sys-on-surface-variant, #666);
        }
    `]
})
export class AuthViewComponent {
    @Input() state: AuthState | 'no-token' = 'loading';
    @Input() errorMessage = '';
}
