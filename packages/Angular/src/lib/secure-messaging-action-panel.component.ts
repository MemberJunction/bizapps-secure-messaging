import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { PlacedField } from './secure-messaging-field-placer.component';

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
    <!-- Pick a document; its bytes are sent inline (base64) straight to the signature provider
         via MJ's "Send Document for Signature" action — no file-storage upload needed. -->
    <div class="action-panel-upload">
      <input #sigFileInput type="file" class="action-panel-file-input"
        accept=".pdf,.docx,.doc" (change)="onSignatureFileChosen($event)">
      @if (pickedDoc) {
        <div class="action-panel-doc">
          <i class="fa-solid fa-file-lines"></i>
          <span class="action-panel-doc-name">{{ pickedDoc.filename }}</span>
          <button class="action-panel-doc-remove" type="button" title="Remove" (click)="pickedDoc = null">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      } @else {
        <button class="action-panel-upload-btn" type="button" (click)="sigFileInput.click()">
          <i class="fa-solid fa-paperclip"></i> Choose a document
        </button>
      }
    </div>

    <!-- Field placement: staff visually drop signature/date/etc. onto the actual document. Since
         uploaded PDFs have no predictable marker text, coordinate placement (not anchor text) is the
         reliable path. Requires a picked PDF to render. -->
    @if (pickedDoc) {
      <label class="action-panel-label">Signing fields</label>
      <div class="action-panel-place">
        <button class="action-panel-place-btn" type="button" (click)="openPlacer()">
          <i class="fa-solid fa-hand-pointer"></i>
          {{ placedFields.length > 0 ? 'Edit field placement' : 'Place fields on document' }}
        </button>
        @if (placedFields.length > 0) {
          <span class="action-panel-place-count">
            <i class="fa-solid fa-circle-check"></i>
            {{ placedFields.length }} field{{ placedFields.length === 1 ? '' : 's' }} placed
          </span>
        }
      </div>
      <div class="action-panel-hint">
        Drop where the contact should sign. If you place no fields, the provider chooses a default location.
      </div>
    }
  }

  @if (error) {
    <div class="action-panel-error">{{ error }}</div>
  }
  @if (success) {
    <div class="action-panel-success"><i class="fa-solid fa-circle-check"></i> {{ success }}</div>
  }
  <div class="action-panel-footer">
    <button class="action-panel-submit" [disabled]="!canSubmit()" (click)="submit()">
      {{ submitting ? 'Working…' : (mode === 'request' ? 'Send request' : 'Create & send') }}
    </button>
  </div>
</div>

@if (showPlacer && pickedDoc) {
  <mj-secure-messaging-field-placer
    [contentBase64]="pickedDoc.contentBase64"
    [filename]="pickedDoc.filename"
    (placedFields)="onFieldsPlaced($event)"
    (cancel)="showPlacer = false">
  </mj-secure-messaging-field-placer>
}
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
.action-panel-place { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
.action-panel-place-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--mj-brand-primary); border-radius: 6px;
  background: var(--mj-bg-surface); color: var(--mj-brand-primary); cursor: pointer;
}
.action-panel-place-btn:hover { background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); }
.action-panel-place-count {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: var(--mj-status-success-text);
}
.action-panel-file-input { display: none; }
.action-panel-upload { margin: 6px 0 10px; }
.action-panel-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  border: 1px dashed var(--mj-border-default);
  border-radius: 6px;
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-secondary);
  cursor: pointer;
}
.action-panel-upload-btn:hover { border-color: var(--mj-brand-primary); color: var(--mj-brand-primary); }
.action-panel-doc {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--mj-border-default);
  border-radius: 6px;
  background: var(--mj-bg-surface-sunken);
  font-size: 13px;
  color: var(--mj-text-primary);
}
.action-panel-doc-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-panel-doc-remove {
  border: none; background: transparent; cursor: pointer;
  color: var(--mj-text-muted); padding: 0; display: flex; align-items: center;
}
.action-panel-doc-remove:hover { color: var(--mj-status-error-text); }
.action-panel-error {
  font-size: 12px;
  color: var(--mj-status-error-text);
  margin-bottom: 8px;
}
.action-panel-success {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mj-status-success-text);
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
  /** The contact's display name — shown as the signer's name in the signing ceremony/emails. */
  @Input() contactName = '';

  /** Emitted after a successful create/send. */
  @Output() done = new EventEmitter<void>();
  /** Emitted when the panel is dismissed without submitting. */
  @Output() cancel = new EventEmitter<void>();

  title = '';
  instructions = '';
  submitting = false;
  error = '';
  success = '';

  signatureAccounts: { id: string; label: string }[] = [];
  selectedAccountId = '';

  /** The document picked to sign — bytes held as base64, sent inline to the signature provider. */
  pickedDoc: { filename: string; contentType: string; contentBase64: string } | null = null;

  /** Whether the full-screen drag-and-drop field placer modal is open. */
  showPlacer = false;
  /** Fields the staffer placed on the document via the placer — sent as coordinate placement. */
  placedFields: PlacedField[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (this.mode === 'signature') {
      void this.loadSignatureAccounts();
    }
  }

  canSubmit(): boolean {
    if (this.submitting || !this.title.trim()) return false;
    if (this.mode === 'signature') {
      return !!this.selectedAccountId && !!this.pickedDoc;
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
        if (!this.pickedDoc) { this.error = 'Choose a document to send for signature.'; return; }
        if (!this.contactEmail) { this.error = 'No contact email is available for this conversation.'; return; }

        // MJ's shipped 'Send Document for Signature' action wraps SignatureEngine (atomic
        // create + send). The document rides INLINE as base64 in the Documents param — the engine
        // hands the bytes straight to the provider (DocuSign), so no file-storage upload is needed.
        const actionId = await this.resolveActionId('Send Document for Signature');
        if (!actionId) {
          this.error = 'The signature action is not available in this environment.';
          return;
        }
        const portalSessionsEntityId = new Metadata().Entities.find(
          e => e.Name === 'MJ_BizApps_SecureMessaging: Portal Sessions'
        )?.ID;

        // Coordinate placement from the visual placer. Each placed field carries its normalized
        // position + the page's true point dimensions, so the provider positions it exactly on the
        // uploaded document. Name the signer so DocuSign shows a real name (not the raw email). When
        // no fields were placed, we send none and the provider applies its own default location.
        const recipient: Record<string, unknown> = { email: this.contactEmail };
        if (this.contactName.trim()) recipient['name'] = this.contactName.trim();
        if (this.placedFields.length > 0) {
          recipient['fields'] = this.placedFields.map(f => ({
            type: f.type,
            page: f.page,
            xPercent: f.xPercent,
            yPercent: f.yPercent,
            pageWidthPt: f.pageWidthPt,
            pageHeightPt: f.pageHeightPt,
            required: f.required,
          }));
        }

        const client = new GraphQLActionClient(Metadata.Provider as unknown as GraphQLDataProvider);
        const result = await client.RunAction(actionId, [
          { Name: 'SignatureAccountID', Value: this.selectedAccountId, Type: 'Input' },
          { Name: 'Title', Value: title, Type: 'Input' },
          // Array/object params go over GraphQL as JSON strings (Value is a String scalar).
          { Name: 'Documents', Value: JSON.stringify([this.pickedDoc]), Type: 'Input' },
          { Name: 'Recipients', Value: JSON.stringify([recipient]), Type: 'Input' },
          { Name: 'EntityID', Value: portalSessionsEntityId, Type: 'Input' },
          { Name: 'RecordID', Value: sessionId, Type: 'Input' },
          // String scalar — send 'true', not boolean true, or GraphQL coercion rejects it.
          { Name: 'SendImmediately', Value: 'true', Type: 'Input' },
        ]);
        if (!result?.Success) {
          this.error = result?.Message || 'Failed to send for signature.';
          return;
        }
      }
      // Show a brief confirmation before the host closes the panel, so success is never ambiguous.
      this.success = this.mode === 'request' ? 'File request sent to the contact.' : 'Document sent for signature.';
      this.submitting = false;
      this.cdr.detectChanges();
      setTimeout(() => this.done.emit(), 1400);
      return;
    } catch (e) {
      console.error('Action panel submit failed', e);
      this.error = 'Something went wrong. Please try again.';
    } finally {
      this.submitting = false;
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to load signature accounts', e);
    }
  }

  /**
   * Read the chosen file as base64 and hold it as the document to sign. No upload — the bytes are
   * passed INLINE to MJ's 'Send Document for Signature' action (Documents param), which hands them
   * straight to the provider (DocuSign). This is MJ's canonical e-signature convention.
   */
  onSignatureFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file
    if (!file) return;

    this.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader gives a data URL: "data:<mime>;base64,<data>" — strip the prefix.
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
      this.pickedDoc = {
        filename: file.name,
        contentType: file.type || 'application/pdf',
        contentBase64: base64,
      };
      // A new document invalidates any fields placed on the previous one.
      this.placedFields = [];
      this.cdr.detectChanges();
    };
    reader.onerror = () => {
      this.error = 'Could not read the selected file.';
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  /** Open the drag-and-drop placer modal (only meaningful once a document is picked). */
  openPlacer(): void {
    if (!this.pickedDoc) return;
    this.showPlacer = true;
    this.cdr.detectChanges();
  }

  /** Receive the placed fields from the modal and close it. */
  onFieldsPlaced(fields: PlacedField[]): void {
    this.placedFields = fields;
    this.showPlacer = false;
    this.cdr.detectChanges();
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

  /**
   * Newest active portal session ID for a thread. In v2 sessions are per-contact (not per-thread),
   * so resolve the thread's contact first, then that contact's newest active session.
   */
  private async resolvePortalSessionId(threadId: string): Promise<string | null> {
    const rv = new RunView();
    const threadRes = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads',
      ExtraFilter: `ID = '${threadId.replace(/'/g, "''")}'`,
      Fields: ['ID', 'ContactID'],
      MaxRows: 1,
      ResultType: 'simple',
    });
    const thread = threadRes.Success ? (threadRes.Results?.[0] as Record<string, unknown> | undefined) : undefined;
    if (!thread) return null;
    const contactId = String(thread['ContactID']);

    const sessRes = await rv.RunView({
      EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
      ExtraFilter: `ContactID = '${contactId.replace(/'/g, "''")}' AND Status = 'Active'`,
      OrderBy: 'LastAccessedAt DESC',
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (sessRes.Success && sessRes.Results && sessRes.Results.length > 0) {
      return (sessRes.Results[0] as Record<string, unknown>)['ID'] as string;
    }
    return null;
  }
}
