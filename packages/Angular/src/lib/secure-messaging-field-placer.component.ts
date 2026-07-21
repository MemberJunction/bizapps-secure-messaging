import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
// pdf.js types (minimal shims — matches MJ's pdf-artifact-viewer pattern; avoids a hard TS dependency
// on pdfjs-dist's types and keeps the surface small).
interface PdfViewport { width: number; height: number; }
interface PdfPageProxy {
  getViewport(params: { scale: number }): PdfViewport;
  render(ctx: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> };
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
}
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: { data: Uint8Array }): { promise: Promise<PdfDocumentProxy> };
}

/** Rendered size of a placed-field marker (px). Must match the `.fp-field` CSS min-width/height so
 *  click-to-place can center the box on the click. */
const FIELD_BOX_WIDTH_PX = 90;
const FIELD_BOX_HEIGHT_PX = 26;

/** The portable field types the placer can drop — mirrors @memberjunction/esignature SignatureFieldType. */
export type PlacerFieldType = 'signature' | 'initials' | 'dateSigned' | 'text' | 'checkbox';

/** A field the user has placed on a page, in the shape the send call needs. Coordinates are stored
 *  as normalized percentages of the page (0–100, top-left origin) so they're page-size independent;
 *  we also carry the page's true dimensions in points so the provider converts exactly. */
export interface PlacedField {
  type: PlacerFieldType;
  /** 1-based page number. */
  page: number;
  /** X of the field's top-left as a % (0–100) of page width. */
  xPercent: number;
  /** Y of the field's top-left as a % (0–100) of page height, from the top. */
  yPercent: number;
  /** True page size in PDF points (1/72"), captured from the rendered page. */
  pageWidthPt: number;
  pageHeightPt: number;
  required: boolean;
  /** Local-only id for tracking/removal in the UI. */
  id: number;
}

/** One rendered PDF page + the metadata we need to map drops to coordinates. */
interface RenderedPage {
  pageNumber: number;
  /** True page dimensions in points (viewport at scale 1). */
  widthPt: number;
  heightPt: number;
  /** Displayed CSS size of the rendered canvas (for % math against the on-screen box). */
  displayWidth: number;
  displayHeight: number;
}

/** A palette chip the user drags/clicks to add a field of a given type. */
interface FieldChip {
  type: PlacerFieldType;
  label: string;
  icon: string;
}

/**
 * Full-screen modal that renders an uploaded PDF and lets staff place signature/date/initials/text/
 * checkbox fields by dragging chips onto the pages (or click-to-place). Emits the placed fields as
 * normalized-coordinate {@link PlacedField}s plus each page's true point dimensions — exactly what
 * `@memberjunction/esignature`'s coordinate placement consumes. Single signer (the thread contact).
 *
 * Why coordinates (not anchor text): staff upload ARBITRARY PDFs with no predictable marker string,
 * so visual placement is the only reliable UX. The modal is where the document gets full focus.
 */
@Component({
  standalone: false,
  selector: 'mj-secure-messaging-field-placer',
  template: `
<div class="fp-backdrop" (click)="onBackdrop($event)">
  <div class="fp-modal" (click)="$event.stopPropagation()">
    <div class="fp-header">
      <div class="fp-title">
        <i class="fa-solid fa-signature"></i>
        <span>Place signing fields</span>
        <span class="fp-doc-name">{{ filename }}</span>
      </div>
      <button class="fp-close" title="Cancel" (click)="cancel.emit()"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <div class="fp-body">
      <!-- Chip palette -->
      <div class="fp-palette">
        <div class="fp-palette-label">Drag onto the document</div>
        @for (chip of chips; track chip.type) {
          <div class="fp-chip" draggable="true"
               (dragstart)="onChipDragStart(chip, $event)"
               [title]="'Drag to place a ' + chip.label + ' field'">
            <i [class]="chip.icon"></i> {{ chip.label }}
          </div>
        }
        <div class="fp-palette-hint">
          Drag a field onto the page where the contact should sign. You can place multiple fields.
        </div>
        <div class="fp-placed-summary">
          <strong>{{ placed.length }}</strong> field{{ placed.length === 1 ? '' : 's' }} placed
          @if (placed.length > 0) {
            <button class="fp-clear" type="button" (click)="clearAll()">Clear all</button>
          }
        </div>
      </div>

      <!-- Rendered pages -->
      <div class="fp-pages" #pagesContainer>
        @if (loading) {
          <div class="fp-loading"><i class="fa-solid fa-spinner fa-spin"></i> Rendering document…</div>
        }
        @if (renderError) {
          <div class="fp-error">{{ renderError }}</div>
        }
        @for (pg of pages; track pg.pageNumber) {
          <div class="fp-page-wrap">
            <div class="fp-page-num">Page {{ pg.pageNumber }}</div>
            <div class="fp-page"
                 [attr.data-page]="pg.pageNumber"
                 (dragover)="onPageDragOver($event)"
                 (drop)="onPageDrop(pg, $event)"
                 (click)="onPageClick(pg, $event)">
              <canvas #pageCanvas [attr.data-page]="pg.pageNumber"></canvas>
              <!-- Placed field markers for this page. Draggable to REPOSITION the same field (not
                   create a new one). -->
              @for (f of fieldsOnPage(pg.pageNumber); track f.id) {
                <div class="fp-field" draggable="true"
                     [style.left.%]="f.xPercent" [style.top.%]="f.yPercent"
                     [title]="'Drag to move · ' + chipLabel(f.type)"
                     (dragstart)="onFieldDragStart(f, $event)"
                     (click)="$event.stopPropagation()">
                  <span class="fp-field-label"><i [class]="chipIcon(f.type)"></i> {{ chipLabel(f.type) }}</span>
                  <button class="fp-field-remove" type="button"
                          (click)="removeField(f, $event)" title="Remove field">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <div class="fp-footer">
      <div class="fp-footer-hint">
        Tip: pick a field type by clicking a chip, then click on the page to drop it.
      </div>
      <div class="fp-footer-actions">
        <button class="fp-btn fp-btn-primary" [disabled]="placed.length === 0" (click)="confirm()">
          Done — {{ placed.length }} field{{ placed.length === 1 ? '' : 's' }}
        </button>
        <button class="fp-btn fp-btn-secondary" (click)="cancel.emit()">Cancel</button>
      </div>
    </div>
  </div>
</div>
`,
  styles: [`
.fp-backdrop {
  position: fixed; inset: 0; z-index: 2000;
  background: var(--mj-bg-overlay, rgba(0,0,0,0.55));
  display: flex; align-items: center; justify-content: center;
}
.fp-modal {
  width: min(1100px, 94vw); height: min(90vh, 900px);
  display: flex; flex-direction: column;
  background: var(--mj-bg-surface); color: var(--mj-text-primary);
  border-radius: var(--mat-sys-corner-medium, 12px);
  box-shadow: 0 12px 48px rgba(0,0,0,0.3); overflow: hidden;
}
.fp-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-bottom: 1px solid var(--mj-border-default);
}
.fp-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.fp-doc-name { color: var(--mj-text-muted); font-weight: 400; font-size: 13px; }
.fp-close {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: var(--mj-text-muted); font-size: 18px;
}
.fp-close:hover { color: var(--mj-text-primary); }
.fp-body { flex: 1; display: flex; min-height: 0; }
.fp-palette {
  width: 220px; flex: 0 0 220px; padding: 16px;
  border-right: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface-card); overflow-y: auto;
}
.fp-palette-label, .fp-palette-hint {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
  color: var(--mj-text-muted); margin-bottom: 10px;
}
.fp-palette-hint { text-transform: none; letter-spacing: 0; margin-top: 12px; line-height: 1.4; }
.fp-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; margin-bottom: 8px;
  border: 1px solid var(--mj-border-default); border-radius: 8px;
  background: var(--mj-bg-surface); cursor: grab; font-size: 13px; font-weight: 500;
  user-select: none;
}
.fp-chip:hover { border-color: var(--mj-brand-primary); color: var(--mj-brand-primary); }
.fp-chip:active { cursor: grabbing; }
.fp-placed-summary {
  margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--mj-border-default);
  font-size: 13px; color: var(--mj-text-secondary);
}
.fp-clear {
  display: block; margin-top: 8px; background: none; border: none; padding: 0;
  color: var(--mj-status-error-text); cursor: pointer; font-size: 12px; text-decoration: underline;
}
.fp-pages {
  flex: 1; overflow-y: auto; padding: 20px;
  background: var(--mj-bg-surface-sunken); display: flex; flex-direction: column; align-items: center; gap: 24px;
}
.fp-loading, .fp-error { color: var(--mj-text-muted); font-size: 14px; padding: 40px; }
.fp-error { color: var(--mj-status-error-text); }
.fp-page-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.fp-page-num { font-size: 11px; color: var(--mj-text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.fp-page {
  position: relative; line-height: 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15); background: #fff;
}
.fp-page canvas { display: block; }
.fp-field {
  position: absolute; transform: translate(0, 0);
  display: flex; align-items: center; gap: 6px;
  min-width: 90px; height: 26px; padding: 0 6px;
  background: color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
  border: 1.5px solid var(--mj-brand-primary); border-radius: 4px;
  font-size: 11px; font-weight: 600; color: var(--mj-brand-primary);
  cursor: default; white-space: nowrap; line-height: normal;
}
.fp-field-label { display: inline-flex; align-items: center; gap: 4px; }
.fp-field-remove {
  background: none; border: none; cursor: pointer; padding: 0;
  color: var(--mj-brand-primary); display: inline-flex; align-items: center;
}
.fp-field-remove:hover { color: var(--mj-status-error-text); }
.fp-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 18px; border-top: 1px solid var(--mj-border-default);
}
.fp-footer-hint { font-size: 12px; color: var(--mj-text-muted); flex: 1; }
.fp-footer-actions { display: flex; gap: 8px; }
.fp-btn {
  padding: 8px 16px; border-radius: var(--mat-sys-corner-small, 8px);
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; border: none;
}
.fp-btn-primary { background: var(--mj-brand-primary); color: var(--mj-brand-on-primary); }
.fp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.fp-btn-secondary { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); border: 1px solid var(--mj-border-default); }
`]
})
export class SecureMessagingFieldPlacerComponent implements AfterViewInit, OnDestroy {
  /** Base64 (no data-URL prefix) of the PDF to place fields on. */
  @Input() contentBase64 = '';
  /** Display name of the document (shown in the header). */
  @Input() filename = 'Document';

  /** Emitted with the placed fields when the user confirms. */
  @Output() placedFields = new EventEmitter<PlacedField[]>();
  /** Emitted when the user cancels. */
  @Output() cancel = new EventEmitter<void>();

  @ViewChildren('pageCanvas') canvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  readonly chips: FieldChip[] = [
    { type: 'signature', label: 'Signature', icon: 'fa-solid fa-signature' },
    { type: 'initials', label: 'Initials', icon: 'fa-solid fa-i-cursor' },
    { type: 'dateSigned', label: 'Date', icon: 'fa-solid fa-calendar-day' },
    { type: 'text', label: 'Text', icon: 'fa-solid fa-font' },
    { type: 'checkbox', label: 'Checkbox', icon: 'fa-solid fa-square-check' },
  ];

  pages: RenderedPage[] = [];
  placed: PlacedField[] = [];
  loading = true;
  renderError = '';
  /** Chip type armed for click-to-place; also the type being dragged. */
  activeChipType: PlacerFieldType | null = null;

  /** Display scale for rendering (CSS px per PDF point). Keeps pages readable without huge canvases. */
  private readonly displayScale = 1.3;
  private nextFieldId = 1;
  private pdfDoc: PdfDocumentProxy | null = null;
  private destroyed = false;
  /** Where within a dragged chip/marker the user grabbed it (px), captured on dragstart, applied on drop. */
  private dragGrabOffsetX = 0;
  private dragGrabOffsetY = 0;
  /** The already-placed field currently being repositioned (drag-to-move), or null for new placement. */
  private movingField: PlacedField | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  async ngAfterViewInit(): Promise<void> {
    await this.renderPdf();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    // Release the pdf.js document so its worker resources are freed.
    void this.pdfDoc?.destroy();
  }

  // ---- PDF rendering --------------------------------------------------------------------------

  private async renderPdf(): Promise<void> {
    try {
      // Dynamic import + MJ's canonical worker setup: the worker is served as a public asset at
      // /assets/pdf.worker.min.mjs (copied via MJExplorer's angular.json). A raw node_modules FS
      // path is rejected by Vite's dev server (403), so we use the public asset path like MJ does.
      const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';

      const bytes = this.base64ToBytes(this.contentBase64);
      this.pdfDoc = await pdfjs.getDocument({ data: bytes }).promise;

      // First pass: capture each page's true point dimensions so the template renders the <canvas>
      // elements; the actual raster happens in the second pass once the canvases exist in the DOM.
      const meta: RenderedPage[] = [];
      for (let n = 1; n <= this.pdfDoc.numPages; n++) {
        const page = await this.pdfDoc.getPage(n);
        const vp = page.getViewport({ scale: 1 }); // scale 1 → dimensions in PDF points
        meta.push({
          pageNumber: n,
          widthPt: vp.width,
          heightPt: vp.height,
          displayWidth: vp.width * this.displayScale,
          displayHeight: vp.height * this.displayScale,
        });
      }
      if (this.destroyed) return;
      this.pages = meta;
      this.loading = false;
      this.cdr.detectChanges(); // create the <canvas> elements

      // Second pass: raster each page onto its canvas now that ViewChildren exist.
      await this.rasterPages();
    } catch (e) {
      console.error('Field placer: failed to render PDF', e);
      this.renderError = 'Could not render this document for field placement. Only PDFs are supported.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async rasterPages(): Promise<void> {
    if (!this.pdfDoc) return;
    const canvasEls = this.canvases.toArray();
    for (const meta of this.pages) {
      const el = canvasEls.find((c) => Number(c.nativeElement.dataset['page']) === meta.pageNumber);
      if (!el) continue;
      const page = await this.pdfDoc.getPage(meta.pageNumber);
      const viewport = page.getViewport({ scale: this.displayScale });
      const canvas = el.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (this.destroyed) return;
    }
    this.cdr.detectChanges();
  }

  // ---- Placing fields -------------------------------------------------------------------------

  onChipDragStart(chip: FieldChip, event: DragEvent): void {
    this.activeChipType = chip.type;
    event.dataTransfer?.setData('text/plain', chip.type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    // Record where WITHIN the chip the user grabbed it, so on drop we can place the field's top-left
    // where the chip's top-left visually is — not offset by the grab point. Without this, the field
    // lands under the cursor, which sits somewhere inside the dragged chip, and feels "off".
    const chipRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragGrabOffsetX = event.clientX - chipRect.left;
    this.dragGrabOffsetY = event.clientY - chipRect.top;
  }

  onPageDragOver(event: DragEvent): void {
    event.preventDefault(); // allow drop
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  /** Begin repositioning an already-placed field. Records the field + where within its marker the
   *  user grabbed it, so the drop lands the marker's top-left where they intend. */
  onFieldDragStart(field: PlacedField, event: DragEvent): void {
    event.stopPropagation(); // don't let the page treat this as a click/new-field gesture
    this.movingField = field;
    // Moving an existing field is NOT a new-chip gesture — clear any armed chip type.
    this.activeChipType = null;
    const markerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragGrabOffsetX = event.clientX - markerRect.left;
    this.dragGrabOffsetY = event.clientY - markerRect.top;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'move'); // Firefox requires data to be set to drag
    }
  }

  onPageDrop(pg: RenderedPage, event: DragEvent): void {
    event.preventDefault();
    // Case 1: repositioning an existing field — move the SAME field, don't create a new one.
    if (this.movingField) {
      const moving = this.movingField;
      this.movingField = null;
      const pos = this.pointToPercent(pg, event, this.dragGrabOffsetX, this.dragGrabOffsetY);
      this.placed = this.placed.map(f =>
        f.id === moving.id
          ? { ...f, page: pg.pageNumber, xPercent: pos.xPercent, yPercent: pos.yPercent, pageWidthPt: pg.widthPt, pageHeightPt: pg.heightPt }
          : f,
      );
      this.cdr.detectChanges();
      return;
    }
    // Case 2: placing a NEW field from a palette chip.
    const type = (event.dataTransfer?.getData('text/plain') as PlacerFieldType) || this.activeChipType;
    if (!type || type === ('move' as PlacerFieldType)) return;
    this.addFieldAtEvent(pg, event, type, this.dragGrabOffsetX, this.dragGrabOffsetY);
  }

  /** Click-to-place: if a chip type is armed, a click on the page drops that field CENTERED on the
   *  click (no drag grab-offset to correct for). */
  onPageClick(pg: RenderedPage, event: MouseEvent): void {
    if (!this.activeChipType) return;
    // Ignore clicks that originated on an existing field marker (handled by its own remove button).
    if ((event.target as HTMLElement).closest('.fp-field')) return;
    // Center the field box on the click: offset by half the field's rendered size.
    this.addFieldAtEvent(pg, event, this.activeChipType, FIELD_BOX_WIDTH_PX / 2, FIELD_BOX_HEIGHT_PX / 2);
  }

  /**
   * Convert a pointer event on a page into a normalized top-left %-position. `grabOffsetX/Y` (px) is
   * subtracted from the pointer so the field's top-left corner — how the marker is rendered — lands
   * where the user intends (the chip/marker's top-left on drop, or centered on a click). Shared by
   * both new-field placement and existing-field repositioning so the math is identical.
   */
  private pointToPercent(
    pg: RenderedPage,
    event: MouseEvent | DragEvent,
    grabOffsetX = 0,
    grabOffsetY = 0,
  ): { xPercent: number; yPercent: number } {
    void pg; // pg identifies the page; the rect comes from the event's target page element
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event as MouseEvent).clientX - rect.left - grabOffsetX;
    const y = (event as MouseEvent).clientY - rect.top - grabOffsetY;
    const xPercent = this.clampPct((x / rect.width) * 100);
    const yPercent = this.clampPct((y / rect.height) * 100);
    return { xPercent, yPercent };
  }

  private addFieldAtEvent(
    pg: RenderedPage,
    event: MouseEvent | DragEvent,
    type: PlacerFieldType,
    grabOffsetX = 0,
    grabOffsetY = 0,
  ): void {
    const { xPercent, yPercent } = this.pointToPercent(pg, event, grabOffsetX, grabOffsetY);
    this.placed = [
      ...this.placed,
      {
        id: this.nextFieldId++,
        type,
        page: pg.pageNumber,
        xPercent,
        yPercent,
        pageWidthPt: pg.widthPt,
        pageHeightPt: pg.heightPt,
        required: true,
      },
    ];
    this.cdr.detectChanges();
  }

  removeField(field: PlacedField, event: Event): void {
    event.stopPropagation();
    this.placed = this.placed.filter((f) => f.id !== field.id);
    this.cdr.detectChanges();
  }

  clearAll(): void {
    this.placed = [];
    this.cdr.detectChanges();
  }

  fieldsOnPage(pageNumber: number): PlacedField[] {
    return this.placed.filter((f) => f.page === pageNumber);
  }

  confirm(): void {
    if (this.placed.length === 0) return;
    this.placedFields.emit(this.placed);
  }

  onBackdrop(_event: MouseEvent): void {
    // Clicking the dark backdrop cancels (the modal itself stops propagation).
    this.cancel.emit();
  }

  // ---- Small helpers --------------------------------------------------------------------------

  chipLabel(type: PlacerFieldType): string {
    return this.chips.find((c) => c.type === type)?.label ?? type;
  }
  chipIcon(type: PlacerFieldType): string {
    return this.chips.find((c) => c.type === type)?.icon ?? 'fa-solid fa-pen';
  }

  private clampPct(v: number): number {
    return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
}
