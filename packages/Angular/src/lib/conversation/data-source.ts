import { InjectionToken } from '@angular/core';

/**
 * Data-source contract for the shared conversation components.
 *
 * The same components serve two runtimes:
 *   - External contact widget (packages/Element): REST + opaque token (RestSecureMessagingDataSource).
 *   - Staff surfaces (in MJ Explorer): an in-MJ Metadata.Provider implementation (future).
 *
 * Components depend on this interface via the SECURE_MESSAGING_DATA_SOURCE injection token,
 * never on a concrete service — so the host picks the implementation.
 */

export interface AuthResponse {
  sessionId: string;
  contactEmail: string;
  /** Deep-link target thread from a magic link; absent for a bare session-token validation (v2). */
  threadId?: string;
  token: string;
}

/** A row in the contact's portal inbox (PRD §5). */
export interface ThreadSummary {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string | null;
}

export interface ThreadsResponse {
  threads: ThreadSummary[];
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
 * The operations the conversation components actually consume. Both the REST data source
 * (external widget) and a future in-MJ provider data source (staff) implement this.
 */
export interface ISecureMessagingDataSource {
  // Auth
  validateToken(token: string): Promise<AuthResponse>;
  redeemMagicLink(token: string): Promise<AuthResponse>;

  // Threads (the contact's inbox)
  listThreads(): Promise<ThreadsResponse>;

  // Messages
  getMessages(threadId: string): Promise<MessagesResponse>;
  sendMessage(threadId: string, content: string, subject?: string): Promise<CreateMessageResponse>;

  // Attachments
  getAttachments(threadId: string): Promise<AttachmentsResponse>;
  uploadFile(threadId: string, file: File): Promise<UploadResponse>;
  getDownloadUrl(threadId: string, attachmentId: string): Promise<string>;

  // File requests
  getFileRequests(threadId: string): Promise<FileRequestsResponse>;
  fulfillFileRequest(threadId: string, requestId: string, file: File): Promise<UploadResponse & { fileRequestId: string }>;

  // Signature requests
  getSignatureRequests(threadId: string): Promise<SignatureRequestsResponse>;
}

/** DI token the conversation components inject. Host provides a concrete implementation. */
export const SECURE_MESSAGING_DATA_SOURCE = new InjectionToken<ISecureMessagingDataSource>(
  'SECURE_MESSAGING_DATA_SOURCE'
);
