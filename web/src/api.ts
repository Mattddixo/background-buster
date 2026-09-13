import type { PhotoTreatment, FitMode } from './cropSpec.js';

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

export interface CellLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollageLayout {
  rows: number;
  cols: number;
  gutter: number;
  cells: CellLayout[];
}

export async function fetchPresets(): Promise<DevicePreset[]> {
  const res = await fetch('/api/presets');
  if (!res.ok) throw new Error('Failed to load presets.');
  return res.json();
}

// The grid math (which cell is where, how big) lives once on the server and
// is fetched here rather than reimplemented client-side, so the editor's
// crop frame and the final render can never disagree about cell geometry.
export async function fetchCollageLayout(
  count: number,
  target: { width: number; height: number },
): Promise<CollageLayout> {
  const params = new URLSearchParams({
    count: String(count),
    width: String(target.width),
    height: String(target.height),
  });
  const res = await fetch(`/api/collage/layout?${params}`);
  if (!res.ok) throw new Error('Failed to compute collage layout.');
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
export async function processPhoto(
  file: File,
  target: TargetInput,
  allowUpscale: boolean,
  treatment: PhotoTreatment,
): Promise<Blob> {
  const form = buildForm(target, { mode: treatment.fitMode, allowUpscale });
  if (treatment.orientation) form.set('orientation', JSON.stringify(treatment.orientation));
  if (treatment.crop) form.set('crop', JSON.stringify(treatment.crop));
  form.set('file', file);
  const res = await fetch('/api/photo', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function processGif(
  file: File,
  target: TargetInput,
  options: { mode: FitMode; allowUpscale?: boolean },
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
  treatments: Array<PhotoTreatment | undefined>,
): Promise<Blob> {
  const form = buildForm(target, options);
  files.forEach((_, i) => {
    const treatment = treatments[i];
    if (treatment) form.set(`treatment_${i}`, JSON.stringify(treatment));
  });
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
