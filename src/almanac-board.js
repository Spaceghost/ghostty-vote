// Generated from imba/src/almanac-board.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The Almanac leaderboard's aggregation: pure functions from result rows (D1 columns) to
// leaderboard.json and recommendations.json. No bindings, so `node --test` runs it directly.
//
// Method, per bucket (suite, mode, VRAM tier or GPU class, model, quant):
//  1. each submitter counts once: their runs collapse to the median of each metric;
//  2. with 4+ submitters, one whose score or log(tokens/s) is more than 3.5 robust standard
//     deviations (1.4826 * MAD) from the bucket median is trimmed as an outlier;
//  3. the bucket reports medians, a 95% interval for the score (normal approximation, 2+
//     submitters), and a confidence of low (<3 submitters), medium (3-9) or high (10+);
//  4. ranking uses the score shrunk toward the tier's typical score by SHRINK pseudo-
//     submitters, so one enthusiastic run cannot top a tier on its own.

export const TIERS = Object.freeze([{id: 'cpu',label: 'CPU only / under 2 GB',min_vram_mb: 0,max_vram_mb: 2048},{id: '4-6gb',label: '4-6 GB',min_vram_mb: 2048,max_vram_mb: 7168},{id: '8gb',label: '8 GB',min_vram_mb: 7168,max_vram_mb: 9216},{id: '10-12gb',label: '10-12 GB',min_vram_mb: 9216,max_vram_mb: 13312},{id: '16gb',label: '16 GB',min_vram_mb: 13312,max_vram_mb: 17408},{id: '20-24gb',label: '20-24 GB',min_vram_mb: 17408,max_vram_mb: 26624},{id: '32gb-plus',label: '32 GB and up',min_vram_mb: 26624,max_vram_mb: null}]);

export const BOARD = Object.freeze({outlierMinSubmitters: 4,outlierK: 3.5,shrink: 2,usableTokensPerS: 10,recommendPerTier: 5,mediumAt: 3,highAt: 10});

export function tierOf(vramMb){
	for (let t of iterable$(TIERS)){
		if (((vramMb >= t.min_vram_mb) && ((t.max_vram_mb === null) || (vramMb < t.max_vram_mb)))) {
			return t.id;
		};
	};
	return TIERS[0].id;
	return;
};

const CLASS_RULES = [['nvidia',new RegExp('\\bRTX\\s*(?:PRO\\s*)?([2-9])0\\d{2}','i'),function(m) {
	return ('nvidia-rtx-' + String(m[1]) + '0');
}],['nvidia',new RegExp('\\bGTX\\s*1[06]\\d{2}','i'),function() {
	return 'nvidia-gtx';
}],['nvidia',new RegExp('\\b(?:RTX\\s*A\\d{3,4}|Quadro|Tesla|A100|H100|L40|L4)\\b','i'),function() {
	return 'nvidia-workstation';
}],['amd',new RegExp('\\bRX\\s*([5-9])\\d{3}','i'),function(m) {
	return ('amd-rx-' + String(m[1]) + '000');
}],['amd',new RegExp('\\b(?:Radeon\\s*(?:\\d{3,4}M|Graphics|Vega)|890M|780M|680M)\\b','i'),function() {
	return 'amd-integrated';
}],['intel',new RegExp('\\bArc\\b','i'),function() {
	return 'intel-arc';
}],['intel',new RegExp('\\b(?:UHD|Iris|HD Graphics)\\b','i'),function() {
	return 'intel-integrated';
}],['apple',new RegExp('\\bM([1-9])\\b','i'),function(m) {
	return ('apple-m' + String(m[1]) + '');
}]];

const CLASS_LABELS = {'nvidia-gtx': 'NVIDIA GTX','nvidia-workstation': 'NVIDIA workstation','amd-integrated': 'AMD integrated','intel-arc': 'Intel Arc','intel-integrated': 'Intel integrated',cpu: 'No GPU',other: 'Other'};

export function gpuClassOf(vendor,model,vramMb = (1 << 20)){
	if (((vramMb < 1024) && (vendor !== 'apple'))) {
		return 'cpu';
	};
	for (let [v,re,name] of iterable$(CLASS_RULES)){
		if ((v !== vendor)) {
			continue;
		};
		const m = re.exec((model || ''));
		if (m) {
			return name(m);
		};
	};
	return (['nvidia','amd','intel','apple'].includes(vendor) ? (('' + String(vendor) + '-other')) : 'other');
	return;
};

export function gpuClassLabel(id){
	if (CLASS_LABELS[id]) {
		return CLASS_LABELS[id];
	};
	let m = new RegExp('^nvidia-rtx-(\\d)0$','').exec(id);
	if (m) {
		return ('NVIDIA RTX ' + String(m[1]) + '0 series');
	};
	m = new RegExp('^amd-rx-(\\d)000$','').exec(id);
	if (m) {
		return ('AMD RX ' + String(m[1]) + '000 series');
	};
	m = new RegExp('^apple-m(\\d)$','').exec(id);
	if (m) {
		return ('Apple M' + String(m[1]) + '');
	};
	m = new RegExp('^(\\w+)-other$','').exec(id);
	if (m) {
		return ('Other ' + String(((m[1] === 'amd') ? 'AMD' : (((m[1] === 'nvidia') ? 'NVIDIA' : ((m[1][0].toUpperCase() + m[1].slice(1))))))) + '');
	};
	return id;
	return;
};

export function median(xs){
	const v = xs.filter(
		function(x) {
			return (((typeof x) === 'number') && Number.isFinite(x));
		}
	).sort(
		function(a,b) {
			return (a - b);
		}
	);
	if ((!v.length)) {
		return null;
	};
	const mid = (v.length >> 1);
	return ((v.length % 2) ? v[mid] : (((v[(mid - 1)] + v[mid]) / 2)));
	return;
};

const mad = function(xs,m) {
	return median(
		xs.map(
			function(x) {
				return Math.abs((x - m));
			}
		)
	);
};

function meanSd(xs){
	const mean = (xs.reduce(
		function(a,b) {
			return (a + b);
		},
		0
	) / xs.length);
	const sd = ((xs.length > 1) ? Math.sqrt(
		(xs.reduce(
			function(a,b) {
				return (a + ((b - mean) ** 2));
			},
			0
		) / (xs.length - 1))
	) : 0);
	return {mean: mean,sd: sd};
	return;
};

const round = function(x,d = 1) {
	return (((x === null) || (x === undefined)) ? null : ((Math.round((x * (10 ** d))) / (10 ** d))));
};

const mostCommon = function(xs) {
	const c = new Map();
	for (let x of iterable$(xs)){
		c.set(x,((c.get(x) || 0) + 1));
	};
	return ((function() {
		let cursor$1 = [...c.entries()];
		let cursor$2 = undefined;
		cursor$2 = cursor$1;
		cursor$1 = cursor$1.sort;
		cursor$1 = Reflect.apply(cursor$1,cursor$2,[function(a,b) {
			return ((b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])));
		}]);
		cursor$2 = undefined;
		cursor$2 = cursor$1;
		cursor$1 = cursor$1[0];
		if (cursor$1 == null) {
			return undefined;
		};
		cursor$2 = cursor$1;
		cursor$1 = cursor$1[0];
		return cursor$1;
	}() ?? null));
	return;
};

const counts = function(xs) {
	const out = {};
	for (let x of iterable$(xs)){
		out[x] = ((out[x] || 0) + 1);
	};
	return out;
	return;
};

export function outliers(values,k = BOARD.outlierK,min = BOARD.outlierMinSubmitters){
	if ((values.length < min)) {
		return new Set();
	};
	const m = median(values);
	const s = (1.4826 * mad(values,m));
	if ((!((s > 0)))) {
		return new Set();
	};
	const out = new Set();
	values.forEach(
		function(x,i) {
			if (((Math.abs((x - m)) / s) > k)) {
				out.add(i);
			};
			return;
		}
	);
	return out;
	return;
};

export function confidenceOf(n){
	return ((n >= BOARD.highAt) ? 'high' : (((n >= BOARD.mediumAt) ? 'medium' : 'low')));
	return;
};

function perSubmitter(runs){
	const tasks = {};
	for (let r of iterable$(runs)){
		for (let [id,s] of iterable$(Object.entries((r.tasks || {})))){
			(tasks[id] ||= []).push(s);
		};
	};
	return {
		score: median(
			runs.map(
				function(r) {
					return r.score;
				}
			)
		),
		success_rate: median(
			runs.map(
				function(r) {
					return r.success_rate;
				}
			)
		),
		tool_call_validity: median(
			runs.map(
				function(r) {
					return r.tool_call_validity;
				}
			)
		),
		tokens_per_s: median(
			runs.map(
				function(r) {
					return r.tokens_per_s;
				}
			)
		),
		ttft_ms: median(
			runs.map(
				function(r) {
					return r.ttft_ms;
				}
			)
		),
		peak_vram_mb: median(
			runs.map(
				function(r) {
					return r.peak_vram_mb;
				}
			)
		),
		context: median(
			runs.map(
				function(r) {
					return r.context;
				}
			)
		),
		tasks: Object.fromEntries(
			Object.entries(tasks).map(
				function([id,xs]) {
					return [id,median(xs)];
				}
			)
		),
		runs: runs
	};
	return;
};

export function summarize(runs){
	const bySubmitter = new Map();
	for (let r of iterable$(runs)){
		if ((!bySubmitter.has(r.submitter))) {
			bySubmitter.set(r.submitter,[]);
		};
		bySubmitter.get(r.submitter).push(r);
	};
	let samples = [...bySubmitter.values()].map(perSubmitter);
	const drop = new Set(
		[...outliers(
			samples.map(
				function(s) {
					return s.score;
				}
			)
		),...outliers(
			samples.map(
				function(s) {
					return Math.log(Math.max(s.tokens_per_s,0.01));
				}
			)
		)]
	);
	const trimmed = drop.size;
	samples = samples.filter(
		function(_,i) {
			return (!drop.has(i));
		}
	);
	const n = samples.length;
	const scores = samples.map(
		function(s) {
			return s.score;
		}
	);
	const {sd: sd} = meanSd(scores);
	const score = median(scores);
	const half = ((n >= 2) ? (((1.96 * sd) / Math.sqrt(n))) : null);
	const tasks = {};
	for (let s of iterable$(samples)){
		for (let [id,v] of iterable$(Object.entries(s.tasks))){
			(tasks[id] ||= []).push(v);
		};
	};
	const kept = samples.flatMap(
		function(s) {
			return s.runs;
		}
	);
	return {
		samples: n,
		runs: kept.length,
		trimmed: trimmed,
		confidence: confidenceOf(n),
		score: round(score),
		score_low: ((half === null) ? null : round(Math.max(0,(score - half)))),
		score_high: ((half === null) ? null : round(Math.min(100,(score + half)))),
		success_rate: round(
			median(
				samples.map(
					function(s) {
						return s.success_rate;
					}
				)
			),
			3
		),
		tool_call_validity: round(
			median(
				samples.map(
					function(s) {
						return s.tool_call_validity;
					}
				)
			),
			3
		),
		tokens_per_s: round(
			median(
				samples.map(
					function(s) {
						return s.tokens_per_s;
					}
				)
			)
		),
		ttft_ms: round(
			median(
				samples.map(
					function(s) {
						return s.ttft_ms;
					}
				)
			),
			0
		),
		peak_vram_mb: round(
			median(
				samples.map(
					function(s) {
						return s.peak_vram_mb;
					}
				)
			),
			0
		),
		context: round(
			median(
				samples.map(
					function(s) {
						return s.context;
					}
				)
			),
			0
		),
		tool_calling: mostCommon(
			kept.map(
				function(r) {
					return r.tool_calling;
				}
			)
		),
		backends: counts(
			kept.map(
				function(r) {
					return r.backend;
				}
			)
		),
		tasks: Object.fromEntries(
			Object.entries(tasks).sort().map(
				function([id,xs]) {
					return [id,round(median(xs),3)];
				}
			)
		)
	};
	return;
};

const bucketBy = function(rows,keyOf) {
	const m = new Map();
	for (let r of iterable$(rows)){
		const k = keyOf(r);
		if ((!m.has(k))) {
			m.set(k,[]);
		};
		m.get(k).push(r);
	};
	return m;
	return;
};

const versionKey = function(v) {
	return v.split('.').map(
		function(n) {
			return (Number(n) || 0);
		}
	);
};

export function compareVersionsDesc(a,b){
	const x = versionKey(a);
	const y = versionKey(b);
	let cursor$3 = 0;
	while ((cursor$3 < 3)){
		if ((x[cursor$3] !== y[cursor$3])) {
			return (y[cursor$3] - x[cursor$3]);
		};
		cursor$3++;
	};
	return 0;
	return;
};

export function buildBoard(rows,suites,now = Date.now()){
	var $1;
	const runs = rows.map(
		function(r) {
			return {...r,tier: tierOf(r.vram_mb),gpu_class: gpuClassOf(r.gpu_vendor,r.gpu_model,r.vram_mb),tasks: parseTasks(r.task_scores)};
		}
	);
	const groups = [];
	for (let [cursor$4,bucket] of iterable$(bucketBy(
		runs,
		function(r) {
			return [r.suite_id,r.suite_version,r.mode,r.tier,r.model,r.quant].join('\x00');
		}
	))){
		const f = bucket[0];
		groups.push({suite_id: f.suite_id,suite_version: f.suite_version,mode: f.mode,tier: f.tier,model: f.model,quant: f.quant,...summarize(bucket)});
	};
	for (let [cursor$5,g] of iterable$(bucketBy(
		groups,
		function(x) {
			return [x.suite_id,x.suite_version,x.mode,x.tier].join('\x00');
		}
	))){
		const prior = median(
			g.map(
				function(x) {
					return x.score;
				}
			)
		);
		for (let x of iterable$(g)){
			x.rank_score = round((((x.samples * x.score) + (BOARD.shrink * prior)) / (x.samples + BOARD.shrink)));
		};
	};
	groups.sort(byRank);
	const gpu = [];
	for (let [cursor$6,bucket] of iterable$(bucketBy(
		runs,
		function(r) {
			return [r.suite_id,r.suite_version,r.mode,r.gpu_class,r.model,r.quant].join('\x00');
		}
	))){
		const f = bucket[0];
		const s = summarize(bucket);
		((($1 = s.tasks),delete s.tasks, $1));
		gpu.push({suite_id: f.suite_id,suite_version: f.suite_version,mode: f.mode,gpu_class: f.gpu_class,model: f.model,quant: f.quant,...s});
	};
	gpu.sort(
		function(a,b) {
			return ((a.gpu_class.localeCompare(b.gpu_class) || (((b.score ?? 0)) - ((a.score ?? 0)))) || a.model.localeCompare(b.model));
		}
	);
	const perSuite = bucketBy(
		runs,
		function(r) {
			return ((r.suite_id + '@') + r.suite_version);
		}
	);
	const suiteList = suites.map(
		function(s) {
			const rs = (perSuite.get(((s.suite_id + '@') + s.suite_version)) || []);
			return {
				id: s.suite_id,
				version: s.suite_version,
				deprecated: (!(!s.deprecated)),
				results: rs.length,
				submitters: new Set(
					rs.map(
						function(r) {
							return r.submitter;
						}
					)
				).size,
				live_results: rs.filter(
					function(r) {
						return (r.mode === 'live');
					}
				).length
			};
			return;
		}
	).sort(
		function(a,b) {
			return (a.id.localeCompare(b.id) || compareVersionsDesc(a.version,b.version));
		}
	);
	return {
		schema_version: 1,
		generated_at: new Date(now).toISOString(),
		method: 'Each submitter counts once per model and tier (median of their runs); with 4+ submitters, outliers beyond 3.5 robust SD on score or log(tokens/s) are trimmed; ranking shrinks the median score toward the tier median by 2 pseudo-submitters; confidence: low <3 submitters, medium 3-9, high 10+.',
		tiers: TIERS,
		gpu_classes: [...new Set(
			gpu.map(
				function(g) {
					return g.gpu_class;
				}
			)
		)].sort().map(
			function(id) {
				return {id: id,label: gpuClassLabel(id)};
			}
		),
		suites: suiteList,
		groups: groups,
		gpu: gpu
	};
	return;
};

function byRank(a,b){
	const ua = ((((a.tokens_per_s ?? 0)) >= BOARD.usableTokensPerS) ? 1 : 0);
	const ub = ((((b.tokens_per_s ?? 0)) >= BOARD.usableTokensPerS) ? 1 : 0);
	return (((((ub - ua) || (((b.rank_score ?? 0)) - ((a.rank_score ?? 0)))) || (b.samples - a.samples)) || a.model.localeCompare(b.model)) || a.quant.localeCompare(b.quant));
	return;
};

function parseTasks(text){
	try {
		const v = JSON.parse((text || '{}'));
		return (((v && ((typeof v) === 'object')) && (!Array.isArray(v))) ? v : {});
	} catch ($2) {
		return {};
	};
	return;
};

export function pickSuite(board){
	const live = board.suites.filter(
		function(s) {
			return ((!s.deprecated) && (s.results > 0));
		}
	);
	live.sort(
		function(a,b) {
			return ((((b.live_results > 0) - (a.live_results > 0)) || (b.submitters - a.submitters)) || compareVersionsDesc(a.version,b.version));
		}
	);
	return (live[0] || null);
	return;
};

export function buildRecommendations(board){
	const suite = pickSuite(board);
	const tiers = TIERS.map(
		function(t) {
			let notes = '';
			let pool = (suite ? board.groups.filter(
				function(g) {
					return ((((g.suite_id === suite.id) && (g.suite_version === suite.version)) && (g.tier === t.id)) && (g.mode === 'live'));
				}
			) : []);
			if ((suite && (!pool.length))) {
				pool = board.groups.filter(
					function(g) {
						return ((((g.suite_id === suite.id) && (g.suite_version === suite.version)) && (g.tier === t.id)) && (g.mode === 'mock'));
					}
				);
				if (pool.length) {
					notes = 'From mock-mode runs (no live runs in this tier yet).';
				};
			};
			const models = pool.slice().sort(byRank).slice(0,BOARD.recommendPerTier).map(
				function(g) {
					const main = mostCommon(
						Object.entries(g.backends).flatMap(
							function([k,n]) {
								return Array(n).fill(k);
							}
						)
					);
					const bits = [];
					if (notes) {
						bits.push(notes);
					};
					if ((g.confidence === 'low')) {
						bits.push(('Low confidence: ' + String(g.samples) + ' submitter' + String(((g.samples === 1) ? '' : 's')) + '.'));
					};
					if ((((g.tokens_per_s ?? 0)) < BOARD.usableTokensPerS)) {
						bits.push('Slow on this tier.');
					};
					return {name: g.model,ollama: ((main === 'ollama') ? g.model : null),lmstudio: ((main === 'lmstudio') ? g.model : null),quant: g.quant,context: ((g.context ?? 0)),vram_mb: g.peak_vram_mb,tool_calling: (g.tool_calling || 'none'),score: g.score,tokens_per_s: g.tokens_per_s,samples: g.samples,confidence: g.confidence,notes: bits.join(' ')};
					return;
				}
			);
			return {...t,models: models};
			return;
		}
	);
	return {schema_version: 1,generated_at: board.generated_at,suite_version: (suite ? suite.version : ''),suite_id: (suite ? suite.id : ''),source: 'leaderboard',tiers: tiers};
	return;
};
