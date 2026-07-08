import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingSecureThreadEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: Secure Threads') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingsecurethread-form',
    templateUrl: './mjbizappssecuremessagingsecurethread.form.component.html'
})
export class mjBizAppsSecureMessagingSecureThreadFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingSecureThreadEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsSecureMessagingPortalMagicLinks', sectionName: 'Portal Magic Links', isExpanded: false },
            { sectionKey: 'mJBizAppsSecureMessagingSecureMessages', sectionName: 'Secure Messages', isExpanded: false },
            { sectionKey: 'mJBizAppsSecureMessagingMessageFiles', sectionName: 'Message Files', isExpanded: false },
            { sectionKey: 'mJBizAppsSecureMessagingFileRequests', sectionName: 'File Requests', isExpanded: false }
        ]);
    }
}

