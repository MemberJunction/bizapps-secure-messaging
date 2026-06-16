import { Injectable } from '@angular/core';

export interface AuthResponse {
    sessionId: string;
    contactEmail: string;
    channelId: string;
    threadId: string;
    token: string;
}

export interface ThreadMessage {
    id: string;
    sender: string;
    recipient: string;
    subject: string | null;
    content: string;
    receivedAt: string;
    generationStatus: string;
    generatedReply: string | null;
    approvalStatus: string | null;
    approvedReply: string | null;
    sentContent: string | null;
    sentAt: string | null;
    parentId: string | null;
    messageFormat: string | null;
}

export interface MessagesResponse {
    messages: ThreadMessage[];
}

export interface CreateMessageResponse {
    messageId: string;
    status: string;
}

export interface ThreadAttachment {
    id: string;
    artifactId: string;
    fileId: string;
    filename: string;
    contentType: string;
    size: number;
}

export interface AttachmentsResponse {
    attachments: ThreadAttachment[];
}

export interface UploadResponse {
    attachmentId: string;
    artifactId: string;
    filename: string;
    contentType: string;
    size: number;
    status: string;
}

export interface FileRequest {
    id: string;
    title: string;
    instructions: string | null;
    status: 'Pending' | 'Fulfilled' | 'Cancelled';
    dueAt: string | null;
    fulfilledAt: string | null;
    createdAt: string;
}

export interface FileRequestsResponse {
    fileRequests: FileRequest[];
}

export interface SignatureRequest {
    id: string;
    title: string;
    status: 'Draft' | 'Sent' | 'Signed' | 'Declined' | 'Cancelled' | 'Unknown';
    /** MJ: Signature Account the request was sent through. */
    signatureAccountId: string | null;
    /** Provider-side envelope identifier, once sent. */
    externalEnvelopeId: string | null;
    sentAt: string | null;
    completedAt: string | null;
    createdAt: string;
}

export interface SignatureRequestsResponse {
    signatureRequests: SignatureRequest[];
}

export class ApiError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * HTTP client service for the Secure Messaging REST API.
 */
@Injectable({ providedIn: 'root' })
export class SecureMessagingApiService {
    private baseUrl = '';
    private token = '';

    configure(baseUrl: string, token: string): void {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.token = token;
    }

    updateToken(token: string): void {
        this.token = token;
    }

    getToken(): string {
        return this.token;
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({ error: response.statusText }));
            throw new ApiError(response.status, body.error || response.statusText);
        }

        return response.json();
    }

    async validateToken(token: string): Promise<AuthResponse> {
        return this.request<AuthResponse>('/auth/validate', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
    }

    async requestMagicLink(sessionId: string): Promise<{ success: boolean; magicLinkToken: string }> {
        return this.request('/auth/magic-link', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        });
    }

    async redeemMagicLink(token: string): Promise<AuthResponse> {
        return this.request<AuthResponse>('/auth/magic-link/redeem', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
    }

    async getMessages(threadId: string): Promise<MessagesResponse> {
        return this.request<MessagesResponse>(`/threads/${threadId}/messages`);
    }

    async sendMessage(threadId: string, content: string, subject?: string): Promise<CreateMessageResponse> {
        return this.request<CreateMessageResponse>(`/threads/${threadId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, subject }),
        });
    }

    /**
     * Uploads a file as multipart/form-data. Deliberately does NOT set Content-Type so
     * the browser supplies the correct multipart boundary; only the Authorization header
     * is attached.
     */
    private async upload<T>(path: string, formData: FormData): Promise<T> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({ error: response.statusText }));
            throw new ApiError(response.status, body.error || response.statusText);
        }

        return response.json();
    }

    async getAttachments(threadId: string): Promise<AttachmentsResponse> {
        return this.request<AttachmentsResponse>(`/threads/${threadId}/attachments`);
    }

    async uploadFile(threadId: string, file: File): Promise<UploadResponse> {
        const form = new FormData();
        form.append('file', file, file.name);
        return this.upload<UploadResponse>(`/threads/${threadId}/attachments`, form);
    }

    /** Resolves a pre-authenticated download URL for a stored attachment. */
    async getDownloadUrl(threadId: string, attachmentId: string): Promise<string> {
        const result = await this.request<{ url: string }>(
            `/threads/${threadId}/attachments/${attachmentId}/download`
        );
        return result.url;
    }

    async getFileRequests(threadId: string): Promise<FileRequestsResponse> {
        return this.request<FileRequestsResponse>(`/threads/${threadId}/file-requests`);
    }

    async fulfillFileRequest(threadId: string, requestId: string, file: File): Promise<UploadResponse & { fileRequestId: string }> {
        const form = new FormData();
        form.append('file', file, file.name);
        return this.upload(`/threads/${threadId}/file-requests/${requestId}/fulfill`, form);
    }

    async getSignatureRequests(threadId: string): Promise<SignatureRequestsResponse> {
        return this.request<SignatureRequestsResponse>(`/threads/${threadId}/signature-requests`);
    }
}
