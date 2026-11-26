// @vitest-environment jsdom
import '@angular/compiler';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseApplication } from '@memberjunction/ng-base-application';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { describe, expect, it, vi } from 'vitest';

// Avoid loading heavy browser-only plugin bundles (AgGrid/CodeMirror/Mermaid) inside jsdom
// while keeping all real @RegisterClass(BaseFormComponent | BaseResourceComponent | BaseApplication) decorators live.
vi.mock('@memberjunction/ng-artifacts', () => ({
  ArtifactsModule: class MockArtifactsModule {},
}));

import { LoadSecureMessagingClient } from '../index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ANGULAR_SRC_LIB = resolve(__dirname, '../lib');
const REPO_ROOT = resolve(__dirname, '../../../..');

const ALLOWED_EXTENSIONS = new Set(['.ts', '.css', '.scss', '.html']);

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'generated' || entry === '__tests__' || entry === 'node_modules') {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkSourceFiles(fullPath));
    } else if (ALLOWED_EXTENSIONS.has(extname(entry)) && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extracts style blocks (`styles: [...]`) and template blocks (`template: ...`) from inline Angular
 * component `.ts` files, or returns the full contents for standalone `.css`/`.scss`/`.html` files.
 */
function extractStyleAndTemplateContent(filePath: string, content: string): string {
  const ext = extname(filePath);
  if (ext === '.css' || ext === '.scss' || ext === '.html') {
    return content;
  }
  const chunks: string[] = [];
  const stylesBlockRe = /styles\s*:\s*\[\s*`([\s\S]*?)`\s*\]/g;
  let match: RegExpExecArray | null;
  while ((match = stylesBlockRe.exec(content)) !== null) {
    chunks.push(match[1]);
  }
  const templateBlockRe = /template\s*:\s*`([\s\S]*?)`/g;
  while ((match = templateBlockRe.exec(content)) !== null) {
    chunks.push(match[1]);
  }
  return chunks.join('\n');
}

/** Strips CSS and JS comments so documentation notes do not trigger false positives. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Angular Design Tokens & Hygiene Static Lint', () => {
  const files = walkSourceFiles(ANGULAR_SRC_LIB);

  it('scans Angular component source files under packages/Angular/src/lib', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('forbids raw #hex, rgb(), rgba(), hsl(), and hsla() color literals across Angular CSS/SCSS/HTML/inline styles', () => {
    const rawColorRegex = /(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/g;
    const violations: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const inspectable = stripComments(extractStyleAndTemplateContent(file, raw));
      const matches = inspectable.match(rawColorRegex);
      if (matches && matches.length > 0) {
        violations.push(`${relative(REPO_ROOT, file)}: ${matches.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('forbids localStorage and window.print() runtime usage in Angular components', () => {
    const violations: string[] = [];

    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/\blocalStorage\b/.test(code)) {
        violations.push(`${relative(REPO_ROOT, file)}: uses localStorage (use UserInfoEngine.Instance instead)`);
      }
      if (/\bwindow\.print\s*\(/.test(code)) {
        violations.push(`${relative(REPO_ROOT, file)}: calls window.print() (use server-side PDF action instead)`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('verifies SecureMessagingResource wraps its chrome in <mj-page-layout> and calls NotifyLoadComplete()', () => {
    const resourcePath = resolve(ANGULAR_SRC_LIB, 'secure-messaging-executive.resource.ts');
    const source = readFileSync(resourcePath, 'utf8');
    expect(source).toContain('<mj-page-layout>');
    expect(source).toContain('</mj-page-layout>');
    expect(source).toContain('this.NotifyLoadComplete()');
    expect(source).toContain('ChangeDetectionStrategy.OnPush');
  });
});

interface EntityMetadataRecord {
  fields: {
    Name: string;
  };
}

interface ApplicationMetadataRecord {
  fields: {
    ClassName: string;
    DefaultNavItems: Array<{
      Label: string;
      ResourceType: string;
      DriverClass: string;
    }>;
  };
}

describe('OpenApp v3 Dual Form & Navigation Registration Parity', () => {
  it('registers every metadata/entities/*.json entity as a live BaseFormComponent via LoadSecureMessagingClient()', () => {
    LoadSecureMessagingClient();

    const entitiesJsonPath = resolve(REPO_ROOT, 'metadata/entities/.entities.json');
    const entityRecords = JSON.parse(readFileSync(entitiesJsonPath, 'utf8')) as EntityMetadataRecord[];
    expect(entityRecords.length).toBeGreaterThan(0);

    for (const entry of entityRecords) {
      const entityName = entry.fields.Name;
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
      expect(registration, `Missing BaseFormComponent registration for '${entityName}'`).toBeDefined();
    }
  });

  it('registers SecureMessagingApplication and every DefaultNavItems DriverClass as a live BaseResourceComponent', () => {
    LoadSecureMessagingClient();

    const appJsonPath = resolve(REPO_ROOT, 'metadata/applications/.secure-messaging-application.json');
    const appMeta = JSON.parse(readFileSync(appJsonPath, 'utf8')) as ApplicationMetadataRecord;

    const appRegistration = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseApplication,
      appMeta.fields.ClassName
    );
    expect(appRegistration, `Missing BaseApplication registration for '${appMeta.fields.ClassName}'`).toBeDefined();

    for (const navItem of appMeta.fields.DefaultNavItems) {
      if (navItem.ResourceType === 'Custom' && navItem.DriverClass) {
        const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(
          BaseResourceComponent,
          navItem.DriverClass
        );
        expect(
          resourceReg,
          `Missing BaseResourceComponent registration for nav item '${navItem.Label}' (${navItem.DriverClass})`
        ).toBeDefined();
      }
    }
  });
});
