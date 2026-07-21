import { NgModule, Injector } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';

// The conversation UI lives in the shared library; this package is only the thin
// custom-element wrapper that bundles it into <mj-secure-messaging> for external sites.
import { SecureMessagingConversationModule, SecureMessagingComponent } from '@mj-biz-apps/secure-messaging-ng';

@NgModule({
    imports: [
        BrowserModule,
        SecureMessagingConversationModule,
    ],
})
export class AppModule {
    constructor(injector: Injector) {
        const secureMessaging = createCustomElement(SecureMessagingComponent, { injector });
        if (!customElements.get('mj-secure-messaging')) {
            customElements.define('mj-secure-messaging', secureMessaging);
        }
    }

    ngDoBootstrap() {}
}
