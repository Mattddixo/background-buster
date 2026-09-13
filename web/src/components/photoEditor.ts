import type { Orientation, PhotoTreatment, FitMode } from '../cropSpec.js';

export interface OpenPhotoEditorOptions {
  file: File;
  /** Actual output pixel size this photo will be rendered at. */
  targetWidth: number;
  targetHeight: number;
  initialTreatment?: PhotoTreatment | null;
  allowUpscale: boolean;
  onConfirm: (treatment: PhotoTreatment) => void;
  onCancel?: () => void;
}

type UiMode = 'fit' | 'fill';
type ContainStyle = 'blur' | 'pad';

const MAX_VIEWPORT = 480;
const MIN_VIEWPORT = 200;
const UPSCALE_CEILING = 3; // when allowUpscale is on, how far past native res Fill can still zoom

function buildWorkingCanvas(
  img: HTMLImageElement,
  rotation: Orientation['rotation'],
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement {
  const swapped = rotation === 90 || rotation === 270;
  const w = swapped ? img.naturalHeight : img.naturalWidth;
  const h = swapped ? img.naturalWidth : img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
  return canvas;
}

// A shared crop/rotate/flip editor, used identically by Upload and Collage.
//
// The central design choice: Fit (show the whole photo, letterboxed) and
// Fill (crop to fill the frame) are equally-weighted, explicit choices —
// not "the default behavior" vs. "a manual override of it." Fit is
// preselected because preserving the original photo is this app's default
// everywhere (see DESIGN.md), but nothing here treats Fill as secondary:
// switching to it is one click, and once there you get full control over
// exactly what's kept via pan/zoom, not just a fine-tune of an automatic
// guess.
//
// Rotate/flip apply in both modes — orientation isn't "losing content," so
// it isn't gated behind picking Fill.
export function openPhotoEditor(options: OpenPhotoEditorOptions): void {
  const { file, targetWidth, targetHeight, allowUpscale, onConfirm, onCancel } = options;
  const initial = options.initialTreatment;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const panel = document.createElement('div');
  panel.className = 'editor-panel';

  const title = document.createElement('h2');
  title.className = 'editor-title';
  title.textContent = 'Edit photo';

  const modeRow = document.createElement('div');
  modeRow.className = 'editor-mode-row';
  const fitModeButton = segmentButton('Fit — show everything');
  const fillModeButton = segmentButton('Fill — crop to fit');
  modeRow.append(fitModeButton, fillModeButton);

  const styleRow = document.createElement('div');
  styleRow.className = 'editor-mode-row editor-style-row';
  const blurStyleButton = segmentButton('Blurred backdrop');
  const padStyleButton = segmentButton('Solid color');
  styleRow.append(blurStyleButton, padStyleButton);

  const viewportWrap = document.createElement('div');
  viewportWrap.className = 'editor-viewport-wrap';

  const viewport = document.createElement('div');
  viewport.className = 'editor-viewport';
  viewport.style.touchAction = 'none';

  const backdropLayer = document.createElement('div');
  backdropLayer.className = 'editor-backdrop';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'editor-canvas-wrap';

  viewport.append(backdropLayer, canvasWrap);
  viewportWrap.append(viewport);

  const status = document.createElement('p');
  status.className = 'editor-status';

  const controls = document.createElement('div');
  controls.className = 'editor-controls';

  const zoomLabel = document.createElement('label');
  zoomLabel.className = 'panel-label';
  zoomLabel.textContent = 'Zoom';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.className = 'editor-zoom';
  zoomSlider.min = '0';
  zoomSlider.max = '1000';
  const zoomSection = document.createElement('div');
  zoomSection.append(zoomLabel, zoomSlider);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'editor-button-row';
  const rotateButton = iconButton('⟳', 'Rotate 90°');
  const flipHButton = iconButton('⇋', 'Flip horizontal');
  const flipVButton = iconButton('⇵', 'Flip vertical');
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'button button-secondary';
  resetButton.textContent = 'Reset';
  buttonRow.append(rotateButton, flipHButton, flipVButton, resetButton);

  const actionRow = document.createElement('div');
  actionRow.className = 'editor-action-row';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'button button-secondary';
  cancelButton.textContent = 'Cancel';
  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'button button-primary';
  confirmButton.textContent = 'Use this';
  actionRow.append(cancelButton, confirmButton);

  controls.append(modeRow, styleRow, zoomSection, buttonRow);
  panel.append(title, viewportWrap, status, controls, actionRow);
  overlay.append(panel);
  document.body.append(overlay);

  let uiMode: UiMode = initial?.fitMode === 'cover' ? 'fill' : 'fit';
  let containStyle: ContainStyle = initial?.fitMode === 'contain-pad' ? 'pad' : 'blur';
  let rotation: Orientation['rotation'] = initial?.orientation?.rotation ?? 0;
  let flipH = initial?.orientation?.flipH ?? false;
  let flipV = initial?.orientation?.flipV ?? false;

  let working: HTMLCanvasElement;
  let viewportW = 0;
  let viewportH = 0;
  let scale = 1;
  let sMin = 1;
  let sMaxEffective = 1;
  let nativeMax = 1;
  let tx = 0;
  let ty = 0;
  let objectUrl: string | null = null;

  function setUiMode(next: UiMode): void {
    uiMode = next;
    fitModeButton.classList.toggle('segment-active', uiMode === 'fit');
    fillModeButton.classList.toggle('segment-active', uiMode === 'fill');
    styleRow.hidden = uiMode !== 'fit';
    zoomSection.hidden = uiMode !== 'fill';
    render();
  }

  function setContainStyle(next: ContainStyle): void {
    containStyle = next;
    blurStyleButton.classList.toggle('segment-active', containStyle === 'blur');
    padStyleButton.classList.toggle('segment-active', containStyle === 'pad');
    render();
  }

  function sizeViewport(): void {
    const targetAspect = targetWidth / targetHeight;
    const available = Math.min(MAX_VIEWPORT, window.innerWidth - 96);
    const box = Math.max(MIN_VIEWPORT, available);
    if (targetAspect >= 1) {
      viewportW = box;
      viewportH = box / targetAspect;
    } else {
      viewportH = box;
      viewportW = box * targetAspect;
    }
    viewport.style.width = `${viewportW}px`;
    viewport.style.height = `${viewportH}px`;
  }

  function clampTranslate(): void {
    const renderedW = working.width * scale;
    const renderedH = working.height * scale;
    tx = Math.min(0, Math.max(viewportW - renderedW, tx));
    ty = Math.min(0, Math.max(viewportH - renderedH, ty));
  }

  // The one function that actually paints the viewport for whichever mode
  // is active — Fill pans/zooms a crop; Fit centers the whole photo over a
  // backdrop. Both branches always end in the same place (canvasWrap's
  // transform + backdrop contents), so nothing else needs to know which
  // mode produced them.
  function render(): void {
    if (!working) return;

    if (uiMode === 'fill') {
      backdropLayer.hidden = true;
      canvasWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    } else {
      backdropLayer.hidden = false;
      renderContainBackdrop();
      const containScale = Math.min(viewportW / working.width, viewportH / working.height);
      const w = working.width * containScale;
      const h = working.height * containScale;
      canvasWrap.style.transform = `translate(${(viewportW - w) / 2}px, ${(viewportH - h) / 2}px) scale(${containScale})`;
    }
    updateStatus();
  }

  function renderContainBackdrop(): void {
    backdropLayer.innerHTML = '';
    if (containStyle === 'pad') {
      backdropLayer.style.background = approximateEdgeColor(working);
      return;
    }
    backdropLayer.style.background = '';
    const coverScale = Math.max(viewportW / working.width, viewportH / working.height);
    const w = working.width * coverScale;
    const h = working.height * coverScale;
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = working.width;
    blurCanvas.height = working.height;
    blurCanvas.getContext('2d')?.drawImage(working, 0, 0);
    blurCanvas.className = 'editor-backdrop-canvas';
    blurCanvas.style.left = `${(viewportW - w) / 2}px`;
    blurCanvas.style.top = `${(viewportH - h) / 2}px`;
    blurCanvas.style.width = `${w}px`;
    blurCanvas.style.height = `${h}px`;
    blurCanvas.style.filter = `blur(${Math.round(Math.max(viewportW, viewportH) / 25)}px)`;
    backdropLayer.appendChild(blurCanvas);
  }

  function setScale(next: number, anchorViewportCenter = true): void {
    const clamped = Math.min(sMaxEffective, Math.max(sMin, next));
    if (anchorViewportCenter) {
      const cx = (viewportW / 2 - tx) / scale;
      const cy = (viewportH / 2 - ty) / scale;
      scale = clamped;
      tx = viewportW / 2 - cx * scale;
      ty = viewportH / 2 - cy * scale;
    } else {
      scale = clamped;
    }
    clampTranslate();
    updateSlider();
    render();
  }

  function updateSlider(): void {
    const range = sMaxEffective - sMin;
    const t = range > 0 ? (scale - sMin) / range : 0;
    zoomSlider.value = String(Math.round(t * 1000));
    zoomSlider.disabled = range <= 0;
  }

  function updateStatus(): void {
    if (uiMode === 'fill') {
      const cropWidthPx = Math.round(viewportW / scale);
      const cropHeightPx = Math.round(viewportH / scale);
      const upscaleFactor = scale > nativeMax ? scale / nativeMax : 1;
      if (upscaleFactor > 1.01) {
        status.textContent = `${cropWidthPx}×${cropHeightPx} source px → ${targetWidth}×${targetHeight} (upscaled ${upscaleFactor.toFixed(1)}×)`;
        status.classList.add('editor-status-warning');
      } else {
        status.textContent = `${cropWidthPx}×${cropHeightPx} source px → ${targetWidth}×${targetHeight}, nothing cropped away`;
        status.classList.remove('editor-status-warning');
      }
      return;
    }

    const containTargetScale = Math.min(targetWidth / working.width, targetHeight / working.height);
    if (containTargetScale > 1.01) {
      status.textContent = `Whole photo shown, upscaled ${containTargetScale.toFixed(1)}× to reach ${targetWidth}×${targetHeight}`;
      status.classList.add('editor-status-warning');
    } else {
      status.textContent = `Whole photo shown, nothing cropped away`;
      status.classList.remove('editor-status-warning');
    }
  }

  function rebuildWorkingImage(img: HTMLImageElement, resetView: boolean): void {
    working = buildWorkingCanvas(img, rotation, flipH, flipV);
    canvasWrap.innerHTML = '';
    canvasWrap.style.width = `${working.width}px`;
    canvasWrap.style.height = `${working.height}px`;
    canvasWrap.appendChild(working);

    sMin = Math.max(viewportW / working.width, viewportH / working.height);
    nativeMax = Math.min(viewportW / targetWidth, viewportH / targetHeight);
    const sourceSmallerThanTarget = nativeMax < sMin;
    sMaxEffective = sourceSmallerThanTarget
      ? allowUpscale
        ? sMin * UPSCALE_CEILING
        : sMin
      : Math.max(nativeMax, sMin);

    if (resetView) {
      scale = sMin;
      tx = (viewportW - working.width * scale) / 2;
      ty = (viewportH - working.height * scale) / 2;
    }
    clampTranslate();
    updateSlider();
    render();
  }

  function restoreInitialCropIfAny(img: HTMLImageElement): void {
    rebuildWorkingImage(img, true);
    const crop = initial?.crop;
    if (!crop || uiMode !== 'fill') return;
    // Restore the exact prior Fill framing: normalized fractions -> screen space.
    scale = Math.min(sMaxEffective, Math.max(sMin, viewportW / (crop.width * working.width)));
    tx = -crop.x * working.width * scale;
    ty = -crop.y * working.height * scale;
    clampTranslate();
    updateSlider();
    render();
  }

  // Sized immediately, not inside img.onload: the viewport's dimensions
  // depend only on targetWidth/targetHeight and the window, not on the
  // image, so there's no reason the modal should ever render collapsed
  // while a local blob URL decodes.
  sizeViewport();
  setUiMode(uiMode);
  setContainStyle(containStyle);

  const img = new Image();
  objectUrl = URL.createObjectURL(file);
  img.onload = () => restoreInitialCropIfAny(img);
  img.src = objectUrl;

  function setRotation(next: Orientation['rotation']): void {
    rotation = next;
    rebuildWorkingImage(img, true);
  }

  fitModeButton.addEventListener('click', () => setUiMode('fit'));
  fillModeButton.addEventListener('click', () => setUiMode('fill'));
  blurStyleButton.addEventListener('click', () => setContainStyle('blur'));
  padStyleButton.addEventListener('click', () => setContainStyle('pad'));

  rotateButton.addEventListener('click', () => {
    const order: Orientation['rotation'][] = [0, 90, 180, 270];
    setRotation(order[(order.indexOf(rotation) + 1) % order.length]);
  });
  flipHButton.addEventListener('click', () => {
    flipH = !flipH;
    rebuildWorkingImage(img, true);
  });
  flipVButton.addEventListener('click', () => {
    flipV = !flipV;
    rebuildWorkingImage(img, true);
  });
  resetButton.addEventListener('click', () => {
    rotation = 0;
    flipH = false;
    flipV = false;
    setUiMode('fit');
    setContainStyle('blur');
    rebuildWorkingImage(img, true);
  });

  zoomSlider.addEventListener('input', () => {
    const t = Number(zoomSlider.value) / 1000;
    setScale(sMin + t * (sMaxEffective - sMin), true);
  });

  viewport.addEventListener('wheel', (e) => {
    if (uiMode !== 'fill') return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setScale(scale * factor, true);
  });

  let dragStart: { pointerId: number; startX: number; startY: number; tx: number; ty: number } | null = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (uiMode !== 'fill') return;
    viewport.setPointerCapture(e.pointerId);
    dragStart = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, tx, ty };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragStart || dragStart.pointerId !== e.pointerId) return;
    tx = dragStart.tx + (e.clientX - dragStart.startX);
    ty = dragStart.ty + (e.clientY - dragStart.startY);
    clampTranslate();
    render();
  });
  function endDrag(e: PointerEvent): void {
    if (dragStart?.pointerId === e.pointerId) dragStart = null;
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  function close(): void {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    overlay.remove();
  }

  cancelButton.addEventListener('click', () => {
    close();
    onCancel?.();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      onCancel?.();
    }
  });

  confirmButton.addEventListener('click', () => {
    const orientation: Orientation = { rotation, flipH, flipV };
    const fitMode: FitMode = uiMode === 'fill' ? 'cover' : containStyle === 'pad' ? 'contain-pad' : 'contain-blur';
    const treatment: PhotoTreatment = { fitMode, orientation };
    if (uiMode === 'fill') {
      treatment.crop = {
        x: clamp01(-tx / scale / working.width),
        y: clamp01(-ty / scale / working.height),
        width: clamp01(viewportW / scale / working.width),
        height: clamp01(viewportH / scale / working.height),
      };
    }
    close();
    onConfirm(treatment);
  });
}

// A cheap, best-effort approximation for the live preview only — drawing a
// heavily downscaled copy and reading its pixel is not the same algorithm
// the server uses (a real cover-fit 1x1 resize via libvips) and isn't meant
// to match exactly; the server always computes the authoritative color for
// the actual output.
function approximateEdgeColor(canvas: HTMLCanvasElement): string {
  const tiny = document.createElement('canvas');
  tiny.width = 1;
  tiny.height = 1;
  const ctx = tiny.getContext('2d');
  if (!ctx) return '#121212';
  ctx.drawImage(canvas, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function segmentButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-segment';
  button.textContent = label;
  return button;
}

function iconButton(symbol: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary editor-icon-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}
