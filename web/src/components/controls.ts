export interface FitSelection {
  mode: 'cover' | 'contain-blur' | 'contain-pad';
  allowUpscale: boolean;
}

const MODES: Array<[FitSelection['mode'], string]> = [
  ['cover', 'Cover (smart crop)'],
  ['contain-blur', 'Contain, blurred backdrop'],
  ['contain-pad', 'Contain, solid pad'],
];

export function createUpscaleToggle(onChange: (allowUpscale: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'checkbox-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  row.append(box, document.createTextNode('Allow upscaling past source resolution'));
  box.addEventListener('change', () => onChange(box.checked));
  return row;
}

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

  let allowUpscale = false;
  function emit(): void {
    onChange({ mode: select.value as FitSelection['mode'], allowUpscale });
  }
  select.addEventListener('change', emit);
  const upscaleRow = createUpscaleToggle((value) => {
    allowUpscale = value;
    emit();
  });
  emit();

  wrap.append(label, select, upscaleRow);
  return wrap;
}
