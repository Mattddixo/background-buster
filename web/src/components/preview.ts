export interface Preview {
  element: HTMLElement;
  show(blob: Blob): void;
  showError(message: string): void;
}

export function createPreview(): Preview {
  const wrap = document.createElement('div');
  wrap.className = 'preview';

  const img = document.createElement('img');
  img.className = 'preview-image';
  img.hidden = true;
  img.alt = 'Generated background preview';

  const message = document.createElement('p');
  message.className = 'preview-message';
  message.textContent = 'Nothing generated yet.';

  // `target="_blank"` is a mobile fallback: some mobile browsers don't honor
  // the `download` attribute on a same-origin blob URL, but opening the image
  // in a new tab still lets you long-press → save to Photos.
  const downloadLink = document.createElement('a');
  downloadLink.className = 'button button-primary';
  downloadLink.textContent = 'Download';
  downloadLink.target = '_blank';
  downloadLink.rel = 'noopener';
  downloadLink.hidden = true;

  wrap.append(img, message, downloadLink);

  let currentUrl: string | null = null;

  function show(blob: Blob): void {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(blob);
    img.src = currentUrl;
    img.hidden = false;
    message.hidden = true;
    message.classList.remove('preview-message-error');
    downloadLink.href = currentUrl;
    downloadLink.download = `background.${blob.type.split('/')[1] ?? 'png'}`;
    downloadLink.hidden = false;
  }

  function showError(text: string): void {
    message.textContent = text;
    message.hidden = false;
    message.classList.add('preview-message-error');
    downloadLink.hidden = true;
  }

  return { element: wrap, show, showError };
}
