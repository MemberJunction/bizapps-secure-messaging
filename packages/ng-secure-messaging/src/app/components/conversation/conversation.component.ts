import { Component, Input, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { SecureMessagingApiService, ThreadMessage } from '../../services/api.service';

@Component({
    standalone: false,
    selector: 'sm-conversation',
    template: `
        <div class="sm-conversation">
            <div class="sm-conversation__header">
                <div class="sm-conversation__title">Secure Message</div>
                <div class="sm-conversation__email">{{ contactEmail }}</div>
                <button class="sm-conversation__refresh" (click)="loadMessages()" [disabled]="loading">
                    {{ loading ? 'Loading...' : 'Refresh' }}
                </button>
            </div>

            <div class="sm-conversation__messages" #messageContainer>
                <div *ngIf="loading && messages.length === 0" class="sm-conversation__loading">
                    <div class="sm-spinner"></div>
                    <p>Loading messages...</p>
                </div>

                <div *ngIf="!loading && messages.length === 0" class="sm-conversation__empty">
                    <p>No messages yet. Send a message to get started.</p>
                </div>

                <sm-message-bubble
                    *ngFor="let msg of messages"
                    [message]="msg"
                    [contactEmail]="contactEmail"
                ></sm-message-bubble>
            </div>

            <sm-compose-box (messageSent)="onMessageSent($event)"></sm-compose-box>
        </div>
    `,
    styles: [`
        .sm-conversation {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: var(--sm-bg-color, #fff);
        }
        .sm-conversation__header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--sm-border-color, #e0e0e0);
            background: var(--sm-header-bg, #f8f9fa);
        }
        .sm-conversation__title {
            font-weight: 700;
            font-size: 1rem;
            color: var(--sm-text-color, #333);
        }
        .sm-conversation__email {
            flex: 1;
            font-size: 0.8rem;
            color: var(--sm-text-secondary, #666);
        }
        .sm-conversation__refresh {
            padding: 0.35rem 0.75rem;
            border: 1px solid var(--sm-border-color, #e0e0e0);
            border-radius: 6px;
            background: white;
            font-size: 0.8rem;
            cursor: pointer;
            color: var(--sm-text-color, #333);
        }
        .sm-conversation__refresh:hover:not(:disabled) {
            background: var(--sm-hover-bg, #f0f0f0);
        }
        .sm-conversation__refresh:disabled {
            opacity: 0.5;
        }
        .sm-conversation__messages {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            display: flex;
            flex-direction: column;
        }
        .sm-conversation__loading, .sm-conversation__empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            color: var(--sm-text-secondary, #666);
        }
        .sm-spinner {
            width: 30px;
            height: 30px;
            border: 3px solid var(--sm-border-color, #e0e0e0);
            border-top-color: var(--sm-brand-color, #1a73e8);
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
        }
        @keyframes sm-spin {
            to { transform: rotate(360deg); }
        }
    `]
})
export class ConversationComponent implements OnInit {
    @Input() threadId = '';
    @Input() channelId = '';
    @Input() contactEmail = '';

    @ViewChild('messageContainer') messageContainer!: ElementRef;

    messages: ThreadMessage[] = [];
    loading = false;

    constructor(
        private api: SecureMessagingApiService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this.loadMessages();
    }

    async loadMessages(): Promise<void> {
        if (!this.threadId) return;
        this.loading = true;
        this.cdr.detectChanges();

        try {
            const result = await this.api.getMessages(this.threadId);
            this.messages = result.messages.sort(
                (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
            );
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
            this.scrollToBottom();
        }
    }

    async onMessageSent(content: string): Promise<void> {
        try {
            await this.api.sendMessage(this.threadId, content);
            await this.loadMessages();
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            const container = this.messageContainer?.nativeElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 50);
    }
}
