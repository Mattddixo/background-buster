import type { ZodType } from 'zod';
import { PipelineError } from '../pipeline/errors.js';

// Multipart fields only carry strings, so structured editor state (an
// Orientation, a CropSpec, a per-photo treatment bundle) travels as a JSON
// string in a form field rather than as part of a JSON body.
export function parseJsonField<T>(value: string | undefined, schema: ZodType<T>, label: string): T | undefined {
  if (value === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PipelineError(`Invalid ${label}: not valid JSON.`, 400, 'INVALID_FIELD');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new PipelineError(
      `Invalid ${label}: ${result.error.issues.map((i) => i.message).join('; ')}`,
      400,
      'INVALID_FIELD',
    );
  }
  return result.data;
}
