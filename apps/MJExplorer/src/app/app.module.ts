//***********************************************************
// Angular
//***********************************************************
import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

//***********************************************************
// MJ - Consolidated Module Bundles
//***********************************************************
import { MJExplorerModulesBundle, SharedService } from '@memberjunction/ng-explorer-modules';
import { AuthServicesModule, RedirectComponent, MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJExplorerAppModule } from '@memberjunction/ng-explorer-app';

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import { CLASS_REGISTRATIONS } from '@memberjunction/ng-bootstrap';

// Supplemental manifest for the Secure Messaging Open App, plus its client bootstrap.
import { CLASS_REGISTRATIONS as SECURE_MESSAGING_CLASSES, LoadSecureMessagingClient } from '@mj-biz-apps/secure-messaging-ng';

// Static code path so the bundler can't tree-shake any registered class.
const combinedClasses = [...CLASS_REGISTRATIONS, ...SECURE_MESSAGING_CLASSES];
LoadSecureMessagingClient();

//***********************************************************
// MSAL
//***********************************************************
import { MsalGuardConfiguration } from '@azure/msal-angular';
import { InteractionType } from '@azure/msal-browser';

//***********************************************************
// Project
//***********************************************************
import { AppComponent } from './app.component';
import { environment } from '../environments/environment';

export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return { interactionType: InteractionType.Redirect };
}

/**
 * Initialize the auth provider before Angular routing starts so MSAL can process
 * the OAuth redirect response before the router consumes the URL hash.
 */
export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    MJExplorerModulesBundle,
    AuthServicesModule.forRoot(environment),
    MJExplorerAppModule.forRoot(environment),
  ],
  providers: [
    SharedService,
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [MJAuthBase],
      multi: true,
    },
  ],
  bootstrap: [AppComponent, RedirectComponent],
})
export class AppModule {}

// Reference the merged manifest so it is never tree-shaken.
void combinedClasses;
