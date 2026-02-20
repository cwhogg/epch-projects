/**
 * Convert a hex color to its relative luminance (WCAG 2.0 formula).
 * Returns 0 for invalid/unparseable hex values.
 */
export function hexToLuminance(hex: string): number {
  const stripped = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(stripped)) return 0;
  const rgb = stripped.match(/.{2}/g)!;
  const [r, g, b] = rgb.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio between two hex colors.
 * Result range: 1 (identical) to 21 (black/white).
 * WCAG AA requires >= 4.5:1 for normal text.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
