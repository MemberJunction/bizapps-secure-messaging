import { Component, Output, EventEmitter } from '@angular/core';

@Component({
    standalone: false,
    selector: 'sm-compose-box',
    template: `
        <div class="sm-compose">
            <textarea
                class="sm-compose__input"
                [(ngModel)]="messageText"
                [disabled]="sending"
                placeholder="Type your message..."
                (keydown.control.enter)="send()"
                (keydown.meta.enter)="send()"
                rows="2"
            ></textarea>
            <button
                class="sm-compose__send"
                [disabled]="sending || !messageText.trim()"
                (click)="send()"
            >
                {{ sending ? 'Sending...' : 'Send' }}
            </button>
        </div>
    `,
    styles: [`
        .sm-compose {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem;
            border-top: 1px solid var(--sm-border-color, #e0e0e0);
            background: var(--sm-compose-bg, #fff);
        }
        .sm-compose__input {
            flex: 1;
            border: 1px solid var(--sm-border-color, #e0e0e0);
            border-radius: 8px;
            padding: 0.5rem 0.75rem;
            font-family: inherit;
            font-size: 0.9rem;
            resize: none;
            outline: none;
            color: var(--sm-text-color, #333);
            background: var(--sm-input-bg, #fff);
        }
        .sm-compose__input:focus {
            border-color: var(--sm-brand-color, #1a73e8);
        }
        .sm-compose__input:disabled {
            opacity: 0.6;
        }
        .sm-compose__send {
            padding: 0.5rem 1.25rem;
            border: none;
            border-radius: 8px;
            background: var(--sm-brand-color, #1a73e8);
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            white-space: nowrap;
        }
        .sm-compose__send:hover:not(:disabled) {
            opacity: 0.9;
        }
        .sm-compose__send:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `]
})
export class ComposeBoxComponent {
    @Output() messageSent = new EventEmitter<string>();

    messageText = '';
    sending = false;

    async send(): Promise<void> {
        const text = this.messageText.trim();
        if (!text || this.sending) return;

        this.sending = true;
        this.messageSent.emit(text);
        this.messageText = '';
        this.sending = false;
    }
}
