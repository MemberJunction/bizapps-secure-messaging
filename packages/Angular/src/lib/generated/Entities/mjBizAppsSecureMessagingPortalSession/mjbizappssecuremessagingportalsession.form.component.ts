import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingPortalSessionEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: Portal Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingportalsession-form',
    templateUrl: './mjbizappssecuremessagingportalsession.form.component.html'
})
export class mjBizAppsSecureMessagingPortalSessionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingPortalSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsSecureMessagingPortalMagicLinks', sectionName: 'Portal Magic Links', isExpanded: false },
            { sectionKey: 'mJBizAppsSecureMessagingFileRequests', sectionName: 'File Requests', isExpanded: false },
            { sectionKey: 'mJBizAppsSecureMessagingSecureMessages', sectionName: 'Secure Messages', isExpanded: false }
        ]);
    }
}

