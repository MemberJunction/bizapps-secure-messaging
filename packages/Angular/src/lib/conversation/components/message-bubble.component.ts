import { Component, Input } from '@angular/core';
import { ThreadMessage } from '../data-source.js';

@Component({
    standalone: false,
    selector: 'sm-message-bubble',
    template: `
        <div class="sm-row" [class.sm-row--outbound]="isOutbound" [class.sm-row--inbound]="!isOutbound">
            <div class="sm-bubble" [class.sm-bubble--outbound]="isOutbound" [class.sm-bubble--inbound]="!isOutbound">
                <div class="sm-bubble__head">
                    <span class="sm-bubble__sender">{{ isOutbound ? 'You' : 'Support' }}</span>
                    <span class="sm-bubble__time">{{ message.receivedAt | date:'shortTime' }}</span>
                </div>
                <div *ngIf="message.subject" class="sm-bubble__subject">{{ message.subject }}</div>
                <div class="sm-bubble__content">{{ displayContent }}</div>
                <div *ngIf="isProcessing" class="sm-bubble__processing">
                    <div class="sm-spinner-small"></div>
                    <span>Preparing reply...</span>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            flex-shrink: 0;
        }
        /* Row controls alignment; the bubble holds the content. MJ-chat-like: flat, no tail,
           asymmetric rounding, generous spacing. */
        .sm-row {
            display: flex;
            margin-bottom: 0.6rem;
        }
        .sm-row--outbound { justify-content: flex-end; }
        .sm-row--inbound { justify-content: flex-start; }
        .sm-bubble {
            max-width: 78%;
            padding: 0.6rem 0.85rem;
            border-radius: 14px;
            word-wrap: break-word;
        }
        .sm-bubble--outbound {
            /* Subtle brand tint rather than a heavy fill — flat + readable, MJ-style. */
            background: color-mix(in srgb, var(--sm-brand-color, var(--mat-sys-primary, #1a73e8)) 14%, var(--mat-sys-surface-container-lowest, #fff));
            color: var(--mat-sys-on-surface, #333);
            border-bottom-right-radius: 4px;
        }
        .sm-bubble--inbound {
            background: var(--mat-sys-surface-container, #f1f3f4);
            color: var(--mat-sys-on-surface, #333);
            border-bottom-left-radius: 4px;
        }
        .sm-bubble__head {
            display: flex;
            align-items: baseline;
            gap: 0.5rem;
            margin-bottom: 0.2rem;
        }
        .sm-bubble__sender {
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--mat-sys-on-surface, #333);
        }
        .sm-bubble__time {
            font-size: 0.7rem;
            color: var(--mat-sys-on-surface-variant, #888);
            margin-left: auto;
        }
        .sm-bubble__subject {
            font-weight: 600;
            margin-bottom: 0.2rem;
        }
        .sm-bubble__content {
            white-space: pre-wrap;
            line-height: 1.5;
        }
        .sm-bubble__processing {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 0.5rem;
            font-size: 0.8rem;
            color: var(--mat-sys-on-surface-variant, #888);
        }
        .sm-spinner-small {
            width: 14px;
            height: 14px;
            border: 2px solid var(--mat-sys-outline-variant, rgba(0,0,0,0.1));
            border-top-color: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
        }
        @keyframes sm-spin {
            to { transform: rotate(360deg); }
        }
    `]
})
export class MessageBubbleComponent {
    @Input() message!: ThreadMessage;
    @Input() contactEmail = '';

    get isOutbound(): boolean {
        return this.message.sender === this.contactEmail;
    }

    get isProcessing(): boolean {
        return this.message.generationStatus === 'Creating Reply';
    }

    get displayContent(): string {
        // For inbound (org) messages, show the sent content if available, then approved reply
        if (!this.isOutbound) {
            return this.message.sentContent
                || this.message.approvedReply
                || this.message.content;
        }
        return this.message.content;
    }
}
