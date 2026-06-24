import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingFileRequestEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: File Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingfilerequest-form',
    templateUrl: './mjbizappssecuremessagingfilerequest.form.component.html'
})
export class mjBizAppsSecureMessagingFileRequestFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingFileRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

