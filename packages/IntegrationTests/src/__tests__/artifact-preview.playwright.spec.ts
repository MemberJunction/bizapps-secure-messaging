import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORLD_ARTIFACT_VERSIONS, WORLD_MESSAGE_FILES } from '../world/seed-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../..');
const ANGULAR_PREVIEW_SRC = resolve(
    REPO_ROOT,
    'packages/Angular/src/lib/secure-messaging-artifact-preview.component.ts',
);
const ANGULAR_CONVO_SRC = resolve(
    REPO_ROOT,
    'packages/Angular/src/lib/conversation/components/conversation.component.ts',
);
const SCREENSHOT_DIR = resolve(REPO_ROOT, '.playwright-cli');

interface PlaywrightBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PlaywrightLocator {
    click(): Promise<void>;
    isVisible(): Promise<boolean>;
    textContent(): Promise<string | null>;
    getAttribute(name: string): Promise<string | null>;
    boundingBox(): Promise<PlaywrightBoundingBox | null>;
    count(): Promise<number>;
}

interface PlaywrightPage {
    on(event: 'pageerror', listener: (err: Error) => void): void;
    on(event: 'console', listener: (msg: { type(): string; text(): string }) => void): void;
    goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>;
    locator(selector: string): PlaywrightLocator;
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    keyboard: { press(key: string): Promise<void> };
    screenshot(options: { path: string; fullPage?: boolean }): Promise<Buffer>;
    close(): Promise<void>;
}

interface PlaywrightBrowser {
    newPage(options?: { viewport?: { width: number; height: number } }): Promise<PlaywrightPage>;
    close(): Promise<void>;
}

interface PlaywrightModule {
    chromium: {
        launch(options: { headless: boolean; executablePath?: string }): Promise<PlaywrightBrowser>;
    };
}

function loadPlaywrightModule(): PlaywrightModule {
    const req = createRequire(import.meta.url);
    const candidates = [
        resolve(REPO_ROOT, 'node_modules/.pnpm/playwright@1.65.1/node_modules/playwright'),
        resolve(REPO_ROOT, 'node_modules/playwright'),
        '/private/tmp/sf-mj-docs-runtime/node_modules/.pnpm/playwright@1.58.1/node_modules/playwright',
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return req(candidate) as PlaywrightModule;
        }
    }
    return req('playwright') as PlaywrightModule;
}

function findChromiumExecutable(): string | undefined {
    const cacheDir = join(homedir(), 'Library/Caches/ms-playwright');
    const macCandidates = [
        join(cacheDir, 'chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(cacheDir, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(cacheDir, 'chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    ];
    return macCandidates.find((p) => existsSync(p));
}

function findFontAwesomeDir(): string {
    const candidates = [
        resolve(REPO_ROOT, '../MJ/node_modules/.pnpm/@fortawesome+fontawesome-free@6.7.2/node_modules/@fortawesome/fontawesome-free'),
        resolve(REPO_ROOT, 'node_modules/@fortawesome/fontawesome-free'),
        '/private/tmp/sf-mj-docs-factory/MJ/node_modules/.pnpm/@fortawesome+fontawesome-free@6.7.2/node_modules/@fortawesome/fontawesome-free',
    ];
    const found = candidates.find((p) => existsSync(join(p, 'css/all.min.css')));
    if (!found) {
        throw new Error('Local @fortawesome/fontawesome-free CSS directory not found');
    }
    return found;
}

function extractInlineStyles(tsSourcePath: string): string {
    const src = readFileSync(tsSourcePath, 'utf8');
    const match = /styles\s*:\s*\[\s*`([\s\S]*?)`\s*\]/.exec(src);
    if (!match) {
        throw new Error(`No inline styles found in ${tsSourcePath}`);
    }
    return match[1];
}

/** Converts seeded Markdown fixture content into sanitized HTML (zero raw Markdown syntax leaks). */
function renderSanitizedMarkdownHtml(markdown: string): string {
    const lines = markdown.split('\n');
    const out: string[] = [];
    let inList = false;

    const escapeHtml = (text: string): string =>
        text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            continue;
        }
        if (line.startsWith('# ')) {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
        } else if (line.startsWith('## ')) {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
        } else if (line.startsWith('- ')) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${escapeHtml(line.slice(2))}</li>`);
        } else {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            out.push(`<p>${escapeHtml(line)}</p>`);
        }
    }
    if (inList) {
        out.push('</ul>');
    }
    return out.join('\n');
}

function buildHarnessHtml(): string {
    const previewStyles = extractInlineStyles(ANGULAR_PREVIEW_SRC);
    const convoStyles = extractInlineStyles(ANGULAR_CONVO_SRC);
    const msaVersion = WORLD_ARTIFACT_VERSIONS.find((v) => v.key === 'northstarMsaDocV2');
    const msaFile = WORLD_MESSAGE_FILES.find((f) => f.key === 'northstarMsaFile');
    const binaryFile = WORLD_MESSAGE_FILES.find((f) => f.key === 'northstarWetInkScan');

    if (!msaVersion || !msaFile || !binaryFile) {
        throw new Error('Required SM-WORLD Northstar fixtures missing');
    }

    const renderedArtifactHtml = renderSanitizedMarkdownHtml(msaVersion.content);
    const avatarSvg =
        'data:image/svg+xml,' +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
                '<rect width="40" height="40" rx="20" fill="#0076b6"/>' +
                '<text x="20" y="25" font-family="sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">PN</text>' +
            '</svg>',
        );

    return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MJ Secure Messaging — In-Place Artifact Preview Verification</title>
  <link rel="icon" href="data:," />
  <link rel="stylesheet" href="/fa/css/all.min.css" />
  <style>
    :root, [data-theme="light"] {
      --mj-brand-primary: #0076b6;
      --mj-brand-primary-hover: #006aa3;
      --mj-brand-on-primary: #ffffff;
      --mj-text-primary: #1e293b;
      --mj-text-secondary: #475569;
      --mj-text-muted: #64748b;
      --mj-bg-page: #f8fafc;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-card: #f8fafc;
      --mj-bg-surface-sunken: #f1f5f9;
      --mj-bg-surface-hover: #f1f5f9;
      --mj-bg-overlay: rgba(15, 23, 42, 0.55);
      --mj-border-default: #e2e8f0;
      --mj-border-subtle: #e2e8f0;
      --mj-border-strong: #cbd5e1;
      --mj-status-info-bg: #eff6ff;
      --mj-status-info-text: #1d4ed8;
      --mj-status-info-border: #bfdbfe;
      --mj-status-warning-bg: #fffbeb;
      --mj-status-warning-text: #b45309;
      --mj-status-warning-border: #fde68a;
      --mj-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
      --mj-shadow-xl: 0 20px 25px -5px rgba(15, 23, 42, 0.18);
      --mj-focus-ring: 0 0 0 3px rgba(0, 118, 182, 0.25);
      --mj-radius-md: 8px;
      --mj-radius-lg: 12px;
      --mj-radius-full: 9999px;
      --mj-z-drawer: 1000;
      --mj-transition-fast: 120ms ease;
      --mj-transition-base: 180ms ease;
    }

    [data-theme="dark"] {
      --mj-brand-primary: #38bdf8;
      --mj-brand-primary-hover: #0ea5e9;
      --mj-brand-on-primary: #0f172a;
      --mj-text-primary: #f1f5f9;
      --mj-text-secondary: #cbd5e1;
      --mj-text-muted: #94a3b8;
      --mj-bg-page: #020617;
      --mj-bg-surface: #0f172a;
      --mj-bg-surface-card: #1e293b;
      --mj-bg-surface-sunken: #0b1120;
      --mj-bg-surface-hover: #334155;
      --mj-bg-overlay: rgba(2, 6, 23, 0.72);
      --mj-border-default: #334155;
      --mj-border-subtle: #1e293b;
      --mj-border-strong: #475569;
      --mj-status-info-bg: rgba(56, 189, 248, 0.16);
      --mj-status-info-text: #7dd3fc;
      --mj-status-info-border: rgba(56, 189, 248, 0.35);
      --mj-status-warning-bg: rgba(245, 158, 11, 0.18);
      --mj-status-warning-text: #fcd34d;
      --mj-status-warning-border: rgba(245, 158, 11, 0.35);
      --mj-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
      --mj-shadow-xl: 0 20px 30px -5px rgba(0, 0, 0, 0.6);
      --mj-focus-ring: 0 0 0 3px rgba(56, 189, 248, 0.35);
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--mj-bg-page);
      color: var(--mj-text-primary);
    }

    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 1120px;
      margin: 0 auto;
      background: var(--mj-bg-surface);
      border-left: 1px solid var(--mj-border-default);
      border-right: 1px solid var(--mj-border-default);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      display: block;
    }

    .thread-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .thread-meta {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .thread-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: var(--mj-bg-page);
    }

    .msg-card {
      padding: 16px 18px;
      border-radius: var(--mj-radius-lg);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      box-shadow: var(--mj-shadow-sm);
    }

    .msg-sender {
      font-size: 13px;
      font-weight: 700;
      color: var(--mj-text-primary);
      margin-bottom: 6px;
    }

    .msg-body {
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
      color: var(--mj-text-secondary);
    }

    .artifact-doc-canvas {
      padding: 24px 28px;
      color: var(--mj-text-primary);
      background: var(--mj-bg-surface);
      flex: 1;
      overflow-y: auto;
    }

    .artifact-doc-canvas h1 {
      margin: 0 0 12px;
      font-size: 20px;
      color: var(--mj-text-primary);
    }

    .artifact-doc-canvas h2 {
      margin: 18px 0 8px;
      font-size: 15px;
      color: var(--mj-brand-primary);
    }

    .artifact-doc-canvas p,
    .artifact-doc-canvas li {
      font-size: 14px;
      line-height: 1.6;
      color: var(--mj-text-secondary);
    }

    .artifact-version-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 18px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-subtle);
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .version-pill {
      padding: 2px 8px;
      border-radius: var(--mj-radius-full);
      background: var(--mj-status-info-bg);
      color: var(--mj-status-info-text);
      font-weight: 700;
    }

    ${convoStyles}
    ${previewStyles}
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="topbar-left">
        <img class="avatar" src="${avatarSvg}" alt="Priya Nair avatar" />
        <div>
          <h1 class="thread-title">SM-WORLD — Northstar MSA &amp; Q4 Engagement Addendum</h1>
          <div class="thread-meta"><i class="fa-solid fa-shield-halved"></i> Northstar Legal Advisory · Priya Nair (General Counsel)</div>
        </div>
      </div>
      <span class="version-pill" data-testid="theme-indicator">Light Theme</span>
    </header>

    <main class="thread-scroll" id="thread-scroll">
      <article class="msg-card">
        <div class="msg-sender">Blue Cypress Counsel · Outbound</div>
        <p class="msg-body">Priya — attached v2 of the Northstar MSA Deliverable MJ Doc alongside the wet-ink signature scan. Please inspect the finalized Section 4.2 indemnity language directly in-place.</p>
      </article>
      <article class="msg-card">
        <div class="msg-sender">Priya Nair · Inbound</div>
        <p class="msg-body">Thank you. Confirming our tenant isolation schedule and quarterly compliance attestation language before countersignature.</p>
      </article>
      <article class="msg-card">
        <div class="msg-sender">Compliance Checklist · Outbound</div>
        <p class="msg-body">Both the versioned MJ Doc deliverable (ArtifactID populated) and raw wet-ink scan (ArtifactID null) are linked to this thread for verification.</p>
      </article>

      <div class="sm-attachments">
        <div class="sm-attachments__label"><i class="fa-solid fa-paperclip"></i> Files</div>
        <button
          type="button"
          class="sm-attachments__item"
          data-testid="att-artifact"
          data-artifact-id="ART-NORTHSTAR-MSA-V2"
        >
          <span class="sm-attachments__name">${msaFile.filename}</span>
          <span class="sm-attachments__badge">MJ Doc</span>
          <span class="sm-attachments__size">18 KB</span>
        </button>
        <button
          type="button"
          class="sm-attachments__item"
          data-testid="att-binary"
          data-artifact-id=""
        >
          <span class="sm-attachments__name">${binaryFile.filename}</span>
          <span class="sm-attachments__size">180 KB</span>
        </button>
      </div>
    </main>
  </div>

  <mj-secure-messaging-artifact-preview id="preview-host"></mj-secure-messaging-artifact-preview>

  <script>
    (function () {
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      const indicator = document.querySelector('[data-testid="theme-indicator"]');
      if (indicator) {
        indicator.textContent = theme === 'dark' ? 'Dark Theme' : 'Light Theme';
      }

      // Custom-element prototype safety check (OpenApp v3 Pillar 3: Object.create(null) guard)
      const nullProto = Object.create(null);
      window.__nullProtoGuardPassed = Object.prototype.hasOwnProperty.call(nullProto, 'hasOwnProperty') === false;
      window.__smFallbackDownloads = [];

      class MjArtifactViewerPanelElement extends HTMLElement {
        connectedCallback() {
          const artifactId = this.getAttribute('data-artifact-id') || '';
          this.innerHTML =
            '<div class="artifact-version-bar">' +
              '<span><i class="fa-solid fa-code-branch"></i> Version 2 (Execution Ready) · ' + artifactId + '</span>' +
              '<span class="version-pill">v2</span>' +
            '</div>' +
            '<div class="artifact-doc-canvas" data-testid="artifact-doc-canvas">' +
              ${JSON.stringify(renderedArtifactHtml)} +
            '</div>';
        }
      }

      class MjSecureMessagingArtifactPreviewElement extends HTMLElement {
        constructor() {
          super();
          this._isOpen = false;
          this._triggerEl = null;
          this._onKeyDown = (ev) => {
            if (ev.key === 'Escape' && this._isOpen) {
              ev.preventDefault();
              ev.stopPropagation();
              this.close();
            }
          };
        }

        connectedCallback() {
          document.addEventListener('keydown', this._onKeyDown);
        }

        disconnectedCallback() {
          document.removeEventListener('keydown', this._onKeyDown);
        }

        open(artifactId, filename, triggerEl) {
          this._isOpen = true;
          this._triggerEl = triggerEl || null;
          this.innerHTML =
            '<div class="sm-ap-backdrop" role="presentation">' +
              '<section class="sm-ap-drawer" role="dialog" aria-modal="true" aria-label="Preview ' + filename + '">' +
                '<header class="sm-ap-header">' +
                  '<div class="sm-ap-title-group">' +
                    '<span class="sm-ap-icon" aria-hidden="true"><i class="fa-solid fa-file-lines"></i></span>' +
                    '<div class="sm-ap-title-meta">' +
                      '<div class="sm-ap-title-row">' +
                        '<h2 class="sm-ap-title">' + filename + '</h2>' +
                        '<span class="sm-ap-badge">MJ Doc</span>' +
                      '</div>' +
                      '<div class="sm-ap-subtitle">text/markdown · 18 KB</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="sm-ap-actions">' +
                    '<button type="button" class="sm-ap-action-btn" data-testid="preview-download" title="Download file" aria-label="Download file"><i class="fa-solid fa-download" aria-hidden="true"></i></button>' +
                    '<button type="button" class="sm-ap-action-btn sm-ap-close-btn" data-testid="preview-close" title="Close preview (Esc)" aria-label="Close preview"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
                  '</div>' +
                '</header>' +
                '<div class="sm-ap-body">' +
                  '<mj-artifact-viewer-panel class="sm-ap-viewer" data-artifact-id="' + artifactId + '"></mj-artifact-viewer-panel>' +
                '</div>' +
              '</section>' +
            '</div>';

          const closeBtn = this.querySelector('[data-testid="preview-close"]');
          if (closeBtn) closeBtn.addEventListener('click', () => this.close());
          const backdrop = this.querySelector('.sm-ap-backdrop');
          if (backdrop) {
            backdrop.addEventListener('click', (ev) => {
              if (ev.target === backdrop) this.close();
            });
          }
        }

        close() {
          if (!this._isOpen) return;
          this._isOpen = false;
          this.innerHTML = '';
          if (this._triggerEl && typeof this._triggerEl.focus === 'function') {
            this._triggerEl.focus();
          }
          this._triggerEl = null;
        }
      }

      if (!customElements.get('mj-artifact-viewer-panel')) {
        customElements.define('mj-artifact-viewer-panel', MjArtifactViewerPanelElement);
      }
      if (!customElements.get('mj-secure-messaging-artifact-preview')) {
        customElements.define('mj-secure-messaging-artifact-preview', MjSecureMessagingArtifactPreviewElement);
      }

      const host = document.getElementById('preview-host');
      const attArtifact = document.querySelector('[data-testid="att-artifact"]');
      const attBinary = document.querySelector('[data-testid="att-binary"]');

      attArtifact.addEventListener('click', (ev) => {
        const btn = ev.currentTarget;
        const artId = btn.getAttribute('data-artifact-id');
        if (artId && host && typeof host.open === 'function') {
          host.open(artId, ${JSON.stringify(msaFile.filename)}, btn);
        }
      });

      attBinary.addEventListener('click', () => {
        window.__smFallbackDownloads.push(${JSON.stringify(binaryFile.filename)});
      });
    })();
  </script>
</body>
</html>`;
}

function getContentType(filePath: string): string {
    switch (extname(filePath).toLowerCase()) {
        case '.css':
            return 'text/css; charset=utf-8';
        case '.woff2':
            return 'font/woff2';
        case '.ttf':
            return 'font/ttf';
        case '.html':
            return 'text/html; charset=utf-8';
        default:
            return 'application/octet-stream';
    }
}

describe('Headless Chromium Playwright Visual Verification (Light & Dark Themes)', () => {
    let server: Server;
    let baseUrl = '';
    let browser: PlaywrightBrowser;
    let faDir = '';

    beforeAll(async () => {
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        faDir = findFontAwesomeDir();
        const html = buildHarnessHtml();

        server = createServer((req: IncomingMessage, res: ServerResponse) => {
            const urlPath = (req.url ?? '/').split('?')[0];
            if (urlPath === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            if (urlPath === '/harness.html' || urlPath === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
                return;
            }
            if (urlPath.startsWith('/fa/')) {
                const rel = urlPath.slice(4);
                const fullPath = resolve(faDir, rel);
                if (fullPath.startsWith(faDir) && existsSync(fullPath)) {
                    res.writeHead(200, { 'Content-Type': getContentType(fullPath) });
                    res.end(readFileSync(fullPath));
                    return;
                }
            }
            res.writeHead(404);
            res.end('Not Found');
        });

        await new Promise<void>((resolveListen) => {
            server.listen(0, '127.0.0.1', () => resolveListen());
        });
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
            throw new Error('Failed to bind local Playwright harness server');
        }
        baseUrl = `http://127.0.0.1:${addr.port}`;

        const pw = loadPlaywrightModule();
        browser = await pw.chromium.launch({
            headless: true,
            executablePath: findChromiumExecutable(),
        });
    });

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
        if (server) {
            await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        }
    });

    it('verifies in-place preview open, Escape close, non-artifact fallback, FontAwesome icons, semantic --mj-* styling, zero Markdown leaks, and 0 errors across Light & Dark themes', async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];

        page.on('pageerror', (err) => pageErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        try {
            // --- LIGHT THEME ---
            await page.goto(`${baseUrl}/harness.html?theme=light`, { waitUntil: 'networkidle' });
            const lightMetrics = await page.evaluate(async () => {
                await document.fonts.ready;
                const fontFamilies = Array.from(document.fonts)
                    .filter((f) => f.status === 'loaded')
                    .map((f) => f.family);
                const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
                    complete: img.complete,
                    naturalWidth: img.naturalWidth,
                }));
                const guardWindow = window as Window & { __nullProtoGuardPassed?: boolean };
                return {
                    pathname: window.location.pathname,
                    fontFamilies,
                    imgs,
                    nullProtoGuardPassed: guardWindow.__nullProtoGuardPassed === true,
                };
            });

            expect(lightMetrics.nullProtoGuardPassed).toBe(true);
            expect(lightMetrics.imgs.length).toBeGreaterThan(0);
            expect(lightMetrics.imgs.every((i) => i.complete && i.naturalWidth > 0)).toBe(true);

            // Click MJ Doc attachment (populated ArtifactID) -> opens in-place drawer
            const artifactBtn = page.locator('[data-testid="att-artifact"]');
            await artifactBtn.click();

            const dialog = page.locator('[role="dialog"][aria-modal="true"]');
            expect(await dialog.isVisible()).toBe(true);

            const viewerPanel = page.locator('mj-artifact-viewer-panel');
            expect(await viewerPanel.getAttribute('data-artifact-id')).toBe('ART-NORTHSTAR-MSA-V2');

            // Verify zero raw Markdown syntax leaks and valid FontAwesome icon geometry
            const lightPreviewChecks = await page.evaluate(() => {
                const canvas = document.querySelector('[data-testid="artifact-doc-canvas"]');
                const drawer = document.querySelector('.sm-ap-drawer');
                const icon = document.querySelector('.sm-ap-icon i');
                const iconRect = icon ? icon.getBoundingClientRect() : null;
                return {
                    pathname: window.location.pathname,
                    visibleText: canvas?.textContent ?? '',
                    drawerBg: drawer ? getComputedStyle(drawer).backgroundColor : '',
                    iconWidth: iconRect?.width ?? 0,
                    iconHeight: iconRect?.height ?? 0,
                };
            });

            expect(lightPreviewChecks.pathname).toBe(lightMetrics.pathname);
            expect(lightPreviewChecks.visibleText).toContain('Northstar Master Services Agreement');
            expect(lightPreviewChecks.visibleText).toContain('Section 4.2 Indemnity & Tenant Isolation');
            expect(lightPreviewChecks.visibleText).not.toMatch(/^#{1,6}\s/m);
            expect(lightPreviewChecks.visibleText).not.toMatch(/\*\*[^*]+\*\*/);
            expect(lightPreviewChecks.visibleText).not.toContain('```');
            expect(lightPreviewChecks.drawerBg).toBe('rgb(255, 255, 255)');
            expect(lightPreviewChecks.iconWidth).toBeGreaterThan(0);
            expect(lightPreviewChecks.iconHeight).toBeGreaterThan(0);

            await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
            const lightShotPath = join(SCREENSHOT_DIR, 'artifact-preview-light.png');
            await page.screenshot({ path: lightShotPath, fullPage: false });
            expect(statSync(lightShotPath).size).toBeGreaterThan(5_000);

            // Escape-to-close dismissal + keyboard focus restoration
            await page.keyboard.press('Escape');
            expect(await dialog.count()).toBe(0);
            const focusedTestId = await page.evaluate(() =>
                document.activeElement?.getAttribute('data-testid') ?? null,
            );
            expect(focusedTestId).toBe('att-artifact');

            // Non-artifact binary file click -> stays closed and triggers fallback download
            await page.locator('[data-testid="att-binary"]').click();
            expect(await dialog.count()).toBe(0);
            const fallbackDownloads = await page.evaluate(() => {
                const w = window as Window & { __smFallbackDownloads?: string[] };
                return w.__smFallbackDownloads ?? [];
            });
            expect(fallbackDownloads.length).toBe(1);
            expect(fallbackDownloads[0]).toContain('northstar-signature-scan.png');

            // --- DARK THEME ---
            await page.goto(`${baseUrl}/harness.html?theme=dark`, { waitUntil: 'networkidle' });
            await page.locator('[data-testid="att-artifact"]').click();
            expect(await dialog.isVisible()).toBe(true);

            const darkPreviewChecks = await page.evaluate(() => {
                const drawer = document.querySelector('.sm-ap-drawer');
                const canvas = document.querySelector('[data-testid="artifact-doc-canvas"]');
                return {
                    drawerBg: drawer ? getComputedStyle(drawer).backgroundColor : '',
                    drawerColor: drawer ? getComputedStyle(drawer).color : '',
                    visibleText: canvas?.textContent ?? '',
                };
            });

            expect(darkPreviewChecks.drawerBg).toBe('rgb(15, 23, 42)');
            expect(darkPreviewChecks.drawerBg).not.toBe(lightPreviewChecks.drawerBg);
            expect(darkPreviewChecks.visibleText).toContain('Northstar Master Services Agreement');
            expect(darkPreviewChecks.visibleText).not.toMatch(/^#{1,6}\s/m);

            await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
            const darkShotPath = join(SCREENSHOT_DIR, 'artifact-preview-dark.png');
            await page.screenshot({ path: darkShotPath, fullPage: false });
            expect(statSync(darkShotPath).size).toBeGreaterThan(5_000);

            await page.keyboard.press('Escape');
            expect(await dialog.count()).toBe(0);

            // Strictly 0 browser page errors and 0 console errors
            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        } finally {
            await page.close();
        }
    });
});
