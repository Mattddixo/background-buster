// Fit mode now lives in the photo editor (see photoEditor.ts) — Upload and
// Collage both use the editor as the one place to change it, rather than
// this sidebar also offering a second, parallel way to set the same thing.
// The only thing left that's genuinely a per-tab, not per-photo, setting is
// how far upscaling is allowed to go.
export function createUpscaleToggle(onChange: (allowUpscale: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'checkbox-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  row.append(box, document.createTextNode('Allow upscaling past source resolution'));
  box.addEventListener('change', () => onChange(box.checked));
  return row;
}
