import { Component, Input } from '@angular/core';
import { ThreadMessage } from '../../services/api.service';

@Component({
    standalone: false,
    selector: 'sm-message-bubble',
    template: `
        <div class="sm-bubble" [class.sm-bubble--outbound]="isOutbound" [class.sm-bubble--inbound]="!isOutbound">
            <div class="sm-bubble__sender">{{ isOutbound ? 'You' : 'Support' }}</div>
            <div *ngIf="message.subject" class="sm-bubble__subject">{{ message.subject }}</div>
            <div class="sm-bubble__content">{{ displayContent }}</div>
            <div class="sm-bubble__time">{{ message.receivedAt | date:'short' }}</div>
            <div *ngIf="isProcessing" class="sm-bubble__processing">
                <div class="sm-spinner-small"></div>
                <span>Preparing reply...</span>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            flex-shrink: 0;
        }
        .sm-bubble {
            max-width: 80%;
            padding: 0.75rem 1rem;
            border-radius: 12px;
            margin-bottom: 0.75rem;
            word-wrap: break-word;
        }
        .sm-bubble--outbound {
            background: var(--sm-brand-color, #1a73e8);
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        .sm-bubble--inbound {
            background: var(--sm-bubble-inbound-bg, #f0f0f0);
            color: var(--sm-text-color, #333);
            margin-right: auto;
            border-bottom-left-radius: 4px;
        }
        .sm-bubble__sender {
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
            opacity: 0.8;
        }
        .sm-bubble__subject {
            font-weight: 600;
            margin-bottom: 0.25rem;
        }
        .sm-bubble__content {
            white-space: pre-wrap;
            line-height: 1.4;
        }
        .sm-bubble__time {
            font-size: 0.7rem;
            opacity: 0.6;
            margin-top: 0.25rem;
            text-align: right;
        }
        .sm-bubble__processing {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 0.5rem;
            font-size: 0.8rem;
            opacity: 0.7;
        }
        .sm-spinner-small {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(0,0,0,0.1);
            border-top-color: var(--sm-brand-color, #1a73e8);
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
