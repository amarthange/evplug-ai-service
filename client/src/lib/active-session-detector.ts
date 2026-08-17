export function formatElapsed(startTime: Date): string {
  const diffMs = Date.now() - startTime.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function estimateCurrentCost(
  startTime: Date,
  pricePerKwh: number,
  powerKw: number
): number {
  const hoursElapsed = (Date.now() - startTime.getTime()) / 3600000;
  const kwhEstimate = hoursElapsed * powerKw * 0.85; // 85% efficiency
  return Math.round(kwhEstimate * pricePerKwh * 100) / 100;
}
