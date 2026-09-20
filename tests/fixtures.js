// Things more than one test file sends: tiny images carrying metadata, and a benchmark run.
export const bytes = (...parts) => {
  const arr = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const c of p) arr.push(c.charCodeAt(0));
    else if (typeof p === 'number') arr.push(p);
    else arr.push(...p);
  }
  return new Uint8Array(arr);
};
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n) => [(n >>> 8) & 255, n & 255];
export const chunk = (type, data) => bytes(be32(data.length), type, data, [0, 0, 0, 0]);

export function png(w = 640, h = 360, { extra = [], seed = 0 } = {}) {
  return bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', bytes(be32(w), be32(h), 8, 6, 0, 0, 0)),
    chunk('tEXt', bytes('Comment\0taken at home')),
    ...extra,
    chunk('eXIf', bytes('MM\0*GPS')),
    chunk('IDAT', bytes([1, 2, 3, seed & 255, (seed >> 8) & 255])),
    chunk('tIME', bytes([7, 234, 9, 19, 12, 0, 0])),
    chunk('IEND', bytes()));
}

export function jpeg(w = 800, h = 450, seed = 0) {
  const seg = (m, data) => bytes(0xff, m, be16(data.length + 2), data);
  return bytes(0xff, 0xd8,
    seg(0xe0, bytes('JFIF\0', 1, 1, 0, 0, 1, 0, 1, 0, 0)),
    seg(0xe1, bytes('Exif\0\0', 'GPS 37.7N 122.4W camera')),
    seg(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')),
    seg(0xfe, bytes('a private comment')),
    seg(0xe2, bytes('ICC_PROFILE\0', 1, 1, 'icc')),
    seg(0xdb, bytes(0, ...new Array(64).fill(1))),
    seg(0xc0, bytes(8, be16(h), be16(w), 1, 1, 0x11, 0)),
    seg(0xda, bytes(1, 1, 0, 0, 63, 0)),
    bytes([0x12, 0x34, seed & 255, 0xff, 0x00, 0x56]),
    bytes(0xff, 0xd9));
}


export const SUITE_SHA = 'a'.repeat(64);

export function result(over = {}) {
  const base = {
    schema_version: 1,
    suite: { id: 'ffxiv-core', version: '1.0.0', sha256: SUITE_SHA },
    client: { name: 'almanac-dalamud', version: '0.3.0' },
    mode: 'live',
    hardware: { gpu_model: 'NVIDIA GeForce RTX 4060', gpu_vendor: 'nvidia', vram_mb: 8192, system_ram_gb: 32, os: 'windows' },
    backend: { kind: 'ollama', version: '0.12.3' },
    model: { name: 'qwen3.5:9b', family: 'qwen', params_b: 9, quant: 'Q4_K_M', context: 8192, tool_calling: 'native' },
    metrics: { score: 72.5, success_rate: 0.8, tool_call_validity: 0.95, quality: 0.7, tokens_per_s: 42.1, ttft_ms: 310, peak_vram_mb: 6900, total_s: 120 },
    tasks: [
      { id: 'market.price', success: true, score: 1, tool_calls: 2, tool_calls_valid: 2, ttft_ms: 300, tokens_per_s: 40, output_tokens: 120, duration_ms: 4000, error: null },
      { id: 'quest.next', success: false, score: 0.4, tool_calls: 1, tool_calls_valid: 1, ttft_ms: null, tokens_per_s: null, error: 'wrong_answer' },
    ],
  };
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') Object.assign(out[k], v);
    else out[k] = v;
  }
  return out;
}

