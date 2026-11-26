// @vitest-environment jsdom
import '@angular/compiler';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, type Type } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  IMetadataProvider,
  RunView,
  RunViewParams,
  RunViewResult,
  UserInfo,
} from '@memberjunction/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Avoid loading heavy browser-only plugin bundles (AgGrid/CodeMirror/Mermaid) inside jsdom;
// `ngc` compiles against the real @memberjunction/ng-artifacts@6.3.0-edge.1 package.
vi.mock('@memberjunction/ng-artifacts', () => ({
  ArtifactsModule: class MockArtifactsModule {},
}));

import {
  SecureMessagingArtifactPreviewComponent,
} from '../lib/secure-messaging-artifact-preview.component';
import {
  MessageAttachment,
  SecureMessagingExecutiveComponent,
} from '../lib/secure-messaging-executive.component';
import { ConversationComponent } from '../lib/conversation/components/conversation.component';
import {
  AuthResponse,
  AttachmentsResponse,
  CreateMessageResponse,
  FileRequestsResponse,
  ISecureMessagingDataSource,
  MessagesResponse,
  SignatureRequestsResponse,
  ThreadAttachment,
  ThreadsResponse,
  UploadResponse,
} from '../lib/conversation/data-source';

beforeAll(() => {
  const testBed = getTestBed();
  if (!testBed.platform) {
    testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  document.body.innerHTML = '';
});

function declareStubComponent(target: Type<object>, metadata: Component): void {
  Component({ standalone: true, ...metadata })(target);
}

/** Lightweight stand-in for `<mj-artifact-viewer-panel>` from `@memberjunction/ng-artifacts`. */
class ArtifactViewerPanelStub {
  public artifactId = '';
  public CurrentUser: UserInfo | null = null;
  public EnvironmentId = '';
  public VersionNumber: number | undefined = undefined;
  public Provider: IMetadataProvider | null = null;
  public ShowHeader = true;
  public ShowTabs = true;
  public ShowCloseButton = false;
  public ShowMaximizeButton = false;
  public ShowSaveToCollection = false;
  public CanEdit = false;
  public IsMaximized = false;
  public Closed = new EventEmitter<void>();
  public MaximizeToggled = new EventEmitter<void>();
}

declareStubComponent(ArtifactViewerPanelStub, {
  selector: 'mj-artifact-viewer-panel',
  template: '<div class="stub-artifact-panel" [attr.data-artifact-id]="artifactId"></div>',
  inputs: [
    'artifactId',
    'CurrentUser',
    'EnvironmentId',
    'VersionNumber',
    'Provider',
    'ShowHeader',
    'ShowTabs',
    'ShowCloseButton',
    'ShowMaximizeButton',
    'ShowSaveToCollection',
    'CanEdit',
    'IsMaximized',
  ],
  outputs: ['Closed', 'MaximizeToggled'],
});

interface VersionRow {
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
}

type RunViewHandler = (params: RunViewParams) => Promise<RunViewResult<VersionRow>>;

class StubRunView extends RunView {
  constructor(private readonly handler: RunViewHandler) {
    super(null);
  }

  public override async RunView<T = VersionRow>(params: RunViewParams): Promise<RunViewResult<T>> {
    const res = await this.handler(params);
    return {
      Success: res.Success,
      Results: res.Results as T[],
      UserViewID: res.UserViewID,
      ErrorMessage: res.ErrorMessage,
      ExecutionTime: res.ExecutionTime,
      RowCount: res.RowCount,
      TotalRowCount: res.TotalRowCount,
    };
  }
}

class StubChangeDetectorRef extends ChangeDetectorRef {
  public readonly detectChangesSpy = vi.fn();
  public readonly markForCheckSpy = vi.fn();
  public override markForCheck(): void {
    this.markForCheckSpy();
  }
  public override detach(): void {}
  public override detectChanges(): void {
    this.detectChangesSpy();
  }
  public override checkNoChanges(): void {}
  public override reattach(): void {}
}

class StubDataSource implements ISecureMessagingDataSource {
  public readonly getDownloadUrlSpy = vi.fn(async (_threadId: string, _attachmentId: string) => 'https://example.com/dl');

  public async validateToken(_token: string): Promise<AuthResponse> {
    return { sessionId: 's1', contactEmail: 'c@example.com', token: 't1' };
  }
  public async redeemMagicLink(_token: string): Promise<AuthResponse> {
    return { sessionId: 's1', contactEmail: 'c@example.com', token: 't1' };
  }
  public async listThreads(): Promise<ThreadsResponse> {
    return { threads: [] };
  }
  public async getMessages(_threadId: string): Promise<MessagesResponse> {
    return { messages: [] };
  }
  public async sendMessage(_threadId: string, _content: string): Promise<CreateMessageResponse> {
    return { messageId: 'm1', status: 'Sent' };
  }
  public async getAttachments(_threadId: string): Promise<AttachmentsResponse> {
    return { attachments: [] };
  }
  public async uploadFile(_threadId: string, _file: File): Promise<UploadResponse> {
    return { attachmentId: 'a1', artifactId: '', filename: 'f', contentType: '', size: 0, status: 'ok' };
  }
  public async getDownloadUrl(threadId: string, attachmentId: string): Promise<string> {
    return this.getDownloadUrlSpy(threadId, attachmentId);
  }
  public async getFileRequests(_threadId: string): Promise<FileRequestsResponse> {
    return { fileRequests: [] };
  }
  public async fulfillFileRequest(_threadId: string, _requestId: string, _file: File): Promise<UploadResponse & { fileRequestId: string }> {
    return { attachmentId: 'a1', artifactId: '', filename: 'f', contentType: '', size: 0, status: 'ok', fileRequestId: 'fr1' };
  }
  public async getSignatureRequests(_threadId: string): Promise<SignatureRequestsResponse> {
    return { signatureRequests: [] };
  }
}

function createMockResult(rows: VersionRow[], success = true): RunViewResult<VersionRow> {
  return {
    Success: success,
    Results: rows,
    UserViewID: '',
    ErrorMessage: '',
    ExecutionTime: 1,
    RowCount: rows.length,
    TotalRowCount: rows.length,
  };
}

function createMockProvider(): IMetadataProvider {
  const user = new UserInfo(null, {
    ID: '11111111-1111-1111-1111-111111111111',
    Name: 'Case Reviewer',
    Email: 'reviewer@example.com',
  });
  return {
    CurrentUser: user,
    Entities: [],
  } as IMetadataProvider;
}

function createPreviewFixture() {
  TestBed.resetTestingModule();
  TestBed.overrideComponent(SecureMessagingArtifactPreviewComponent, {
    set: {
      imports: [CommonModule, ArtifactViewerPanelStub],
    },
  });
  return TestBed.createComponent(SecureMessagingArtifactPreviewComponent);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SecureMessagingArtifactPreviewComponent', () => {
  it('stays closed and executes zero RunView queries until ArtifactId is populated', () => {
    const fromProviderSpy = vi.spyOn(RunView, 'FromMetadataProvider');

    const fixture = createPreviewFixture();
    fixture.componentRef.setInput('Provider', createMockProvider());
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(hostEl.querySelector('.sm-ap-backdrop')).toBeNull();
    expect(hostEl.querySelector('mj-artifact-viewer-panel')).toBeNull();
    expect(fromProviderSpy).not.toHaveBeenCalled();
  });

  it('opens in-place drawer, verifies availability with RunView simple projection, and mounts <mj-artifact-viewer-panel>', async () => {
    const runViewCalls: RunViewParams[] = [];
    const provider = createMockProvider();
    const stubRv = new StubRunView(async (params) => {
      runViewCalls.push(params);
      return createMockResult([{ ID: 'ver-101', ArtifactID: 'ART-101', VersionNumber: 2 }]);
    });

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(stubRv);

    const fixture = createPreviewFixture();
    fixture.componentRef.setInput('Provider', provider);
    fixture.componentRef.setInput('Filename', 'Q4-Audit-Report.md');
    fixture.componentRef.setInput('ContentType', 'text/markdown');
    fixture.componentRef.setInput('FileSize', 4096);
    fixture.componentRef.setInput('CanDownload', true);
    fixture.componentRef.setInput('ArtifactId', 'ART-101');
    fixture.detectChanges();

    await flushMicrotasks();
    fixture.detectChanges();

    expect(runViewCalls.length).toBe(1);
    expect(runViewCalls[0].EntityName).toBe('MJ: Artifact Versions');
    expect(runViewCalls[0].ResultType).toBe('simple');
    expect(runViewCalls[0].Fields).toEqual(['ID', 'ArtifactID', 'VersionNumber']);

    const hostEl = fixture.nativeElement as HTMLElement;
    const dialog = hostEl.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(hostEl.querySelector('.sm-ap-title')?.textContent?.trim()).toBe('Q4-Audit-Report.md');

    const viewerDebugEl = fixture.debugElement.query((el) => el.name === 'mj-artifact-viewer-panel');
    expect(viewerDebugEl).not.toBeNull();
    const viewerStub = viewerDebugEl.componentInstance as ArtifactViewerPanelStub;
    expect(viewerStub.artifactId).toBe('ART-101');
    expect(viewerStub.Provider).toBe(provider);
    expect(viewerStub.CanEdit).toBe(false);
  });

  it('dismisses on Escape key, emits Closed, and restores focus to the triggering attachment element', () => {
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Engagement Letter';
    document.body.appendChild(triggerButton);
    triggerButton.focus();
    const focusSpy = vi.spyOn(triggerButton, 'focus');

    const fixture = createPreviewFixture();
    const closedSpy = vi.fn();
    fixture.componentInstance.Closed.subscribe(closedSpy);

    fixture.componentRef.setInput('SkipAvailabilityCheck', true);
    fixture.componentRef.setInput('TriggerElement', triggerButton);
    fixture.componentRef.setInput('Filename', 'Engagement-Letter.md');
    fixture.componentRef.setInput('ArtifactId', 'ART-ESC-1');
    fixture.detectChanges();

    expect(fixture.componentInstance.IsOpen).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('mj-artifact-viewer-panel')).not.toBeNull();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    document.dispatchEvent(escEvent);
    fixture.detectChanges();

    expect(escEvent.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(closedSpy).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sm-ap-backdrop')).toBeNull();
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('dismisses on backdrop click and close button click, and toggles maximized width', () => {
    const fixture = createPreviewFixture();
    const closedSpy = vi.fn();
    fixture.componentInstance.Closed.subscribe(closedSpy);

    fixture.componentRef.setInput('SkipAvailabilityCheck', true);
    fixture.componentRef.setInput('Filename', 'Proposal.md');
    fixture.componentRef.setInput('ArtifactId', 'ART-CLICK-1');
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    const drawer = hostEl.querySelector('.sm-ap-drawer') as HTMLElement;
    expect(drawer.classList.contains('sm-ap-drawer--maximized')).toBe(false);

    fixture.componentInstance.toggleMaximize();
    fixture.detectChanges();
    expect(drawer.classList.contains('sm-ap-drawer--maximized')).toBe(true);

    // Clicking inside the drawer does NOT dismiss
    drawer.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.IsOpen).toBe(true);

    // Clicking backdrop dismisses
    (hostEl.querySelector('.sm-ap-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(closedSpy).toHaveBeenCalledTimes(1);

    // Re-open and dismiss via Close button
    fixture.componentRef.setInput('ArtifactId', 'ART-CLICK-2');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsOpen).toBe(true);

    const closeBtn = hostEl.querySelector('.sm-ap-close-btn') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.IsOpen).toBe(false);
    expect(closedSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores stale in-flight availability checks when switching attachments rapidly or dismissing mid-fetch', async () => {
    let resolveFirst!: (val: RunViewResult<VersionRow>) => void;
    let resolveSecond!: (val: RunViewResult<VersionRow>) => void;

    const firstPromise = new Promise<RunViewResult<VersionRow>>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<RunViewResult<VersionRow>>((res) => {
      resolveSecond = res;
    });

    let callIndex = 0;
    const provider = createMockProvider();
    const stubRv = new StubRunView(() => {
      callIndex++;
      return callIndex === 1 ? firstPromise : secondPromise;
    });
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(stubRv);

    const fixture = createPreviewFixture();
    fixture.componentRef.setInput('Provider', provider);
    fixture.componentRef.setInput('ArtifactId', 'ART-SLOW-1');
    fixture.detectChanges();
    expect(fixture.componentInstance.previewState).toBe('loading');

    // Rapidly switch to a second attachment before the first finishes
    fixture.componentRef.setInput('ArtifactId', 'ART-FAST-2');
    fixture.detectChanges();

    // Second resolves first -> ready
    resolveSecond(createMockResult([{ ID: 'ver-2', ArtifactID: 'ART-FAST-2', VersionNumber: 1 }]));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(fixture.componentInstance.previewState).toBe('ready');
    expect(fixture.componentInstance.activeArtifactId).toBe('ART-FAST-2');

    // First (stale) now resolves with empty results — MUST NOT overwrite the active ready state
    resolveFirst(createMockResult([]));
    await flushMicrotasks();
    fixture.detectChanges();
    expect(fixture.componentInstance.previewState).toBe('ready');
    expect(fixture.componentInstance.activeArtifactId).toBe('ART-FAST-2');
  });

  it('renders a clean theme-native unavailable state with download fallback when no accessible version exists', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const provider = createMockProvider();
    const stubRv = new StubRunView(async () => createMockResult([]));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(stubRv);

    const fixture = createPreviewFixture();
    const downloadSpy = vi.fn();
    fixture.componentInstance.DownloadRequested.subscribe(downloadSpy);

    fixture.componentRef.setInput('Provider', provider);
    fixture.componentRef.setInput('Filename', 'Restricted-Doc.md');
    fixture.componentRef.setInput('CanDownload', true);
    fixture.componentRef.setInput('ArtifactId', 'ART-MISSING-1');
    fixture.detectChanges();

    await flushMicrotasks();
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.previewState).toBe('unavailable');
    expect(hostEl.querySelector('mj-artifact-viewer-panel')).toBeNull();
    expect(hostEl.querySelector('.sm-ap-state--unavailable')).not.toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const dlBtn = hostEl.querySelector('.sm-ap-btn--primary') as HTMLButtonElement;
    dlBtn.click();
    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Secure message thread attachment routing', () => {
  it('routes populated MessageFile.ArtifactID to in-place preview and null/empty ArtifactID to download fallback in SecureMessagingExecutiveComponent', () => {
    const cdrStub = new StubChangeDetectorRef();
    const component = new SecureMessagingExecutiveComponent(cdrStub, null);
    const downloadSpy = vi.spyOn(component, 'downloadAttachment').mockResolvedValue();

    const mjDocAttachment: MessageAttachment = {
      id: 'mf-1',
      artifactId: 'ART-DOC-99',
      fileId: 'file-1',
      filename: 'Tax-Brief.md',
      contentType: 'text/markdown',
      size: 2048,
    };

    const binaryAttachment: MessageAttachment = {
      id: 'mf-2',
      artifactId: null,
      fileId: 'file-2',
      filename: 'Scanned-ID.pdf',
      contentType: 'application/pdf',
      size: 512000,
    };

    const emptyArtifactAttachment: MessageAttachment = {
      id: 'mf-3',
      artifactId: '   ',
      fileId: 'file-3',
      filename: 'Receipt.png',
      contentType: 'image/png',
      size: 120000,
    };

    // Populated ArtifactID -> opens in-place preview host, does NOT download
    component.openAttachment(mjDocAttachment);
    expect(component.previewAttachment?.artifactId).toBe('ART-DOC-99');
    expect(component.previewAttachment?.filename).toBe('Tax-Brief.md');
    expect(downloadSpy).not.toHaveBeenCalled();

    // Closing preview clears preview state cleanly
    component.closeAttachmentPreview();
    expect(component.previewAttachment).toBeNull();

    // Null ArtifactID -> falls back to downloadAttachment
    component.openAttachment(binaryAttachment);
    expect(component.previewAttachment).toBeNull();
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledWith(binaryAttachment);

    // Whitespace-only ArtifactID -> falls back to downloadAttachment
    component.openAttachment(emptyArtifactAttachment);
    expect(component.previewAttachment).toBeNull();
    expect(downloadSpy).toHaveBeenCalledTimes(2);
    expect(downloadSpy).toHaveBeenLastCalledWith(emptyArtifactAttachment);
  });

  it('routes populated artifactId to artifactPreviewRequested when observed and falls back to download in ConversationComponent', () => {
    const apiStub = new StubDataSource();
    const cdrStub = new StubChangeDetectorRef();

    const component = new ConversationComponent(apiStub, cdrStub);
    component.threadId = 'thread-1';
    const downloadSpy = vi.spyOn(component, 'download').mockResolvedValue();
    const previewSpy = vi.fn();
    component.artifactPreviewRequested.subscribe(previewSpy);

    const artifactAtt: ThreadAttachment = {
      id: 'att-1',
      artifactId: 'ART-PORTAL-1',
      fileId: 'file-1',
      filename: 'Engagement-Memo.md',
      contentType: 'text/markdown',
      size: 1024,
    };
    const binaryAtt: ThreadAttachment = {
      id: 'att-2',
      artifactId: null,
      fileId: 'file-2',
      filename: 'Photo.jpg',
      contentType: 'image/jpeg',
      size: 4096,
    };

    component.onAttachmentClick(artifactAtt);
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(previewSpy).toHaveBeenCalledWith(artifactAtt);
    expect(downloadSpy).not.toHaveBeenCalled();

    component.onAttachmentClick(binaryAtt);
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledWith(binaryAtt);
  });
});
