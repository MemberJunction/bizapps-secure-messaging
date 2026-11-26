import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ContactSelection, OpenThreadRequest } from './secure-messaging.contracts';

type SmView = 'inbox' | 'workspace';

/**
 * MJ Explorer entry point AND the standalone two-lens coordinator for Secure Messaging.
 *
 * Wraps the staff surfaces in canonical `<mj-page-layout>` chrome and swaps between:
 *   - Inbox (triage)  --click a contact-->  Client Workspace (contact 360)
 *   - Workspace       --click a thread -->  Inbox focused on that thread (+ Back to workspace)
 *
 * View state round-trips through the resource's query params, so refresh and browser
 * back/forward restore the right lens. In embeddable mode an external host plays this
 * coordinator role instead, consuming the same component @Input/@Output contract directly.
 */
@RegisterClass(BaseResourceComponent, 'SecureMessagingResource')
@Component({
  standalone: false,
  selector: 'mj-secure-messaging-resource',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-page-layout>
      @if (view === 'inbox') {
        @if (selectedContactId && focusThreadId) {
          <div class="sm-backbar" (click)="backToWorkspace()">
            <i class="fa-solid fa-arrow-left"></i>
            <span>Back to {{ contactLabel || 'client' }} workspace</span>
          </div>
        }
        <mj-secure-messaging-executive
          class="sm-surface"
          [focusThreadId]="focusThreadId"
          (contactSelected)="onContactSelected($event)">
        </mj-secure-messaging-executive>
      } @else {
        <mj-secure-messaging-client-workspace
          class="sm-surface"
          [contactId]="selectedContactId"
          [contactName]="selectedContactName"
          [contactEmail]="selectedContactEmail"
          (openThreadRequested)="onOpenThread($event)"
          (closeRequested)="backToInbox()">
        </mj-secure-messaging-client-workspace>
      }
    </mj-page-layout>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .sm-surface { display: block; flex: 1; min-height: 0; height: 100%; }
    .sm-backbar {
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      height: 38px; box-sizing: border-box; padding: 0 16px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      color: var(--mj-brand-primary);
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }
    .sm-backbar:hover { background: var(--mj-bg-surface-hover); }
  `]
})
export class SecureMessagingResource extends BaseResourceComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  view: SmView = 'inbox';
  selectedContactId = '';
  selectedContactName = '';
  selectedContactEmail = '';
  contactLabel = '';
  focusThreadId: string | null = null;

  override ngOnInit(): void {
    super.ngOnInit();
    this.hydrateFromParams(this.GetQueryParams());
    this.cdr.markForCheck();
    // Signal the shell's loading screen to clear — without this, a direct URL navigation
    // / refresh / deep-link to this resource hangs on "Preparing your view…" forever.
    // The child surfaces (inbox / workspace) own their own data loading + spinners.
    this.NotifyLoadComplete();
  }

  protected override OnQueryParamsChanged(params: Record<string, string>): void {
    // Browser back/forward — re-derive the lens from the URL.
    this.hydrateFromParams(params);
    this.cdr.markForCheck();
  }

  private hydrateFromParams(p: Record<string, string>): void {
    this.selectedContactId = p['contactId'] ?? '';
    this.focusThreadId = p['threadId'] ?? null;
    this.view = p['view'] === 'workspace' && this.selectedContactId ? 'workspace' : 'inbox';
  }

  /** Inbox → open a contact's 360 workspace. */
  onContactSelected(c: ContactSelection): void {
    this.selectedContactId = c.contactId;
    this.selectedContactName = c.contactName || '';
    this.selectedContactEmail = c.contactEmail || '';
    this.contactLabel = c.contactName || c.contactEmail || '';
    this.focusThreadId = null;
    this.view = 'workspace';
    this.UpdateQueryParams({ view: 'workspace', contactId: c.contactId, threadId: null });
    if (this.contactLabel) this.NotifyDisplayNameChanged(this.contactLabel);
    this.cdr.markForCheck();
  }

  /** Workspace → open a thread back in the inbox (single conversation viewer), keeping the contact for "Back". */
  onOpenThread(e: OpenThreadRequest): void {
    this.focusThreadId = e.threadId;
    this.view = 'inbox';
    this.UpdateQueryParams({ view: 'inbox', contactId: this.selectedContactId, threadId: e.threadId });
    this.cdr.markForCheck();
  }

  /** "Back to {contact} workspace" from a thread-focused inbox. */
  backToWorkspace(): void {
    this.focusThreadId = null;
    this.view = 'workspace';
    this.UpdateQueryParams({ view: 'workspace', contactId: this.selectedContactId, threadId: null });
    this.cdr.markForCheck();
  }

  /** Return to the plain inbox (clear contact context). */
  backToInbox(): void {
    this.selectedContactId = '';
    this.contactLabel = '';
    this.focusThreadId = null;
    this.view = 'inbox';
    this.UpdateQueryParams({ view: 'inbox', contactId: null, threadId: null });
    this.cdr.markForCheck();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'MJ_BizApps_SecureMessaging: Secure Messages';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-shield-halved';
  }
}

export function LoadSecureMessagingComponent(): void {}
