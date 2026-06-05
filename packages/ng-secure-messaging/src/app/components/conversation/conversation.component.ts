import { Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import {
    SecureMessagingApiService,
    ThreadMessage,
    ThreadAttachment,
    FileRequest,
    SignatureRequest,
} from '../../services/api.service';

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

            <!-- Pending file requests from the organization -->
            <div *ngFor="let fr of pendingFileRequests" class="sm-request-banner sm-request-banner--file">
                <div class="sm-request-banner__icon">📥</div>
                <div class="sm-request-banner__body">
                    <div class="sm-request-banner__title">File requested: {{ fr.title }}</div>
                    <div class="sm-request-banner__desc" *ngIf="fr.instructions">{{ fr.instructions }}</div>
                </div>
                <button
                    class="sm-request-banner__action"
                    [disabled]="uploading"
                    (click)="triggerFulfill(fr)"
                >Upload</button>
            </div>

            <!-- Pending signature requests -->
            <div *ngFor="let sr of pendingSignatureRequests" class="sm-request-banner sm-request-banner--sign">
                <div class="sm-request-banner__icon">✍️</div>
                <div class="sm-request-banner__body">
                    <div class="sm-request-banner__title">Signature requested: {{ sr.title }}</div>
                    <div class="sm-request-banner__desc">Awaiting your signature ({{ sr.status }})</div>
                </div>
            </div>

            <input
                #fulfillInput
                type="file"
                class="sm-conversation__hidden-input"
                (change)="onFulfillFileChosen($event)"
            />

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

                <!-- Shared files in this conversation -->
                <div *ngIf="attachments.length > 0" class="sm-attachments">
                    <div class="sm-attachments__label">📎 Files</div>
                    <button
                        *ngFor="let att of attachments"
                        class="sm-attachments__item"
                        [disabled]="downloadingId === att.id"
                        (click)="download(att)"
                        [title]="'Download ' + att.filename"
                    >
                        <span class="sm-attachments__name">{{ att.filename }}</span>
                        <span class="sm-attachments__size">{{ formatSize(att.size) }}</span>
                    </button>
                </div>
            </div>

            <sm-compose-box
                [uploading]="uploading"
                (messageSent)="onMessageSent($event)"
                (fileSelected)="onFileSelected($event)"
            ></sm-compose-box>
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .sm-conversation {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            background: var(--mat-sys-surface-container-lowest, #fff);
        }
        .sm-conversation__header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            background: var(--mat-sys-surface-container-low, #f8f9fa);
        }
        .sm-conversation__title {
            font-weight: 700;
            font-size: 1rem;
            color: var(--mat-sys-on-surface, #333);
        }
        .sm-conversation__email {
            flex: 1;
            font-size: 0.8rem;
            color: var(--mat-sys-on-surface-variant, #666);
        }
        .sm-conversation__refresh {
            padding: 0.35rem 0.75rem;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 6px;
            background: white;
            font-size: 0.8rem;
            cursor: pointer;
            color: var(--mat-sys-on-surface, #333);
        }
        .sm-conversation__refresh:hover:not(:disabled) {
            background: var(--mat-sys-surface-container, #f0f0f0);
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
            justify-content: flex-end;
        }
        .sm-conversation__loading, .sm-conversation__empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            color: var(--mat-sys-on-surface-variant, #666);
        }
        .sm-spinner {
            width: 30px;
            height: 30px;
            border: 3px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-top-color: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
            border-radius: 50%;
            animation: sm-spin 0.8s linear infinite;
        }
        @keyframes sm-spin {
            to { transform: rotate(360deg); }
        }
        .sm-conversation__hidden-input { display: none; }
        .sm-request-banner {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.6rem 1rem;
            border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            background: var(--mat-sys-primary-container, #f1f6ff);
        }
        .sm-request-banner--sign {
            background: var(--mat-sys-surface-container-high, #fff7e6);
        }
        .sm-request-banner__icon { font-size: 1.1rem; }
        .sm-request-banner__body { flex: 1; min-width: 0; }
        .sm-request-banner__title {
            font-weight: 600;
            font-size: 0.85rem;
            color: var(--mat-sys-on-surface, #333);
        }
        .sm-request-banner__desc {
            font-size: 0.78rem;
            color: var(--mat-sys-on-surface-variant, #666);
        }
        .sm-request-banner__action {
            flex-shrink: 0;
            padding: 0.35rem 0.85rem;
            border: none;
            border-radius: 6px;
            background: var(--sm-brand-color, var(--mat-sys-primary, #1a73e8));
            color: white;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
        }
        .sm-request-banner__action:disabled { opacity: 0.5; cursor: not-allowed; }
        .sm-attachments {
            margin-top: 0.75rem;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.4rem;
        }
        .sm-attachments__label {
            font-size: 0.78rem;
            color: var(--mat-sys-on-surface-variant, #666);
            margin-right: 0.25rem;
        }
        .sm-attachments__item {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.3rem 0.6rem;
            border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
            border-radius: 14px;
            background: var(--mat-sys-surface-container, #f4f4f4);
            font-size: 0.78rem;
            color: var(--mat-sys-on-surface, #333);
            cursor: pointer;
        }
        .sm-attachments__item:hover:not(:disabled) { background: var(--mat-sys-surface-container, #ececec); }
        .sm-attachments__item:disabled { opacity: 0.5; cursor: wait; }
        .sm-attachments__size { color: var(--mat-sys-on-surface-variant, #888); }
    `]
})
export class ConversationComponent implements OnInit {
    @Input() threadId = '';
    @Input() channelId = '';
    @Input() contactEmail = '';

    @ViewChild('messageContainer') messageContainer!: ElementRef;
    @ViewChild('fulfillInput') fulfillInput!: ElementRef<HTMLInputElement>;

    /** Emitted when a file is uploaded, so the host widget can surface a CustomEvent. */
    @Output() fileUploaded = new EventEmitter<{ attachmentId: string; filename: string }>();

    messages: ThreadMessage[] = [];
    attachments: ThreadAttachment[] = [];
    fileRequests: FileRequest[] = [];
    signatureRequests: SignatureRequest[] = [];
    loading = false;
    uploading = false;
    downloadingId: string | null = null;

    /** The file request currently being fulfilled (set when the user clicks Upload on a banner). */
    private fulfillingRequest: FileRequest | null = null;

    constructor(
        private api: SecureMessagingApiService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this.loadMessages();
        this.loadSidecars();
    }

    get pendingFileRequests(): FileRequest[] {
        return this.fileRequests.filter(fr => fr.status === 'Pending');
    }

    get pendingSignatureRequests(): SignatureRequest[] {
        return this.signatureRequests.filter(sr => sr.status === 'Draft' || sr.status === 'Sent');
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

    /** Loads attachments, file requests, and signature requests. Best-effort — failures are logged. */
    async loadSidecars(): Promise<void> {
        if (!this.threadId) return;
        const [att, fr, sr] = await Promise.allSettled([
            this.api.getAttachments(this.threadId),
            this.api.getFileRequests(this.threadId),
            this.api.getSignatureRequests(this.threadId),
        ]);
        if (att.status === 'fulfilled') this.attachments = att.value.attachments;
        if (fr.status === 'fulfilled') this.fileRequests = fr.value.fileRequests;
        if (sr.status === 'fulfilled') this.signatureRequests = sr.value.signatureRequests;
        this.cdr.detectChanges();
    }

    async onMessageSent(content: string): Promise<void> {
        try {
            await this.api.sendMessage(this.threadId, content);
            await this.loadMessages();
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    async onFileSelected(file: File): Promise<void> {
        this.uploading = true;
        this.cdr.detectChanges();
        try {
            const result = await this.api.uploadFile(this.threadId, file);
            this.fileUploaded.emit({ attachmentId: result.attachmentId, filename: result.filename });
            await this.loadSidecars();
        } catch (error) {
            console.error('Failed to upload file:', error);
        } finally {
            this.uploading = false;
            this.cdr.detectChanges();
        }
    }

    triggerFulfill(fr: FileRequest): void {
        this.fulfillingRequest = fr;
        this.fulfillInput.nativeElement.click();
    }

    async onFulfillFileChosen(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        const request = this.fulfillingRequest;
        input.value = '';
        this.fulfillingRequest = null;
        if (!file || !request) return;

        this.uploading = true;
        this.cdr.detectChanges();
        try {
            await this.api.fulfillFileRequest(this.threadId, request.id, file);
            await this.loadSidecars();
        } catch (error) {
            console.error('Failed to fulfill file request:', error);
        } finally {
            this.uploading = false;
            this.cdr.detectChanges();
        }
    }

    async download(att: ThreadAttachment): Promise<void> {
        this.downloadingId = att.id;
        this.cdr.detectChanges();
        try {
            const url = await this.api.getDownloadUrl(this.threadId, att.id);
            window.open(url, '_blank', 'noopener');
        } catch (error) {
            console.error('Failed to get download URL:', error);
        } finally {
            this.downloadingId = null;
            this.cdr.detectChanges();
        }
    }

    formatSize(bytes: number): string {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
