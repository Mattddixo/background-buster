// Mirrors server/src/pipeline/shared/cropSpec.ts exactly — this is the only
// type duplicated between workspaces (everything else geometry-related, like
// collage grid layout, is fetched from the server instead of reimplemented
// here, see api.ts#fetchCollageLayout).
export interface CropSpec {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
