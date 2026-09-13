export interface DevicePreset {
  id: string;
  label: string;
  category: 'phone' | 'desktop' | 'tv';
  width: number;
  height: number;
}

export const presets: DevicePreset[] = [
  { id: 'phone-portrait', label: 'Phone (portrait)', category: 'phone', width: 1290, height: 2796 },
  { id: 'phone-landscape', label: 'Phone (landscape)', category: 'phone', width: 2796, height: 1290 },
  { id: 'phone-portrait-compact', label: 'Phone, compact (portrait)', category: 'phone', width: 1080, height: 2340 },
  { id: 'desktop-1080p', label: 'Desktop 1080p', category: 'desktop', width: 1920, height: 1080 },
  { id: 'desktop-1440p', label: 'Desktop 1440p', category: 'desktop', width: 2560, height: 1440 },
  { id: 'desktop-4k', label: 'Desktop 4K', category: 'desktop', width: 3840, height: 2160 },
  { id: 'desktop-ultrawide', label: 'Ultrawide', category: 'desktop', width: 3440, height: 1440 },
  { id: 'tv-4k', label: 'TV 4K', category: 'tv', width: 3840, height: 2160 },
  { id: 'tv-8k', label: 'TV 8K', category: 'tv', width: 7680, height: 4320 },
];
