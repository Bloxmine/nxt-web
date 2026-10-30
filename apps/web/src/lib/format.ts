/** "7.85 V" */
export function formatBattery(millivolts: number): string {
  return `${(millivolts / 1000).toFixed(2)} V`;
}

/** "12.3 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
