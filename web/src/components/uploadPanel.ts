export interface UploadPanelHandle {
  element: HTMLElement;
  setTreatmentLabel(label: string | null): void;
}

export function createUploadPanel(
  onFile: (file: File | null) => void,
  onEdit: (file: File) => void,
): UploadPanelHandle {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section dropzone';

  const hint = document.createElement('p');
  hint.className = 'dropzone-hint';
  hint.textContent = 'Choose a photo or GIF. Nothing here gets saved.';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.className = 'file-input';

  const fileRow = document.createElement('div');
  fileRow.className = 'upload-file-row';
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  const treatmentBadge = document.createElement('span');
  treatmentBadge.className = 'crop-badge';
  treatmentBadge.hidden = true;
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'thumb-edit-button';
  editButton.textContent = '✎';
  editButton.hidden = true;
  editButton.setAttribute('aria-label', 'Edit photo');
  fileRow.append(fileName, treatmentBadge, editButton);

  let currentFile: File | null = null;

  function setCurrentFile(file: File | null): void {
    currentFile = file;
    fileName.textContent = file?.name ?? '';
    // GIFs always use the automatic Cover fit — the editor only applies to
    // static photos (animated Fit/contain isn't implemented — see DESIGN.md).
    editButton.hidden = !file || file.type === 'image/gif';
    treatmentBadge.hidden = true;
    onFile(file);
  }

  input.addEventListener('change', () => setCurrentFile(input.files?.[0] ?? null));
  editButton.addEventListener('click', () => {
    if (currentFile) onEdit(currentFile);
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
    if (file) setCurrentFile(file);
  });

  wrap.append(hint, input, fileRow);

  return {
    element: wrap,
    setTreatmentLabel(label) {
      treatmentBadge.textContent = label ?? '';
      treatmentBadge.hidden = !label;
    },
  };
}
