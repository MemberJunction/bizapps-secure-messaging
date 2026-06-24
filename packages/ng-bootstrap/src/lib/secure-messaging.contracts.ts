/**
 * Host-agnostic event/selection contracts for the Secure Messaging staff components.
 *
 * The Executive Inbox and Client Workspace expose these via @Output/@Input so they can be
 * coordinated either by our own SecureMessagingResource (standalone OpenApp mode) or by any
 * external MJ Angular host that embeds the components (embeddable widget mode). Same contract,
 * two consumers.
 */

/** Emitted by the Client Workspace when a thread row is clicked; the host decides how to open it. */
export interface OpenThreadRequest {
  threadId: string;
  contactId: string;
  title?: string;
}

/** Emitted by the Client Workspace around a staff-initiated thread action. */
export interface WorkspaceActionRequest {
  kind: 'message' | 'request' | 'signature';
  contactId: string;
  threadId: string | null;
}

/** Emitted by the Executive Inbox when a contact is chosen to open their 360 workspace. */
export interface ContactSelection {
  contactId: string;
  contactName?: string;
  contactEmail?: string;
}
