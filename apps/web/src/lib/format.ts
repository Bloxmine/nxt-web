/** "7.85 V" */
/** Below this the brick's motors weaken and sensors read oddly (6 AA cells: 9 V when fresh). */
export const LOW_BATTERY_MV = 6800;

export function formatBattery(millivolts: number): string {
  return `${(millivolts / 1000).toFixed(2)} V`;
}

/** "12.3 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
