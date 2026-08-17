/**
 * [EVPlugFinder] Session Share Engine
 * Handles Canvas-based generation of shareable session cards.
 * No React/Firebase dependencies.
 */

export interface SessionShareData {
  stationName: string;
  sessionDate: Date;
  energyDelivered: number;    // kWh
  durationMinutes: number;
  totalCost: number;          // INR
  connectorType: string;
}

/**
 * Formats duration into a human-readable string.
 * e.g., 90 -> '1h 30m', 45 -> '45m'
 */
export function formatDurationMinutes(mins: number): string {
  const hours = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  
  if (hours === 0) return `${remainingMins}m`;
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Calculates CO2 offset based on energy delivered.
 * Formula: 0.82 kg/kWh
 */
export function formatCo2(energyKwh: number): string {
  const grams = energyKwh * 820; // 0.82 kg/kWh = 820 g/kWh
  if (grams < 1000) return `${Math.round(grams)}g`;
  return `${(grams / 1000).toFixed(2)}kg`;
}

/**
 * Utility to wrap text on Canvas
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let testY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, testY);
      line = words[n] + ' ';
      testY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, testY);
  return testY;
}

/**
 * Draws the session card to a provided canvas element.
 * Dimensions: 400x700px (logical), 800x1400px (actual retina)
 */
export function drawSessionCard(
  canvas: HTMLCanvasElement,
  data: SessionShareData
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set logical dimensions
  const width = 400;
  const height = 700;
  
  // Set physical dimensions for Retina
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  // Scale context for retina
  ctx.scale(2, 2);

  // 1. Background Gradient
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle Grid Pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let i = 0; i < height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }

  // 3. Top Badge: EVPLUGFINDER
  ctx.fillStyle = '#22c55e'; // Primary Green
  ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EVPLUGFINDER', width / 2, 60);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '9px -apple-system, system-ui, sans-serif';
  ctx.fillText('CHARGING SESSION', width / 2, 75);

  // 4. Station Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const stationY = wrapText(ctx, data.stationName, width / 2, 140, 320, 36);

  // 5. Date
  const dateStr = data.sessionDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ' · ' + data.sessionDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
  ctx.fillText(dateStr, width / 2, stationY + 30);

  // 6. Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(60, stationY + 60);
  ctx.lineTo(width - 60, stationY + 60);
  ctx.stroke();

  // 7. Stats Grid (2x2)
  const gridY = stationY + 120;
  const col1 = width * 0.3;
  const col2 = width * 0.7;

  // Energy
  drawStat(ctx, col1, gridY, `${data.energyDelivered.toFixed(1)}`, 'kWh Delivered', '#3b82f6');
  // Duration
  drawStat(ctx, col2, gridY, formatDurationMinutes(data.durationMinutes), 'Time Spent', '#a855f7');
  // Cost
  drawStat(ctx, col1, gridY + 120, `₹${Math.round(data.totalCost)}`, 'Total Cost', '#22c55e');
  // CO2
  drawStat(ctx, col2, gridY + 120, formatCo2(data.energyDelivered), 'CO₂ Offset', '#10b981');

  // 8. CO2 Visual: Leaf Path
  const leafX = col2;
  const leafY = gridY + 120 - 45;
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leafX, leafY);
  ctx.bezierCurveTo(leafX + 10, leafY - 10, leafX + 10, leafY - 20, leafX, leafY - 20);
  ctx.bezierCurveTo(leafX - 10, leafY - 20, leafX - 10, leafY - 10, leafX, leafY);
  ctx.moveTo(leafX, leafY);
  ctx.lineTo(leafX, leafY - 20);
  ctx.stroke();

  // 9. Bottom Gradient Strip
  const footerH = 60;
  const footerY = height - footerH;
  const footGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footGradient.addColorStop(0, '#22c55e');
  footGradient.addColorStop(1, '#10b981');
  ctx.fillStyle = footGradient;
  ctx.fillRect(0, footerY, width, footerH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Charged green · Powered by EVPlugFinder', width / 2, height - 25);
}

function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, label: string, color: string) {
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 32px -apple-system, system-ui, sans-serif';
  ctx.fillText(value, x, y);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 10px -apple-system, system-ui, sans-serif';
  ctx.fillText(label.toUpperCase(), x, y + 20);
}

/**
 * Exports the session card as a PNG blob.
 * Uses an off-screen canvas.
 */
export async function exportSessionCardBlob(
  data: SessionShareData
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawSessionCard(canvas, data);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, 'image/png');
  });
}
