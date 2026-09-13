import type { CropSpec } from '../cropSpec.js';

export interface OpenPhotoEditorOptions {
  file: File;
  /** Actual output pixel size this photo will be rendered at. */
  targetWidth: number;
  targetHeight: number;
  initialCrop?: CropSpec | null;
  allowUpscale: boolean;
  onConfirm: (crop: CropSpec) => void;
  onCancel?: () => void;
}

const MAX_VIEWPORT = 480;
const MIN_VIEWPORT = 200;
const UPSCALE_CEILING = 3; // when allowUpscale is on, how far past native res you can still zoom

function buildWorkingCanvas(
  img: HTMLImageElement,
  rotation: CropSpec['rotation'],
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

// A shared crop/rotate/flip editor: pan with a pointer (mouse or touch),
// zoom with a slider or the wheel, rotate/flip via canvas pre-baking so pan
// math never has to reason about a live CSS rotation. Every screen-space
// number here is in CSS pixels of the fixed-size viewport; the only thing
// that leaves this module is the normalized CropSpec.
export function openPhotoEditor(options: OpenPhotoEditorOptions): void {
  const { file, targetWidth, targetHeight, allowUpscale, onConfirm, onCancel } = options;
  const targetAspect = targetWidth / targetHeight;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const panel = document.createElement('div');
  panel.className = 'editor-panel';

  const title = document.createElement('h2');
  title.className = 'editor-title';
  title.textContent = 'Edit photo';

  const viewportWrap = document.createElement('div');
  viewportWrap.className = 'editor-viewport-wrap';

  const viewport = document.createElement('div');
  viewport.className = 'editor-viewport';
  viewport.style.touchAction = 'none';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'editor-canvas-wrap';
  viewportWrap.append(viewport);
  viewport.append(canvasWrap);

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
  confirmButton.textContent = 'Use this crop';
  actionRow.append(cancelButton, confirmButton);

  controls.append(zoomLabel, zoomSlider, buttonRow);
  panel.append(title, viewportWrap, status, controls, actionRow);
  overlay.append(panel);
  document.body.append(overlay);

  let rotation: CropSpec['rotation'] = options.initialCrop?.rotation ?? 0;
  let flipH = options.initialCrop?.flipH ?? false;
  let flipV = options.initialCrop?.flipV ?? false;
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

  function sizeViewport(): void {
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

  function applyTransform(): void {
    canvasWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
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
    applyTransform();
    updateSlider();
    updateStatus();
  }

  function updateSlider(): void {
    const range = sMaxEffective - sMin;
    const t = range > 0 ? (scale - sMin) / range : 0;
    zoomSlider.value = String(Math.round(t * 1000));
    zoomSlider.disabled = range <= 0;
  }

  function updateStatus(): void {
    const cropWidthPx = Math.round(viewportW / scale);
    const cropHeightPx = Math.round(viewportH / scale);
    const upscaleFactor = scale > nativeMax ? scale / nativeMax : 1;
    if (upscaleFactor > 1.01) {
      status.textContent = `${cropWidthPx}×${cropHeightPx} source px → ${targetWidth}×${targetHeight} (upscaled ${upscaleFactor.toFixed(1)}×)`;
      status.classList.add('editor-status-warning');
    } else {
      status.textContent = `${cropWidthPx}×${cropHeightPx} source px → ${targetWidth}×${targetHeight}`;
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
    applyTransform();
    updateSlider();
    updateStatus();
  }

  function applyInitialCropIfAny(img: HTMLImageElement): void {
    const initial = options.initialCrop;
    rebuildWorkingImage(img, true);
    if (!initial) return;
    // Restore the exact prior view: normalized fractions -> screen space.
    scale = Math.min(sMaxEffective, Math.max(sMin, viewportW / (initial.width * working.width)));
    tx = -initial.x * working.width * scale;
    ty = -initial.y * working.height * scale;
    clampTranslate();
    applyTransform();
    updateSlider();
    updateStatus();
  }

  // Sized immediately, not inside img.onload: the viewport's dimensions
  // depend only on targetAspect and the window, not on the image, so there's
  // no reason the modal should ever render collapsed while a local blob URL
  // decodes — even though that's normally sub-frame-time, it isn't
  // guaranteed, and a caught-mid-decode measurement during testing showed
  // exactly that collapsed state.
  sizeViewport();

  const img = new Image();
  objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    applyInitialCropIfAny(img);
  };
  img.src = objectUrl;

  function setRotation(next: CropSpec['rotation']): void {
    rotation = next;
    rebuildWorkingImage(img, true);
  }

  rotateButton.addEventListener('click', () => {
    const order: CropSpec['rotation'][] = [0, 90, 180, 270];
    const next = order[(order.indexOf(rotation) + 1) % order.length];
    setRotation(next);
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
    rebuildWorkingImage(img, true);
  });

  zoomSlider.addEventListener('input', () => {
    const t = Number(zoomSlider.value) / 1000;
    setScale(sMin + t * (sMaxEffective - sMin), true);
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setScale(scale * factor, true);
  });

  let dragStart: { pointerId: number; startX: number; startY: number; tx: number; ty: number } | null = null;
  viewport.addEventListener('pointerdown', (e) => {
    viewport.setPointerCapture(e.pointerId);
    dragStart = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, tx, ty };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragStart || dragStart.pointerId !== e.pointerId) return;
    tx = dragStart.tx + (e.clientX - dragStart.startX);
    ty = dragStart.ty + (e.clientY - dragStart.startY);
    clampTranslate();
    applyTransform();
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
    const crop: CropSpec = {
      rotation,
      flipH,
      flipV,
      x: clamp01((-tx / scale) / working.width),
      y: clamp01((-ty / scale) / working.height),
      width: clamp01((viewportW / scale) / working.width),
      height: clamp01((viewportH / scale) / working.height),
    };
    close();
    onConfirm(crop);
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
