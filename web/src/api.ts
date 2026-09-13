export interface DevicePreset {
  id: string;
  label: string;
  category: 'phone' | 'desktop' | 'tv';
  width: number;
  height: number;
}

export interface TargetInput {
  presetId?: string;
  width?: number;
  height?: number;
}

export interface FitOptions {
  mode: 'cover' | 'contain-blur' | 'contain-pad';
  allowUpscale?: boolean;
}

export async function fetchPresets(): Promise<DevicePreset[]> {
  const res = await fetch('/api/presets');
  if (!res.ok) throw new Error('Failed to load presets.');
  return res.json();
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function buildForm(target: TargetInput, options: object): FormData {
  const form = new FormData();
  if (target.presetId) form.set('presetId', target.presetId);
  if (target.width) form.set('width', String(target.width));
  if (target.height) form.set('height', String(target.height));
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) form.set(key, String(value));
  }
  return form;
}

// `file` is appended last so the server (which resolves the other fields as
// soon as it reaches the file part of the multipart stream) has already seen
// every field by the time it starts reading the upload.
export async function processPhoto(file: File, target: TargetInput, options: FitOptions): Promise<Blob> {
  const form = buildForm(target, options);
  form.set('file', file);
  const res = await fetch('/api/photo', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function processGif(
  file: File,
  target: TargetInput,
  options: Pick<FitOptions, 'mode' | 'allowUpscale'>,
): Promise<Blob> {
  const form = buildForm(target, options);
  form.set('file', file);
  const res = await fetch('/api/gif', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function processCollage(
  files: File[],
  target: TargetInput,
  options: { allowUpscale?: boolean },
): Promise<Blob> {
  const form = buildForm(target, options);
  files.forEach((file) => form.append('files', file));
  const res = await fetch('/api/collage', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function generate(style: string, seed: string, width: number, height: number): Promise<Blob> {
  const res = await fetch(`/api/generate/${style}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed, width, height }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}
