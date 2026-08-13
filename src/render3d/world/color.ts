// Small hex-color helpers shared by terrain.ts's per-cell coloring and
// paletteBlend.ts's day/night lerp. Kept dependency-free (no three.js
// import) so paletteBlend.ts's pure per-field lerp stays easy to unit-test
// without a WebGL/Color-class dependency, even though callers typically
// feed the result straight into a three.js Color via .set(hexString).

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

export function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  const clamp255 = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)));
  const toHex2 = (c: number) => clamp255(c).toString(16).padStart(2, "0");
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lerps two hex colors ("#rrggbb") channel-by-channel, returning a new hex
 * string. `t=0` returns `a`, `t=1` returns `b`. */
export function lerpHexColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)]);
}
