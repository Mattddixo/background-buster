import { fetchPresets, processPhoto, processGif, generate, type DevicePreset } from './api.js';
import { detectDeviceTarget } from './deviceTarget.js';
import { createPresetPicker, type TargetSelection } from './components/presetPicker.js';
import { createFitControls, type FitSelection } from './components/controls.js';
import { createUploadPanel } from './components/uploadPanel.js';
import { createGeneratorPanel, type GeneratorSelection } from './components/generatorPanel.js';
import { createPreview } from './components/preview.js';

type SourceMode = 'upload' | 'generate';

function tabButton(text: string, active: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = active ? 'tab tab-active' : 'tab';
  return button;
}

function setActiveTab(active: HTMLButtonElement, inactive: HTMLButtonElement): void {
  active.classList.add('tab-active');
  inactive.classList.remove('tab-active');
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
  const uploadTab = tabButton('Upload', true);
  const generateTab = tabButton('Generate', false);
  modeTabs.append(uploadTab, generateTab);

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
  let target: TargetSelection = {};
  let fit: FitSelection = { mode: 'cover', allowUpscale: false };
  let generatorSelection: GeneratorSelection = { style: 'gradient', seed: 'seed' };

  const [presets] = await Promise.all([fetchPresets()]);
  const detected = detectDeviceTarget();

  presetSlot.appendChild(createPresetPicker(presets, detected, (t) => (target = t)));
  fitSlot.appendChild(createFitControls((f) => (fit = f)));

  function renderSource(): void {
    sourceSlot.innerHTML = '';
    if (mode === 'upload') {
      sourceSlot.appendChild(createUploadPanel((f) => (file = f)));
    } else {
      sourceSlot.appendChild(createGeneratorPanel((s) => (generatorSelection = s)));
    }
  }
  renderSource();

  uploadTab.addEventListener('click', () => {
    mode = 'upload';
    setActiveTab(uploadTab, generateTab);
    renderSource();
  });
  generateTab.addEventListener('click', () => {
    mode = 'generate';
    setActiveTab(generateTab, uploadTab);
    renderSource();
  });

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
