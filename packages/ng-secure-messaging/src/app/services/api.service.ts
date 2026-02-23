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
}
