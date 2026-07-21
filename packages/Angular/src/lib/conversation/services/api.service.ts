import { Injectable } from '@angular/core';
import {
  ApiError,
  AuthResponse,
  AttachmentsResponse,
  CreateMessageResponse,
  FileRequestsResponse,
  ISecureMessagingDataSource,
  MessagesResponse,
  SignatureRequestsResponse,
  ThreadsResponse,
  UploadResponse,
} from '../data-source.js';

// Re-export the shared DTOs so existing importers of api.service keep working.
export * from '../data-source.js';

/**
 * REST implementation of ISecureMessagingDataSource — the external contact widget path.
 * Talks to the Secure Messaging portal API over HTTP with an opaque session token.
 */
@Injectable({ providedIn: 'root' })
export class SecureMessagingApiService implements ISecureMessagingDataSource {
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
      ...((options.headers as Record<string, string>) || {}),
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

  async listThreads(): Promise<ThreadsResponse> {
    return this.request<ThreadsResponse>('/threads');
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
