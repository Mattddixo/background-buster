import { fetchPresets, processPhoto, processGif, processCollage, generate, type DevicePreset } from './api.js';
import { detectDeviceTarget } from './deviceTarget.js';
import { createPresetPicker, type TargetSelection } from './components/presetPicker.js';
import { createFitControls, createUpscaleToggle, type FitSelection } from './components/controls.js';
import { createUploadPanel } from './components/uploadPanel.js';
import { createCollagePanel, type CollageSelection } from './components/collagePanel.js';
import { createGeneratorPanel, type GeneratorSelection } from './components/generatorPanel.js';
import { createPreview } from './components/preview.js';

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
  let collageFiles: File[] = [];
  let target: TargetSelection = {};
  let fit: FitSelection = { mode: 'cover', allowUpscale: false };
  let collageAllowUpscale = false;
  let generatorSelection: GeneratorSelection = { style: 'gradient', seed: 'seed' };

  const presets = await fetchPresets();
  const detected = detectDeviceTarget();

  presetSlot.appendChild(createPresetPicker(presets, detected, (t) => (target = t)));

  function renderSource(): void {
    sourceSlot.innerHTML = '';
    fitSlot.innerHTML = '';

    if (mode === 'upload') {
      sourceSlot.appendChild(createUploadPanel((f) => (file = f)));
      fitSlot.appendChild(createFitControls((f) => (fit = f)));
    } else if (mode === 'collage') {
      sourceSlot.appendChild(createCollagePanel((s: CollageSelection) => (collageFiles = s.files)));
      fitSlot.appendChild(
        createUpscaleToggle((allow) => {
          collageAllowUpscale = allow;
        }),
      );
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
            ? await processGif(file, target, { mode: fit.mode, allowUpscale: fit.allowUpscale })
            : await processPhoto(file, target, { mode: fit.mode, allowUpscale: fit.allowUpscale });
      } else if (mode === 'collage') {
        if (collageFiles.length < MIN_COLLAGE_PHOTOS || collageFiles.length > MAX_COLLAGE_PHOTOS) {
          throw new Error(`Choose between ${MIN_COLLAGE_PHOTOS} and ${MAX_COLLAGE_PHOTOS} photos.`);
        }
        blob = await processCollage(collageFiles, target, { allowUpscale: collageAllowUpscale });
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
