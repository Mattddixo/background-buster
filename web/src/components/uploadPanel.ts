export function createUploadPanel(onFile: (file: File | null) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section dropzone';

  const hint = document.createElement('p');
  hint.className = 'dropzone-hint';
  hint.textContent = 'Choose a photo or GIF. Nothing here gets saved.';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.className = 'file-input';
  input.addEventListener('change', () => onFile(input.files?.[0] ?? null));

  const fileName = document.createElement('p');
  fileName.className = 'file-name';

  input.addEventListener('change', () => {
    fileName.textContent = input.files?.[0]?.name ?? '';
  });

  // Drag-and-drop is a desktop-only convenience; touch devices just use the
  // native file input above, which already opens the OS photo picker.
  wrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    wrap.classList.add('dropzone-active');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dropzone-active'));
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('dropzone-active');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      onFile(file);
      fileName.textContent = file.name;
    }
  });

  wrap.append(hint, input, fileName);
  return wrap;
}
