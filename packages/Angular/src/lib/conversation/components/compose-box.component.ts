import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

@Component({
    standalone: false,
    selector: 'sm-compose-box',
    template: `
        <div class="sm-compose">
            <button
                class="sm-compose__attach"
                type="button"
                title="Attach a file"
                [disabled]="sending || uploading"
                (click)="fileInput.click()"
            >
                <span *ngIf="!uploading">📎</span>
                <span *ngIf="uploading" class="sm-compose__attach-spinner"></span>
            </button>
            <input
                #fileInput
                type="file"
                class="sm-compose__file-input"
                (change)="onFileChosen($event)"
            />
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
        :host {
            flex-shrink: 0;
        }
        .sm-compose {
            display: flex;
            align-items: flex-end;
            gap: 0.5rem;
            padding: 0.75rem;
            border-top: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            background: var(--mat-sys-surface-container-low, #fff);
        }
        .sm-compose__attach {
            flex-shrink: 0;
            width: 38px;
            height: 38px;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 8px;
            background: var(--mat-sys-surface-container-lowest, #fff);
            font-size: 1.1rem;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sm-compose__attach:hover:not(:disabled) {
            background: var(--mat-sys-surface-container, #f0f0f0);
        }
        .sm-compose__attach:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .sm-compose__attach-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-top-color: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
        }
        .sm-compose__file-input {
            display: none;
        }
        .sm-compose__input {
            flex: 1;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 8px;
            padding: 0.5rem 0.75rem;
            font-family: inherit;
            font-size: 0.9rem;
            resize: none;
            outline: none;
            color: var(--mat-sys-on-surface, #333);
            background: var(--mat-sys-surface-container-lowest, #fff);
        }
        .sm-compose__input:focus {
            border-color: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
        }
        .sm-compose__input:disabled {
            opacity: 0.6;
        }
        .sm-compose__send {
            padding: 0.5rem 1.25rem;
            border: none;
            border-radius: 8px;
            background: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
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
    @Output() fileSelected = new EventEmitter<File>();

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    messageText = '';
    sending = false;
    /** Set by the parent while an upload is in flight so the attach button shows a spinner. */
    @Input() uploading = false;

    async send(): Promise<void> {
        const text = this.messageText.trim();
        if (!text || this.sending) return;

        this.sending = true;
        this.messageSent.emit(text);
        this.messageText = '';
        this.sending = false;
    }

    onFileChosen(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.fileSelected.emit(file);
        }
        // Reset so selecting the same file again re-triggers change.
        input.value = '';
    }
}
