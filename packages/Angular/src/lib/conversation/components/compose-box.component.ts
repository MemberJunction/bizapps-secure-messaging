import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

/** A file staged in the compose box, not yet uploaded. Mirrors MJ chat's pending-attachment shape. */
export interface StagedFile {
    id: string;
    file: File;
    name: string;
    size: number;
}

@Component({
    standalone: false,
    selector: 'sm-compose-box',
    template: `
        <div class="sm-compose-wrap">
            <!-- Staged attachments (chips) — shown above the input, removed before send like MJ chat -->
            @if (stagedFiles.length > 0) {
                <div class="sm-staged">
                    @for (f of stagedFiles; track f.id) {
                        <div class="sm-staged__chip" [title]="f.name">
                            <i class="fa-solid fa-paperclip sm-staged__icon"></i>
                            <span class="sm-staged__name">{{ f.name }}</span>
                            <span class="sm-staged__size">{{ formatSize(f.size) }}</span>
                            <button
                                type="button"
                                class="sm-staged__remove"
                                title="Remove"
                                [disabled]="sending"
                                (click)="removeStaged(f.id)"
                            >
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                    }
                </div>
            }
            <div class="sm-compose">
                <div class="sm-compose__field">
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
                        (keydown.enter)="onEnter($event)"
                        rows="1"
                    ></textarea>
                    <div class="sm-compose__actions">
                        <button
                            class="sm-compose__attach"
                            type="button"
                            title="Attach a file"
                            [disabled]="sending"
                            (click)="fileInput.click()"
                        ><i class="fa-solid fa-paperclip"></i></button>
                        <button
                            class="sm-compose__send"
                            type="button"
                            title="Send"
                            [disabled]="sending || !canSend"
                            (click)="send()"
                        >
                            @if (!sending) {
                                <i class="fa-solid fa-paper-plane"></i>
                            } @else {
                                <span class="sm-compose__send-spinner"></span>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            flex-shrink: 0;
        }
        .sm-compose-wrap {
            border-top: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface-card);
        }
        .sm-staged {
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            padding: 0.6rem 0.75rem 0;
        }
        .sm-staged__chip {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            max-width: 240px;
            padding: 0.3rem 0.55rem;
            border: 1px solid var(--mj-border-default);
            border-radius: 999px;
            background: var(--mj-bg-surface-sunken);
            font-size: 0.8rem;
        }
        .sm-staged__icon { color: var(--mj-text-muted); flex-shrink: 0; }
        .sm-staged__name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--mj-text-primary);
        }
        .sm-staged__size { color: var(--mj-text-muted); flex-shrink: 0; }
        .sm-staged__remove {
            flex-shrink: 0;
            border: none;
            background: transparent;
            cursor: pointer;
            color: var(--mj-text-muted);
            padding: 0;
            line-height: 1;
            display: flex;
            align-items: center;
        }
        .sm-staged__remove:hover:not(:disabled) { color: var(--mj-status-error-text); }
        .sm-staged__remove:disabled { opacity: 0.4; cursor: not-allowed; }
        .sm-compose {
            padding: 0.75rem;
        }
        .sm-compose__file-input { display: none; }
        /* MJ-style single bordered field-card holding the input + the inline action buttons. */
        .sm-compose__field {
            position: relative;
            border: 2px solid var(--mj-border-default);
            border-radius: 12px;
            background: var(--mj-bg-surface);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .sm-compose__field:focus-within {
            border-color: var(--sm-brand-color, var(--mj-brand-primary));
            box-shadow: 0 2px 12px color-mix(in srgb, var(--sm-brand-color, var(--mj-brand-primary)) 15%, transparent);
        }
        .sm-compose__input {
            display: block;
            width: 100%;
            box-sizing: border-box;
            min-height: 46px;
            max-height: 160px;
            border: none;
            outline: none;
            resize: none;
            /* Right padding leaves room for the action buttons tucked bottom-right. */
            padding: 0.7rem 5rem 0.7rem 0.9rem;
            font-family: inherit;
            font-size: 0.9rem;
            line-height: 1.5;
            color: var(--mj-text-primary);
            background: transparent;
            border-radius: 12px;
        }
        .sm-compose__input::placeholder { color: var(--mj-text-muted); }
        .sm-compose__input:disabled { opacity: 0.6; }
        .sm-compose__actions {
            position: absolute;
            right: 0.5rem;
            bottom: 0.45rem;
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }
        .sm-compose__attach,
        .sm-compose__send {
            width: 34px;
            height: 34px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: background 0.2s ease, transform 0.1s ease, opacity 0.2s ease;
        }
        .sm-compose__attach {
            background: transparent;
            color: var(--mj-text-muted);
            font-size: 1.05rem;
        }
        .sm-compose__attach:hover:not(:disabled) {
            background: color-mix(in srgb, var(--mj-text-primary) 6%, transparent);
        }
        .sm-compose__send {
            background: var(--sm-brand-color, var(--mj-brand-primary));
            color: var(--mj-brand-on-primary);
            font-size: 0.95rem;
        }
        .sm-compose__send:hover:not(:disabled) { transform: scale(1.05); }
        .sm-compose__attach:disabled,
        .sm-compose__send:disabled { opacity: 0.4; cursor: not-allowed; }
        .sm-compose__send:disabled {
            background: var(--mj-border-default);
            color: var(--mj-text-muted);
        }
        .sm-compose__send-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid color-mix(in srgb, var(--mj-brand-on-primary) 40%, transparent);
            border-top-color: var(--mj-brand-on-primary);
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
        }
        @keyframes sm-spin { to { transform: rotate(360deg); } }
    `]
})
export class ComposeBoxComponent {
    /**
     * Emitted on Send with the message text + any staged files. Files are uploaded by the parent
     * ONLY at this point (committed together with the message), mirroring MJ chat / Slack — never
     * on file pick.
     */
    @Output() messageSent = new EventEmitter<{ text: string; files: File[] }>();

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    messageText = '';
    /** Set by the parent while the send (message + attachment upload) is in flight. */
    @Input() sending = false;

    /** Files chosen but not yet sent. Held locally until Send commits them. */
    stagedFiles: StagedFile[] = [];

    private nextId = 0;

    /** Can send when there's text OR at least one staged file (like MJ chat). */
    get canSend(): boolean {
        return this.messageText.trim().length > 0 || this.stagedFiles.length > 0;
    }

    async send(): Promise<void> {
        if (this.sending || !this.canSend) return;
        const text = this.messageText.trim();
        const files = this.stagedFiles.map(s => s.file);
        // Parent owns the async commit + the `sending` flag; clear the local draft optimistically.
        this.messageSent.emit({ text, files });
        this.messageText = '';
        this.stagedFiles = [];
    }

    /** Enter sends; Shift+Enter inserts a newline (MJ chat behavior). */
    onEnter(event: Event): void {
        const e = event as KeyboardEvent;
        if (e.shiftKey) return; // allow newline
        e.preventDefault();
        void this.send();
    }

    /** Stage the chosen file — does NOT upload. Upload happens on Send. */
    onFileChosen(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.stagedFiles.push({ id: `f${this.nextId++}`, file, name: file.name, size: file.size });
        }
        // Reset so selecting the same file again re-triggers change.
        input.value = '';
    }

    /** Remove a staged file before sending. */
    removeStaged(id: string): void {
        this.stagedFiles = this.stagedFiles.filter(s => s.id !== id);
    }

    formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
