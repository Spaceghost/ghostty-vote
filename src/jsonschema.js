// Generated from imba/src/jsonschema.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// A small, strict JSON Schema (2020-12 subset) validator with no dependencies, for the
// Almanac leaderboard's submissions. Strict on purpose:
//   - an object schema without `additionalProperties` rejects unknown fields (as if it said false);
//   - numbers must be finite; `integer` means a safe integer;
//   - a keyword this file does not implement makes compile() throw, so a schema change the
//     validator cannot enforce fails the tests instead of being silently ignored.
// Only local references ("#/$defs/name") are followed.

const ANNOTATIONS = new Set(['$schema','$id','$comment','title','description','examples','default','deprecated','readOnly','writeOnly','format','x-unit','x-aggregate']);

const KEYWORDS = new Set(['type','enum','const','properties','required','additionalProperties','patternProperties','propertyNames','minProperties','maxProperties','items','minItems','maxItems','uniqueItems','pattern','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','$ref','$defs','anyOf','oneOf']);

const TYPES = new Set(['string','number','integer','boolean','object','array','null']);

const typeOf = function(v) {
	if ((v === null)) {
		return 'null';
	};
	if (Array.isArray(v)) {
		return 'array';
	};
	if (((typeof v) === 'number')) {
		return (Number.isFinite(v) ? 'number' : 'nonfinite');
	};
	return (typeof v);
	return;
};

const isType = function(v,t) {
	return ((t === 'integer') ? Number.isSafeInteger(v) : (((t === 'number') ? ((typeOf(v) === 'number')) : ((typeOf(v) === t)))));
};

const isPlainObject = function(v) {
	return (typeOf(v) === 'object');
};

const codePoints = function(s) {
	return [...s].length;
};

function check(schema,root,where){
	if (((typeof schema) === 'boolean')) {
		return;
	};
	if ((!isPlainObject(schema))) {
		throw new Error(('' + String(where) + ': schema must be an object'));
	};
	for (let k of iterable$(Object.keys(schema))){
		if (((!KEYWORDS.has(k)) && (!ANNOTATIONS.has(k)))) {
			throw new Error(('' + String(where) + ': unsupported keyword ' + String(k) + ''));
		};
	};
	const types = ((schema.type === undefined) ? [] : [].concat(schema.type));
	for (let t of iterable$(types)){
		if ((!TYPES.has(t))) {
			throw new Error(('' + String(where) + ': unknown type ' + String(t) + ''));
		};
	};
	if ((schema.pattern !== undefined)) {
		new RegExp(schema.pattern,'u');
	};
	if ((schema.$ref !== undefined)) {
		resolve(root,schema.$ref);
	};
	for (let [k,v] of iterable$(Object.entries((schema.properties || {})))){
		check(v,root,('' + String(where) + '.properties.' + String(k) + ''));
	};
	for (let [k,v] of iterable$(Object.entries((schema.patternProperties || {})))){
		new RegExp(k,'u');
		check(v,root,('' + String(where) + '.patternProperties'));
	};
	for (let [k,v] of iterable$(Object.entries((schema.$defs || {})))){
		check(v,root,('' + String(where) + '.$defs.' + String(k) + ''));
	};
	for (let key of ['additionalProperties','items','propertyNames']){
		if ((schema[key] !== undefined)) {
			check(schema[key],root,('' + String(where) + '.' + String(key) + ''));
		};
	};
	for (let key of ['anyOf','oneOf']){
		for (let [n,s] of iterable$((schema[key] || []).entries())){
			check(s,root,('' + String(where) + '.' + String(key) + '[' + String(n) + ']'));
		};
	};
	return;
};

function resolve(root,ref){
	const m = new RegExp('^#\\/\\$defs\\/([A-Za-z0-9_.-]+)$','').exec(ref);
	const target = (((m && root.$defs) && Object.hasOwn(root.$defs,m[1])) ? root.$defs[m[1]] : undefined);
	if ((target === undefined)) {
		throw new Error(('unsupported or missing $ref ' + String(ref) + ''));
	};
	return target;
	return;
};

export function compile(schema,{strict: strict = true} = {}){
	check(schema,schema,'#');
	const run = function(s,v,path) {
		if ((s === true)) {
			return null;
		};
		if ((s === false)) {
			return {path: path,message: 'is not allowed'};
		};
		if (s.$ref) {
			const e = run(resolve(schema,s.$ref),v,path);
			if (e) {
				return e;
			};
		};
		if ((s.type !== undefined)) {
			const types = [].concat(s.type);
			if ((!(types.some(
				function(t) {
					return isType(v,t);
				}
			)))) {
				return {path: path,message: ('must be ' + String(types.join(' or ')) + '')};
			};
		};
		if (((s.const !== undefined) && (JSON.stringify(s.const) !== JSON.stringify(v)))) {
			return {path: path,message: ('must be ' + String(JSON.stringify(s.const)) + '')};
		};
		if ((s.enum && (!(s.enum.some(
			function(e) {
				return (JSON.stringify(e) === JSON.stringify(v));
			}
		))))) {
			return {path: path,message: 'is not one of the allowed values'};
		};
		if ((s.anyOf && (!(s.anyOf.some(
			function(sub) {
				return (run(sub,v,path) === null);
			}
		))))) {
			return {path: path,message: 'matches none of the allowed shapes'};
		};
		if ((s.oneOf && (s.oneOf.filter(
			function(sub) {
				return (run(sub,v,path) === null);
			}
		).length !== 1))) {
			return {path: path,message: 'must match exactly one shape'};
		};
		const t = typeOf(v);
		if ((t === 'nonfinite')) {
			return {path: path,message: 'must be a finite number'};
		};
		if ((t === 'string')) {
			const n = codePoints(v);
			if (((s.minLength !== undefined) && (n < s.minLength))) {
				return {path: path,message: ('must be at least ' + String(s.minLength) + ' characters')};
			};
			if (((s.maxLength !== undefined) && (n > s.maxLength))) {
				return {path: path,message: ('must be at most ' + String(s.maxLength) + ' characters')};
			};
			if (((s.pattern !== undefined) && (!(new RegExp(s.pattern,'u').test(v))))) {
				return {path: path,message: 'has characters or a shape that is not allowed'};
			};
		};
		if ((t === 'number')) {
			if (((s.minimum !== undefined) && (v < s.minimum))) {
				return {path: path,message: ('must be at least ' + String(s.minimum) + '')};
			};
			if (((s.maximum !== undefined) && (v > s.maximum))) {
				return {path: path,message: ('must be at most ' + String(s.maximum) + '')};
			};
			if (((s.exclusiveMinimum !== undefined) && (v <= s.exclusiveMinimum))) {
				return {path: path,message: ('must be more than ' + String(s.exclusiveMinimum) + '')};
			};
			if (((s.exclusiveMaximum !== undefined) && (v >= s.exclusiveMaximum))) {
				return {path: path,message: ('must be less than ' + String(s.exclusiveMaximum) + '')};
			};
			if (((s.multipleOf !== undefined) && (Math.abs(((v / s.multipleOf) - Math.round((v / s.multipleOf)))) > 1e-9))) {
				return {path: path,message: ('must be a multiple of ' + String(s.multipleOf) + '')};
			};
		};
		if ((t === 'array')) {
			if (((s.minItems !== undefined) && (v.length < s.minItems))) {
				return {path: path,message: ('needs at least ' + String(s.minItems) + ' items')};
			};
			if (((s.maxItems !== undefined) && (v.length > s.maxItems))) {
				return {path: path,message: ('allows at most ' + String(s.maxItems) + ' items')};
			};
			if ((s.uniqueItems && (new Set(
				v.map(
					function(x) {
						return JSON.stringify(x);
					}
				)
			).size !== v.length))) {
				return {path: path,message: 'has duplicate items'};
			};
			if ((s.items !== undefined)) {
				for (let [i,x] of iterable$(v.entries())){
					const e = run(s.items,x,('' + String(path) + '[' + String(i) + ']'));
					if (e) {
						return e;
					};
				};
			};
		};
		if ((t === 'object')) {
			const keys = Object.keys(v);
			if (((s.minProperties !== undefined) && (keys.length < s.minProperties))) {
				return {path: path,message: ('needs at least ' + String(s.minProperties) + ' fields')};
			};
			if (((s.maxProperties !== undefined) && (keys.length > s.maxProperties))) {
				return {path: path,message: ('allows at most ' + String(s.maxProperties) + ' fields')};
			};
			for (let r of iterable$((s.required || []))){
				if ((!Object.hasOwn(v,r))) {
					return {path: ('' + String(path) + '.' + String(r) + ''),message: 'is required'};
				};
			};
			const props = (s.properties || {});
			const pats = Object.entries((s.patternProperties || {})).map(
				function([p,sub]) {
					return [new RegExp(p,'u'),sub];
				}
			);
			for (let k of iterable$(keys)){
				const at = ('' + String(path) + '.' + String(k) + '');
				if ((s.propertyNames !== undefined)) {
					const e = run(s.propertyNames,k,at);
					if (e) {
						return {path: at,message: 'is not an allowed field name'};
					};
				};
				let matched = false;
				if (Object.hasOwn(props,k)) {
					matched = true;
					const e = run(props[k],v[k],at);
					if (e) {
						return e;
					};
				};
				for (let [re,sub] of iterable$(pats)){
					if (re.test(k)) {
						matched = true;
						const e = run(sub,v[k],at);
						if (e) {
							return e;
						};
					};
				};
				if ((!matched)) {
					const extra = ((s.additionalProperties === undefined) ? ((!strict)) : s.additionalProperties);
					if ((extra === false)) {
						return {path: at,message: 'is not a known field'};
					};
					const e = run(extra,v[k],at);
					if (e) {
						return e;
					};
				};
			};
		};
		return null;
		return;
	};
	return function(value) {
		return run(schema,value,'$');
	};
	return;
};
