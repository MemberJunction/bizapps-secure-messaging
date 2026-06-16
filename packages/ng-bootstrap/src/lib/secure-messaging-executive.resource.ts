import { Component } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'SecureMessagingResource')
@Component({
  standalone: false,
  selector: 'mj-secure-messaging-resource',
  template: `<mj-secure-messaging-executive></mj-secure-messaging-executive>`,
  styles: [`:host { display: block; height: 100%; }`]
})
export class SecureMessagingResource extends BaseResourceComponent {
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'MJ_BizApps_SecureMessaging: Secure Messages';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-shield-halved';
  }
}

export function LoadSecureMessagingComponent(): void {}
