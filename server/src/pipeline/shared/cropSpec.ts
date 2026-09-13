// A manual crop, as chosen by a user in the photo editor. Fully declarative
// and resolution-independent: x/y/width/height are fractions (0..1) of the
// image AFTER rotation and flip are applied, so the same spec produces the
// same crop regardless of the actual source pixel dimensions on either side
// of the wire (the client's downscaled preview vs. the server's full-res
// original).
export interface CropSpec {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
