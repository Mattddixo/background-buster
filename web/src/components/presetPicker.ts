import type { DevicePreset } from '../api.js';
import type { DetectedTarget } from '../deviceTarget.js';

export interface TargetSelection {
  presetId?: string;
  width?: number;
  height?: number;
}

export function createPresetPicker(
  presets: DevicePreset[],
  detected: DetectedTarget | null,
  onChange: (target: TargetSelection) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section';

  const label = document.createElement('label');
  label.textContent = 'Target';
  label.className = 'panel-label';

  const select = document.createElement('select');
  select.className = 'field';

  if (detected) {
    const option = document.createElement('option');
    option.value = detected.id;
    option.textContent = `${detected.label} — ${detected.width}×${detected.height}`;
    select.appendChild(option);
  }

  const categories: Array<{ key: DevicePreset['category']; label: string }> = [
    { key: 'phone', label: 'Phone' },
    { key: 'desktop', label: 'Desktop' },
    { key: 'tv', label: 'TV' },
  ];
  for (const category of categories) {
    const matching = presets.filter((p) => p.category === category.key);
    if (!matching.length) continue;
    const group = document.createElement('optgroup');
    group.label = category.label;
    for (const preset of matching) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = `${preset.label} — ${preset.width}×${preset.height}`;
      group.appendChild(option);
    }
    select.appendChild(group);
  }

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom size…';
  select.appendChild(customOption);

  const customRow = document.createElement('div');
  customRow.className = 'custom-size-row';
  customRow.hidden = true;
  const widthInput = createNumberField('Width');
  const heightInput = createNumberField('Height');
  customRow.append(widthInput, heightInput);

  function emit(): void {
    if (select.value === 'custom') {
      const width = Number(widthInput.value);
      const height = Number(heightInput.value);
      if (width > 0 && height > 0) onChange({ width, height });
      return;
    }
    if (detected && select.value === detected.id) {
      onChange({ width: detected.width, height: detected.height });
      return;
    }
    onChange({ presetId: select.value });
  }

  select.addEventListener('change', () => {
    customRow.hidden = select.value !== 'custom';
    emit();
  });
  widthInput.addEventListener('input', emit);
  heightInput.addEventListener('input', emit);

  emit();

  wrap.append(label, select, customRow);
  return wrap;
}

function createNumberField(placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.inputMode = 'numeric';
  input.placeholder = placeholder;
  input.className = 'field field-narrow';
  return input;
}
