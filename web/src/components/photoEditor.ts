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
type Corner = 'nw' | 'ne' | 'sw' | 'se';

const MAX_STAGE = 480;
const MIN_STAGE = 200;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function oppositeCorner(corner: Corner): Corner {
  return { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }[corner] as Corner;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function cornerPoint(corner: Corner, rect: Rect): { x: number; y: number } {
  return {
    x: corner.includes('e') ? rect.left + rect.width : rect.left,
    y: corner.includes('s') ? rect.top + rect.height : rect.top,
  };
}

// A shared crop/rotate/flip editor, used identically by Upload and Collage.
//
// The central design choice: Fit (show the whole photo, letterboxed) and
// Fill (crop to fill the frame) are equally-weighted, explicit choices —
// not "the default behavior" vs. "a manual override of it." Fit is
// preselected because preserving the original photo is this app's default
// everywhere (see DESIGN.md).
//
// Fill's interaction is a direct-manipulation crop rectangle over the
// whole, statically-displayed photo — drag a corner to resize (aspect
// locked to the target), drag inside to move — the way a phone's native
// photo cropper works, rather than the earlier design of panning/zooming
// the photo underneath a fixed frame.
//
// Rotate/flip apply in both modes — orientation isn't "losing content," so
// it isn't gated behind picking Fill.
export function openPhotoEditor(options: OpenPhotoEditorOptions): void {
  const { file, targetWidth, targetHeight, allowUpscale, onConfirm, onCancel } = options;
  const initial = options.initialTreatment;
  const targetAspect = targetWidth / targetHeight;

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

  const stageWrap = document.createElement('div');
  stageWrap.className = 'editor-viewport-wrap';

  // Fit mode: a target-aspect box with a backdrop behind the centered photo.
  const viewport = document.createElement('div');
  viewport.className = 'editor-viewport';
  const backdropLayer = document.createElement('div');
  backdropLayer.className = 'editor-backdrop';
  const foregroundHost = document.createElement('div');
  foregroundHost.className = 'editor-canvas-wrap';
  viewport.append(backdropLayer, foregroundHost);

  // Fill mode: a photo-aspect box showing the whole photo, with a
  // draggable/resizable crop rectangle on top.
  //
  // The dimmed surround (a box-shadow spread trick) and the interactive
  // border+handles are two separate elements, not one — the dimming has to
  // be clipped to the stage's own bounds (or it visually bleeds past the
  // photo into the rest of the panel), but the handles must NOT be
  // clipped, since they sit half outside the crop box by design and that
  // box is routinely flush against the stage's edges (e.g. the default,
  // max-size crop). Clipping both together clips the handles out of both
  // view and hit-testing right at the most common starting point —
  // confirmed with elementFromPoint during testing, not assumed.
  const stage = document.createElement('div');
  stage.className = 'editor-stage';
  stage.style.touchAction = 'none';
  const stagePhotoHost = document.createElement('div');
  stagePhotoHost.className = 'editor-canvas-wrap';
  const dimLayer = document.createElement('div');
  dimLayer.className = 'crop-dim-layer';
  const dimHole = document.createElement('div');
  dimHole.className = 'crop-dim-hole';
  dimLayer.appendChild(dimHole);
  const cropBox = document.createElement('div');
  cropBox.className = 'crop-box';
  const handles = new Map<Corner, HTMLElement>();
  (['nw', 'ne', 'sw', 'se'] as Corner[]).forEach((corner) => {
    const handle = document.createElement('div');
    handle.className = `crop-handle crop-handle-${corner}`;
    handles.set(corner, handle);
    cropBox.appendChild(handle);
  });
  stage.append(stagePhotoHost, dimLayer, cropBox);

  stageWrap.append(viewport, stage);

  const status = document.createElement('p');
  status.className = 'editor-status';

  const controls = document.createElement('div');
  controls.className = 'editor-controls';

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

  controls.append(modeRow, styleRow, buttonRow);
  panel.append(title, stageWrap, status, controls, actionRow);
  overlay.append(panel);
  document.body.append(overlay);

  let uiMode: UiMode = initial?.fitMode === 'cover' ? 'fill' : 'fit';
  let containStyle: ContainStyle = initial?.fitMode === 'contain-pad' ? 'pad' : 'blur';
  let rotation: Orientation['rotation'] = initial?.orientation?.rotation ?? 0;
  let flipH = initial?.orientation?.flipH ?? false;
  let flipV = initial?.orientation?.flipV ?? false;

  let working: HTMLCanvasElement;
  let objectUrl: string | null = null;

  // Fit-mode geometry (target-aspect viewport).
  let viewportW = 0;
  let viewportH = 0;

  // Fill-mode geometry: the stage always shows the whole photo at
  // photoDisplayScale, and the crop rectangle lives in stage-pixel space.
  let stageW = 0;
  let stageH = 0;
  let photoDisplayScale = 1;
  let rectLeft = 0;
  let rectTop = 0;
  let rectW = 0;
  let rectH = 0;
  let minRectW = 0;
  let maxRectW = 0;

  function setUiMode(next: UiMode): void {
    uiMode = next;
    fitModeButton.classList.toggle('segment-active', uiMode === 'fit');
    fillModeButton.classList.toggle('segment-active', uiMode === 'fill');
    styleRow.hidden = uiMode !== 'fit';
    viewport.hidden = uiMode !== 'fit';
    stage.hidden = uiMode !== 'fill';
    render();
  }

  function setContainStyle(next: ContainStyle): void {
    containStyle = next;
    blurStyleButton.classList.toggle('segment-active', containStyle === 'blur');
    padStyleButton.classList.toggle('segment-active', containStyle === 'pad');
    render();
  }

  function sizeBoxes(): void {
    const available = Math.min(MAX_STAGE, window.innerWidth - 96);
    const box = Math.max(MIN_STAGE, available);

    if (targetAspect >= 1) {
      viewportW = box;
      viewportH = box / targetAspect;
    } else {
      viewportH = box;
      viewportW = box * targetAspect;
    }
    viewport.style.width = `${viewportW}px`;
    viewport.style.height = `${viewportH}px`;

    const photoAspect = working.width / working.height;
    if (photoAspect >= 1) {
      stageW = box;
      stageH = box / photoAspect;
    } else {
      stageH = box;
      stageW = box * photoAspect;
    }
    stage.style.width = `${stageW}px`;
    stage.style.height = `${stageH}px`;
    photoDisplayScale = stageW / working.width;
  }

  // The one function that actually paints whichever mode is active — Fit
  // centers the whole photo over a backdrop; Fill positions the crop
  // rectangle over the statically-displayed whole photo.
  function render(): void {
    if (!working) return;

    if (uiMode === 'fill') {
      stagePhotoHost.appendChild(working);
      working.style.position = '';
      working.style.width = `${stageW}px`;
      working.style.height = `${stageH}px`;
      for (const el of [dimHole, cropBox]) {
        el.style.left = `${rectLeft}px`;
        el.style.top = `${rectTop}px`;
        el.style.width = `${rectW}px`;
        el.style.height = `${rectH}px`;
      }
    } else {
      foregroundHost.appendChild(working);
      renderContainBackdrop();
      const containScale = Math.min(viewportW / working.width, viewportH / working.height);
      const w = working.width * containScale;
      const h = working.height * containScale;
      working.style.position = 'absolute';
      working.style.left = `${(viewportW - w) / 2}px`;
      working.style.top = `${(viewportH - h) / 2}px`;
      working.style.width = `${w}px`;
      working.style.height = `${h}px`;
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

  // Recomputes how small/large the crop rectangle is allowed to get. Smaller
  // rect = more zoomed in on the source = more likely to need upscaling to
  // reach the target's actual pixel size, so the floor is tied to that, not
  // to an arbitrary UI limit.
  function computeRectBounds(): void {
    maxRectW = Math.min(stageW, stageH * targetAspect);
    const nativeRectW = targetWidth * photoDisplayScale;
    const sourceSmallerThanTarget = nativeRectW > maxRectW;
    minRectW = sourceSmallerThanTarget
      ? allowUpscale
        ? maxRectW / UPSCALE_CEILING
        : maxRectW
      : Math.min(nativeRectW, maxRectW);
  }

  function resetRect(): void {
    rectW = maxRectW;
    rectH = rectW / targetAspect;
    rectLeft = (stageW - rectW) / 2;
    rectTop = (stageH - rectH) / 2;
  }

  function clampRect(): void {
    rectW = clamp(rectW, minRectW, maxRectW);
    rectH = rectW / targetAspect;
    rectLeft = clamp(rectLeft, 0, stageW - rectW);
    rectTop = clamp(rectTop, 0, stageH - rectH);
  }

  function updateStatus(): void {
    if (uiMode === 'fill') {
      const sourceW = Math.round(rectW / photoDisplayScale);
      const sourceH = Math.round(rectH / photoDisplayScale);
      const nativeRectW = targetWidth * photoDisplayScale;
      const upscaleFactor = rectW < nativeRectW ? nativeRectW / rectW : 1;
      if (upscaleFactor > 1.01) {
        status.textContent = `${sourceW}×${sourceH} source px → ${targetWidth}×${targetHeight} (upscaled ${upscaleFactor.toFixed(1)}×)`;
        status.classList.add('editor-status-warning');
      } else {
        status.textContent = `${sourceW}×${sourceH} source px → ${targetWidth}×${targetHeight}, nothing cropped away`;
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
    sizeBoxes();
    computeRectBounds();
    if (resetView) resetRect();
    clampRect();
    render();
  }

  function restoreInitialCropIfAny(img: HTMLImageElement): void {
    rebuildWorkingImage(img, true);
    const crop = initial?.crop;
    if (!crop || uiMode !== 'fill') return;
    // Restore the exact prior Fill framing: normalized fractions -> stage px.
    rectLeft = crop.x * stageW;
    rectTop = crop.y * stageH;
    rectW = crop.width * stageW;
    rectH = crop.height * stageH;
    clampRect();
    render();
  }

  const img = new Image();
  objectUrl = URL.createObjectURL(file);
  img.onload = () => restoreInitialCropIfAny(img);
  img.src = objectUrl;

  // sizeBoxes()/render() need `working`, which only exists once the image
  // has loaded — the mode/style button states are still set immediately so
  // the panel doesn't flash from one look to another right after opening.
  fitModeButton.classList.toggle('segment-active', uiMode === 'fit');
  fillModeButton.classList.toggle('segment-active', uiMode === 'fill');
  blurStyleButton.classList.toggle('segment-active', containStyle === 'blur');
  padStyleButton.classList.toggle('segment-active', containStyle === 'pad');
  styleRow.hidden = uiMode !== 'fit';
  viewport.hidden = uiMode !== 'fit';
  stage.hidden = uiMode !== 'fill';

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

  // Scroll wheel as a quick, coarse zoom (grows/shrinks the rect around its
  // own center); dragging a corner remains the precise way to do it.
  stage.addEventListener('wheel', (e) => {
    if (uiMode !== 'fill') return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const cx = rectLeft + rectW / 2;
    const cy = rectTop + rectH / 2;
    rectW = clamp(rectW / factor, minRectW, maxRectW);
    rectH = rectW / targetAspect;
    rectLeft = cx - rectW / 2;
    rectTop = cy - rectH / 2;
    clampRect();
    render();
  });

  // Move: dragging inside the rectangle (not on a handle) translates it.
  let moveStart: { pointerId: number; startX: number; startY: number; left: number; top: number } | null = null;
  cropBox.addEventListener('pointerdown', (e) => {
    if (e.target !== cropBox) return; // handles have their own listener below
    cropBox.setPointerCapture(e.pointerId);
    moveStart = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, left: rectLeft, top: rectTop };
  });
  cropBox.addEventListener('pointermove', (e) => {
    if (!moveStart || moveStart.pointerId !== e.pointerId) return;
    rectLeft = clamp(moveStart.left + (e.clientX - moveStart.startX), 0, stageW - rectW);
    rectTop = clamp(moveStart.top + (e.clientY - moveStart.startY), 0, stageH - rectH);
    render();
  });
  function endMove(e: PointerEvent): void {
    if (moveStart?.pointerId === e.pointerId) moveStart = null;
  }
  cropBox.addEventListener('pointerup', endMove);
  cropBox.addEventListener('pointercancel', endMove);

  // Resize: dragging a corner handle resizes the rect, anchored at the
  // opposite corner, aspect-locked to the target — exactly how a phone's
  // native photo cropper behaves.
  handles.forEach((handle, corner) => {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const fixed = cornerPoint(oppositeCorner(corner), { left: rectLeft, top: rectTop, width: rectW, height: rectH });
      const stageRect = stage.getBoundingClientRect();

      function onMove(ev: PointerEvent): void {
        const px = ev.clientX - stageRect.left;
        const py = ev.clientY - stageRect.top;

        const availableW = corner.includes('e') ? stageW - fixed.x : fixed.x;
        const availableH = corner.includes('s') ? stageH - fixed.y : fixed.y;
        const maxByStage = Math.min(availableW, availableH * targetAspect);

        // Aspect is locked to one degree of freedom, so both axes of the
        // drag are folded into a single width: whichever axis implies the
        // larger rectangle wins, so the corner tracks the pointer whether
        // you drag mostly sideways, mostly vertically, or diagonally —
        // dragging a corner "purely up" still resizes it, the way a phone
        // cropper's handles do.
        const wFromX = Math.abs(px - fixed.x);
        const wFromY = Math.abs(py - fixed.y) * targetAspect;
        let newW = Math.max(wFromX, wFromY);
        newW = clamp(newW, minRectW, Math.min(maxRectW, maxByStage));
        const newH = newW / targetAspect;

        rectLeft = corner.includes('e') ? fixed.x : fixed.x - newW;
        rectTop = corner.includes('s') ? fixed.y : fixed.y - newH;
        rectW = newW;
        rectH = newH;
        render();
      }

      function onUp(ev: PointerEvent): void {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  });

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
        x: clamp01(rectLeft / stageW),
        y: clamp01(rectTop / stageH),
        width: clamp01(rectW / stageW),
        height: clamp01(rectH / stageH),
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
