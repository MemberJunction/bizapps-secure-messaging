import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SecureMessagingExecutiveComponent } from './secure-messaging-executive.component';
import { SecureMessagingClientWorkspaceComponent } from './secure-messaging-client-workspace.component';
import { SecureMessagingResource } from './secure-messaging-executive.resource';
// Side-effect import: triggers @RegisterClass for SecureMessagingApplication
import './secure-messaging.application';

@NgModule({
  declarations: [
    SecureMessagingExecutiveComponent,
    SecureMessagingClientWorkspaceComponent,
    SecureMessagingResource
  ],
  imports: [
    CommonModule,
    FormsModule
  ],
  exports: [
    SecureMessagingExecutiveComponent,
    SecureMessagingClientWorkspaceComponent,
    SecureMessagingResource
  ]
})
export class SecureMessagingModule {}
