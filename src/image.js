// Checks an uploaded PNG or JPEG and strips its metadata without decoding a pixel:
// PNG keeps only the chunks that affect how the image looks, JPEG drops every APPn
// segment but JFIF (APP0), the ICC profile (APP2) and Adobe's colour transform (APP14),
// and every comment. EXIF (camera, GPS, time), XMP, text chunks and timestamps go.
// Pure: no bindings, so `node --test` runs it directly.

export const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg']);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs']);

const bad = (message) => ({ ok: false, error: 'bad_image', message });

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function concat(parts, total) {
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out;
}

function png(b) {
  const parts = [b.subarray(0, 8)];
  let total = 8;
  let off = 8;
  let width = 0;
  let height = 0;
  let idat = false;
  let first = true;
  while (off + 12 <= b.length) {
    const len = u32(b, off);
    const type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
    const end = off + 12 + len;
    if (!/^[A-Za-z]{4}$/.test(type) || end > b.length) return bad('The PNG file is damaged or cut short.');
    if (first) {
      if (type !== 'IHDR' || len !== 13) return bad('The PNG file has no header.');
      width = u32(b, off + 8);
      height = u32(b, off + 12);
      first = false;
    }
    if (type === 'IDAT') idat = true;
    if (PNG_KEEP.has(type)) {
      parts.push(b.subarray(off, end));
      total += end - off;
    }
    off = end;
    if (type === 'IEND') return idat ? { ok: true, type: 'image/png', width, height, bytes: concat(parts, total) } : bad('The PNG file has no image data.');
  }
  return bad('The PNG file is damaged or cut short.');
}

const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function keepJpegSegment(m, b, dataOff, len) {
  if (m === 0xfe) return false; // COM
  if (m < 0xe0 || m > 0xef) return true; // not APPn: tables, frame headers, restart interval
  const id = (n) => String.fromCharCode(...b.subarray(dataOff, dataOff + Math.min(n, len)));
  if (m === 0xe0) return id(5) === 'JFIF\0';
  if (m === 0xe2) return id(12) === 'ICC_PROFILE\0';
  if (m === 0xee) return id(5) === 'Adobe';
  return false;
}

function jpeg(b) {
  const parts = [b.subarray(0, 2)];
  let total = 2;
  let off = 2;
  let width = 0;
  let height = 0;
  while (off + 4 <= b.length) {
    if (b[off] !== 0xff) return bad('The JPEG file is damaged.');
    let m = b[off + 1];
    while (m === 0xff && off + 2 < b.length) { off++; m = b[off + 1]; } // fill bytes
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) return bad('The JPEG file is damaged.');
    const len = u16(b, off + 2);
    const end = off + 2 + len;
    if (len < 2 || end > b.length) return bad('The JPEG file is damaged or cut short.');
    if (isSof(m)) {
      if (len < 7) return bad('The JPEG file is damaged.');
      height = u16(b, off + 5);
      width = u16(b, off + 7);
    }
    if (m === 0xda) { // start of scan: the rest is image data, kept as is
      if (!width || !height) return bad('The JPEG file has no frame header.');
      parts.push(b.subarray(off));
      total += b.length - off;
      return { ok: true, type: 'image/jpeg', width, height, bytes: concat(parts, total) };
    }
    if (keepJpegSegment(m, b, off + 4, len - 2)) {
      parts.push(b.subarray(off, end));
      total += end - off;
    }
    off = end;
  }
  return bad('The JPEG file is damaged or cut short.');
}

// bytes (Uint8Array) -> {ok, type, width, height, bytes} with the metadata stripped, or
// {ok: false, error, message}. Only PNG and JPEG are accepted, whatever the upload claimed.
export function inspectImage(bytes, { minSide = 64, maxSide = 16384 } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let r;
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) r = png(b);
  else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) r = jpeg(b);
  else return { ok: false, error: 'bad_type', message: 'Only PNG and JPEG screenshots can be shared.' };
  if (!r.ok) return r;
  if (r.width < minSide || r.height < minSide || r.width > maxSide || r.height > maxSide) {
    return bad(`The image must be between ${minSide} and ${maxSide} pixels on each side.`);
  }
  return r;
}
