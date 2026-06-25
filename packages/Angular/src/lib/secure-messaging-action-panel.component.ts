import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';

/**
 * Shared action panel for staff-initiated thread actions: requesting files from the contact,
 * and sending a document for e-signature. Embedded by both the Executive Inbox and the Client
 * Workspace so the request/signature logic lives in one place.
 *
 * It is self-contained — given a `threadId` and the contact's `contactEmail`, it resolves the
 * portal session, loads signature accounts + thread documents, and submits:
 *   - 'request'   → creates a `File Requests` row (Pending).
 *   - 'signature' → invokes MJ's shipped `Send Document for Signature` action (which wraps
 *                   SignatureEngine.SendForSignature) via the data provider.
 *
 * Emits `done` after a successful create/send, and `cancel` when dismissed.
 */
@Component({
  standalone: false,
  selector: 'mj-secure-messaging-action-panel',
  template: `
<div class="action-panel">
  <div class="action-panel-header">
    <i [class]="mode === 'request' ? 'fa-solid fa-folder-plus' : 'fa-solid fa-file-signature'"></i>
    <span>{{ mode === 'request' ? 'Request files from contact' : 'Send a document for signature' }}</span>
    <button class="action-panel-close" title="Cancel" (click)="cancel.emit()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <input class="action-panel-input" type="text" [(ngModel)]="title"
    [placeholder]="mode === 'request' ? 'What files do you need? (title)' : 'Document title'">

  @if (mode === 'request') {
    <textarea class="action-panel-input" rows="2" [(ngModel)]="instructions"
      placeholder="Instructions (optional)"></textarea>
  }

  @if (mode === 'signature') {
    <label class="action-panel-label">Signature account</label>
    @if (signatureAccounts.length > 0) {
      <select class="action-panel-input" [(ngModel)]="selectedAccountId">
        @for (acct of signatureAccounts; track acct.id) {
          <option [value]="acct.id">{{ acct.label }}</option>
        }
      </select>
    } @else {
      <div class="action-panel-hint">No active signature accounts are configured. Add one in MJ: Signature Accounts.</div>
    }
    <label class="action-panel-label">Document to sign</label>
    @if (documents.length > 0) {
      <select class="action-panel-input" [(ngModel)]="selectedArtifactId">
        @for (doc of documents; track doc.artifactId) {
          <option [value]="doc.artifactId">{{ doc.filename }}</option>
        }
      </select>
    } @else {
      <div class="action-panel-hint">No documents on this conversation yet. Upload a file to the thread first.</div>
    }
  }

  @if (error) {
    <div class="action-panel-error">{{ error }}</div>
  }
  <div class="action-panel-footer">
    <button class="action-panel-submit" [disabled]="!canSubmit()" (click)="submit()">
      {{ submitting ? 'Working…' : (mode === 'request' ? 'Send request' : 'Create & send') }}
    </button>
  </div>
</div>
`,
  styles: [`
.action-panel {
  margin: 12px 0;
  padding: 14px;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mat-sys-corner-medium, 12px);
  background: var(--mj-bg-surface-card);
}
.action-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
  color: var(--mj-text-primary);
}
.action-panel-close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mj-text-muted);
  font-size: 14px;
}
.action-panel-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mat-sys-corner-small, 8px);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}
.action-panel-input:focus {
  outline: none;
  border-color: var(--mj-brand-primary);
}
.action-panel-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--mj-text-muted);
  margin-bottom: 4px;
}
.action-panel-hint {
  font-size: 12px;
  color: var(--mj-text-muted);
  margin-bottom: 8px;
}
.action-panel-error {
  font-size: 12px;
  color: var(--mj-status-error-text);
  margin-bottom: 8px;
}
.action-panel-footer {
  display: flex;
  justify-content: flex-end;
}
.action-panel-submit {
  padding: 7px 16px;
  border: none;
  border-radius: var(--mat-sys-corner-small, 8px);
  background: var(--mj-brand-primary);
  color: var(--mj-brand-on-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.action-panel-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`]
})
export class SecureMessagingActionPanelComponent implements OnInit {
  /** Which action this panel performs. */
  @Input() mode: 'request' | 'signature' = 'request';
  /** The conversation thread the action targets. */
  @Input() threadId = '';
  /** The contact's email — used as the signer recipient. */
  @Input() contactEmail = '';

  /** Emitted after a successful create/send. */
  @Output() done = new EventEmitter<void>();
  /** Emitted when the panel is dismissed without submitting. */
  @Output() cancel = new EventEmitter<void>();

  title = '';
  instructions = '';
  submitting = false;
  error = '';

  signatureAccounts: { id: string; label: string }[] = [];
  documents: { artifactId: string; filename: string }[] = [];
  selectedAccountId = '';
  selectedArtifactId = '';

  ngOnInit(): void {
    if (this.mode === 'signature') {
      void this.loadSignatureAccounts();
      void this.loadDocuments();
    }
  }

  canSubmit(): boolean {
    if (this.submitting || !this.title.trim()) return false;
    if (this.mode === 'signature') {
      return !!this.selectedAccountId && !!this.selectedArtifactId;
    }
    return true;
  }

  async submit(): Promise<void> {
    const title = this.title.trim();
    if (!title || !this.threadId || this.submitting) return;

    this.submitting = true;
    this.error = '';
    try {
      const sessionId = await this.resolvePortalSessionId(this.threadId);
      if (!sessionId) {
        this.error = 'No active portal session was found for this conversation.';
        return;
      }

      if (this.mode === 'request') {
        const md = new Metadata();
        const entity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: File Requests');
        entity.NewRecord();
        entity.Set('PortalSessionID', sessionId);
        entity.Set('ThreadID', this.threadId);
        entity.Set('Title', title);
        entity.Set('Status', 'Pending');
        if (this.instructions.trim()) entity.Set('Instructions', this.instructions.trim());
        if (!(await entity.Save())) {
          this.error = entity.LatestResult?.Message || 'Failed to create file request.';
          return;
        }
      } else {
        if (!this.selectedAccountId) { this.error = 'Select a signature account to send through.'; return; }
        if (!this.selectedArtifactId) { this.error = 'Select a document to send for signature.'; return; }
        if (!this.contactEmail) { this.error = 'No contact email is available for this conversation.'; return; }

        // MJ's shipped 'Send Document for Signature' action wraps SignatureEngine
        // (atomic create + send). Invoked via the data provider — the engine is server-side.
        const actionId = await this.resolveActionId('Send Document for Signature');
        if (!actionId) {
          this.error = 'The signature action is not available in this environment.';
          return;
        }
        const portalSessionsEntityId = new Metadata().Entities.find(
          e => e.Name === 'MJ_BizApps_SecureMessaging: Portal Sessions'
        )?.ID;

        const client = new GraphQLActionClient(Metadata.Provider as unknown as GraphQLDataProvider);
        const result = await client.RunAction(actionId, [
          { Name: 'SignatureAccountID', Value: this.selectedAccountId, Type: 'Input' },
          { Name: 'Title', Value: title, Type: 'Input' },
          { Name: 'ArtifactID', Value: this.selectedArtifactId, Type: 'Input' },
          { Name: 'Recipients', Value: [{ email: this.contactEmail }], Type: 'Input' },
          { Name: 'EntityID', Value: portalSessionsEntityId, Type: 'Input' },
          { Name: 'RecordID', Value: sessionId, Type: 'Input' },
          { Name: 'SendImmediately', Value: true, Type: 'Input' },
        ]);
        if (!result?.Success) {
          this.error = result?.Message || 'Failed to send for signature.';
          return;
        }
      }
      this.done.emit();
    } catch (e) {
      console.error('Action panel submit failed', e);
      this.error = 'Something went wrong. Please try again.';
    } finally {
      this.submitting = false;
    }
  }

  /** Load active signature accounts (provider + credentials) for the account picker. */
  private async loadSignatureAccounts(): Promise<void> {
    try {
      const rv = new RunView();
      const res = await rv.RunView({
        EntityName: 'MJ: Signature Accounts',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'IsDefault DESC, Name ASC',
        ResultType: 'simple',
      });
      if (!res.Success) return;
      this.signatureAccounts = (res.Results as Record<string, unknown>[]).map(r => ({
        id: String(r['ID']),
        label: `${r['Name']}${r['SignatureProvider'] ? ' (' + r['SignatureProvider'] + ')' : ''}`,
      }));
      this.selectedAccountId = this.signatureAccounts[0]?.id ?? '';
    } catch (e) {
      console.error('Failed to load signature accounts', e);
    }
  }

  /** Load the thread's documents (Message Files backed by an Artifact) for the document picker. */
  private async loadDocuments(): Promise<void> {
    if (!this.threadId) return;
    try {
      const rv = new RunView();
      const res = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
        ExtraFilter: `ThreadID = '${this.threadId.replace(/'/g, "''")}' AND ArtifactID IS NOT NULL`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
      });
      if (!res.Success) return;
      this.documents = (res.Results as Record<string, unknown>[]).map(r => ({
        artifactId: String(r['ArtifactID']),
        filename: (r['Filename'] as string) ?? 'document',
      }));
      this.selectedArtifactId = this.documents[0]?.artifactId ?? '';
    } catch (e) {
      console.error('Failed to load signable documents', e);
    }
  }

  /** Resolve an Action's ID by name (RunView on MJ: Actions). */
  private async resolveActionId(name: string): Promise<string | null> {
    const rv = new RunView();
    const res = await rv.RunView({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name = '${name.replace(/'/g, "''")}'`,
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (!res.Success || res.Results.length === 0) return null;
    return String((res.Results as Record<string, unknown>[])[0].ID);
  }

  /** Newest portal session ID for a thread. */
  private async resolvePortalSessionId(threadId: string): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
      ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
      OrderBy: 'LastAccessedAt DESC',
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (result.Success && result.Results && result.Results.length > 0) {
      return (result.Results[0] as Record<string, unknown>)['ID'] as string;
    }
    return null;
  }
}
