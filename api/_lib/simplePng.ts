/**
 * Minimal pure-JS PNG writer + drawing helpers (no native deps — Vercel-safe).
 * Used for Discord analysis image attachments.
 */
import { deflateSync, inflateSync } from 'zlib';

export type Rgba = [number, number, number, number];

export class SimpleCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  fill(color: Rgba) {
    const [r, g, b, a] = color;
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgba) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    const [r, g, b, a] = color;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        // Simple alpha over solid bg when a < 255
        if (a >= 255) {
          this.data[i] = r;
          this.data[i + 1] = g;
          this.data[i + 2] = b;
          this.data[i + 3] = 255;
        } else {
          const inv = 1 - a / 255;
          this.data[i] = Math.round(r * (a / 255) + this.data[i] * inv);
          this.data[i + 1] = Math.round(g * (a / 255) + this.data[i + 1] * inv);
          this.data[i + 2] = Math.round(b * (a / 255) + this.data[i + 2] * inv);
          this.data[i + 3] = 255;
        }
      }
    }
  }

  /**
   * Draw a grayscale or RGBA PNG image buffer (decoded) scaled to fit.
   * `src` is raw RGBA pixels.
   */
  drawImageRgba(
    src: Uint8Array,
    srcW: number,
    srcH: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    opacity = 1,
  ) {
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(srcH - 1, Math.floor((y / dh) * srcH));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(srcW - 1, Math.floor((x / dw) * srcW));
        const si = (sy * srcW + sx) * 4;
        const px = Math.floor(dx + x);
        const py = Math.floor(dy + y);
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const di = (py * this.width + px) * 4;
        const sa = (src[si + 3] / 255) * opacity;
        if (sa <= 0) continue;
        const inv = 1 - sa;
        this.data[di] = Math.round(src[si] * sa + this.data[di] * inv);
        this.data[di + 1] = Math.round(src[si + 1] * sa + this.data[di + 1] * inv);
        this.data[di + 2] = Math.round(src[si + 2] * sa + this.data[di + 2] * inv);
        this.data[di + 3] = 255;
      }
    }
  }

  /** Scale factor multiplies the 5×7 glyph (2 = 10×14 px). */
  drawText(text: string, x: number, y: number, color: Rgba, scale = 2) {
    let cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const ch of text) {
      const glyph = FONT[ch] || FONT['?'] || FONT[' '];
      if (!glyph) {
        cx += 6 * scale;
        continue;
      }
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            this.fillRect(cx + col * scale, cy + row * scale, scale, scale, color);
          }
        }
      }
      cx += 6 * scale;
    }
    return cx;
  }

  /** Word-wrap and draw; returns y after last line. */
  drawWrappedText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    color: Rgba,
    scale = 2,
    lineHeight = 18,
  ): number {
    const charW = 6 * scale;
    const maxChars = Math.max(8, Math.floor(maxWidth / charW));
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let cy = y;
    const flush = () => {
      if (!line) return;
      this.drawText(line, x, cy, color, scale);
      cy += lineHeight;
      line = '';
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars) {
        flush();
        if (word.length > maxChars) {
          // Hard-break long tokens
          for (let i = 0; i < word.length; i += maxChars) {
            this.drawText(word.slice(i, i + maxChars), x, cy, color, scale);
            cy += lineHeight;
          }
        } else {
          line = word;
        }
      } else {
        line = next;
      }
    }
    flush();
    return cy;
  }

  toPngBuffer(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Filter type 0 per scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    const srcStart = y * width * 4;
    raw.set(rgba.subarray(srcStart, srcStart + width * 4), rowStart + 1);
  }
  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode a simple PNG (8-bit RGBA or RGB, non-interlaced) into raw RGBA. */
export function decodePngRgba(png: Buffer): { width: number; height: number; data: Uint8Array } | null {
  try {
    if (png[0] !== 137 || png.toString('ascii', 1, 4) !== 'PNG') return null;
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 6;
    const idatParts: Buffer[] = [];
    while (offset + 8 <= png.length) {
      const len = png.readUInt32BE(offset);
      const type = png.toString('ascii', offset + 4, offset + 8);
      const data = png.subarray(offset + 8, offset + 8 + len);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === 'IDAT') {
        idatParts.push(Buffer.from(data));
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + len;
    }
    if (!width || !height || bitDepth !== 8) return null;
    const inflated = inflateSync(Buffer.concat(idatParts));
    const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
    const stride = width * bytesPerPixel + 1;
    const out = new Uint8Array(width * height * 4);
    let prev = new Uint8Array(width * bytesPerPixel);
    for (let y = 0; y < height; y++) {
      const rowOff = y * stride;
      const filter = inflated[rowOff];
      const row = inflated.subarray(rowOff + 1, rowOff + stride);
      const cur = new Uint8Array(width * bytesPerPixel);
      for (let i = 0; i < row.length; i++) {
        const left = i >= bytesPerPixel ? cur[i - bytesPerPixel] : 0;
        const up = prev[i];
        const upLeft = i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
        let val = row[i];
        if (filter === 1) val = (val + left) & 255;
        else if (filter === 2) val = (val + up) & 255;
        else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          val = (val + pr) & 255;
        }
        cur[i] = val;
      }
      for (let x = 0; x < width; x++) {
        const si = x * bytesPerPixel;
        const di = (y * width + x) * 4;
        if (colorType === 6) {
          out[di] = cur[si];
          out[di + 1] = cur[si + 1];
          out[di + 2] = cur[si + 2];
          out[di + 3] = cur[si + 3];
        } else if (colorType === 2) {
          out[di] = cur[si];
          out[di + 1] = cur[si + 1];
          out[di + 2] = cur[si + 2];
          out[di + 3] = 255;
        } else {
          out[di] = out[di + 1] = out[di + 2] = cur[si];
          out[di + 3] = 255;
        }
      }
      prev = cur;
    }
    return { width, height, data: out };
  } catch {
    return null;
  }
}

// 5×7 bitmap font (bit 4 = left pixel). Covers A–Z, a–z→A–Z, 0–9, and common punctuation.
const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x00],
  '"': [0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00],
  '#': [0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x00, 0x00],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  '&': [0x08, 0x14, 0x08, 0x15, 0x12, 0x0d, 0x00],
  "'": [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '*': [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ':': [0x00, 0x04, 0x00, 0x00, 0x04, 0x00, 0x00],
  ';': [0x00, 0x04, 0x00, 0x00, 0x04, 0x04, 0x08],
  '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '[': [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  '\\': [0x10, 0x10, 0x08, 0x04, 0x02, 0x01, 0x01],
  ']': [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  '^': [0x04, 0x0a, 0x11, 0x00, 0x00, 0x00, 0x00],
  _: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  '·': [0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00],
  '▲': [0x00, 0x04, 0x0e, 0x1f, 0x00, 0x00, 0x00],
  '▼': [0x00, 0x00, 0x1f, 0x0e, 0x04, 0x00, 0x00],
};

// Map lowercase to uppercase glyphs
for (let i = 97; i <= 122; i++) {
  FONT[String.fromCharCode(i)] = FONT[String.fromCharCode(i - 32)];
}
