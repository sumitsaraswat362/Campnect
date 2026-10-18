export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

  const patterns: Record<HapticStyle, number | number[]> = {
    light: 15,
    medium: 35,
    heavy: 60,
    success: [20, 50, 30],
    warning: [40, 60, 40],
    error: [60, 80, 60, 80],
  };

  try {
    navigator.vibrate(patterns[style]);
  } catch {
    // Ignore unsupported devices
  }
}
