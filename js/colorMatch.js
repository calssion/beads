/**
 * 颜色匹配模块
 * 提供三种算法：
 *   1. euclidean  — RGB 欧几里得距离（最快，精度一般）
 *   2. weighted   — RGB 加权欧几里得距离
 *   3. ciede2000  — CIE Lab CIEDE2000（最贴合人眼感知，推荐）
 */

/* =========================================================
 *  RGB → CIE Lab 转换
 * ========================================================= */

/**
 * sRGB [0-255] → 线性 RGB [0-1]
 */
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * RGB [0-255] → CIE XYZ (D65 白点)
 */
function rgbToXyz(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ];
}

/**
 * CIE XYZ → CIE Lab (D65 白点: 0.95047, 1.0, 1.08883)
 */
function xyzToLab(xyz) {
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const epsilon = 0.008856;
  const kappa = 903.3;

  function f(t) {
    return t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;
  }

  const fx = f(xyz[0] / Xn);
  const fy = f(xyz[1] / Yn);
  const fz = f(xyz[2] / Zn);

  return [
    116 * fy - 16,       // L
    500 * (fx - fy),     // a
    200 * (fy - fz),     // b
  ];
}

/**
 * RGB [0-255] → CIE Lab
 */
function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

/* =========================================================
 *  CIEDE2000 色差公式
 *  参考: Sharma, Wu & Dalal (2005)
 * ========================================================= */

function ciede2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  // 1. Lab 色度
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;

  const Cab7 = Math.pow(Cab, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 6103515625))); // 25^7

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * DEG;
  if (h2p < 0) h2p += 360;

  // 2. 差值
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  // 3. 加权平均
  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * RAD)
    + 0.24 * Math.cos(2 * hp * RAD)
    + 0.32 * Math.cos((3 * hp + 6) * RAD)
    - 0.20 * Math.cos((4 * hp - 63) * RAD);

  const Lp50sq = (Lp - 50) * (Lp - 50);
  const SL = 1 + 0.015 * Lp50sq / Math.sqrt(20 + Lp50sq);
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Math.pow(Cp, 7);
  const RT = -2 * Math.sqrt(Cp7 / (Cp7 + 6103515625))
    * Math.sin(60 * Math.exp(-((hp - 275) / 25) * ((hp - 275) / 25)) * RAD);

  const rL = dLp / SL;
  const rC = dCp / SC;
  const rH = dHp / SH;

  return Math.sqrt(rL * rL + rC * rC + rH * rH + RT * rC * rH);
}

/* =========================================================
 *  预计算调色板 Lab 值缓存（避免重复转换）
 * ========================================================= */

const _labCache = new WeakMap();

function ensureLabCache(palette) {
  if (!_labCache.has(palette)) {
    const map = {};
    for (const color of palette) {
      map[color.id] = rgbToLab(color.rgb);
    }
    _labCache.set(palette, map);
  }
  return _labCache.get(palette);
}

/* =========================================================
 *  颜色匹配函数
 * ========================================================= */

/**
 * RGB 欧几里得距离
 */
function getClosestColor(targetRgb, palette) {
  let minDist = Infinity;
  let closest = null;

  for (const color of palette) {
    const dr = targetRgb[0] - color.rgb[0];
    const dg = targetRgb[1] - color.rgb[1];
    const db = targetRgb[2] - color.rgb[2];
    const dist = dr * dr + dg * dg + db * db;

    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }
  return closest;
}

/**
 * RGB 加权欧几里得距离
 */
function getClosestColorWeighted(targetRgb, palette) {
  let minDist = Infinity;
  let closest = null;

  for (const color of palette) {
    const dr = targetRgb[0] - color.rgb[0];
    const dg = targetRgb[1] - color.rgb[1];
    const db = targetRgb[2] - color.rgb[2];
    const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;

    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }
  return closest;
}

/**
 * CIEDE2000 — CIE Lab 色差，最贴合人眼感知
 */
function getClosestColorCIEDE2000(targetRgb, palette) {
  const labCache = ensureLabCache(palette);
  const targetLab = rgbToLab(targetRgb);
  let minDist = Infinity;
  let closest = null;

  for (const color of palette) {
    const dist = ciede2000(targetLab, labCache[color.id]);
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }
  return closest;
}

/**
 * 统一入口 —— 根据算法名称选择匹配函数
 * @param {number[]} targetRgb
 * @param {{id: string, hex: string, rgb: number[]}[]} palette
 * @param {'euclidean'|'weighted'|'ciede2000'} algorithm
 * @returns {{id: string, hex: string, rgb: number[]}}
 */
function matchColor(targetRgb, palette, algorithm) {
  switch (algorithm) {
    case 'weighted':  return getClosestColorWeighted(targetRgb, palette);
    case 'ciede2000': return getClosestColorCIEDE2000(targetRgb, palette);
    default:          return getClosestColor(targetRgb, palette);
  }
}
