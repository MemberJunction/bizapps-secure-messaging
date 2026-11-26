import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';

/** Lifecycle state of the in-place artifact preview host. */
export type ArtifactPreviewState = 'closed' | 'loading' | 'ready' | 'unavailable';

interface ArtifactVersionAvailabilityRow {
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Theme-native in-place slide-over/modal preview host for attached MJ Doc artifacts
 * (`MessageFile.ArtifactID`).
 *
 * Wraps `<mj-artifact-viewer-panel>` from `@memberjunction/ng-artifacts` so staff and
 * recipients can inspect attached MJ Docs directly inside a secure message thread
 * without navigating away or losing scroll position.
 *
 * Key guarantees:
 * - Lazy mounting: `<mj-artifact-viewer-panel>` is conditionally mounted via `@if`
 *   only while an active `ArtifactId` is open and verified accessible, executing zero
 *   artifact queries until clicked.
 * - Stale-load cancellation: rapid attachment switches or Escape dismissal mid-fetch
 *   invalidate in-flight checks via a monotonic load token.
 * - Accessibility: `role="dialog"`, `aria-modal="true"`, Escape-to-close keyboard
 *   handling, backdrop/close-button dismissal, and keyboard focus restoration to the
 *   triggering attachment element.
 * - Pure semantic `--mj-*` CSS custom properties for seamless light & dark theming.
 */
@Component({
  standalone: true,
  selector: 'mj-secure-messaging-artifact-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ArtifactsModule],
  template: `
    @if (IsOpen) {
      <div
        class="sm-ap-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
      >
        <section
          class="sm-ap-drawer"
          [class.sm-ap-drawer--maximized]="isMaximized"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="dialogAriaLabel"
          (click)="$event.stopPropagation()"
        >
          <header class="sm-ap-header">
            <div class="sm-ap-title-group">
              <span class="sm-ap-icon" aria-hidden="true">
                <i class="fa-solid fa-file-lines"></i>
              </span>
              <div class="sm-ap-title-meta">
                <div class="sm-ap-title-row">
                  <h2 class="sm-ap-title">{{ displayTitle }}</h2>
                  <span class="sm-ap-badge">MJ Doc</span>
                </div>
                @if (metaSummary) {
                  <div class="sm-ap-subtitle">{{ metaSummary }}</div>
                }
              </div>
            </div>

            <div class="sm-ap-actions">
              @if (CanDownload) {
                <button
                  type="button"
                  class="sm-ap-action-btn"
                  title="Download file"
                  aria-label="Download file"
                  (click)="onDownloadClick()"
                >
                  <i class="fa-solid fa-download" aria-hidden="true"></i>
                </button>
              }
              <button
                type="button"
                class="sm-ap-action-btn"
                [title]="isMaximized ? 'Restore drawer size' : 'Expand preview'"
                [attr.aria-label]="isMaximized ? 'Restore drawer size' : 'Expand preview'"
                (click)="toggleMaximize()"
              >
                <i
                  class="fa-solid"
                  [class.fa-down-left-and-up-right-to-center]="isMaximized"
                  [class.fa-up-right-and-down-left-from-center]="!isMaximized"
                  aria-hidden="true"
                ></i>
              </button>
              <button
                type="button"
                class="sm-ap-action-btn sm-ap-close-btn"
                title="Close preview (Esc)"
                aria-label="Close preview"
                (click)="close()"
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          </header>

          <div class="sm-ap-body">
            @if (previewState === 'loading') {
              <div class="sm-ap-state" role="status" aria-live="polite">
                <div class="sm-ap-spinner" aria-hidden="true"></div>
                <p class="sm-ap-state-title">Loading document preview…</p>
                <p class="sm-ap-state-desc">Resolving the latest accessible artifact version.</p>
              </div>
            } @else if (previewState === 'ready' && activeArtifactId) {
              <mj-artifact-viewer-panel
                class="sm-ap-viewer"
                [artifactId]="activeArtifactId"
                [CurrentUser]="currentUser"
                [EnvironmentId]="EnvironmentId"
                [VersionNumber]="VersionNumber"
                [Provider]="Provider"
                [ShowHeader]="true"
                [ShowTabs]="true"
                [ShowCloseButton]="false"
                [ShowMaximizeButton]="false"
                [ShowSaveToCollection]="false"
                [CanEdit]="false"
                [IsMaximized]="isMaximized"
                (Closed)="close()"
                (MaximizeToggled)="toggleMaximize()"
              ></mj-artifact-viewer-panel>
            } @else if (previewState === 'unavailable') {
              <div class="sm-ap-state sm-ap-state--unavailable" role="status" aria-live="polite">
                <span class="sm-ap-state-icon" aria-hidden="true">
                  <i class="fa-solid fa-file-circle-exclamation"></i>
                </span>
                <h3 class="sm-ap-state-title">Preview unavailable</h3>
                <p class="sm-ap-state-desc">{{ unavailableReason }}</p>
                <div class="sm-ap-state-actions">
                  @if (CanDownload) {
                    <button
                      type="button"
                      class="sm-ap-btn sm-ap-btn--primary"
                      (click)="onDownloadClick()"
                    >
                      <i class="fa-solid fa-download" aria-hidden="true"></i>
                      <span>Download file</span>
                    </button>
                  }
                  <button
                    type="button"
                    class="sm-ap-btn sm-ap-btn--secondary"
                    (click)="close()"
                  >
                    Close
                  </button>
                </div>
              </div>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host {
      display: contents;
    }

    .sm-ap-backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--mj-z-drawer, 1000);
      background: var(--mj-bg-overlay);
      display: flex;
      justify-content: flex-end;
      align-items: stretch;
      animation: sm-ap-fade-in var(--mj-transition-fast, 150ms ease) forwards;
    }

    .sm-ap-drawer {
      width: min(860px, 92vw);
      max-width: 100vw;
      height: 100%;
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      border-left: 1px solid var(--mj-border-default);
      box-shadow: var(--mj-shadow-xl);
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      transition: width var(--mj-transition-base, 200ms ease);
      animation: sm-ap-slide-in var(--mj-transition-base, 200ms ease) forwards;
    }

    .sm-ap-drawer--maximized {
      width: min(1440px, 98vw);
    }

    .sm-ap-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-subtle);
      flex-shrink: 0;
    }

    .sm-ap-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }

    .sm-ap-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--mj-radius-md, 8px);
      background: var(--mj-status-info-bg);
      color: var(--mj-brand-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }

    .sm-ap-title-meta {
      min-width: 0;
      flex: 1;
    }

    .sm-ap-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .sm-ap-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sm-ap-badge {
      flex-shrink: 0;
      padding: 2px 8px;
      border-radius: var(--mj-radius-full, 9999px);
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .sm-ap-subtitle {
      margin-top: 2px;
      font-size: 12px;
      color: var(--mj-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sm-ap-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .sm-ap-action-btn {
      width: 34px;
      height: 34px;
      border-radius: var(--mj-radius-md, 8px);
      border: 1px solid var(--mj-border-subtle);
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background var(--mj-transition-fast, 150ms ease),
                  color var(--mj-transition-fast, 150ms ease),
                  border-color var(--mj-transition-fast, 150ms ease);
    }

    .sm-ap-action-btn:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
      border-color: var(--mj-border-default);
    }

    .sm-ap-action-btn:focus-visible {
      outline: none;
      box-shadow: var(--mj-focus-ring);
    }

    .sm-ap-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--mj-bg-surface-sunken);
      overflow: hidden;
    }

    .sm-ap-viewer {
      flex: 1;
      min-height: 0;
      display: block;
      width: 100%;
      height: 100%;
    }

    .sm-ap-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 36px 24px;
      text-align: center;
      gap: 8px;
      color: var(--mj-text-secondary);
    }

    .sm-ap-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--mj-border-default);
      border-top-color: var(--mj-brand-primary);
      border-radius: 50%;
      animation: sm-ap-spin 0.8s linear infinite;
      margin-bottom: 6px;
    }

    .sm-ap-state-icon {
      width: 48px;
      height: 48px;
      border-radius: var(--mj-radius-lg, 12px);
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning-text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      margin-bottom: 6px;
    }

    .sm-ap-state-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .sm-ap-state-desc {
      margin: 0;
      max-width: 420px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--mj-text-muted);
    }

    .sm-ap-state-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }

    .sm-ap-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--mj-radius-md, 8px);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background var(--mj-transition-fast, 150ms ease),
                  border-color var(--mj-transition-fast, 150ms ease);
    }

    .sm-ap-btn:focus-visible {
      outline: none;
      box-shadow: var(--mj-focus-ring);
    }

    .sm-ap-btn--primary {
      background: var(--mj-brand-primary);
      color: var(--mj-brand-on-primary);
    }

    .sm-ap-btn--primary:hover {
      background: var(--mj-brand-primary-hover);
    }

    .sm-ap-btn--secondary {
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      border-color: var(--mj-border-default);
    }

    .sm-ap-btn--secondary:hover {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
    }

    @keyframes sm-ap-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes sm-ap-slide-in {
      from { transform: translateX(24px); opacity: 0.9; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes sm-ap-spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .sm-ap-drawer {
        width: 100vw;
        border-left: none;
      }
    }
  `],
})
export class SecureMessagingArtifactPreviewComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly doc = inject(DOCUMENT);

  private _artifactId: string | null = null;
  private _filename = '';
  private _contentType = '';
  private _fileSize = 0;
  private _canDownload = false;
  private _loadToken = 0;
  private _returnFocusElement: HTMLElement | null = null;

  /** Current host lifecycle state (`closed`, `loading`, `ready`, or `unavailable`). */
  public previewState: ArtifactPreviewState = 'closed';

  /** Whether the slide-over preview is expanded to full-width modal dimensions. */
  public isMaximized = false;

  /** Human-readable explanation shown when the artifact cannot be previewed. */
  public unavailableReason = '';

  /** Optional metadata provider override for multi-provider Angular hosts. */
  @Input() Provider: IMetadataProvider | null = null;

  /** Optional specific artifact version number to display. */
  @Input() VersionNumber: number | undefined = undefined;

  /** Optional MJ environment identifier passed through to `<mj-artifact-viewer-panel>`. */
  @Input() EnvironmentId = '';

  /** Optional triggering element to restore keyboard focus to upon Escape/close. */
  @Input() TriggerElement: HTMLElement | null = null;

  /**
   * When true, skips the lightweight `MJ: Artifact Versions` availability pre-check
   * and mounts `<mj-artifact-viewer-panel>` immediately. Defaults to `false`.
   */
  @Input() SkipAvailabilityCheck = false;

  /** Populated `MessageFile.ArtifactID` to preview, or null/empty when closed. */
  @Input()
  set ArtifactId(value: string | null) {
    const normalized = value?.trim() || null;
    if (normalized === this._artifactId) {
      return;
    }
    const wasOpen = this._artifactId !== null;
    this._artifactId = normalized;
    this.handleArtifactIdChange(normalized, wasOpen);
  }
  get ArtifactId(): string | null {
    return this._artifactId;
  }

  /** CamelCase alias for {@link ArtifactId}. */
  @Input()
  set artifactId(value: string | null) {
    this.ArtifactId = value;
  }
  get artifactId(): string | null {
    return this.ArtifactId;
  }

  /** Display filename of the attached MessageFile. */
  @Input()
  set Filename(value: string) {
    this._filename = value || '';
    this.cdr.markForCheck();
  }
  get Filename(): string {
    return this._filename;
  }

  /** CamelCase alias for {@link Filename}. */
  @Input()
  set filename(value: string) {
    this.Filename = value;
  }
  get filename(): string {
    return this.Filename;
  }

  /** MIME content type of the attached MessageFile. */
  @Input()
  set ContentType(value: string) {
    this._contentType = value || '';
    this.cdr.markForCheck();
  }
  get ContentType(): string {
    return this._contentType;
  }

  /** CamelCase alias for {@link ContentType}. */
  @Input()
  set contentType(value: string) {
    this.ContentType = value;
  }
  get contentType(): string {
    return this.ContentType;
  }

  /** File size in bytes for the attached MessageFile. */
  @Input()
  set FileSize(value: number) {
    this._fileSize = Number.isFinite(value) && value > 0 ? value : 0;
    this.cdr.markForCheck();
  }
  get FileSize(): number {
    return this._fileSize;
  }

  /** CamelCase alias for {@link FileSize}. */
  @Input()
  set fileSize(value: number) {
    this.FileSize = value;
  }
  get fileSize(): number {
    return this.FileSize;
  }

  /** Whether a raw file download fallback action is available for this attachment. */
  @Input()
  set CanDownload(value: boolean) {
    this._canDownload = Boolean(value);
    this.cdr.markForCheck();
  }
  get CanDownload(): boolean {
    return this._canDownload;
  }

  /** CamelCase alias for {@link CanDownload}. */
  @Input()
  set canDownload(value: boolean) {
    this.CanDownload = value;
  }
  get canDownload(): boolean {
    return this.CanDownload;
  }

  /** Emitted when the preview host is dismissed via Escape, backdrop click, or Close button. */
  @Output() Closed = new EventEmitter<void>();

  /** CamelCase alias for {@link Closed}. */
  @Output() closed = this.Closed;

  /** Emitted when the user requests downloading the underlying file directly. */
  @Output() DownloadRequested = new EventEmitter<void>();

  /** CamelCase alias for {@link DownloadRequested}. */
  @Output() downloadRequested = this.DownloadRequested;

  /** Active metadata provider (explicit `@Input() Provider` or default global provider). */
  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  /** Whether the preview host currently has an active artifact ID open. */
  public get IsOpen(): boolean {
    return this._artifactId !== null && this.previewState !== 'closed';
  }

  /** Active non-null artifact ID bound to `<mj-artifact-viewer-panel>`. */
  public get activeArtifactId(): string | null {
    return this._artifactId;
  }

  /** Active MJ user passed to `<mj-artifact-viewer-panel>`. */
  public get currentUser(): UserInfo {
    return this.ProviderToUse?.CurrentUser;
  }

  /** Header title for the preview drawer. */
  public get displayTitle(): string {
    return this._filename.trim() || 'Document preview';
  }

  /** Accessible label for the preview dialog. */
  public get dialogAriaLabel(): string {
    return `Preview ${this.displayTitle}`;
  }

  /** Concise subtitle combining content type and formatted size. */
  public get metaSummary(): string {
    const parts: string[] = [];
    if (this._contentType.trim()) {
      parts.push(this._contentType.trim());
    }
    if (this._fileSize > 0) {
      parts.push(this.formatFileSize(this._fileSize));
    }
    return parts.join(' · ');
  }

  /** Dismisses the preview host cleanly when Escape is pressed anywhere while open. */
  @HostListener('document:keydown', ['$event'])
  public onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.IsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  public ngOnDestroy(): void {
    this._loadToken++;
    this._returnFocusElement = null;
  }

  /** Dismisses the preview when the translucent backdrop is clicked. */
  public onBackdropClick(): void {
    this.close();
  }

  /** Toggles between standard slide-over drawer width and expanded modal width. */
  public toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
    this.cdr.markForCheck();
  }

  /** Requests the parent surface to execute the standard file download fallback. */
  public onDownloadClick(): void {
    this.DownloadRequested.emit();
  }

  /** Closes the preview host, cancels in-flight loads, and restores keyboard focus. */
  public close(): void {
    if (!this.IsOpen) {
      return;
    }
    this._loadToken++;
    this._artifactId = null;
    this.previewState = 'closed';
    this.isMaximized = false;
    this.unavailableReason = '';
    this.cdr.markForCheck();
    this.restoreFocus();
    this.Closed.emit();
  }

  private handleArtifactIdChange(artifactId: string | null, wasOpen: boolean): void {
    const token = ++this._loadToken;
    this.isMaximized = false;
    this.unavailableReason = '';

    if (!artifactId) {
      this.previewState = 'closed';
      this.cdr.markForCheck();
      if (wasOpen) {
        this.restoreFocus();
      }
      return;
    }

    if (!wasOpen) {
      const active = this.doc?.activeElement;
      this._returnFocusElement =
        this.TriggerElement ?? (active instanceof HTMLElement ? active : null);
    } else if (this.TriggerElement) {
      this._returnFocusElement = this.TriggerElement;
    }

    if (this.SkipAvailabilityCheck) {
      this.previewState = 'ready';
      this.cdr.markForCheck();
      return;
    }

    this.previewState = 'loading';
    this.cdr.markForCheck();
    void this.verifyArtifactAvailability(artifactId, token);
  }

  private async verifyArtifactAvailability(artifactId: string, token: number): Promise<void> {
    try {
      const provider = this.ProviderToUse;
      if (!provider) {
        if (token !== this._loadToken || this._artifactId !== artifactId) {
          return;
        }
        this.previewState = 'unavailable';
        this.unavailableReason = 'No active MemberJunction data provider is available to load this preview.';
        this.cdr.markForCheck();
        return;
      }

      const rv = RunView.FromMetadataProvider(provider);
      const res = await rv.RunView<ArtifactVersionAvailabilityRow>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID = '${escapeSqlLiteral(artifactId)}'`,
        Fields: ['ID', 'ArtifactID', 'VersionNumber'],
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'simple',
      });

      if (token !== this._loadToken || this._artifactId !== artifactId) {
        return;
      }

      if (res?.Success && Array.isArray(res.Results) && res.Results.length > 0) {
        this.previewState = 'ready';
        this.unavailableReason = '';
      } else {
        this.previewState = 'unavailable';
        this.unavailableReason =
          'This document preview is unavailable or you do not have permission to view it.';
      }
      this.cdr.markForCheck();
    } catch {
      if (token !== this._loadToken || this._artifactId !== artifactId) {
        return;
      }
      this.previewState = 'unavailable';
      this.unavailableReason = 'Unable to load this document preview right now.';
      this.cdr.markForCheck();
    }
  }

  private restoreFocus(): void {
    const target = this._returnFocusElement;
    this._returnFocusElement = null;
    if (target && target.isConnected && typeof target.focus === 'function') {
      target.focus();
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
