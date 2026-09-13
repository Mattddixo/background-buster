import { findPreset } from '../presets/index.js';
import { PipelineError } from '../pipeline/errors.js';

export function resolveTarget(input: { presetId?: string; width?: number; height?: number }): {
  width: number;
  height: number;
} {
  if (input.presetId) {
    const preset = findPreset(input.presetId);
    if (!preset) throw new PipelineError(`Unknown preset id: ${input.presetId}`, 400, 'UNKNOWN_PRESET');
    return { width: preset.width, height: preset.height };
  }
  return { width: input.width as number, height: input.height as number };
}
