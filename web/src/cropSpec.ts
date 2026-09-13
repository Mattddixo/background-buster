// Mirrors server/src/pipeline/shared/{cropSpec,orientation}.ts exactly —
// these are the only types duplicated between workspaces (everything else
// geometry-related, like collage grid layout, is fetched from the server
// instead of reimplemented here — see api.ts#fetchCollageLayout).

export interface CropSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Orientation {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export type FitMode = 'cover' | 'contain-blur' | 'contain-pad';

// Everything the editor decides about one photo. `crop` only means
// something when fitMode is 'cover' (Fill); 'contain-blur'/'contain-pad'
// (Fit) always show the whole photo, so a leftover crop from a previous
// Fill choice is never sent for those.
export interface PhotoTreatment {
  fitMode: FitMode;
  orientation?: Orientation;
  crop?: CropSpec;
}

export const DEFAULT_FIT_MODE: FitMode = 'contain-blur';

// Only shown once someone has actually visited the editor for a photo —
// before that there's nothing deliberate to report, so no label at all
// rather than implying a choice was made.
export function describeTreatment(treatment: PhotoTreatment | undefined): string | null {
  if (!treatment) return null;
  if (treatment.fitMode === 'cover') return 'Fill · custom crop';
  if (treatment.fitMode === 'contain-pad') return 'Fit · solid color';
  return 'Fit · blurred backdrop';
}
