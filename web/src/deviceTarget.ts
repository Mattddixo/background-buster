export interface DetectedTarget {
  id: 'this-device';
  label: string;
  width: number;
  height: number;
}

// On a phone, the most common thing anyone wants is "a background sized for
// the screen I'm holding" — so on a touch device we compute that directly
// from screen.width/height and devicePixelRatio, instead of making someone
// hunt through a preset list on a small screen to find their own phone.
export function detectDeviceTarget(): DetectedTarget | null {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.round(window.screen.width * dpr);
  const height = Math.round(window.screen.height * dpr);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return null;

  return { id: 'this-device', label: 'This device', width, height };
}
