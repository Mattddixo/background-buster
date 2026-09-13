// A manual crop rectangle, as chosen by a user in the photo editor. Fully
// declarative and resolution-independent: x/y/width/height are fractions
// (0..1) of the image after orientation (see orientation.ts) is applied, so
// the same spec produces the same crop regardless of the actual source
// pixel dimensions on either side of the wire (the client's downscaled
// preview vs. the server's full-res original).
//
// Deliberately does not carry rotation or flip — those apply universally
// regardless of fit mode (see orientation.ts) and are meaningless without a
// crop rectangle attached to them, unlike orientation which stands alone.
export interface CropSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}
