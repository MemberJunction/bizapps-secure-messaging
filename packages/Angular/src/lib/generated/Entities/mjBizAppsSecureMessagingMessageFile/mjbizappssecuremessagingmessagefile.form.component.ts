import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingMessageFileEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: Message Files') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingmessagefile-form',
    templateUrl: './mjbizappssecuremessagingmessagefile.form.component.html'
})
export class mjBizAppsSecureMessagingMessageFileFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingMessageFileEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

