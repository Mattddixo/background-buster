export interface CollageEntry {
  id: number;
  file: File;
}

export interface CollagePanelHandle {
  element: HTMLElement;
  setCropStatus(id: number, active: boolean): void;
  clearAllCropBadges(): void;
}

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 9;

let nextId = 1;

export function createCollagePanel(
  onChange: (entries: CollageEntry[]) => void,
  onEdit: (entry: CollageEntry, index: number) => void,
  hasCrop: (id: number) => boolean,
): CollagePanelHandle {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section';

  const hint = document.createElement('p');
  hint.className = 'dropzone-hint';
  hint.textContent = `Choose ${MIN_PHOTOS}–${MAX_PHOTOS} photos, drag the handle to reorder.`;

  const list = document.createElement('div');
  list.className = 'collage-list';

  const addRow = document.createElement('div');
  addRow.className = 'collage-add-row';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.multiple = true;
  input.className = 'file-input';
  const count = document.createElement('span');
  count.className = 'collage-count';
  addRow.append(input, count);

  let entries: CollageEntry[] = [];
  let objectUrls: string[] = [];
  const cropBadges = new Map<number, HTMLElement>();

  function emit(): void {
    onChange(entries);
    count.textContent = `${entries.length} / ${MAX_PHOTOS}`;
  }

  // Pointer Events cover mouse and touch identically, so dragging to reorder
  // works the same on a phone as it does with a mouse — no separate
  // touch-vs-mouse code path to keep in sync.
  function attachDrag(row: HTMLElement, handle: HTMLElement, getIndex: () => number): void {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const fromIndex = getIndex();
      handle.setPointerCapture(e.pointerId);
      row.classList.add('collage-row-dragging');

      const siblingRows = () => Array.from(list.children) as HTMLElement[];
      const rowAt = (clientY: number) =>
        siblingRows().find((r) => {
          const rect = r.getBoundingClientRect();
          return clientY >= rect.top && clientY <= rect.bottom;
        });
      const clearHover = () => siblingRows().forEach((r) => r.classList.remove('collage-row-hover'));

      function onMove(ev: PointerEvent): void {
        clearHover();
        const over = rowAt(ev.clientY);
        if (over && over !== row) over.classList.add('collage-row-hover');
      }

      function onUp(ev: PointerEvent): void {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        row.classList.remove('collage-row-dragging');
        clearHover();

        const over = rowAt(ev.clientY);
        const toIndex = over ? siblingRows().indexOf(over) : -1;
        if (toIndex !== -1 && toIndex !== fromIndex) {
          const [moved] = entries.splice(fromIndex, 1);
          entries.splice(toIndex, 0, moved);
          emit();
        }
        renderList();
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  function renderList(): void {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    cropBadges.clear();
    list.innerHTML = '';

    entries.forEach((entry, index) => {
      const url = URL.createObjectURL(entry.file);
      objectUrls.push(url);

      const row = document.createElement('div');
      row.className = 'collage-row';

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-hidden', 'true');

      const thumb = document.createElement('img');
      thumb.className = 'collage-thumb';
      thumb.src = url;
      thumb.alt = '';

      const nameCol = document.createElement('span');
      nameCol.className = 'collage-name';
      nameCol.textContent = entry.file.name;

      const cropBadge = document.createElement('span');
      cropBadge.className = 'crop-badge';
      cropBadge.textContent = 'Cropped';
      // Re-derived from the source of truth on every render (not just left
      // hidden and patched up later): renderList() re-runs on every
      // reorder, which was rebuilding this element from scratch and
      // silently dropping a crop's visible badge even though the crop
      // itself, tracked by photo id in main.ts, survived correctly — caught
      // by a browser test that dragged a cropped photo to a new position.
      cropBadge.hidden = !hasCrop(entry.id);
      cropBadges.set(entry.id, cropBadge);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'thumb-edit-button';
      editButton.textContent = '✎';
      editButton.setAttribute('aria-label', `Edit ${entry.file.name}`);
      editButton.addEventListener('click', () => onEdit(entry, entries.indexOf(entry)));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
      remove.addEventListener('click', () => {
        entries.splice(index, 1);
        renderList();
        emit();
      });

      row.append(handle, thumb, nameCol, cropBadge, editButton, remove);
      list.appendChild(row);
      attachDrag(row, handle, () => Array.from(list.children).indexOf(row));
    });
  }

  input.addEventListener('change', () => {
    const incoming = Array.from(input.files ?? []).map((file) => ({ id: nextId++, file }));
    entries = [...entries, ...incoming].slice(0, MAX_PHOTOS);
    input.value = '';
    renderList();
    emit();
  });

  renderList();
  emit();

  wrap.append(hint, list, addRow);

  return {
    element: wrap,
    setCropStatus(id, active) {
      const badge = cropBadges.get(id);
      if (badge) badge.hidden = !active;
    },
    clearAllCropBadges() {
      cropBadges.forEach((badge) => (badge.hidden = true));
    },
  };
}
