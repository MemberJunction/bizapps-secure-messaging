import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SecureMessagingComponent } from './components/secure-messaging.component.js';
import { ConversationComponent } from './components/conversation.component.js';
import { ComposeBoxComponent } from './components/compose-box.component.js';
import { MessageBubbleComponent } from './components/message-bubble.component.js';
import { AuthViewComponent } from './components/auth-view.component.js';
import { SECURE_MESSAGING_DATA_SOURCE } from './data-source.js';
import { SecureMessagingApiService } from './services/api.service.js';

/**
 * The shared conversation UI (root + conversation + compose + message bubble + auth view).
 * Used by the external contact widget (packages/Element) and any host that wants to render
 * a secure-messaging conversation. Components consume the data source via
 * SECURE_MESSAGING_DATA_SOURCE; this module provides the REST implementation by default —
 * a host can override the token with its own provider implementation.
 */
@NgModule({
  declarations: [
    SecureMessagingComponent,
    ConversationComponent,
    ComposeBoxComponent,
    MessageBubbleComponent,
    AuthViewComponent,
  ],
  imports: [CommonModule, FormsModule],
  providers: [
    { provide: SECURE_MESSAGING_DATA_SOURCE, useExisting: SecureMessagingApiService },
  ],
  exports: [
    SecureMessagingComponent,
    ConversationComponent,
    ComposeBoxComponent,
    MessageBubbleComponent,
    AuthViewComponent,
  ],
})
export class SecureMessagingConversationModule {}
