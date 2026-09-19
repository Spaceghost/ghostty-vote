// A small, strict JSON Schema (2020-12 subset) validator with no dependencies, for the
// Almanac leaderboard's submissions. Strict on purpose:
//   - an object schema without `additionalProperties` rejects unknown fields (as if it said false);
//   - numbers must be finite; `integer` means a safe integer;
//   - a keyword this file does not implement makes compile() throw, so a schema change the
//     validator cannot enforce fails the tests instead of being silently ignored.
// Only local references ("#/$defs/name") are followed.

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default', 'deprecated', 'readOnly', 'writeOnly', 'format', 'x-unit', 'x-aggregate']);
const KEYWORDS = new Set([
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'patternProperties', 'propertyNames',
  'minProperties', 'maxProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', '$ref', '$defs', 'anyOf', 'oneOf',
]);
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isFinite(v) ? 'number' : 'nonfinite';
  return typeof v;
};
const isType = (v, t) => (t === 'integer' ? Number.isSafeInteger(v) : t === 'number' ? typeOf(v) === 'number' : typeOf(v) === t);
const isPlainObject = (v) => typeOf(v) === 'object';
const codePoints = (s) => [...s].length;

// Throws on anything this validator would not enforce.
function check(schema, root, where) {
  if (typeof schema === 'boolean') return;
  if (!isPlainObject(schema)) throw new Error(`${where}: schema must be an object`);
  for (const k of Object.keys(schema)) {
    if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) throw new Error(`${where}: unsupported keyword ${k}`);
  }
  const types = schema.type === undefined ? [] : [].concat(schema.type);
  for (const t of types) if (!TYPES.has(t)) throw new Error(`${where}: unknown type ${t}`);
  if (schema.pattern !== undefined) new RegExp(schema.pattern, 'u');
  if (schema.$ref !== undefined) resolve(root, schema.$ref);
  for (const [k, v] of Object.entries(schema.properties || {})) check(v, root, `${where}.properties.${k}`);
  for (const [k, v] of Object.entries(schema.patternProperties || {})) { new RegExp(k, 'u'); check(v, root, `${where}.patternProperties`); }
  for (const [k, v] of Object.entries(schema.$defs || {})) check(v, root, `${where}.$defs.${k}`);
  for (const key of ['additionalProperties', 'items', 'propertyNames']) if (schema[key] !== undefined) check(schema[key], root, `${where}.${key}`);
  for (const key of ['anyOf', 'oneOf']) for (const [n, s] of (schema[key] || []).entries()) check(s, root, `${where}.${key}[${n}]`);
}

function resolve(root, ref) {
  const m = /^#\/\$defs\/([A-Za-z0-9_.-]+)$/.exec(ref);
  const target = m && root.$defs && Object.hasOwn(root.$defs, m[1]) ? root.$defs[m[1]] : undefined;
  if (target === undefined) throw new Error(`unsupported or missing $ref ${ref}`);
  return target;
}

// Returns validate(value) -> null when valid, else {path, message} for the first problem.
// { strict: false } lets an object schema without additionalProperties allow extra fields
// (standard JSON Schema behaviour; the tests use it to check what the Worker publishes).
export function compile(schema, { strict = true } = {}) {
  check(schema, schema, '#');
  const run = (s, v, path) => {
    if (s === true) return null;
    if (s === false) return { path, message: 'is not allowed' };
    if (s.$ref) { const e = run(resolve(schema, s.$ref), v, path); if (e) return e; }
    if (s.type !== undefined) {
      const types = [].concat(s.type);
      if (!types.some((t) => isType(v, t))) return { path, message: `must be ${types.join(' or ')}` };
    }
    if (s.const !== undefined && JSON.stringify(s.const) !== JSON.stringify(v)) return { path, message: `must be ${JSON.stringify(s.const)}` };
    if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) return { path, message: 'is not one of the allowed values' };
    if (s.anyOf && !s.anyOf.some((sub) => run(sub, v, path) === null)) return { path, message: 'matches none of the allowed shapes' };
    if (s.oneOf && s.oneOf.filter((sub) => run(sub, v, path) === null).length !== 1) return { path, message: 'must match exactly one shape' };
    const t = typeOf(v);
    if (t === 'nonfinite') return { path, message: 'must be a finite number' };
    if (t === 'string') {
      const n = codePoints(v);
      if (s.minLength !== undefined && n < s.minLength) return { path, message: `must be at least ${s.minLength} characters` };
      if (s.maxLength !== undefined && n > s.maxLength) return { path, message: `must be at most ${s.maxLength} characters` };
      if (s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(v)) return { path, message: 'has characters or a shape that is not allowed' };
    }
    if (t === 'number') {
      if (s.minimum !== undefined && v < s.minimum) return { path, message: `must be at least ${s.minimum}` };
      if (s.maximum !== undefined && v > s.maximum) return { path, message: `must be at most ${s.maximum}` };
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) return { path, message: `must be more than ${s.exclusiveMinimum}` };
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) return { path, message: `must be less than ${s.exclusiveMaximum}` };
      if (s.multipleOf !== undefined && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) return { path, message: `must be a multiple of ${s.multipleOf}` };
    }
    if (t === 'array') {
      if (s.minItems !== undefined && v.length < s.minItems) return { path, message: `needs at least ${s.minItems} items` };
      if (s.maxItems !== undefined && v.length > s.maxItems) return { path, message: `allows at most ${s.maxItems} items` };
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) return { path, message: 'has duplicate items' };
      if (s.items !== undefined) for (const [i, x] of v.entries()) { const e = run(s.items, x, `${path}[${i}]`); if (e) return e; }
    }
    if (t === 'object') {
      const keys = Object.keys(v);
      if (s.minProperties !== undefined && keys.length < s.minProperties) return { path, message: `needs at least ${s.minProperties} fields` };
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) return { path, message: `allows at most ${s.maxProperties} fields` };
      for (const r of s.required || []) if (!Object.hasOwn(v, r)) return { path: `${path}.${r}`, message: 'is required' };
      const props = s.properties || {};
      const pats = Object.entries(s.patternProperties || {}).map(([p, sub]) => [new RegExp(p, 'u'), sub]);
      for (const k of keys) {
        const at = `${path}.${k}`;
        if (s.propertyNames !== undefined) { const e = run(s.propertyNames, k, at); if (e) return { path: at, message: 'is not an allowed field name' }; }
        let matched = false;
        if (Object.hasOwn(props, k)) { matched = true; const e = run(props[k], v[k], at); if (e) return e; }
        for (const [re, sub] of pats) if (re.test(k)) { matched = true; const e = run(sub, v[k], at); if (e) return e; }
        if (!matched) {
          const extra = s.additionalProperties === undefined ? !strict : s.additionalProperties;
          if (extra === false) return { path: at, message: 'is not a known field' };
          const e = run(extra, v[k], at);
          if (e) return e;
        }
      }
    }
    return null;
  };
  return (value) => run(schema, value, '$');
}
