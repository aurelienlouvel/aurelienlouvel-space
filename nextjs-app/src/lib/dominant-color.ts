/**
 * Couleur dominante d'un média, pour teinter l'interface autour de lui.
 *
 * Le média est réduit à une grille minuscule et chaque pixel pèse d'autant plus
 * qu'il est saturé : un fond gris ou blanc ne doit pas écraser la couleur qui
 * fait l'identité de l'image. Les sources doivent être same-origin ou CORS
 * (sinon le canvas est « tainted » et on renvoie `null`).
 */

export type RGB = [number, number, number];

const GRID = 24;

function averageOf(source: CanvasImageSource): RGB | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, GRID, GRID);
    const { data } = ctx.getImageData(0, 0, GRID, GRID);

    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const lightness = (max + min) / 510;
      // Les extrêmes (quasi noir, quasi blanc) ne portent pas de couleur.
      const usable = 1 - Math.abs(lightness - 0.5) * 1.4;
      const weight = 0.05 + saturation * saturation * Math.max(0.05, usable);
      r += data[i] * weight;
      g += data[i + 1] * weight;
      b += data[i + 2] * weight;
      total += weight;
    }
    if (total === 0) return null;
    return [r / total, g / total, b / total];
  } catch {
    return null;
  }
}

const imageCache = new Map<string, Promise<RGB | null>>();

export function colorFromImageUrl(url: string): Promise<RGB | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<RGB | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(averageOf(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

/** Image courante d'une vidéo en lecture ; `null` tant qu'aucune frame n'est décodée. */
export function colorFromVideo(video: HTMLVideoElement): RGB | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  return averageOf(video);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/**
 * Deux teintes pastel voisines pour un dégradé de fond : celle du média, et
 * une cousine décalée de quelques degrés, plus claire.
 */
export function panelGradient(color: RGB): { c1: string; c2: string } {
  const [h, s] = rgbToHsl(color);
  const sat = Math.min(0.95, Math.max(0.4, s));
  const c1 = `hsl(${Math.round(h)} ${Math.round(sat * 100)}% 78%)`;
  const c2 = `hsl(${Math.round((h + 38) % 360)} ${Math.round(sat * 85)}% 90%)`;
  return { c1, c2 };
}

export const NEUTRAL_PANEL = { c1: "rgb(255 255 255)", c2: "rgb(255 255 255)" };

/* ── Palette de 3 teintes (pour le dégradé animé du side panel) ─────────── */

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Version pastel d'une couleur : teinte gardée, saturation bornée, clarté imposée. */
function pastel(color: RGB, lightness: number): RGB {
  const [h, s] = rgbToHsl(color);
  return hslToRgb(h, Math.min(0.95, Math.max(0.4, s)), lightness);
}

const HUE_BUCKETS = 6;

function paletteOf(source: CanvasImageSource): RGB[] | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, GRID, GRID);
    const { data } = ctx.getImageData(0, 0, GRID, GRID);
    const sum = Array.from({ length: HUE_BUCKETS }, () => [0, 0, 0, 0]);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
      const [h, s, l] = rgbToHsl(rgb);
      const weight = s * s * Math.max(0.05, 1 - Math.abs(l - 0.5) * 1.4) + 0.001;
      const k = Math.min(HUE_BUCKETS - 1, Math.floor(h / (360 / HUE_BUCKETS)));
      sum[k][0] += rgb[0] * weight;
      sum[k][1] += rgb[1] * weight;
      sum[k][2] += rgb[2] * weight;
      sum[k][3] += weight;
    }
    const ranked = sum
      .filter((b) => b[3] > 0)
      .sort((a, b) => b[3] - a[3])
      .slice(0, 3)
      .map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as RGB);
    if (ranked.length === 0) return null;
    const [h0, s0] = rgbToHsl(ranked[0]);
    while (ranked.length < 3) {
      ranked.push(hslToRgb(h0 + (ranked.length === 1 ? 38 : -34), Math.max(0.45, s0), 0.6));
    }
    // Trois teintes claires, de la plus claire (fond) à la plus profonde (reflet).
    return [pastel(ranked[0], 0.8), pastel(ranked[1], 0.86), pastel(ranked[2], 0.74)];
  } catch {
    return null;
  }
}

const paletteCache = new Map<string, Promise<RGB[] | null>>();

export function paletteFromImageUrl(url: string): Promise<RGB[] | null> {
  const cached = paletteCache.get(url);
  if (cached) return cached;
  const promise = new Promise<RGB[] | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(paletteOf(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
  paletteCache.set(url, promise);
  return promise;
}

export function paletteFromVideo(video: HTMLVideoElement): RGB[] | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  return paletteOf(video);
}
