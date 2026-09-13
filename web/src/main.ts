import {
  fetchPresets,
  fetchCollageLayout,
  processPhoto,
  processGif,
  processCollage,
  generate,
  type DevicePreset,
  type CollageLayout,
} from './api.js';
import { detectDeviceTarget } from './deviceTarget.js';
import { createPresetPicker, type TargetSelection } from './components/presetPicker.js';
import { createUpscaleToggle } from './components/controls.js';
import { createUploadPanel, type UploadPanelHandle } from './components/uploadPanel.js';
import { createCollagePanel, type CollageEntry, type CollagePanelHandle } from './components/collagePanel.js';
import { createGeneratorPanel, type GeneratorSelection } from './components/generatorPanel.js';
import { createPreview } from './components/preview.js';
import { openPhotoEditor } from './components/photoEditor.js';
import { describeTreatment, DEFAULT_FIT_MODE, type PhotoTreatment } from './cropSpec.js';

type SourceMode = 'upload' | 'collage' | 'generate';

const MIN_COLLAGE_PHOTOS = 2;
const MAX_COLLAGE_PHOTOS = 9;

function tabButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = 'tab';
  return button;
}

function setActiveTab(active: HTMLButtonElement, others: HTMLButtonElement[]): void {
  active.classList.add('tab-active');
  others.forEach((btn) => btn.classList.remove('tab-active'));
}

function resolveDimensions(
  target: TargetSelection,
  presets: DevicePreset[],
): { width: number; height: number } {
  if (target.width && target.height) return { width: target.width, height: target.height };
  if (target.presetId) {
    const preset = presets.find((p) => p.id === target.presetId);
    if (preset) return { width: preset.width, height: preset.height };
  }
  throw new Error('Pick a target first.');
}

function targetKey(target: TargetSelection): string {
  return target.presetId ? `p:${target.presetId}` : `c:${target.width ?? ''}x${target.height ?? ''}`;
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  const layout = document.createElement('div');
  layout.className = 'layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';

  const header = document.createElement('header');
  header.className = 'app-header';
  const heading = document.createElement('h1');
  heading.textContent = 'Background Buster';
  const tagline = document.createElement('p');
  tagline.textContent = 'Make a background. Nothing you upload is kept.';
  header.append(heading, tagline);

  const modeTabs = document.createElement('div');
  modeTabs.className = 'mode-tabs';
  const uploadTab = tabButton('Upload');
  const collageTab = tabButton('Collage');
  const generateTab = tabButton('Generate');
  modeTabs.append(uploadTab, collageTab, generateTab);

  const sourceSlot = document.createElement('div');
  const presetSlot = document.createElement('div');
  const fitSlot = document.createElement('div');

  const actionRow = document.createElement('div');
  actionRow.className = 'panel-section';
  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'button button-primary';
  createButton.textContent = 'Create';
  actionRow.appendChild(createButton);

  sidebar.append(header, modeTabs, sourceSlot, presetSlot, fitSlot, actionRow);

  const preview = createPreview();
  const main = document.createElement('main');
  main.className = 'main';
  main.appendChild(preview.element);

  layout.append(sidebar, main);
  root.appendChild(layout);

  let mode: SourceMode = 'upload';
  let file: File | null = null;
  // No treatment yet means "use the app-wide default" (Fit, blurred
  // backdrop) — a treatment is only ever stored once the editor is
  // actually confirmed, so an untouched photo has no explicit state to
  // display, and still gets the preserve-everything default at Create time.
  let uploadTreatment: PhotoTreatment | null = null;
  let uploadHandle: UploadPanelHandle | null = null;

  let collageEntries: CollageEntry[] = [];
  const collageTreatments = new Map<number, PhotoTreatment>();
  let collagePanelHandle: CollagePanelHandle | null = null;
  let collageLayout: CollageLayout | null = null;
  let lastCollageLayoutKey = '';

  let target: TargetSelection = {};
  let uploadAllowUpscale = false;
  let collageAllowUpscale = false;
  let generatorSelection: GeneratorSelection = { style: 'gradient', seed: 'seed' };

  const presets = await fetchPresets();
  const detected = detectDeviceTarget();

  // A stored treatment was framed against a specific target size — if the
  // target changes, that framing may no longer make sense (wrong aspect,
  // or a resolution it wasn't sized for), so it's cleared rather than
  // silently reused. Photos fall back to the preserve-everything default,
  // never to a stale crop.
  function invalidateTreatmentsOnTargetChange(): void {
    if (uploadTreatment) {
      uploadTreatment = null;
      uploadHandle?.setTreatmentLabel(null);
    }
    if (collageTreatments.size > 0) {
      collageTreatments.clear();
      collagePanelHandle?.clearAllTreatmentLabels();
    }
    lastCollageLayoutKey = '';
  }

  presetSlot.appendChild(
    createPresetPicker(presets, detected, (t) => {
      target = t;
      invalidateTreatmentsOnTargetChange();
      void refreshCollageLayout();
    }),
  );

  // The collage layout (which cell is where, how big) depends only on photo
  // count and target — refetched from the server whenever either changes,
  // never recomputed locally, so the editor's crop frame always matches
  // what the final render will actually do.
  //
  // Multiple triggers (adding photos, changing target) can each kick off a
  // fetch in close succession; since they're fire-and-forget, an older
  // request can resolve after a newer one and overwrite it with stale data.
  // A request token discards any response that isn't from the most
  // recently issued request — caught by an automated browser test that
  // exercised these triggers back-to-back, not by inspection.
  let collageLayoutRequestId = 0;

  async function refreshCollageLayout(): Promise<void> {
    if (collageEntries.length < MIN_COLLAGE_PHOTOS) {
      collageLayout = null;
      lastCollageLayoutKey = '';
      return;
    }
    const key = `${collageEntries.length}:${targetKey(target)}`;
    if (key === lastCollageLayoutKey) return;

    const requestId = ++collageLayoutRequestId;
    try {
      const dims = resolveDimensions(target, presets);
      const fresh = await fetchCollageLayout(collageEntries.length, dims);
      if (requestId !== collageLayoutRequestId) return; // superseded by a newer request

      const shapeChanged = !collageLayout || collageLayout.rows !== fresh.rows || collageLayout.cols !== fresh.cols;
      collageLayout = fresh;
      lastCollageLayoutKey = key;
      if (shapeChanged && collageTreatments.size > 0) {
        collageTreatments.clear();
        collagePanelHandle?.clearAllTreatmentLabels();
      }
    } catch {
      if (requestId === collageLayoutRequestId) collageLayout = null;
    }
  }

  function openUploadEditor(targetFile: File): void {
    let dims: { width: number; height: number };
    try {
      dims = resolveDimensions(target, presets);
    } catch (err) {
      preview.showError(err instanceof Error ? err.message : 'Pick a target first.');
      return;
    }
    openPhotoEditor({
      file: targetFile,
      targetWidth: dims.width,
      targetHeight: dims.height,
      initialTreatment: uploadTreatment,
      allowUpscale: uploadAllowUpscale,
      onConfirm: (treatment) => {
        uploadTreatment = treatment;
        uploadHandle?.setTreatmentLabel(describeTreatment(treatment));
      },
    });
  }

  async function openCollageEditor(entry: CollageEntry, index: number): Promise<void> {
    try {
      // Validated for its own sake (a clear "pick a target first" beats a
      // vague layout-fetch failure) — the crop itself is framed against the
      // cell size below, not this overall target.
      resolveDimensions(target, presets);
    } catch (err) {
      preview.showError(err instanceof Error ? err.message : 'Pick a target first.');
      return;
    }
    // Always goes through the same key-checked path as every other trigger
    // (cheap no-op when nothing changed) rather than a separate "does this
    // look stale" shortcut, which is exactly what let a stale layout slip
    // through during testing.
    await refreshCollageLayout();
    const cell = collageLayout?.cells[index];
    if (!cell) {
      preview.showError('Could not determine this photo’s cell yet — try again in a moment.');
      return;
    }
    openPhotoEditor({
      file: entry.file,
      targetWidth: cell.width,
      targetHeight: cell.height,
      initialTreatment: collageTreatments.get(entry.id) ?? null,
      allowUpscale: collageAllowUpscale,
      onConfirm: (treatment) => {
        collageTreatments.set(entry.id, treatment);
        collagePanelHandle?.setTreatmentLabel(entry.id, describeTreatment(treatment));
      },
    });
  }

  function renderSource(): void {
    sourceSlot.innerHTML = '';
    fitSlot.innerHTML = '';
    uploadHandle = null;
    collagePanelHandle = null;

    if (mode === 'upload') {
      uploadHandle = createUploadPanel(
        (f) => {
          file = f;
          uploadTreatment = null;
          uploadHandle?.setTreatmentLabel(null);
        },
        (f) => openUploadEditor(f),
      );
      sourceSlot.appendChild(uploadHandle.element);
      fitSlot.appendChild(createUpscaleToggle((allow) => (uploadAllowUpscale = allow)));
    } else if (mode === 'collage') {
      collagePanelHandle = createCollagePanel(
        (entries) => {
          const removedIds = new Set(collageEntries.map((e) => e.id));
          entries.forEach((e) => removedIds.delete(e.id));
          removedIds.forEach((id) => collageTreatments.delete(id));
          collageEntries = entries;
          void refreshCollageLayout();
        },
        (entry, index) => void openCollageEditor(entry, index),
        (id) => describeTreatment(collageTreatments.get(id)),
      );
      sourceSlot.appendChild(collagePanelHandle.element);
      fitSlot.appendChild(createUpscaleToggle((allow) => (collageAllowUpscale = allow)));
    } else {
      sourceSlot.appendChild(createGeneratorPanel((s) => (generatorSelection = s)));
      // Generators always fill the target exactly — no fit mode or upscale
      // guard applies, so the fit panel is simply not shown in this mode.
    }
  }
  renderSource();

  uploadTab.addEventListener('click', () => {
    mode = 'upload';
    setActiveTab(uploadTab, [collageTab, generateTab]);
    renderSource();
  });
  collageTab.addEventListener('click', () => {
    mode = 'collage';
    setActiveTab(collageTab, [uploadTab, generateTab]);
    renderSource();
  });
  generateTab.addEventListener('click', () => {
    mode = 'generate';
    setActiveTab(generateTab, [uploadTab, collageTab]);
    renderSource();
  });
  setActiveTab(uploadTab, [collageTab, generateTab]);

  createButton.addEventListener('click', async () => {
    createButton.disabled = true;
    const originalText = createButton.textContent;
    createButton.textContent = 'Working…';
    try {
      let blob: Blob;
      if (mode === 'upload') {
        if (!file) throw new Error('Choose a photo or GIF first.');
        blob =
          file.type === 'image/gif'
            ? // GIFs are always Cover — animated Fit/contain isn't
              // implemented (see DESIGN.md), so there's no treatment to pick.
              await processGif(file, target, { mode: 'cover', allowUpscale: uploadAllowUpscale })
            : await processPhoto(
                file,
                target,
                uploadAllowUpscale,
                uploadTreatment ?? { fitMode: DEFAULT_FIT_MODE },
              );
      } else if (mode === 'collage') {
        if (collageEntries.length < MIN_COLLAGE_PHOTOS || collageEntries.length > MAX_COLLAGE_PHOTOS) {
          throw new Error(`Choose between ${MIN_COLLAGE_PHOTOS} and ${MAX_COLLAGE_PHOTOS} photos.`);
        }
        const files = collageEntries.map((e) => e.file);
        const treatments = collageEntries.map((e) => collageTreatments.get(e.id));
        blob = await processCollage(files, target, { allowUpscale: collageAllowUpscale }, treatments);
      } else {
        const { width, height } = resolveDimensions(target, presets);
        blob = await generate(generatorSelection.style, generatorSelection.seed, width, height);
      }
      preview.show(blob);
    } catch (err) {
      preview.showError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      createButton.disabled = false;
      createButton.textContent = originalText;
    }
  });
}

main();
