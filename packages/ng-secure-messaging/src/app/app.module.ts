import { NgModule, Injector } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { createCustomElement } from '@angular/elements';

import { SecureMessagingComponent } from './components/secure-messaging/secure-messaging.component';
import { AuthViewComponent } from './components/auth-view/auth-view.component';
import { ConversationComponent } from './components/conversation/conversation.component';
import { MessageBubbleComponent } from './components/message-bubble/message-bubble.component';
import { ComposeBoxComponent } from './components/compose-box/compose-box.component';

@NgModule({
    declarations: [
        SecureMessagingComponent,
        AuthViewComponent,
        ConversationComponent,
        MessageBubbleComponent,
        ComposeBoxComponent,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        CommonModule,
    ],
    providers: [],
})
export class AppModule {
    constructor(injector: Injector) {
        // Register the main component as a custom element
        const secureMessaging = createCustomElement(SecureMessagingComponent, { injector });
        customElements.define('mj-secure-messaging', secureMessaging);
    }

    ngDoBootstrap() {}
}
