import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, NavItem } from '@memberjunction/ng-base-application';

/**
 * Registers Secure Messaging as a first-class MJ Explorer application.
 * Appears in the app switcher with its own icon, color, and nav items.
 *
 * The ClassName must match the value stored in the MJ Applications entity record.
 */
@RegisterClass(BaseApplication, 'SecureMessagingApplication')
export class SecureMessagingApplication extends BaseApplication {
    override async GetNavItems(): Promise<NavItem[]> {
        return [
            {
                Label: 'Inbox',
                ResourceType: 'Custom',
                DriverClass: 'SecureMessagingResource',
                Icon: 'fa-solid fa-inbox',
                isDefault: true
            }
        ];
    }
}
