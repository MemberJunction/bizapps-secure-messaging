import { Component } from '@angular/core';
import { mjBizAppsSecureMessagingPortalMagicLinkEntity } from '@mj-biz-apps/secure-messaging-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_SecureMessaging: Portal Magic Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappssecuremessagingportalmagiclink-form',
    templateUrl: './mjbizappssecuremessagingportalmagiclink.form.component.html'
})
export class mjBizAppsSecureMessagingPortalMagicLinkFormComponent extends BaseFormComponent {
    public record!: mjBizAppsSecureMessagingPortalMagicLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

