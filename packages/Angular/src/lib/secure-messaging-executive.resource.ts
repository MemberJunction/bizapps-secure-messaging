import { Component } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ContactSelection, OpenThreadRequest } from './secure-messaging.contracts';

type SmView = 'inbox' | 'workspace';

/**
 * MJ Explorer entry point AND the standalone two-lens coordinator for Secure Messaging.
 *
 * It hosts both staff surfaces and swaps between them, keeping ALL navigation inside our
 * package (no host involvement, so the app stays drop-in with a single "Inbox" nav item):
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
  template: `
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
        (openThreadRequested)="onOpenThread($event)"
        (closeRequested)="backToInbox()">
      </mj-secure-messaging-client-workspace>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .sm-surface { display: block; height: 100%; }
    :host:has(.sm-backbar) .sm-surface { height: calc(100% - 38px); }
    .sm-backbar {
      display: flex; align-items: center; gap: 8px;
      height: 38px; box-sizing: border-box; padding: 0 16px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      color: var(--mat-sys-primary, #0076b6);
      background: var(--mat-sys-surface-container-low, #f8fafc);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
    }
    .sm-backbar:hover { background: var(--mat-sys-surface-container, #f1f5f9); }
  `]
})
export class SecureMessagingResource extends BaseResourceComponent {
  view: SmView = 'inbox';
  selectedContactId = '';
  contactLabel = '';
  focusThreadId: string | null = null;

  override ngOnInit(): void {
    super.ngOnInit();
    this.hydrateFromParams(this.GetQueryParams());
  }

  protected override OnQueryParamsChanged(params: Record<string, string>): void {
    // Browser back/forward — re-derive the lens from the URL.
    this.hydrateFromParams(params);
  }

  private hydrateFromParams(p: Record<string, string>): void {
    this.selectedContactId = p['contactId'] ?? '';
    this.focusThreadId = p['threadId'] ?? null;
    this.view = p['view'] === 'workspace' && this.selectedContactId ? 'workspace' : 'inbox';
  }

  /** Inbox → open a contact's 360 workspace. */
  onContactSelected(c: ContactSelection): void {
    this.selectedContactId = c.contactId;
    this.contactLabel = c.contactName || c.contactEmail || '';
    this.focusThreadId = null;
    this.view = 'workspace';
    this.UpdateQueryParams({ view: 'workspace', contactId: c.contactId, threadId: null });
    if (this.contactLabel) this.NotifyDisplayNameChanged(this.contactLabel);
  }

  /** Workspace → open a thread back in the inbox (single conversation viewer), keeping the contact for "Back". */
  onOpenThread(e: OpenThreadRequest): void {
    this.focusThreadId = e.threadId;
    this.view = 'inbox';
    this.UpdateQueryParams({ view: 'inbox', contactId: this.selectedContactId, threadId: e.threadId });
  }

  /** "Back to {contact} workspace" from a thread-focused inbox. */
  backToWorkspace(): void {
    this.focusThreadId = null;
    this.view = 'workspace';
    this.UpdateQueryParams({ view: 'workspace', contactId: this.selectedContactId, threadId: null });
  }

  /** Return to the plain inbox (clear contact context). */
  backToInbox(): void {
    this.selectedContactId = '';
    this.contactLabel = '';
    this.focusThreadId = null;
    this.view = 'inbox';
    this.UpdateQueryParams({ view: 'inbox', contactId: null, threadId: null });
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'MJ_BizApps_SecureMessaging: Secure Messages';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-shield-halved';
  }
}

export function LoadSecureMessagingComponent(): void {}
