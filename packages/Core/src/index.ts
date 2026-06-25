// Portal auth / session lifecycle
export { PortalAuthService } from './services/PortalAuthService.js';
export type { PortalSessionContext, MagicLinkResult, MagicLinkRedemptionResult, StartSecureThreadInput, StartSecureThreadResult, PromotedMessageInput, PromoteThreadInput, PromoteThreadResult } from './services/PortalAuthService.js';

// Message stores (owned default + optional channel adapter) and the store abstraction
export { getMessageStore, setMessageStore, OwnedMessageStore, ChannelMessageStore, setMessageNotifier } from './stores/index.js';
export type { MessageStore, SecureMessageView, CreateMessageInput, CreateMessageResult, CreateOutboundMessageInput, ImportMessagesInput, ImportMessagesResult, MessageNotifier, MessageNotification } from './stores/index.js';

// File/artifact store (bytes in MJ Files, wrapped as MJ Artifacts)
export { ArtifactFileStore, getFileStore, MAX_FILE_BYTES } from './stores/ArtifactFileStore.js';
export type { StoreFileInput, StoreFileContext, StoredFile } from './stores/ArtifactFileStore.js';

// Config (message backend selection, etc.)
export { getSecureMessagingConfig, setSecureMessagingConfig, loadSecureMessagingConfig } from './config.js';
export type { SecureMessagingConfig, MessageBackend } from './config.js';
