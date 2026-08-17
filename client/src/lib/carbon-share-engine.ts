/**
 * Carbon Share Engine
 * Handles impact computation, SVG generation, and PNG export using native Canvas API.
 */

export interface CarbonImpactData {
  totalKwh: number;
  totalCo2Kg: number;
  treesEquivalent: number;
  kmNotDrivenPetrol: number;
  sessionCount: number;
  userName: string;
  generatedAt: Date;
}

export interface ShareResult {
  method: 'web_share' | 'download' | 'clipboard' | 'error';
  success: boolean;
  error?: string;
}

/**
 * Computes impact data from a list of completed bookings.
 */
export function computeImpactData(
  bookings: Array<{ kwhDelivered: number; status: string }>,
  userName: string
): CarbonImpactData {
  const completed = bookings.filter(b => b.status === 'completed');
  const totalKwh = completed.reduce(
    (sum, b) => sum + (Number(b.kwhDelivered) || 0), 0
  );
  
  // 0.82 kg CO2 offset per kWh vs ICE vehicle (Indian grid average)
  const totalCo2Kg = totalKwh * 0.82;
  
  // 1 tree absorbs ~21.7 kg CO2/year (FAO standard)
  const treesEquivalent = Math.round(totalCo2Kg / 21.7);
  
  // avg petrol car: ~6.5 km per kWh-equivalent of CO2 saved
  const kmNotDrivenPetrol = Math.round(totalKwh * 6.5);

  return {
    totalKwh,
    totalCo2Kg,
    treesEquivalent,
    kmNotDrivenPetrol,
    sessionCount: completed.length,
    userName,
    generatedAt: new Date()
  };
}

/**
 * Returns separate value and unit for large type treatment.
 */
export function formatCo2Display(kg: number): { value: string; unit: string } {
  if (kg < 1) return {
    value: (kg * 1000).toFixed(0),
    unit: 'g CO₂ offset'
  };
  if (kg < 1000) return {
    value: kg.toFixed(1),
    unit: 'kg CO₂ offset'
  };
  return {
    value: (kg / 1000).toFixed(2),
    unit: 'tonnes CO₂ offset'
  };
}

/**
 * Generates the shareable SVG as a string.
 * 
 * JSDOC:
 * - CSS variables are NOT used as they won't resolve in canvas export.
 * - linearGradient is avoided for broader browser compatibility in exports.
 * - System fonts used to ensure consistent rendering without embedding.
 * - viewBox="0 0 400 560" ensures responsive scaling in the UI.
 */
export function generateShareSVG(data: CarbonImpactData): string {
  const co2 = formatCo2Display(data.totalCo2Kg);
  const dateStr = data.generatedAt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  
  const kmDisplay = data.kmNotDrivenPetrol > 999 
    ? `${(data.kmNotDrivenPetrol/1000).toFixed(1)}k` 
    : data.kmNotDrivenPetrol;

  const treeValue = data.treesEquivalent > 0 ? data.treesEquivalent : '<1';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560">
  <!-- BACKGROUND -->
  <rect width="400" height="560" fill="#0f2419" rx="0"/>
  
  <!-- DECORATIVE ELEMENTS -->
  <circle cx="380" cy="-20" r="160" fill="#166534" opacity="0.4"/>
  <circle cx="20" cy="520" r="80" fill="#166534" opacity="0.3"/>

  <!-- BRANDING -->
  <g transform="translate(28, 36)">
    <polygon points="22,20 14,36 20,36 16,52 28,32 22,32" fill="#4ade80" transform="translate(-14, -20)"/>
    <text x="32" y="14" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#4ade80" letter-spacing="0.5">SeniorDevOps</text>
    <text x="32" y="30" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#86efac" letter-spacing="1">EV CHARGING PLATFORM</text>
  </g>
  
  <text x="372" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#86efac" text-anchor="end">${data.userName.slice(0, 20)}</text>

  <line x1="28" y1="84" x2="372" y2="84" stroke="#166534" stroke-width="1"/>

  <!-- MAIN HEADLINE -->
  <text x="200" y="148" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="#86efac" font-weight="400">I've helped offset</text>
  
  <text x="200" y="230" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="72" fill="#ffffff" font-weight="800" letter-spacing="-2">${co2.value}</text>
  <text x="200" y="262" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#4ade80" font-weight="600" letter-spacing="1">${co2.unit.toUpperCase()}</text>
  
  <text x="200" y="300" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#86efac" font-weight="400">by charging my EV ⚡</text>
  
  <!-- Safety fallback polygon for emoji rendering issues -->
  <polygon points="315,285 307,301 313,301 309,317 321,297 315,297" fill="#4ade80" opacity="0"/>

  <!-- STAT PILLS -->
  <g transform="translate(20, 340)">
    <!-- Pill 1: Trees -->
    <rect width="110" height="70" rx="12" fill="#166534"/>
    <text x="55" y="30" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${treeValue}</text>
    <text x="55" y="50" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#86efac" letter-spacing="0.5">TREES / YEAR 🌳</text>
  </g>

  <g transform="translate(145, 340)">
    <!-- Pill 2: Sessions -->
    <rect width="110" height="70" rx="12" fill="#166534"/>
    <text x="55" y="30" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${data.sessionCount}</text>
    <text x="55" y="50" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#86efac" letter-spacing="0.5">CHARGES DONE ⚡</text>
  </g>

  <g transform="translate(270, 340)">
    <!-- Pill 3: KM -->
    <rect width="110" height="70" rx="12" fill="#166534"/>
    <text x="55" y="30" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${kmDisplay}</text>
    <text x="55" y="50" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#86efac" letter-spacing="0.5">KM NOT PETROL 🚗</text>
  </g>

  <!-- CONTEXT -->
  <text x="200" y="460" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#86efac">${data.totalKwh.toFixed(1)} kWh of clean energy delivered</text>

  <!-- FOOTER -->
  <text x="28" y="520" font-size="10" fill="#166534" font-family="system-ui, -apple-system, sans-serif">Generated ${dateStr}</text>
  <text x="200" y="520" text-anchor="middle" font-size="10" fill="#166534" font-family="system-ui, -apple-system, sans-serif">Join the EV movement</text>
  <text x="372" y="520" text-anchor="end" font-size="10" fill="#166534" font-family="system-ui, -apple-system, sans-serif">seniordevops.app</text>
  
  <rect x="0" y="545" width="400" height="4" fill="#4ade80" rx="0"/>
</svg>
  `.trim();
}

/**
 * Exports the SVG string to a PNG Blob using Canvas.
 * 
 * JSDOC:
 * - Uses Blob URL instead of base64 to avoid encoding issues with Unicode/Emoji.
 * - Implements 2x scaling (Retina quality) for sharper image export.
 * - Fills background with solid color first to prevent transparent artifacts on mobile OS galleries.
 * - Revokes Blob URL immediately after drawing to prevent memory leaks.
 */
export async function exportSVGtoPNG(svgString: string): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.width = 400;
    img.height = 560;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const SCALE = 2;
      canvas.width = 400 * SCALE;
      canvas.height = 560 * SCALE;

      const ctx = canvas.getContext('2d')!;
      ctx.scale(SCALE, SCALE);

      // White background fallback for iOS camera roll
      ctx.fillStyle = '#0f2419';
      ctx.fillRect(0, 0, 400, 560);

      ctx.drawImage(img, 0, 0, 400, 560);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/png',
        1.0
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('SVG load failed: ' + String(err)));
    };

    img.src = svgUrl;
  });
}

/**
 * Export with emoji fallback for older Android/Browser versions.
 */
export async function exportSVGtoPNGWithFallback(
  svgString: string
): Promise<{ blob: Blob; usedFallback: boolean }> {
  try {
    const blob = await exportSVGtoPNG(svgString);
    return { blob, usedFallback: false };
  } catch (err) {
    console.warn('[SeniorDevOps Share] SVG export failed, retrying without emoji:', err);
    // Strip emoji and replace labels
    const stripped = svgString
      .replace(/🌳/g, '')
      .replace(/⚡/g, '')
      .replace(/🚗/g, '')
      .replace(/TREES \/ YEAR/g, 'TREES PER YEAR')
      .replace(/CHARGES DONE/g, 'CHARGES DONE')
      .replace(/KM NOT PETROL/g, 'KM AVOIDED');
    
    const blob = await exportSVGtoPNG(stripped);
    return { blob, usedFallback: true };
  }
}

/**
 * Shares the image using Web Share API or falls back to direct download.
 * 
 * JSDOC:
 * - Detects 'canShare' for file support (iOS Safari 15+, Android Chrome 89+).
 * - Gracefully handles 'AbortError' when users close the system share sheet.
 * - Adheres to iOS Safari's strict user-activation requirement by keeping the 
 *   execution chain direct from click to share.
 */
export async function shareOrDownload(
  blob: Blob,
  data: CarbonImpactData
): Promise<ShareResult> {
  const fileName = `seniordevops-impact-${data.totalCo2Kg.toFixed(0)}kg-co2.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  const co2 = formatCo2Display(data.totalCo2Kg);
  const shareText = `I've offset ${co2.value} ${co2.unit} of CO₂ by charging my EV with SeniorDevOps! 🌱⚡ #EVCharging #CleanEnergy #SeniorDevOps`;

  // Try Web Share with file
  const canShareFiles = (navigator as any).canShare?.({ files: [file] }) ?? false;

  if (navigator.share && canShareFiles) {
    try {
      await navigator.share({
        files: [file],
        title: 'My EV Impact',
        text: shareText
      });
      return { method: 'web_share', success: true };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { method: 'web_share', success: false, error: 'User cancelled' };
      }
      console.warn('[SeniorDevOps Share] Web Share failed:', err);
    }
  }

  // Text-only fallback
  if (navigator.share) {
    try {
      await navigator.share({ title: 'My EV Impact', text: shareText });
      return { method: 'web_share', success: true };
    } catch { /* Fall through */ }
  }

  // Download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  
  return { method: 'download', success: true };
}
