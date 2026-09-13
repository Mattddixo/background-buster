import { presets } from './data.js';
import type { DevicePreset } from './data.js';

export { presets };
export type { DevicePreset };

export function findPreset(id: string): DevicePreset | undefined {
  return presets.find((p) => p.id === id);
}

export function matchPresetsByAspect(width: number, height: number): DevicePreset[] {
  const aspect = width / height;
  return [...presets].sort(
    (a, b) => Math.abs(a.width / a.height - aspect) - Math.abs(b.width / b.height - aspect),
  );
}
