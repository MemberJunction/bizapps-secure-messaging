import { getSecureMessagingConfig } from '../config.js';
import { MessageStore } from './MessageStore.js';
import { OwnedMessageStore } from './OwnedMessageStore.js';
import { ChannelMessageStore } from './ChannelMessageStore.js';

export type {
    MessageStore,
    SecureMessageView,
    CreateMessageInput,
    CreateMessageResult,
} from './MessageStore.js';
export { OwnedMessageStore } from './OwnedMessageStore.js';
export { ChannelMessageStore } from './ChannelMessageStore.js';

let _messageStore: MessageStore | null = null;

/**
 * Returns the configured MessageStore singleton. Selected by SecureMessagingConfig:
 * 'owned' (default, self-contained) or 'channel' (bridges to Channel Messages).
 */
export function getMessageStore(): MessageStore {
    if (!_messageStore) {
        const { messageBackend } = getSecureMessagingConfig();
        _messageStore = messageBackend === 'channel'
            ? new ChannelMessageStore()
            : new OwnedMessageStore();
    }
    return _messageStore;
}

/** Overrides the message store (primarily for tests or programmatic bootstrap). */
export function setMessageStore(store: MessageStore | null): void {
    _messageStore = store;
}
