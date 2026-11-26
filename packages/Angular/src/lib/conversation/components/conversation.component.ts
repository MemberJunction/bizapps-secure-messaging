import { Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild, ChangeDetectorRef, Inject } from '@angular/core';
import {
    ISecureMessagingDataSource,
    SECURE_MESSAGING_DATA_SOURCE,
    ThreadMessage,
    ThreadAttachment,
    FileRequest,
    SignatureRequest,
} from '../data-source.js';

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
            @for (fr of pendingFileRequests; track fr.id) {
                <div class="sm-request-banner sm-request-banner--file">
                    <div class="sm-request-banner__icon"><i class="fa-solid fa-file-arrow-up"></i></div>
                    <div class="sm-request-banner__body">
                        <div class="sm-request-banner__title">File requested: {{ fr.title }}</div>
                        @if (fr.instructions) {
                            <div class="sm-request-banner__desc">{{ fr.instructions }}</div>
                        }
                    </div>
                    <button
                        type="button"
                        class="sm-request-banner__action"
                        [disabled]="uploading"
                        (click)="triggerFulfill(fr)"
                    >Upload</button>
                </div>
            }

            <!-- Pending signature requests -->
            @for (sr of pendingSignatureRequests; track sr.id) {
                <div class="sm-request-banner sm-request-banner--sign">
                    <div class="sm-request-banner__icon"><i class="fa-solid fa-file-signature"></i></div>
                    <div class="sm-request-banner__body">
                        <div class="sm-request-banner__title">Signature requested: {{ sr.title }}</div>
                        <div class="sm-request-banner__desc">Awaiting your signature ({{ sr.status }})</div>
                    </div>
                </div>
            }

            <input
                #fulfillInput
                type="file"
                class="sm-conversation__hidden-input"
                (change)="onFulfillFileChosen($event)"
            />

            <div class="sm-conversation__messages" #messageContainer>
                @if (loading && messages.length === 0) {
                    <div class="sm-conversation__loading">
                        <div class="sm-spinner"></div>
                        <p>Loading messages...</p>
                    </div>
                }

                @if (!loading && messages.length === 0) {
                    <div class="sm-conversation__empty">
                        <p>No messages yet. Send a message to get started.</p>
                    </div>
                }

                @for (msg of messages; track msg.id) {
                    <sm-message-bubble
                        [message]="msg"
                        [contactEmail]="contactEmail"
                    ></sm-message-bubble>
                }

                <!-- Shared files in this conversation -->
                @if (attachments.length > 0) {
                    <div class="sm-attachments">
                        <div class="sm-attachments__label"><i class="fa-solid fa-paperclip"></i> Files</div>
                        @for (att of attachments; track att.id) {
                            <button
                                type="button"
                                class="sm-attachments__item"
                                [disabled]="downloadingId === att.id"
                                (click)="onAttachmentClick(att)"
                                [title]="att.artifactId ? 'Preview ' + att.filename : 'Download ' + att.filename"
                            >
                                <span class="sm-attachments__name">{{ att.filename }}</span>
                                @if (att.artifactId) {
                                    <span class="sm-attachments__badge">MJ Doc</span>
                                }
                                <span class="sm-attachments__size">{{ formatSize(att.size) }}</span>
                            </button>
                        }
                    </div>
                }
            </div>

            @if (!readOnly) {
                <sm-compose-box
                    [sending]="sending"
                    (messageSent)="onMessageSent($event)"
                ></sm-compose-box>
            }
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
            background: var(--mj-bg-surface);
        }
        .sm-conversation__header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface-card);
        }
        .sm-conversation__title {
            font-weight: 700;
            font-size: 1rem;
            color: var(--mj-text-primary);
        }
        .sm-conversation__email {
            flex: 1;
            font-size: 0.8rem;
            color: var(--mj-text-muted);
        }
        .sm-conversation__refresh {
            padding: 0.35rem 0.75rem;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            font-size: 0.8rem;
            cursor: pointer;
            color: var(--mj-text-primary);
        }
        .sm-conversation__refresh:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover);
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
            color: var(--mj-text-muted);
        }
        .sm-spinner {
            width: 30px;
            height: 30px;
            border: 3px solid var(--mj-border-default);
            border-top-color: var(--sm-brand-color, var(--mj-brand-primary));
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
            border-bottom: 1px solid var(--mj-border-default);
            background: var(--mj-status-info-bg);
        }
        .sm-request-banner--sign {
            background: var(--mj-status-warning-bg);
        }
        .sm-request-banner__icon { font-size: 1.1rem; color: var(--mj-brand-primary); }
        .sm-request-banner__body { flex: 1; min-width: 0; }
        .sm-request-banner__title {
            font-weight: 600;
            font-size: 0.85rem;
            color: var(--mj-text-primary);
        }
        .sm-request-banner__desc {
            font-size: 0.78rem;
            color: var(--mj-text-muted);
        }
        .sm-request-banner__action {
            flex-shrink: 0;
            padding: 0.35rem 0.85rem;
            border: none;
            border-radius: 6px;
            background: var(--sm-brand-color, var(--mj-brand-primary));
            color: var(--mj-brand-on-primary);
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
            color: var(--mj-text-muted);
            margin-right: 0.25rem;
        }
        .sm-attachments__item {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.3rem 0.6rem;
            border: 1px solid var(--mj-border-default);
            border-radius: 14px;
            background: var(--mj-bg-surface-sunken);
            font-size: 0.78rem;
            color: var(--mj-text-primary);
            cursor: pointer;
        }
        .sm-attachments__item:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
        .sm-attachments__item:disabled { opacity: 0.5; cursor: wait; }
        .sm-attachments__badge {
            padding: 1px 6px;
            border-radius: 9999px;
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            font-size: 0.7rem;
            font-weight: 700;
        }
        .sm-attachments__size { color: var(--mj-text-muted); }
    `]
})
export class ConversationComponent implements OnInit {
    @Input() threadId = '';
    @Input() contactEmail = '';
    /** When true (a Closed thread), the compose box is hidden — the conversation is read-only. */
    @Input() readOnly = false;

    @ViewChild('messageContainer') messageContainer!: ElementRef;
    @ViewChild('fulfillInput') fulfillInput!: ElementRef<HTMLInputElement>;

    /** Emitted when a file is uploaded, so the host widget can surface a CustomEvent. */
    @Output() fileUploaded = new EventEmitter<{ attachmentId: string; filename: string }>();

    /** Emitted when an attachment with a populated ArtifactID is clicked and the host handles in-place preview. */
    @Output() artifactPreviewRequested = new EventEmitter<ThreadAttachment>();

    messages: ThreadMessage[] = [];
    attachments: ThreadAttachment[] = [];
    fileRequests: FileRequest[] = [];
    signatureRequests: SignatureRequest[] = [];
    loading = false;
    uploading = false;        // file-request fulfillment upload in flight
    sending = false;          // compose send (message + staged attachments) in flight
    downloadingId: string | null = null;
    private optimisticSeq = 0; // unique id suffix for optimistic (pending) message bubbles

    /** The file request currently being fulfilled (set when the user clicks Upload on a banner). */
    private fulfillingRequest: FileRequest | null = null;

    constructor(
        @Inject(SECURE_MESSAGING_DATA_SOURCE) private api: ISecureMessagingDataSource,
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

    /**
     * Commit a composed message + its staged attachments together (like MJ chat / Slack). Renders
     * the message OPTIMISTICALLY — the bubble appears instantly and the compose box frees up — then
     * uploads files + sends text + reconciles with the server in the background. Files are NEVER
     * uploaded on pick, only here on Send.
     */
    async onMessageSent(payload: { text: string; files: File[] }): Promise<void> {
        const { text, files } = payload;
        if (!text && files.length === 0) return;

        // 1. Optimistic render: show the outbound bubble immediately (sender = contact = outbound).
        let optimistic: ThreadMessage | null = null;
        if (text) {
            optimistic = {
                id: `pending-${this.optimisticSeq++}`,
                sender: this.contactEmail,
                recipient: '',
                subject: null,
                content: text,
                receivedAt: new Date().toISOString(),
                generationStatus: '',
                generatedReply: null,
                approvalStatus: null,
                approvedReply: null,
                sentContent: null,
                sentAt: null,
                parentId: null,
                messageFormat: null,
            };
            this.messages = [...this.messages, optimistic];
        }
        // Don't block the compose box on the network — it already cleared its draft.
        this.scrollToBottom();
        this.cdr.detectChanges();

        // 2. Commit in the background.
        try {
            for (const file of files) {
                const result = await this.api.uploadFile(this.threadId, file);
                this.fileUploaded.emit({ attachmentId: result.attachmentId, filename: result.filename });
            }
            if (text) {
                await this.api.sendMessage(this.threadId, text);
            }
            // 3. Reconcile with the server (replaces the optimistic row with the persisted one).
            await this.loadMessages();
            if (files.length > 0) {
                await this.loadSidecars();
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            // Roll the optimistic bubble back so the user knows it didn't send.
            if (optimistic) {
                this.messages = this.messages.filter(m => m.id !== optimistic!.id);
            }
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

    /** Routes attachment clicks: emits artifactPreviewRequested when ArtifactID is populated and observed, else falls back to download. */
    onAttachmentClick(att: ThreadAttachment): void {
        if (att.artifactId?.trim() && this.artifactPreviewRequested.observed) {
            this.artifactPreviewRequested.emit(att);
            return;
        }
        void this.download(att);
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
