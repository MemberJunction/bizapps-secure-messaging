import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingSecureMessageEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: Secure Messages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingsecuremessage-form',
    templateUrl: './mjbizappssecuremessagingsecuremessage.form.component.html'
})
export class mjBizAppsSecureMessagingSecureMessageFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingSecureMessageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsSecureMessagingMessageFiles', sectionName: 'Message Files', isExpanded: false }
        ]);
    }
}

