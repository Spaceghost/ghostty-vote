# The Almanac leaderboard's aggregation: pure functions from result rows (D1 columns) to
# leaderboard.json and recommendations.json. No bindings, so `node --test` runs it directly.
#
# Method, per bucket (suite, mode, VRAM tier or GPU class, model, quant):
#  1. each submitter counts once: their runs collapse to the median of each metric;
#  2. with 4+ submitters, one whose score or log(tokens/s) is more than 3.5 robust standard
#     deviations (1.4826 * MAD) from the bucket median is trimmed as an outlier;
#  3. the bucket reports medians, a 95% interval for the score (normal approximation, 2+
#     submitters), and a confidence of low (<3 submitters), medium (3-9) or high (10+);
#  4. ranking uses the score shrunk toward the tier's typical score by SHRINK pseudo-
#     submitters, so one enthusiastic run cannot top a tier on its own.

export const TIERS = Object.freeze([{id: 'cpu', label: 'CPU only / under 2 GB', min_vram_mb: 0, max_vram_mb: 2048}, {id: '4-6gb', label: '4-6 GB', min_vram_mb: 2048, max_vram_mb: 7168}, {id: '8gb', label: '8 GB', min_vram_mb: 7168, max_vram_mb: 9216}, {id: '10-12gb', label: '10-12 GB', min_vram_mb: 9216, max_vram_mb: 13312}, {id: '16gb', label: '16 GB', min_vram_mb: 13312, max_vram_mb: 17408}, {id: '20-24gb', label: '20-24 GB', min_vram_mb: 17408, max_vram_mb: 26624}, {id: '32gb-plus', label: '32 GB and up', min_vram_mb: 26624, max_vram_mb: null}])

export const BOARD = Object.freeze({outlierMinSubmitters: 4, outlierK: 3.5, shrink: 2, usableTokensPerS: 10, recommendPerTier: 5, mediumAt: 3, highAt: 10})

export def tierOf(vramMb)
	for t of TIERS
		if ((vramMb >= t.min_vram_mb) && ((t.max_vram_mb === null) || (vramMb < t.max_vram_mb)))
			return t.id
	return TIERS[0].id
	return

const CLASS_RULES = [['nvidia', new RegExp('\\bRTX\\s*(?:PRO\\s*)?([2-9])0\\d{2}', 'i'), (do(m)
	return ('nvidia-rtx-' + String(m[1]) + '0')
)], ['nvidia', new RegExp('\\bGTX\\s*1[06]\\d{2}', 'i'), (do()
	return 'nvidia-gtx'
)], ['nvidia', new RegExp('\\b(?:RTX\\s*A\\d{3,4}|Quadro|Tesla|A100|H100|L40|L4)\\b', 'i'), (do()
	return 'nvidia-workstation'
)], ['amd', new RegExp('\\bRX\\s*([5-9])\\d{3}', 'i'), (do(m)
	return ('amd-rx-' + String(m[1]) + '000')
)], ['amd', new RegExp('\\b(?:Radeon\\s*(?:\\d{3,4}M|Graphics|Vega)|890M|780M|680M)\\b', 'i'), (do()
	return 'amd-integrated'
)], ['intel', new RegExp('\\bArc\\b', 'i'), (do()
	return 'intel-arc'
)], ['intel', new RegExp('\\b(?:UHD|Iris|HD Graphics)\\b', 'i'), (do()
	return 'intel-integrated'
)], ['apple', new RegExp('\\bM([1-9])\\b', 'i'), (do(m)
	return ('apple-m' + String(m[1]) + '')
)]]

const CLASS_LABELS = {'nvidia-gtx': 'NVIDIA GTX', 'nvidia-workstation': 'NVIDIA workstation', 'amd-integrated': 'AMD integrated', 'intel-arc': 'Intel Arc', 'intel-integrated': 'Intel integrated', cpu: 'No GPU', other: 'Other'}

export def gpuClassOf(vendor, model, vramMb = (1 << 20))
	if ((vramMb < 1024) && (vendor !== 'apple'))
		return 'cpu'
	for [v, re, name] of CLASS_RULES
		if (v !== vendor)
			continue
		const m = re.exec((model || ''))
		if m
			return name(m)
	return (['nvidia', 'amd', 'intel', 'apple'].includes(vendor) ? ('' + String(vendor) + '-other') : 'other')
	return

export def gpuClassLabel(id)
	if CLASS_LABELS[id]
		return CLASS_LABELS[id]
	let m = new RegExp('^nvidia-rtx-(\\d)0$', '').exec(id)
	if m
		return ('NVIDIA RTX ' + String(m[1]) + '0 series')
	(m = new RegExp('^amd-rx-(\\d)000$', '').exec(id))
	if m
		return ('AMD RX ' + String(m[1]) + '000 series')
	(m = new RegExp('^apple-m(\\d)$', '').exec(id))
	if m
		return ('Apple M' + String(m[1]) + '')
	(m = new RegExp('^(\\w+)-other$', '').exec(id))
	if m
		return ('Other ' + String(((m[1] === 'amd') ? 'AMD' : ((m[1] === 'nvidia') ? 'NVIDIA' : (m[1][0].toUpperCase() + m[1].slice(1))))) + '')
	return id
	return

export def median(xs)
	const v = xs.filter(
		(do(x)
			return (((typeof x) === 'number') && Number.isFinite(x))
		)
	).sort(
		(do(a, b)
			return (a - b)
		)
	)
	if (! v.length)
		return null
	const mid = (v.length >> 1)
	return ((v.length % 2) ? v[mid] : ((v[(mid - 1)] + v[mid]) / 2))
	return

const mad = (do(xs, m)
	return median(
		xs.map(
			(do(x)
				return Math.abs((x - m))
			)
		)
	)
)

def meanSd(xs)
	const mean = (xs.reduce(
		(do(a, b)
			return (a + b)
		),
		0
	) / xs.length)
	const sd = ((xs.length > 1) ? Math.sqrt(
		(xs.reduce(
			(do(a, b)
				return (a + ((b - mean) ** 2))
			),
			0
		) / (xs.length - 1))
	) : 0)
	return {mean: mean, sd: sd}
	return

const round = (do(x, d = 1)
	return (((x === null) || (x === undefined)) ? null : (Math.round((x * (10 ** d))) / (10 ** d)))
)

const mostCommon = (do(xs)
	const c = new Map()
	for x of xs
		c.set(x, ((c.get(x) || 0) + 1))
	return ((do()
		let cursor$1 = [...c.entries()]
		let cursor$2 = undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1.sort
		cursor$1 = Reflect.apply(cursor$1, cursor$2, [(do(a, b)
			return ((b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
		)])
		cursor$2 = undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1[0]
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1[0]
		return cursor$1
	)() ?? null)
	return
)

const counts = (do(xs)
	const out = {}
	for x of xs
		(out[x] = ((out[x] || 0) + 1))
	return out
	return
)

export def outliers(values, k = BOARD.outlierK, min = BOARD.outlierMinSubmitters)
	if (values.length < min)
		return new Set()
	const m = median(values)
	const s = (1.4826 * mad(values, m))
	if (! (s > 0))
		return new Set()
	const out = new Set()
	values.forEach(
		(do(x, i)
			if ((Math.abs((x - m)) / s) > k)
				out.add(i)
			return
		)
	)
	return out
	return

export def confidenceOf(n)
	return ((n >= BOARD.highAt) ? 'high' : ((n >= BOARD.mediumAt) ? 'medium' : 'low'))
	return

def perSubmitter(runs)
	const tasks = {}
	for r of runs
		for [id, s] of Object.entries((r.tasks || {}))
			(tasks[id] ||= []).push(s)
	return {
		score: median(
			runs.map(
				(do(r)
					return r.score
				)
			)
		)
		success_rate: median(
			runs.map(
				(do(r)
					return r.success_rate
				)
			)
		)
		tool_call_validity: median(
			runs.map(
				(do(r)
					return r.tool_call_validity
				)
			)
		)
		tokens_per_s: median(
			runs.map(
				(do(r)
					return r.tokens_per_s
				)
			)
		)
		ttft_ms: median(
			runs.map(
				(do(r)
					return r.ttft_ms
				)
			)
		)
		peak_vram_mb: median(
			runs.map(
				(do(r)
					return r.peak_vram_mb
				)
			)
		)
		context: median(
			runs.map(
				(do(r)
					return r.context
				)
			)
		)
		tasks: Object.fromEntries(
			Object.entries(tasks).map(
				(do([id, xs])
					return [id, median(xs)]
				)
			)
		)
		runs: runs
	}
	return

export def summarize(runs)
	const bySubmitter = new Map()
	for r of runs
		if (! bySubmitter.has(r.submitter))
			bySubmitter.set(r.submitter, [])
		bySubmitter.get(r.submitter).push(r)
	let samples = [...bySubmitter.values()].map(perSubmitter)
	const drop = new Set(
		[...outliers(
			samples.map(
				(do(s)
					return s.score
				)
			)
		), ...outliers(
			samples.map(
				(do(s)
					return Math.log(Math.max(s.tokens_per_s, 0.01))
				)
			)
		)]
	)
	const trimmed = drop.size
	(samples = samples.filter(
		(do(_, i)
			return (! drop.has(i))
		)
	))
	const n = samples.length
	const scores = samples.map(
		(do(s)
			return s.score
		)
	)
	const {sd: sd} = meanSd(scores)
	const score = median(scores)
	const half = ((n >= 2) ? ((1.96 * sd) / Math.sqrt(n)) : null)
	const tasks = {}
	for s of samples
		for [id, v] of Object.entries(s.tasks)
			(tasks[id] ||= []).push(v)
	const kept = samples.flatMap(
		(do(s)
			return s.runs
		)
	)
	return {
		samples: n
		runs: kept.length
		trimmed: trimmed
		confidence: confidenceOf(n)
		score: round(score)
		score_low: ((half === null) ? null : round(Math.max(0, (score - half))))
		score_high: ((half === null) ? null : round(Math.min(100, (score + half))))
		success_rate: round(
			median(
				samples.map(
					(do(s)
						return s.success_rate
					)
				)
			),
			3
		)
		tool_call_validity: round(
			median(
				samples.map(
					(do(s)
						return s.tool_call_validity
					)
				)
			),
			3
		)
		tokens_per_s: round(
			median(
				samples.map(
					(do(s)
						return s.tokens_per_s
					)
				)
			)
		)
		ttft_ms: round(
			median(
				samples.map(
					(do(s)
						return s.ttft_ms
					)
				)
			),
			0
		)
		peak_vram_mb: round(
			median(
				samples.map(
					(do(s)
						return s.peak_vram_mb
					)
				)
			),
			0
		)
		context: round(
			median(
				samples.map(
					(do(s)
						return s.context
					)
				)
			),
			0
		)
		tool_calling: mostCommon(
			kept.map(
				(do(r)
					return r.tool_calling
				)
			)
		)
		backends: counts(
			kept.map(
				(do(r)
					return r.backend
				)
			)
		)
		tasks: Object.fromEntries(
			Object.entries(tasks).sort().map(
				(do([id, xs])
					return [id, round(median(xs), 3)]
				)
			)
		)
	}
	return

const bucketBy = (do(rows, keyOf)
	const m = new Map()
	for r of rows
		const k = keyOf(r)
		if (! m.has(k))
			m.set(k, [])
		m.get(k).push(r)
	return m
	return
)

const versionKey = (do(v)
	return v.split('.').map(
		(do(n)
			return (Number(n) || 0)
		)
	)
)

export def compareVersionsDesc(a, b)
	const x = versionKey(a)
	const y = versionKey(b)
	let cursor$3 = 0
	while (cursor$3 < 3)
		if (x[cursor$3] !== y[cursor$3])
			return (y[cursor$3] - x[cursor$3])
		(cursor$3++)
	return 0
	return

export def buildBoard(rows, suites, now = Date.now())
	const runs = rows.map(
		(do(r)
			return {...r, tier: tierOf(r.vram_mb), gpu_class: gpuClassOf(r.gpu_vendor, r.gpu_model, r.vram_mb), tasks: parseTasks(r.task_scores)}
		)
	)
	const groups = []
	for [cursor$4, bucket] of bucketBy(
		runs,
		(do(r)
			return [r.suite_id, r.suite_version, r.mode, r.tier, r.model, r.quant].join('\x00')
		)
	)
		const f = bucket[0]
		groups.push({suite_id: f.suite_id, suite_version: f.suite_version, mode: f.mode, tier: f.tier, model: f.model, quant: f.quant, ...summarize(bucket)})
	for [cursor$5, g] of bucketBy(
		groups,
		(do(x)
			return [x.suite_id, x.suite_version, x.mode, x.tier].join('\x00')
		)
	)
		const prior = median(
			g.map(
				(do(x)
					return x.score
				)
			)
		)
		for x of g
			(x.rank_score = round((((x.samples * x.score) + (BOARD.shrink * prior)) / (x.samples + BOARD.shrink))))
	groups.sort(byRank)
	const gpu = []
	for [cursor$6, bucket] of bucketBy(
		runs,
		(do(r)
			return [r.suite_id, r.suite_version, r.mode, r.gpu_class, r.model, r.quant].join('\x00')
		)
	)
		const f = bucket[0]
		const s = summarize(bucket)
		(delete s.tasks)
		gpu.push({suite_id: f.suite_id, suite_version: f.suite_version, mode: f.mode, gpu_class: f.gpu_class, model: f.model, quant: f.quant, ...s})
	gpu.sort(
		(do(a, b)
			return ((a.gpu_class.localeCompare(b.gpu_class) || ((b.score ?? 0) - (a.score ?? 0))) || a.model.localeCompare(b.model))
		)
	)
	const perSuite = bucketBy(
		runs,
		(do(r)
			return ((r.suite_id + '@') + r.suite_version)
		)
	)
	const suiteList = suites.map(
		(do(s)
			const rs = (perSuite.get(((s.suite_id + '@') + s.suite_version)) || [])
			return {
				id: s.suite_id
				version: s.suite_version
				deprecated: (! (! s.deprecated))
				results: rs.length
				submitters: new Set(
					rs.map(
						(do(r)
							return r.submitter
						)
					)
				).size
				live_results: rs.filter(
					(do(r)
						return (r.mode === 'live')
					)
				).length
			}
			return
		)
	).sort(
		(do(a, b)
			return (a.id.localeCompare(b.id) || compareVersionsDesc(a.version, b.version))
		)
	)
	return {
		schema_version: 1
		generated_at: new Date(now).toISOString()
		method: 'Each submitter counts once per model and tier (median of their runs); with 4+ submitters, outliers beyond 3.5 robust SD on score or log(tokens/s) are trimmed; ranking shrinks the median score toward the tier median by 2 pseudo-submitters; confidence: low <3 submitters, medium 3-9, high 10+.'
		tiers: TIERS
		gpu_classes: [...new Set(
			gpu.map(
				(do(g)
					return g.gpu_class
				)
			)
		)].sort().map(
			(do(id)
				return {id: id, label: gpuClassLabel(id)}
			)
		)
		suites: suiteList
		groups: groups
		gpu: gpu
	}
	return

def byRank(a, b)
	const ua = (((a.tokens_per_s ?? 0) >= BOARD.usableTokensPerS) ? 1 : 0)
	const ub = (((b.tokens_per_s ?? 0) >= BOARD.usableTokensPerS) ? 1 : 0)
	return (((((ub - ua) || ((b.rank_score ?? 0) - (a.rank_score ?? 0))) || (b.samples - a.samples)) || a.model.localeCompare(b.model)) || a.quant.localeCompare(b.quant))
	return

def parseTasks(text)
	try
		const v = JSON.parse((text || '{}'))
		return (((v && ((typeof v) === 'object')) && (! Array.isArray(v))) ? v : {})
	catch
		return {}
	return

export def pickSuite(board)
	const live = board.suites.filter(
		(do(s)
			return ((! s.deprecated) && (s.results > 0))
		)
	)
	live.sort(
		(do(a, b)
			return ((((b.live_results > 0) - (a.live_results > 0)) || (b.submitters - a.submitters)) || compareVersionsDesc(a.version, b.version))
		)
	)
	return (live[0] || null)
	return

export def buildRecommendations(board)
	const suite = pickSuite(board)
	const tiers = TIERS.map(
		(do(t)
			let notes = ''
			let pool = (suite ? board.groups.filter(
				(do(g)
					return ((((g.suite_id === suite.id) && (g.suite_version === suite.version)) && (g.tier === t.id)) && (g.mode === 'live'))
				)
			) : [])
			if (suite && (! pool.length))
				(pool = board.groups.filter(
					(do(g)
						return ((((g.suite_id === suite.id) && (g.suite_version === suite.version)) && (g.tier === t.id)) && (g.mode === 'mock'))
					)
				))
				if pool.length
					(notes = 'From mock-mode runs (no live runs in this tier yet).')
			const models = pool.slice().sort(byRank).slice(0, BOARD.recommendPerTier).map(
				(do(g)
					const main = mostCommon(
						Object.entries(g.backends).flatMap(
							(do([k, n])
								return Array(n).fill(k)
							)
						)
					)
					const bits = []
					if notes
						bits.push(notes)
					if (g.confidence === 'low')
						bits.push(('Low confidence: ' + String(g.samples) + ' submitter' + String(((g.samples === 1) ? '' : 's')) + '.'))
					if ((g.tokens_per_s ?? 0) < BOARD.usableTokensPerS)
						bits.push('Slow on this tier.')
					return {name: g.model, ollama: ((main === 'ollama') ? g.model : null), lmstudio: ((main === 'lmstudio') ? g.model : null), quant: g.quant, context: (g.context ?? 0), vram_mb: g.peak_vram_mb, tool_calling: (g.tool_calling || 'none'), score: g.score, tokens_per_s: g.tokens_per_s, samples: g.samples, confidence: g.confidence, notes: bits.join(' ')}
					return
				)
			)
			return {...t, models: models}
			return
		)
	)
	return {schema_version: 1, generated_at: board.generated_at, suite_version: (suite ? suite.version : ''), suite_id: (suite ? suite.id : ''), source: 'leaderboard', tiers: tiers}
	return
