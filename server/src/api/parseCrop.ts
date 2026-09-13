import type { CropSpec } from '../pipeline/shared/cropSpec.js';
import { PipelineError } from '../pipeline/errors.js';
import { cropSpecSchema } from './schemas.js';

// Multipart fields only carry strings, so a crop spec travels as a JSON
// string in a form field (`crop` for a single photo, `crop_0`.."crop_8" for
// a collage) rather than structured JSON body.
export function parseCropField(value: string | undefined): CropSpec | undefined {
  if (value === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PipelineError('Invalid crop data: not valid JSON.', 400, 'INVALID_CROP');
  }

  const result = cropSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new PipelineError(
      `Invalid crop data: ${result.error.issues.map((i) => i.message).join('; ')}`,
      400,
      'INVALID_CROP',
    );
  }
  return result.data;
}
