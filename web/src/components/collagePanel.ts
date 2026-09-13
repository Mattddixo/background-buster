export interface CollageSelection {
  files: File[];
}

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 9;

export function createCollagePanel(onChange: (selection: CollageSelection) => void): HTMLElement {
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

  let files: File[] = [];
  let objectUrls: string[] = [];

  function emit(): void {
    onChange({ files });
    count.textContent = `${files.length} / ${MAX_PHOTOS}`;
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
          const [moved] = files.splice(fromIndex, 1);
          files.splice(toIndex, 0, moved);
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
    list.innerHTML = '';

    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
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

      const name = document.createElement('span');
      name.className = 'collage-name';
      name.textContent = file.name;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.addEventListener('click', () => {
        files.splice(index, 1);
        renderList();
        emit();
      });

      row.append(handle, thumb, name, remove);
      list.appendChild(row);
      attachDrag(row, handle, () => Array.from(list.children).indexOf(row));
    });
  }

  input.addEventListener('change', () => {
    const incoming = Array.from(input.files ?? []);
    files = [...files, ...incoming].slice(0, MAX_PHOTOS);
    input.value = '';
    renderList();
    emit();
  });

  renderList();
  emit();

  wrap.append(hint, list, addRow);
  return wrap;
}
