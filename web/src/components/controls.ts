export interface FitSelection {
  mode: 'cover' | 'contain-blur' | 'contain-pad';
  allowUpscale: boolean;
}

const MODES: Array<[FitSelection['mode'], string]> = [
  ['cover', 'Cover (smart crop)'],
  ['contain-blur', 'Contain, blurred backdrop'],
  ['contain-pad', 'Contain, solid pad'],
];

export function createFitControls(onChange: (selection: FitSelection) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section';

  const label = document.createElement('label');
  label.textContent = 'Fit';
  label.className = 'panel-label';

  const select = document.createElement('select');
  select.className = 'field';
  for (const [value, text] of MODES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }

  const upscaleRow = document.createElement('label');
  upscaleRow.className = 'checkbox-row';
  const upscaleBox = document.createElement('input');
  upscaleBox.type = 'checkbox';
  upscaleRow.append(upscaleBox, document.createTextNode('Allow upscaling past source resolution'));

  function emit(): void {
    onChange({ mode: select.value as FitSelection['mode'], allowUpscale: upscaleBox.checked });
  }
  select.addEventListener('change', emit);
  upscaleBox.addEventListener('change', emit);
  emit();

  wrap.append(label, select, upscaleRow);
  return wrap;
}
