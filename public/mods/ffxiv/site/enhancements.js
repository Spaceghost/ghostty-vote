// Generated from imba/public/mods/ffxiv/site/enhancements.imba; edit the Imba source.
(() => {
  // node_modules/imba/src/imba/runtime.mjs
  var __init__$ = /* @__PURE__ */ Symbol.for("#__init__");
  var __initor__$ = /* @__PURE__ */ Symbol.for("#__initor__");
  var __meta__$ = /* @__PURE__ */ Symbol.for("#meta");
  var __imba__$ = /* @__PURE__ */ Symbol.for("imba");
  var HAS = {
    SUPERCALLS: 1 << 3,
    CONSTRUCTOR: 1 << 4
  };
  var ClassFlags = {
    IsExtension: 1 << 0,
    IsTag: 1 << 1,
    HasDescriptors: 1 << 2,
    HasSuperCalls: 1 << 3,
    HasConstructor: 1 << 4,
    HasFields: 1 << 5,
    HasMixins: 1 << 6,
    HasInitor: 1 << 7,
    HasDecorators: 1 << 8,
    IsObjectExtension: 1 << 9,
    IsMixin: 1 << 10
  };
  var mmap = /* @__PURE__ */ new Map();
  var state = globalThis[__imba__$] ||= {
    counter: 0,
    classes: mmap
  };
  function meta$(klass, defaults = {}) {
    mmap.has(klass) || mmap.set(klass, {
      symbol: Symbol(klass.name),
      parent: Object.getPrototypeOf(klass.prototype)?.constructor,
      for: klass,
      uses: null,
      inits: null,
      id: state.counter++,
      ...defaults
    });
    return mmap.get(klass);
  }
  function iterable$(a) {
    return a?.toIterable?.() || a;
  }
  function isSameDesc(a, b) {
    if (!a || !b) return false;
    if (a.get) return b.get === a.get;
    if (a.set) return b.set === a.set;
    if (a.value) return a.value === b.value;
  }
  function extend$(target, ext, descs, cache = {}) {
    const klass = target.constructor;
    if (!descs && ext) {
      descs = Object.getOwnPropertyDescriptors(ext);
      delete descs.constructor;
      if (descs[__init__$]) {
        console.warn(`Cannot define plain fields when extending class ${klass.name}`);
        delete descs[__init__$];
      }
      ;
    }
    let meta = meta$(klass);
    if (meta && meta.augments) {
      const map = /* @__PURE__ */ new Map();
      for (let key of Object.keys(descs)) {
        let orig = Object.getOwnPropertyDescriptor(target, key);
        for (let augmented of meta.augments) {
          let defines = map.get(augmented);
          defines || map.set(augmented, defines = {});
          let augmentedKey = Object.getOwnPropertyDescriptor(augmented.prototype, key);
          if (augmentedKey && !isSameDesc(orig, augmentedKey)) console.warn("wont extend", key, augmentedKey, orig);
          else defines[key] = descs[key];
        }
      }
      for (let [augmented, defines] of map) {
        if (Object.keys(defines).length) extend$(augmented.prototype, null, defines);
      }
    }
    Object.defineProperties(target, descs);
    return target;
  }
  function augment$(klass, mixin) {
    let meta = meta$(klass);
    let mix = meta$(mixin);
    let par = mix.parent;
    while (par && meta$(par)?.flags & ClassFlags.IsMixin) {
      augment$(klass, par);
      par = null;
      break;
    }
    if (par && !(klass.prototype instanceof par)) {
      throw new Error(`Mixin ${mixin.name} has superclass not present in target class`);
    }
    if (!mix.augments) {
      mix.augments = /* @__PURE__ */ new Set();
      const ref = mix.ref = Symbol(mixin.name);
      const native = Object[Symbol.hasInstance];
      mixin.prototype[ref] = true;
      Object.defineProperty(mixin, Symbol.hasInstance, {
        value: function(rel) {
          return this === mixin ? rel && !!rel[ref] : native.call(this, rel);
        }
      });
    }
    if (klass.prototype[mix.ref]) {
      return klass;
    }
    if (mix.uses) {
      for (let v of mix.uses) augment$(klass, v);
    }
    mix.augments.add(klass);
    meta.uses ||= [];
    meta.uses.push(mixin);
    let descs = Object.getOwnPropertyDescriptors(mixin.prototype);
    delete descs.constructor;
    if (descs[__init__$]) {
      meta.inits ||= [];
      meta.inits.push(mixin.prototype[__init__$]);
      delete descs[__init__$];
    }
    Object.defineProperties(klass.prototype, descs);
    if (mixin?.mixed instanceof Function) mixin.mixed(klass);
    return klass;
  }
  var sup = {
    cache: {},
    self: null,
    target: null,
    proxy: new Proxy({}, {
      apply: (_2, thisArg, args) => {
        return Reflect.apply(sup.target, thisArg, args);
      },
      get: (_2, key) => {
        let val = Reflect.get(sup.target, key, sup.self);
        if (val instanceof Function) return val.bind(sup.self);
        return val;
      },
      set: (_2, key, value, receiver) => {
        return Reflect.set(sup.target, key, value, sup.self);
      }
    })
  };
  function register$(klass, symbol, name, flags, into = null) {
    let proto = Object.getPrototypeOf(klass.prototype);
    let mixed = (flags & (ClassFlags.HasMixins | ClassFlags.IsExtension)) == ClassFlags.HasMixins;
    let meta;
    if (mixed) {
      mmap.set(klass, mmap.get(proto.constructor));
      proto = Object.getPrototypeOf(proto);
    }
    if (into) {
      let target = flags & ClassFlags.IsObjectExtension ? into : into.prototype;
      let meta2 = meta$(klass);
      if (meta2.uses) {
        if (into === target) console.warn("Cannot extend object with mixins");
        for (let mixin of meta2.uses) augment$(into, mixin);
      }
      if (flags & ClassFlags.HasSuperCalls) {
        sup.cache[symbol] = Object.create(
          Object.getPrototypeOf(target),
          Object.getOwnPropertyDescriptors(target)
        );
      }
      extend$(target, klass.prototype);
      return into;
    }
    let supr = proto?.constructor;
    meta = meta$(klass, { symbol });
    Object.defineProperty(klass, __meta__$, { value: meta, enumerable: false, configurable: true });
    if (name && klass.name !== name) {
      Object.defineProperty(klass, "name", { value: name, configurable: true });
    }
    meta.flags = flags;
    if (flags & ClassFlags.HasConstructor)
      klass.prototype[__initor__$] = symbol;
    if (meta.uses) for (let mixin of meta.uses) mixin.mixes?.(klass);
    if (supr?.inherited instanceof Function) supr.inherited(klass);
    return klass;
  }

  // node_modules/imba/dist/imba.mjs
  var le = /* @__PURE__ */ Symbol.for("#__init__");
  var xo = /* @__PURE__ */ Symbol.for("#__initor__");
  var Iu = /* @__PURE__ */ Symbol.for("#meta");
  var Yr = /* @__PURE__ */ Symbol.for("imba");
  var Tt = { IsExtension: 1, IsTag: 2, HasDescriptors: 4, HasSuperCalls: 8, HasConstructor: 16, HasFields: 32, HasMixins: 64, HasInitor: 128, HasDecorators: 256, IsObjectExtension: 512, IsMixin: 1024 };
  var Dt = /* @__PURE__ */ new Map();
  var Pu = globalThis[Yr] || (globalThis[Yr] = { counter: 0, classes: Dt });
  function Et(i, t = {}) {
    var e;
    return Dt.has(i) || Dt.set(i, { symbol: Symbol(i.name), parent: (e = Object.getPrototypeOf(i.prototype)) == null ? void 0 : e.constructor, for: i, uses: null, inits: null, id: Pu.counter++, ...t }), Dt.get(i);
  }
  var So = /* @__PURE__ */ new WeakMap();
  function wo(i) {
    return So.get(i) || So.set(i, {}).get(i);
  }
  function Lu(i, t) {
    if (!i || !t) return false;
    if (i.get) return t.get === i.get;
    if (i.set) return t.set === i.set;
    if (i.value) return i.value === t.value;
  }
  function _o(i, t, e, r = {}) {
    let s = i.constructor;
    !e && t && (e = Object.getOwnPropertyDescriptors(t), delete e.constructor, e[le] && (console.warn(`Cannot define plain fields when extending class ${s.name}`), delete e[le]));
    let n = Et(s);
    if (n && n.augments) {
      let o = /* @__PURE__ */ new Map();
      for (let l of Object.keys(e)) {
        let h = Object.getOwnPropertyDescriptor(i, l);
        for (let u of n.augments) {
          let d = o.get(u);
          d || o.set(u, d = {});
          let a = Object.getOwnPropertyDescriptor(u.prototype, l);
          a && !Lu(h, a) ? console.warn("wont extend", l, a, h) : d[l] = e[l];
        }
      }
      for (let [l, h] of o) Object.keys(h).length && _o(l.prototype, null, h);
    }
    return Object.defineProperties(i, e), i;
  }
  function Ve(i, t) {
    var o;
    let e = Et(i), r = Et(t), s = r.parent;
    for (; s && ((o = Et(s)) == null ? void 0 : o.flags) & Tt.IsMixin; ) {
      Ve(i, s), s = null;
      break;
    }
    if (s && !(i.prototype instanceof s)) throw new Error(`Mixin ${t.name} has superclass not present in target class`);
    if (!r.augments) {
      r.augments = /* @__PURE__ */ new Set();
      let l = r.ref = Symbol(t.name), h = Object[Symbol.hasInstance];
      t.prototype[l] = true, Object.defineProperty(t, Symbol.hasInstance, { value: function(u) {
        return this === t ? u && !!u[l] : h.call(this, u);
      } });
    }
    if (i.prototype[r.ref]) return i;
    if (r.uses) for (let l of r.uses) Ve(i, l);
    r.augments.add(i), e.uses || (e.uses = []), e.uses.push(t);
    let n = Object.getOwnPropertyDescriptors(t.prototype);
    return delete n.constructor, n[le] && (e.inits || (e.inits = []), e.inits.push(t.prototype[le]), delete n[le]), Object.defineProperties(i.prototype, n), (t == null ? void 0 : t.mixed) instanceof Function && t.mixed(i), i;
  }
  var Y = { cache: {}, self: null, target: null, proxy: new Proxy({}, { apply: (i, t, e) => Reflect.apply(Y.target, t, e), get: (i, t) => {
    let e = Reflect.get(Y.target, t, Y.self);
    return e instanceof Function ? e.bind(Y.self) : e;
  }, set: (i, t, e, r) => Reflect.set(Y.target, t, e, Y.self) }) };
  function c(i, t, e, r, s = null) {
    var u;
    let n = Object.getPrototypeOf(i.prototype), o = (r & (Tt.HasMixins | Tt.IsExtension)) == Tt.HasMixins, l;
    if (o && (Dt.set(i, Dt.get(n.constructor)), n = Object.getPrototypeOf(n)), s) {
      let d = r & Tt.IsObjectExtension ? s : s.prototype, a = Et(i);
      if (a.uses) {
        s === d && console.warn("Cannot extend object with mixins");
        for (let $ of a.uses) Ve(s, $);
      }
      return r & Tt.HasSuperCalls && (Y.cache[t] = Object.create(Object.getPrototypeOf(d), Object.getOwnPropertyDescriptors(d))), _o(d, i.prototype), s;
    }
    let h = n == null ? void 0 : n.constructor;
    if (l = Et(i, { symbol: t }), Object.defineProperty(i, Iu, { value: l, enumerable: false, configurable: true }), e && i.name !== e && Object.defineProperty(i, "name", { value: e, configurable: true }), l.flags = r, r & Tt.HasConstructor && (i.prototype[xo] = t), l.uses) for (let d of l.uses) (u = d.mixes) == null || u.call(d, i);
    return (h == null ? void 0 : h.inherited) instanceof Function && h.inherited(i), i;
  }
  var he = /* @__PURE__ */ Symbol.for("#__listeners__");
  var Fu = /* @__PURE__ */ Symbol();
  var Xr = class Xr2 {
    static for(t) {
      return new Proxy({}, new this(t));
    }
    constructor(t) {
      this.getter = t;
    }
    get target() {
      return this.getter();
    }
    get(t, e) {
      return this.target[e];
    }
    set(t, e, r) {
      return this.target[e] = r, true;
    }
  };
  c(Xr, Fu, "LazyProxy", 16);
  var Gr = Xr;
  function Eo(i, t = {}) {
    return new Proxy(t, new Gr(i));
  }
  function ue(i) {
    let t = typeof i;
    if (t == "number") return i;
    if (t == "string") {
      if (/^\d+fps$/.test(i)) return 1e3 / parseFloat(i);
      if (/^([-+]?[\d\.]+)s$/.test(i)) return parseFloat(i) * 1e3;
      if (/^([-+]?[\d\.]+)ms$/.test(i)) return parseFloat(i);
    }
    return null;
  }
  function je(i, t, e) {
    if (!i) return;
    let r = Object.getOwnPropertyDescriptor(i, t);
    return r || i == e ? r || void 0 : je(Reflect.getPrototypeOf(i), t, e);
  }
  var To = function(i, t, e) {
    let r, s, n;
    for (; (r = e) && (e = e.next); ) (s = e.listener) && (e.path && s[e.path] ? n = t ? s[e.path].apply(s, t) : s[e.path]() : n = t ? s.apply(e, t) : s.call(e)), e.times && --e.times <= 0 && (r.next = e.next, e.listener = null);
  };
  function j(i, t, e, r) {
    let s, n, o;
    return s = i[he] || (i[he] = {}), n = s[t] || (s[t] = {}), o = n.tail || (n.tail = n.next = {}), o.listener = e, o.path = r, n.tail = o.next = {}, o;
  }
  function M(i, t, e) {
    let r = j(i, t, e);
    return r.times = 1, r;
  }
  function Nt(i, t, e, r) {
    if (!e) return;
    let s, n, o = i[he];
    if (o && (s = o[t])) {
      for (; (n = s) && (s = s.next); ) if (s == e || s.listener == e) {
        n.next = s.next, s.listener = null;
        break;
      }
    }
  }
  function q(i, t, e = null) {
    let r;
    (r = i[he]) && (r[t] && To(t, e, r[t]), r.all && To(t, [t, e], r.all));
  }
  var Mu = /* @__PURE__ */ Symbol();
  var Qr = class Qr2 {
    emit(t, ...e) {
      return q(this, t, e);
    }
    on(t, ...e) {
      return j(this, t, ...e);
    }
    once(t, ...e) {
      return M(this, t, ...e);
    }
    un(t, ...e) {
      return Nt(this, t, ...e);
    }
  };
  c(Qr, Mu, "Emitter", 0);
  var zt = Qr;
  function Jr(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function Ru(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var No = /* @__PURE__ */ Symbol.for("#__init__");
  var Co = /* @__PURE__ */ Symbol.for("#schedule");
  var Zr = /* @__PURE__ */ Symbol.for("#frames");
  var qe = /* @__PURE__ */ Symbol.for("#interval");
  var Vt = /* @__PURE__ */ Symbol.for("#stage");
  var Kt = /* @__PURE__ */ Symbol.for("#scheduled");
  var He = /* @__PURE__ */ Symbol.for("#version");
  var Au = /* @__PURE__ */ Symbol.for("#fps");
  var Io = /* @__PURE__ */ Symbol.for("#ticker");
  var Du = globalThis.requestAnimationFrame || function(i) {
    return globalThis.setTimeout(i, 1e3 / 60);
  };
  var xp = 1 / 60;
  var zu = /* @__PURE__ */ Symbol();
  var ri = class ri2 {
    constructor(t = null) {
      this[No](t);
    }
    [No](t = null, e = true, r = true) {
      var s;
      this.owner = t && (s = t.owner) !== void 0 ? s : null, this.target = t && (s = t.target) !== void 0 ? s : null, this.active = t && (s = t.active) !== void 0 ? s : false, this.value = t && (s = t.value) !== void 0 ? s : void 0, this.skip = t && (s = t.skip) !== void 0 ? s : 0, this.last = t && (s = t.last) !== void 0 ? s : 0;
    }
    tick(t, e) {
      return this.last = this.owner[Zr], this.target.tick(this, e), 1;
    }
    update(t, e) {
      let r = this.active, s = t.value;
      return this.value != s && (this.deactivate(), this.value = s), (this.value || r || e) && this.activate(), this;
    }
    queue() {
      this.owner.add(this);
    }
    activate() {
      return this.value === true ? this.owner.on("commit", this) : this.value === false || typeof this.value == "number" && (this.value / 16.666666666666668 <= 2 ? this.owner.on("raf", this) : this[qe] = globalThis.setInterval(this.queue.bind(this), this.value)), this.active = true, this;
    }
    deactivate() {
      return this.value === true && this.owner.un("commit", this), this.owner.un("raf", this), this[qe] && (globalThis.clearInterval(this[qe]), this[qe] = null), this.active = false, this;
    }
  };
  c(ri, zu, "Scheduled", 16);
  var ti = ri;
  var Vu = /* @__PURE__ */ Symbol();
  var ii = class ii2 {
    constructor() {
      var t = this;
      this.id = /* @__PURE__ */ Symbol(), this.queue = [], this.stage = -1, this[Vt] = -1, this[Zr] = 0, this[Kt] = false, this[He] = 0, this.listeners = {}, this.intervals = {}, this.commit = function() {
        return t.add("commit"), t;
      }, this[Au] = 0, this.$promise = null, this.$resolve = null, this[Io] = function(e) {
        return t[Kt] = false, t.tick(e);
      };
    }
    touch() {
      return this[He]++;
    }
    get version() {
      return this[He];
    }
    add(t, e = false) {
      return (e || this.queue.indexOf(t) == -1) && this.queue.push(t), this[Kt] || this[Co](), this;
    }
    get committing\u03A6() {
      return this.queue.indexOf("commit") >= 0;
    }
    get syncing\u03A6() {
      return this[Vt] == 1;
    }
    listen(t, e) {
      let r = this.listeners[t], s = !r;
      return r || (r = this.listeners[t] = /* @__PURE__ */ new Set()), r.add(e), t == "raf" && s && this.add("raf"), this;
    }
    unlisten(t, e) {
      var r;
      let s = this.listeners[t];
      return s && s.delete(e), t == "raf" && s && s.size == 0 && (r = this.listeners.raf, delete this.listeners.raf), this;
    }
    on(t, e) {
      return this.listen(t, e);
    }
    un(t, e) {
      return this.unlisten(t, e);
    }
    get promise() {
      var t = this;
      return this.$promise || (this.$promise = new Promise(function(e) {
        return t.$resolve = e;
      }));
    }
    tick(t) {
      var e = this;
      let r = this.queue, s = this[Zr]++;
      if (this.ts || (this.ts = t), this.dt = t - this.ts, this.ts = t, this.queue = [], this[Vt] = 1, this[He]++, r.length) for (let n = 0, o = Ru(r), l = o.length; n < l; n++) {
        let h = o[n];
        typeof h == "string" && this.listeners[h] ? this.listeners[h].forEach(function(u) {
          if (Jr(u.tick, Function)) return u.tick(e, h);
          if (Jr(u, Function)) return u(e, h);
        }) : Jr(h, Function) ? h(this.dt, this) : h.tick && h.tick(this.dt, this);
      }
      return this[Vt] = this[Kt] ? 0 : -1, this.$promise && (this.$resolve(this), this.$promise = this.$resolve = null), this.listeners.raf && this.add("raf"), this;
    }
    [Co]() {
      return this[Kt] || (this[Kt] = true, this[Vt] == -1 && (this[Vt] = 0), Du(this[Io])), this;
    }
    schedule(t, e) {
      var s, n;
      return e || (e = t[s = this.id] || (t[s] = { value: true })), (e[n = this.id] || (e[n] = new ti({ owner: this, target: t }))).update(e, true);
    }
    unschedule(t, e = {}) {
      e || (e = t[this.id]);
      let r = e && e[this.id];
      return r && r.active && r.deactivate(), this;
    }
  };
  c(ii, Vu, "Scheduler", 16);
  var ei = ii;
  var P = new ei();
  function L() {
    return P.add("commit").promise;
  }
  function Ku(i, t) {
    return globalThis.setTimeout(function() {
      i(), L();
    }, t);
  }
  function ju(i, t) {
    return globalThis.setInterval(function() {
      i(), L();
    }, t);
  }
  var qu = globalThis.clearInterval;
  var Hu = globalThis.clearTimeout;
  var ae = globalThis.imba || (globalThis.imba = {});
  ae.commit = L;
  ae.setTimeout = Ku;
  ae.setInterval = ju;
  ae.clearInterval = qu;
  ae.clearTimeout = Hu;
  var Uu = /* @__PURE__ */ Symbol();
  var jt;
  var Fp = new (jt = class {
  }, c(jt, Uu, "Env", 0), jt)();
  function Bu(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var ce = /* @__PURE__ */ Symbol.for("#idler");
  var fe = /* @__PURE__ */ Symbol.for("#resolve");
  var Wu = /* @__PURE__ */ Symbol();
  var si = class si2 extends Set {
    constructor() {
      super(), this[ce] = Promise.resolve(this);
    }
    emit(t, ...e) {
      return q(this, t, e);
    }
    on(t, ...e) {
      return j(this, t, ...e);
    }
    once(t, ...e) {
      return M(this, t, ...e);
    }
    un(t, ...e) {
      return Nt(this, t, ...e);
    }
    add(t) {
      var e = this;
      if (Bu(t, Function) && (t = t()), !this.has(t)) {
        let r = this.size == 0;
        super.add(t), r && (this[ce] = this[fe] = null, this.emit("busy", this)), this.emit("add", t, this);
        let s = function() {
          return e.delete(t);
        };
        t.then(s, s);
      }
      return t;
    }
    delete(t) {
      return super.delete(t) ? (this.emit("delete", t, this), this.size == 0 && (this[fe] && (this[fe](true), this[fe] = null), this.emit("idle", this)), true) : false;
    }
    get idle() {
      var t = this;
      return this[ce] || (this[ce] = new Promise(function(e) {
        return t.size == 0 ? e(true) : t[fe] = e;
      }));
    }
    get idle\u03A6() {
      return this.size == 0;
    }
    then(t, e) {
      return this.idle.then(t, e);
    }
  };
  c(si, Wu, "Queue", 24);
  var Ue = si;
  var ko = /* @__PURE__ */ Symbol.for("#toStringDeopt");
  var de = /* @__PURE__ */ Symbol.for("#named");
  var Fo = /* @__PURE__ */ Symbol.for("#symbols");
  var Mo = /* @__PURE__ */ Symbol.for("#batches");
  var Ro = /* @__PURE__ */ Symbol.for("#extras");
  var ni = /* @__PURE__ */ Symbol.for("#stacks");
  var Gu = /* @__PURE__ */ Symbol();
  var oi = class oi2 {
    constructor(t) {
      this.dom = t, this.string = "";
    }
    contains(t) {
      return this.dom.classList.contains(t);
    }
    has(t) {
      return this.dom.classList.contains(t);
    }
    add(t) {
      return this.contains(t) ? this : (this.string += (this.string ? " " : "") + t, this.dom.classList.add(t), this);
    }
    set(t, e) {
      this[de] || (this[de] = {});
      let r = this[de][t];
      return r != e && (r && this.decr(r), e && this.incr(e), this[de][t] = e), this;
    }
    remove(t) {
      if (!this.contains(t)) return this;
      let e = new RegExp("(^|\\s)" + t + "(?=\\s|$)", "g");
      return this.string = this.string.replace(e, ""), this.dom.classList.remove(t), this;
    }
    toggle(t, e) {
      return e === void 0 && (e = !this.contains(t)), e ? this.add(t) : this.remove(t);
    }
    incr(t, e = 0) {
      var r = this;
      let s = this.stacks, n = s[t] || 0;
      return n < 1 && this.add(t), e > 0 && setTimeout(function() {
        return r.decr(t);
      }, e), s[t] = Math.max(n, 0) + 1;
    }
    decr(t) {
      let e = this.stacks, r = e[t] || 0;
      return r == 1 && this.remove(t), e[t] = Math.max(r, 1) - 1;
    }
    reconcile(t, e, r) {
      let s = this[Fo], n = this[Mo], o = true;
      if (!s) s = this[Fo] = [t], n = this[Mo] = [e || ""], r && (this.dom.className || "").indexOf(r) == -1 && (s.push(t), n.push(r)), this.toString = this.valueOf = this[ko];
      else {
        let l = s.indexOf(t), h = e || "";
        l == -1 ? (s.push(t), n.push(h), r && (this.dom.className || "").indexOf(r) == -1 && (s.push(t), n.push(r))) : n[l] != h ? n[l] = h : o = false;
      }
      o && (this[Ro] = " " + n.join(" "), this.sync());
    }
    valueOf() {
      return this.string;
    }
    toString() {
      return this.string;
    }
    [ko]() {
      return this.string + (this[Ro] || "");
    }
    sync() {
      return this.dom.flagSync$();
    }
    get stacks() {
      return this[ni] || (this[ni] = {});
    }
  };
  c(oi, Gu, "Flags", 16);
  var Ht = oi;
  var Ao = /* @__PURE__ */ Symbol.for("#__init__");
  var li = /* @__PURE__ */ Symbol.for("#getRenderContext");
  var Xu = /* @__PURE__ */ Symbol.for("#getDynamicContext");
  var Qu = /* @__PURE__ */ Symbol.for("#removeFromCache");
  var k = { context: null, document: null, createTextNode: function(i) {
    return globalThis.document.createTextNode(i);
  } };
  var Ju = /* @__PURE__ */ Symbol();
  var ui = class ui2 {
    constructor(t = null) {
      this[Ao](t);
    }
    [Ao](t = null, e = true, r = true) {
      var s;
      this.stack = t && (s = t.stack) !== void 0 ? s : [], this.moving = t && (s = t.moving) !== void 0 ? s : /* @__PURE__ */ new Set();
    }
    push(t) {
      return this.stack.push(t);
    }
    pop(t) {
      return this.stack.pop();
    }
  };
  c(ui, Ju, "Renderer", 16);
  var hi = ui;
  var G = new hi();
  var Zu = /* @__PURE__ */ Symbol();
  var We = class We2 extends Map {
    constructor(t, e = null) {
      super(), this._ = t, this.sym = e;
    }
    pop() {
      return k.context = null;
    }
    [li](t) {
      let e = this.get(t);
      return e || this.set(t, e = new We2(this._, t)), k.context = e;
    }
    [Xu](t, e) {
      return this[li](t)[li](e);
    }
    [Qu](t) {
      let e = this[t];
      return e && (this.delete(e), this[t] = null, this.value == e && (this.value = null)), this;
    }
    run(t, e = 1) {
      if (this.value = t, k.context == this && (k.context = null), e == 0) {
        let r = t;
        if (typeof r == "number" && (r = String(r)), typeof r == "string") {
          let s = this.text || (this.text = k.createTextNode(r));
          return r != s.textContent && (s.textContent = r), s;
        }
      }
      return this.get(t);
    }
    cache(t) {
      return this.set(this.value, t), t;
    }
  };
  c(We, Zu, "RenderContext", 16);
  var ct = We;
  function Ye(i, t = /* @__PURE__ */ Symbol(), e = i) {
    return k.context = i[t] || (i[t] = new ct(e, t));
  }
  function Gp() {
    let i = k.context, t = i || new ct(null);
    return globalThis.DEBUG_IMBA && !i && G.stack.length > 0 && console.trace("detected unmemoized nodes in", G.stack.slice(0), "see https://imba.io", t), i && (k.context = null), t;
  }
  function mi(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function ta(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var ye = /* @__PURE__ */ Symbol.for("#parent");
  var Do = /* @__PURE__ */ Symbol.for("#closestNode");
  var ea = /* @__PURE__ */ Symbol.for("#parentNode");
  var ra = /* @__PURE__ */ Symbol.for("#context");
  var il = /* @__PURE__ */ Symbol.for("##inited");
  var ai = /* @__PURE__ */ Symbol.for("#getRenderContext");
  var ia = /* @__PURE__ */ Symbol.for("#getDynamicContext");
  var zo = /* @__PURE__ */ Symbol.for("#insertChild");
  var $e = /* @__PURE__ */ Symbol.for("#appendChild");
  var ci = /* @__PURE__ */ Symbol.for("#replaceChild");
  var Vo = /* @__PURE__ */ Symbol.for("#removeChild");
  var ht = /* @__PURE__ */ Symbol.for("#insertInto");
  var Ko = /* @__PURE__ */ Symbol.for("#insertIntoDeopt");
  var pe = /* @__PURE__ */ Symbol.for("#removeFrom");
  var jo = /* @__PURE__ */ Symbol.for("#removeFromDeopt");
  var Ut = /* @__PURE__ */ Symbol.for("#replaceWith");
  var qo = /* @__PURE__ */ Symbol.for("#replaceWithDeopt");
  var fi = /* @__PURE__ */ Symbol.for("#placeholderNode");
  var sa = /* @__PURE__ */ Symbol.for("#attachToParent");
  var na = /* @__PURE__ */ Symbol.for("#detachFromParent");
  var Ho = /* @__PURE__ */ Symbol.for("#placeChild");
  var oa = /* @__PURE__ */ Symbol.for("#beforeReconcile");
  var la = /* @__PURE__ */ Symbol.for("#afterReconcile");
  var ha = /* @__PURE__ */ Symbol.for("#afterVisit");
  var ua = /* @__PURE__ */ Symbol.for("#visitContext");
  var sl = /* @__PURE__ */ Symbol.for("#__init__");
  var nl = /* @__PURE__ */ Symbol.for("##parent");
  var Ge = /* @__PURE__ */ Symbol.for("##up");
  var di = /* @__PURE__ */ Symbol.for("##context");
  var Ct = /* @__PURE__ */ Symbol.for("#domNode");
  var me = /* @__PURE__ */ Symbol.for("##placeholderNode");
  var Uo = /* @__PURE__ */ Symbol.for("#forNode");
  var Bo = /* @__PURE__ */ Symbol.for("#domDeopt");
  var ge = /* @__PURE__ */ Symbol.for("##visitContext");
  var ol = /* @__PURE__ */ Symbol.for("#isRichElement");
  var Wo = /* @__PURE__ */ Symbol.for("#src");
  var Bt = /* @__PURE__ */ Symbol.for("#htmlNodeName");
  var aa = /* @__PURE__ */ Symbol.for("#getSlot");
  var Go = /* @__PURE__ */ Symbol.for("#cssns");
  var ca = /* @__PURE__ */ Symbol.for("#cssid");
  var Je = window.Event;
  var im = window.UIEvent;
  var sm = window.FocusEvent;
  var ll = window.MouseEvent;
  var hl = window.PointerEvent;
  var ul = window.KeyboardEvent;
  var R = window.CustomEvent;
  var vi = window.Node;
  var Si = window.Comment;
  var al = window.Text;
  var N = window.Element;
  var nm = window.HTMLElement;
  var om = window.HTMLHtmlElement;
  var cl = window.HTMLSelectElement;
  var fl = window.HTMLInputElement;
  var dl = window.HTMLTextAreaElement;
  var pl = window.HTMLButtonElement;
  var ml = window.HTMLOptionElement;
  var lm = window.HTMLScriptElement;
  var hm = window.SVGElement;
  var um = window.DocumentFragment;
  var am = window.ShadowRoot;
  var gl = window.Document;
  var cm = window.Window;
  var fm = window.customElements;
  var pi = {};
  function yl(i, t, e) {
    if (!i) return e[t] = null;
    if (e[t] !== void 0) return e[t];
    let r = Object.getOwnPropertyDescriptor(i, t);
    return r !== void 0 || i == SVGElement ? e[t] = r || null : yl(Reflect.getPrototypeOf(i), t, e);
  }
  var gi = {};
  var yi = {};
  var $i = {};
  var fa = {};
  function Ze() {
    return globalThis.document;
  }
  var da = { get(i, t) {
    let e = i, r;
    for (; e && r == null; ) (e = e[ye]) && (r = e[t]);
    return r;
  }, set(i, t, e) {
    let r = i, s;
    for (; r && s == null; ) {
      if (je(r, t, Element)) return r[t] = e, true;
      r = r[ye];
    }
    return true;
  } };
  var pa = /* @__PURE__ */ Symbol();
  var wi = class wi2 {
    get flags() {
      return this.documentElement.flags;
    }
    emit(...t) {
      return this.documentElement.emit(...t);
    }
  };
  c(wi, pa, "Document", 1, Document);
  Node.prototype[sl] = function() {
    return this;
  };
  var ma = /* @__PURE__ */ Symbol();
  var _i = class _i2 {
    get [ye]() {
      return this[nl] || this.parentNode || this[Ge];
    }
    get [Do]() {
      return this;
    }
    get [ea]() {
      var t;
      return (t = this[ye]) == null ? void 0 : t[Do];
    }
    get [ra]() {
      return this[di] || (this[di] = new Proxy(this, da));
    }
    [il]() {
      return this;
    }
    [ai](t) {
      return Ye(this, t);
    }
    [ia](t, e) {
      return this[ai](t)[ai](e);
    }
    [zo](t, e) {
      return t[ht](this, e);
    }
    [$e](t) {
      return t[ht](this, null);
    }
    [ci](t, e) {
      let r = this[zo](t, e);
      return this[Vo](e), r;
    }
    [Vo](t) {
      return t[pe](this);
    }
    [ht](t, e = null) {
      return e ? t.insertBefore(this, e) : t.appendChild(this), this;
    }
    [Ko](t, e) {
      return e ? t.insertBefore(this[Ct] || this, e) : t.appendChild(this[Ct] || this), this;
    }
    [pe](t) {
      return t.removeChild(this);
    }
    [jo](t) {
      return t.removeChild(this[Ct] || this);
    }
    [Ut](t, e) {
      return e[ci](t, this);
    }
    [qo](t, e) {
      return e[ci](t, this[Ct] || this);
    }
    get [fi]() {
      let t;
      return this[me] || (this[me] = (t = globalThis.document.createComment("placeholder"), t[Uo] = this, t));
    }
    set [fi](t) {
      let e = this[me];
      this[me] = t, t[Uo] = this, e && e != t && e.parentNode && e[Ut](t);
    }
    [sa]() {
      let t = this[Ct], e = t && t.parentNode;
      return t && e && t != this && (this[Ct] = null, this[ht](e, t), t[pe](e)), this;
    }
    [na]() {
      this[Bo] != true && (this[Bo] = true, true) && (this[Ut] = this[qo], this[pe] = this[jo], this[ht] = this[Ko], this[Ge] || (this[Ge] = this[ye]));
      let t = this[fi];
      return this.parentNode && t != this && (t[ht](this.parentNode, this), this[pe](this.parentNode)), this[Ct] = t, this;
    }
    [Ho](t, e, r) {
      let s = typeof t;
      if (s === "undefined" || t === null) {
        if (r && mi(r, Comment)) return r;
        let n = globalThis.document.createComment("");
        return r ? r[Ut](n, this) : n[ht](this, null);
      }
      if (t === r) return t;
      if (s !== "object") {
        let n, o = t;
        return r ? mi(r, Text) ? (r.textContent = o, r) : (n = globalThis.document.createTextNode(o), r[Ut](n, this), n) : (this.appendChild(n = globalThis.document.createTextNode(o)), n);
      } else return t[ht] ? r ? r[Ut](t, this) : t[ht](this, null) : this[Ho](String(t), e, r);
    }
  };
  c(_i, ma, "Node", 1, Node);
  var ga = /* @__PURE__ */ Symbol();
  var Ti = class Ti2 {
    log(...t) {
      return console.log(...t);
    }
    get hidden\u03A6() {
      var e, r;
      let t = globalThis.getComputedStyle(this);
      return t.display == "none" || t.visibility == "hidden" ? true : this.offsetParent || this === globalThis.document.body ? false : (r = (e = this.parentElement) == null ? void 0 : e.hidden\u03A6) != null ? r : true;
    }
    get detached\u03A6() {
      return !globalThis.document.documentElement.contains(this);
    }
    get unobstructed\u03A6() {
      let t = this.getBoundingClientRect(), e = window.visualViewport, r = t.left + t.width * 0.5, s = t.top + t.height * 0.5;
      if (e.width > r && r > 0 && e.height > s && s > 0) {
        let n = globalThis.document.elementFromPoint(r, s);
        return !!(n && (n.contains(this) || this.contains(n)));
      }
      return false;
    }
    get focus\u03A6() {
      return globalThis.document.activeElement == this;
    }
    get focin\u03A6() {
      return this.contains(globalThis.document.activeElement);
    }
    emit(t, e, r = {}) {
      var o, l, h;
      e != null && ((o = r.detail) != null || (r.detail = e)), (l = r.bubbles) != null || (r.bubbles = true), (h = r.cancelable) != null || (r.cancelable = true);
      let s = new CustomEvent(t, r);
      r.original && (s.originalEvent = r.original);
      let n = this.dispatchEvent(s);
      return s;
    }
    text$(t) {
      return this.textContent = t, this;
    }
    [oa]() {
      return this;
    }
    [la]() {
      return this;
    }
    [ha]() {
      this[ge] && (this[ge] = null);
    }
    get [ua]() {
      return this[ge] || (this[ge] = {});
    }
    get flags() {
      return this.$flags || (this.$flags = new Ht(this), this.flag$ == Element.prototype.flag$ && (this.flags$ext = this.className), this.flagDeopt$()), this.$flags;
    }
    flag$(t) {
      let e = this.flags$ns;
      this.className = e ? e + (this.flags$ext = t) : this.flags$ext = t;
    }
    flagDeopt$() {
      var t = this;
      this.flag$ = this.flagExt$, this.flagSelf$ = function(e) {
        return t.flagSync$(t.flags$own = e);
      };
    }
    flagExt$(t) {
      return this.flagSync$(this.flags$ext = t);
    }
    flagSelf$(t) {
      return this.flagDeopt$(), this.flagSelf$(t);
    }
    flagSync$() {
      return this.className = (this.flags$ns || "") + (this.flags$ext || "") + " " + (this.flags$own || "") + " " + (this.$flags || "");
    }
    set$(t, e) {
      let r = je(this, t, Element);
      !r || !r.set ? this.setAttribute(t, e) : this[t] = e;
    }
    get richValue() {
      return this.value;
    }
    set richValue(t) {
      this.value = t;
    }
  };
  c(Ti, ga, "Element", 1, Element);
  Element.prototype.setns$ = Element.prototype.setAttributeNS;
  Element.prototype[ol] = true;
  function pm(i, t, e, r) {
    let s = globalThis.document.createElement(i);
    return e && (s.className = e), r !== null && s.text$(r), t && t[$e] && t[$e](s), s;
  }
  var ya = /* @__PURE__ */ Symbol();
  var Ei = class Ei2 {
    set$(t, e) {
      var n;
      let r = pi[n = this.nodeName] || (pi[n] = {}), s = yl(this, t, r);
      !s || !s.set ? this.setAttribute(t, e) : this[t] = e;
    }
    flag$(t) {
      let e = this.flags$ns;
      this.setAttribute("class", e ? e + (this.flags$ext = t) : this.flags$ext = t);
    }
    flagSelf$(t) {
      var e = this;
      return this.flag$ = function(r) {
        return e.flagSync$(e.flags$ext = r);
      }, this.flagSelf$ = function(r) {
        return e.flagSync$(e.flags$own = r);
      }, this.flagSelf$(t);
    }
    flagSync$() {
      return this.setAttribute("class", (this.flags$ns || "") + (this.flags$ext || "") + " " + (this.flags$own || "") + " " + (this.$flags || ""));
    }
  };
  c(Ei, ya, "SVGElement", 1, SVGElement);
  var $a = /* @__PURE__ */ Symbol();
  var Ni = class Ni2 {
    set src(t) {
      if (this[Wo] != t && (this[Wo] = t, true)) {
        if (t && t.adoptNode) t.adoptNode(this);
        else if (t && t.type == "svg") {
          if (t.attributes) for (let e = t.attributes, r = 0, s = Object.keys(e), n = s.length, o, l; r < n; r++) o = s[r], l = e[o], this.setAttribute(o, l);
          this.innerHTML = t.content;
        }
      }
    }
  };
  c(Ni, $a, "SVGSVGElement", 1, SVGSVGElement);
  function ft(i) {
    return globalThis.document.createComment(i);
  }
  function xi(i) {
    return globalThis.document.createTextNode(i);
  }
  var Xe = globalThis.navigator;
  var ba = Xe && Xe.vendor || "";
  var el = Xe && Xe.userAgent || "";
  var va = ba.indexOf("Apple") > -1 || el.indexOf("CriOS") >= 0 || el.indexOf("FxiOS") >= 0;
  var Qe = !va;
  var rl = /* @__PURE__ */ new Map();
  var Sa = /* @__PURE__ */ Symbol();
  var Ci = class Ci2 extends HTMLElement {
    connectedCallback() {
      return Qe ? this.parentNode.removeChild(this) : this.parentNode.connectedCallback();
    }
    disconnectedCallback() {
      if (!Qe) return this.parentNode.disconnectedCallback();
    }
  };
  c(Ci, Sa, "CustomHook", 0);
  var bi = Ci;
  window.customElements.define("i-hook", bi);
  function xa(i, t) {
    let e = rl.get(t);
    if (!e) {
      e = {};
      let r = t.prototype, s = [r];
      for (; (r = r && Object.getPrototypeOf(r)) && r.constructor != i.constructor; ) s.unshift(r);
      for (let n = 0, o = ta(s), l = o.length; n < l; n++) {
        let h = o[n], u = Object.getOwnPropertyDescriptors(h);
        Object.assign(e, u);
      }
      rl.set(t, e);
    }
    return e;
  }
  function wa(i, t, e, r, s) {
    let n;
    typeof i != "string" && i && i.nodeName && (i = i.nodeName);
    let o = yi[i] || i;
    if (gi[i]) {
      let l = gi[i], h = l.prototype[Bt];
      if (h && Qe) n = globalThis.document.createElement(h, { is: o });
      else if (l.create$ && h) {
        n = globalThis.document.createElement(h), n.setAttribute("is", o);
        let u = xa(n, l);
        Object.defineProperties(n, u), n.__slots = {}, n.appendChild(globalThis.document.createElement("i-hook"));
      } else l.create$ ? (n = l.create$(n), n.__slots = {}) : console.warn("could not create tag " + i);
    } else n = globalThis.document.createElement(yi[i] || i);
    return n[nl] = t, n[sl](), n[il](), r !== null && n[aa]("__").text$(r), (e || n.flags$ns) && n.flag$(e || ""), n;
  }
  function bm(i, t, e = {}) {
    $i[i] = fa[i] = t, t.nodeName = i;
    let r = i, s = t.prototype;
    if (i.indexOf("-") == -1 && (r = "" + i + "-tag", yi[i] = r), e.cssns) {
      let n = (s._ns_ || s[Go] || "") + " " + (e.cssns || "");
      s._ns_ = n.trim() + " ", s[Go] = e.cssns;
    }
    if (e.cssid) {
      let n = (s.flags$ns || "") + " " + e.cssid;
      s[ca] = e.cssid, s.flags$ns = n.trim() + " ";
    }
    return s[Bt] && !e.extends && (e.extends = s[Bt]), e.extends ? (s[Bt] = e.extends, gi[i] = t, Qe && window.customElements.define(r, t, { extends: e.extends })) : window.customElements.define(r, t), t;
  }
  var Ta = globalThis.imba || (globalThis.imba = {});
  Ta.document = globalThis.document;
  function be(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function Ii(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var sr = /* @__PURE__ */ Symbol.for("#parent");
  var $l = /* @__PURE__ */ Symbol.for("#closestNode");
  var Ea = /* @__PURE__ */ Symbol.for("#isRichElement");
  var Na = /* @__PURE__ */ Symbol.for("#afterVisit");
  var Ca = /* @__PURE__ */ Symbol.for("#getRenderContext");
  var bl = /* @__PURE__ */ Symbol.for("#appendChild");
  var vl = /* @__PURE__ */ Symbol.for("#removeChild");
  var Sl = /* @__PURE__ */ Symbol.for("#replaceChild");
  var ut = /* @__PURE__ */ Symbol.for("#insertInto");
  var tr = /* @__PURE__ */ Symbol.for("#replaceWith");
  var xl = /* @__PURE__ */ Symbol.for("#insertChild");
  var er = /* @__PURE__ */ Symbol.for("#removeFrom");
  var wl = /* @__PURE__ */ Symbol.for("#placeChild");
  var Ia = /* @__PURE__ */ Symbol.for("#registerFunctionalSlot");
  var Oa = /* @__PURE__ */ Symbol.for("#getFunctionalSlot");
  var _l = /* @__PURE__ */ Symbol.for("#getSlot");
  var Pi = /* @__PURE__ */ Symbol.for("##parent");
  var dt = /* @__PURE__ */ Symbol.for("##up");
  var Oi = /* @__PURE__ */ Symbol.for("##flags");
  var Pa = /* @__PURE__ */ Symbol.for("#domFlags");
  var U = /* @__PURE__ */ Symbol.for("#end");
  var Tl = /* @__PURE__ */ Symbol.for("#textContent");
  var rr = /* @__PURE__ */ Symbol.for("#textNode");
  var ir = /* @__PURE__ */ Symbol.for("#functionalSlots");
  function Em() {
    return true;
  }
  var La = /* @__PURE__ */ Symbol();
  var Li = class Li2 {
    constructor() {
      this.childNodes = [];
    }
    log(...t) {
    }
    hasChildNodes() {
      return false;
    }
    set [sr](t) {
      this[Pi] = t;
    }
    get [sr]() {
      return this[Pi] || this[dt];
    }
    get [$l]() {
      return this[sr][$l];
    }
    get [Ea]() {
      return true;
    }
    get flags() {
      return this[Oi] || (this[Oi] = new Ht(this));
    }
    flagSync$() {
      return this;
    }
    [Na]() {
      return this;
    }
    [Ca](t) {
      return Ye(this, t);
    }
  };
  c(Li, La, "Fragment", 16);
  var pt = Li;
  var ka = 0;
  var Fa = /* @__PURE__ */ Symbol();
  var ki = class ki2 extends pt {
    constructor(t, e) {
      super(...arguments), this[dt] = e, this.parentNode = null, this[Pa] = t, this.childNodes = [], this[U] = ft("slot" + ka++), e && e[bl](this);
    }
    get [sr]() {
      return this[Pi] || this.parentNode || this[dt];
    }
    set textContent(t) {
      this[Tl] = t;
    }
    get textContent() {
      return this[Tl];
    }
    hasChildNodes() {
      for (let t = 0, e = Ii(this.childNodes), r = e.length; t < r; t++) {
        let s = e[t];
        if (be(s, pt) && s.hasChildNodes()) return true;
        if (!be(s, Si)) {
          if (be(s, vi)) return true;
        }
      }
      return false;
    }
    text$(t) {
      return this[rr] ? this[rr].textContent = t : this[rr] = this[wl](t), this[rr];
    }
    appendChild(t) {
      return this.parentNode && t[ut](this.parentNode, this[U]), this.childNodes.push(t);
    }
    [bl](t) {
      var e;
      return this.parentNode ? t[ut](this.parentNode, this[U]) : (e = t[dt]) != null || (t[dt] = this[dt] || this), this.childNodes.push(t);
    }
    insertBefore(t, e) {
      this.parentNode && this.parentNode[xl](t, e);
      let r = this.childNodes.indexOf(e);
      return r >= 0 && this.childNodes.splice(r, 0, t), t;
    }
    [vl](t) {
      this.parentNode && this.parentNode[vl](t);
      let e = this.childNodes.indexOf(t);
      e >= 0 && this.childNodes.splice(e, 1);
    }
    [Sl](t, e) {
      this.parentNode && this.parentNode[Sl](t, e);
      let r = this.childNodes.indexOf(e);
      return this.childNodes[r] = t, t;
    }
    [ut](t, e) {
      let r = this.parentNode;
      if (this.parentNode != t && (this.parentNode = t, true)) {
        this[U] && (e = this[U][ut](t, e));
        for (let s = 0, n = Ii(this.childNodes), o = n.length; s < o; s++) n[s][ut](t, e);
      }
      return this;
    }
    [tr](t, e) {
      let r = t[ut](e, this[U]);
      return this[er](e), r;
    }
    [xl](t, e) {
      if (this.parentNode && this.insertBefore(t, e || this[U]), e) {
        let r = this.childNodes.indexOf(e);
        r >= 0 && this.childNodes.splice(r, 0, t);
      } else this.childNodes.push(t);
      return t;
    }
    [er](t) {
      for (let e = 0, r = Ii(this.childNodes), s = r.length; e < s; e++) r[e][er](t);
      return this[U] && this[U][er](t), this.parentNode = null, this;
    }
    [wl](t, e, r) {
      let s = this.parentNode, n = typeof t;
      if (n === "undefined" || t === null) {
        if (r && be(r, Si)) return r;
        let o = ft("");
        if (r) {
          let l = this.childNodes.indexOf(r);
          return this.childNodes.splice(l, 1, o), s && r[tr](o, s), o;
        }
        return this.childNodes.push(o), s && o[ut](s, this[U]), o;
      }
      if (t === r) return t;
      if (n !== "object") {
        let o, l = t;
        if (r) {
          if (be(r, al)) return r.textContent = l, r;
          {
            o = xi(l);
            let h = this.childNodes.indexOf(r);
            return this.childNodes.splice(h, 1, o), s && r[tr](o, s), o;
          }
        } else return this.childNodes.push(o = xi(l)), s && o[ut](s, this[U]), o;
      } else if (r) {
        let o = this.childNodes.indexOf(r);
        return this.childNodes.splice(o, 1, t), s && r[tr](t, s), t;
      } else return this.childNodes.push(t), s && t[ut](s, this[U]), t;
    }
  };
  c(ki, Fa, "VirtualFragment", 16);
  var nr = ki;
  function or(i, t) {
    let e = new nr(i, null);
    return e[dt] = t, e;
  }
  var Ma = /* @__PURE__ */ Symbol();
  var Fi = class Fi2 {
    [Ia](t) {
      let e = this[ir] || (this[ir] = {});
      return e[t] || (e[t] = or(0, this));
    }
    [Oa](t, e) {
      let r = this[ir];
      return r && r[t] || this[_l](t, e);
    }
    [_l](t, e) {
      var r;
      return t == "__" && !this.render || !this.__slots ? this : (r = this.__slots)[t] || (r[t] = or(0, this));
    }
  };
  c(Fi, Ma, "Node", 1, vi);
  function Ra(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Aa = /* @__PURE__ */ Symbol.for("#afterVisit");
  var lr = /* @__PURE__ */ Symbol.for("#insertInto");
  var Nl = /* @__PURE__ */ Symbol.for("#appendChild");
  var Da = /* @__PURE__ */ Symbol.for("#replaceWith");
  var Mi = /* @__PURE__ */ Symbol.for("#removeFrom");
  var za = /* @__PURE__ */ Symbol.for("#domFlags");
  var Va = /* @__PURE__ */ Symbol.for("##parent");
  var mt = /* @__PURE__ */ Symbol.for("#end");
  var Ka = /* @__PURE__ */ Symbol.for("#removeChild");
  var ja = /* @__PURE__ */ Symbol.for("#insertChild");
  var qa = /* @__PURE__ */ Symbol();
  var Ai = class Ai2 extends pt {
    constructor(t, e) {
      super(...arguments), this[za] = t, this[Va] = e, t & 256 || (this[mt] = ft("list")), this.$ = this.childNodes, this.length = 0, e && e[Nl](this);
    }
    hasChildNodes() {
      return this.length != 0;
    }
    [Aa](t) {
      let e = this.length;
      if (this.length = t, e == t) return;
      let r = this.parentNode;
      if (!r) return;
      let s = this.childNodes, n = this[mt];
      if (e > t) for (; e > t; ) r[Ka](s[--e]);
      else if (t > e) for (; t > e; ) r[ja](s[e++], n);
      this.length = t;
    }
    [lr](t, e) {
      this.parentNode = t, this[mt] && this[mt][lr](t, e), e = this[mt];
      for (let r = 0, s = Ra(this.childNodes), n = s.length; r < n; r++) {
        let o = s[r];
        if (r == this.length) break;
        o[lr](t, e);
      }
      return this;
    }
    [Nl](t) {
    }
    [Da](t, e) {
      let r = t[lr](e, this[mt]);
      return this[Mi](e), r;
    }
    [Mi](t) {
      let e = this.length;
      for (; e > 0; ) this.childNodes[--e][Mi](t);
      this[mt] && t.removeChild(this[mt]), this.parentNode = null;
    }
  };
  c(Ai, qa, "IndexedTagFragment", 16);
  function Cl(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Di = /* @__PURE__ */ Symbol.for("#appendChild");
  var hr = /* @__PURE__ */ Symbol.for("#insertChild");
  var Ha = /* @__PURE__ */ Symbol.for("#replaceWith");
  var ur = /* @__PURE__ */ Symbol.for("#insertInto");
  var zi = /* @__PURE__ */ Symbol.for("#removeFrom");
  var Ua = /* @__PURE__ */ Symbol.for("#afterVisit");
  var ar = /* @__PURE__ */ Symbol.for("#domFlags");
  var Il = /* @__PURE__ */ Symbol.for("##parent");
  var gt = /* @__PURE__ */ Symbol.for("#end");
  var Ol = /* @__PURE__ */ Symbol.for("#removeChild");
  var Ba = /* @__PURE__ */ Symbol();
  var Ki = class Ki2 extends pt {
    constructor(t, e) {
      super(...arguments), this[ar] = t, this[Il] = e, this.changes = /* @__PURE__ */ new Map(), this.dirty = false, this.array = this.childNodes, this.$ = new ct(this, /* @__PURE__ */ Symbol()), t & 256 || (this[gt] = ft("map")), e && e[Di](this);
    }
    [Di](t) {
      if (this.parentNode) return this.parentNode[hr](t, this[gt]);
    }
    hasChildNodes() {
      return this.childNodes.length != 0;
    }
    push(t, e) {
      if (!(this[ar] & 1)) {
        this.array.push(t), this[Di](t);
        return;
      }
      let r = this.array[e];
      if (r !== t) {
        this.dirty = true;
        let s = this.array.indexOf(t), n = this.changes.get(t);
        s === -1 ? (this.array.splice(e, 0, t), this.insertChild(t, e, s)) : s === e + 1 ? (r && this.changes.set(r, -1), this.array.splice(e, 1)) : (s >= 0 && this.array.splice(s, 1), this.array.splice(e, 0, t), this.moveChild(t, e, s)), n == -1 && this.changes.delete(t);
      }
    }
    insertChild(t, e, r) {
      let s = this.parentNode;
      if (s) if (e > 0) {
        let n = this.array[e - 1];
        s[hr](t, n.nextSibling);
      } else s[hr](t, this.childNodes[e + 1] || this[gt]);
    }
    moveChild(t, e, r) {
      return this.insertChild(t, e, r);
    }
    removeChild(t, e) {
      t.parentNode && t[zi](t.parentNode);
    }
    [hr](t, e) {
    }
    [Ha](t, e) {
      let r = t[ur](e, this[gt]);
      return this[zi](e), r;
    }
    [ur](t, e) {
      this[Il] = t;
      let r = this.parentNode;
      if (t != r) {
        this.parentNode = t;
        for (let s = 0, n = Cl(this.array), o = n.length; s < o; s++) n[s][ur](t, e);
        this[gt] && this[gt][ur](t, e);
      }
      return this;
    }
    [zi](t) {
      for (let e = 0, r = Cl(this.array), s = r.length; e < s; e++) {
        let n = r[e];
        t[Ol](n);
      }
      return this[gt] && t[Ol](this[gt]), this.parentNode = null;
    }
    [Ua](t) {
      var e = this;
      if (!(this[ar] & 1)) {
        this[ar] |= 1;
        return;
      }
      if (this.dirty && (this.changes.forEach(function(r, s) {
        if (r == -1) return e.removeChild(s);
      }), this.changes.clear(), this.dirty = false), this.array.length > t) for (; this.array.length > t; ) {
        let r = this.array.pop();
        this.removeChild(r);
      }
    }
  };
  c(Ki, Ba, "KeyedTagFragment", 16);
  var Vi = Ki;
  function Dm(i, t) {
    return new Vi(i, t);
  }
  function Pl(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function Wa(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var fr = /* @__PURE__ */ Symbol.for("#__init__");
  var Ya = /* @__PURE__ */ Symbol.for("##inited");
  var Ga = /* @__PURE__ */ Symbol.for("#afterVisit");
  var Xa = /* @__PURE__ */ Symbol.for("#insertInto");
  var Qa = /* @__PURE__ */ Symbol.for("#insertIntoDeopt");
  var Ja = /* @__PURE__ */ Symbol.for("#beforeReconcile");
  var Za = /* @__PURE__ */ Symbol.for("#afterReconcile");
  var Ll = /* @__PURE__ */ Symbol.for("#__hooks__");
  var It = /* @__PURE__ */ Symbol.for("#autorender");
  var cr = /* @__PURE__ */ Symbol.for("##visitContext");
  var kl = /* @__PURE__ */ Symbol.for("#domNode");
  var tc = /* @__PURE__ */ Symbol();
  var Wt;
  var Fl = new (Wt = class {
    constructor(t = null) {
      this[fr](t);
    }
    [fr](t = null, e = true, r = true) {
      var s;
      this.items = t && (s = t.items) !== void 0 ? s : [], this.current = t && (s = t.current) !== void 0 ? s : null, this.lastQueued = t && (s = t.lastQueued) !== void 0 ? s : null, this.tests = t && (s = t.tests) !== void 0 ? s : 0;
    }
    flush() {
      let t = null;
      for (; t = this.items.shift(); ) {
        if (!t.parentNode || t.hydrated\u03A6) continue;
        let e = this.current;
        this.current = t, t.__F |= 1024;
        try {
          t.connectedCallback();
        } catch (r) {
          console.error(r);
        }
        this.current = e;
      }
    }
    queue(t) {
      var e = this;
      let r = this.items.length, s = 0, n = this.lastQueued;
      this.lastQueued = t;
      let o = Node.DOCUMENT_POSITION_PRECEDING, l = Node.DOCUMENT_POSITION_FOLLOWING;
      if (r) {
        let h = this.items.indexOf(n), u = h, d = function($, x) {
          return e.tests++, $.compareDocumentPosition(x);
        };
        (h == -1 || n.nodeName != t.nodeName) && (u = h = 0);
        let a = this.items[u];
        for (; a && d(a, t) & l; ) a = this.items[++u];
        if (u != h) a ? this.items.splice(u, 0, t) : this.items.push(t);
        else {
          for (; a && d(a, t) & o; ) a = this.items[--u];
          u != h && (a ? this.items.splice(u + 1, 0, t) : this.items.unshift(t));
        }
      } else this.items.push(t), this.current || globalThis.queueMicrotask(this.flush.bind(this));
    }
  }, c(Wt, tc, null, 16), Wt)();
  var ec = /* @__PURE__ */ Symbol();
  var ji = class ji2 extends HTMLElement {
    constructor() {
      super(), this.flags$ns && (this.flag$ = this.flagExt$), this.setup$(), this.build();
    }
    setup$() {
      return this.__slots = {}, this.__F = 0;
    }
    [fr]() {
      return this.__F |= 3, this;
    }
    [Ya]() {
      if (this[Ll]) return this[Ll].inited(this);
    }
    flag$(t) {
      this.className = this.flags$ext = t;
    }
    build() {
      return this;
    }
    awaken() {
      return this;
    }
    mount() {
      return this;
    }
    remount() {
      return this.mount(), this;
    }
    unmount() {
      return this;
    }
    rendered() {
      return this;
    }
    dehydrate() {
      return this;
    }
    hydrate() {
      return this.autoschedule = true, this;
    }
    tick(t, e) {
      return this.commit();
    }
    visit() {
      return this.commit();
    }
    commit() {
      return this.render\u03A6 ? (this.__F |= 256, this.render && this.render(), this.rendered(), this.__F = (this.__F | 512) & -257 & -8193) : (this.__F |= 8192, this);
    }
    get autoschedule() {
      return (this.__F & 64) != 0;
    }
    set autoschedule(t) {
      t ? this.__F |= 64 : this.__F &= -65;
    }
    set autorender(t) {
      let e = this[It] || (this[It] = {});
      e.value = t, this.mounted\u03A6 && P.schedule(this, e);
    }
    get render\u03A6() {
      return !this.suspended\u03A6;
    }
    get mounting\u03A6() {
      return (this.__F & 16) != 0;
    }
    get mounted\u03A6() {
      return (this.__F & 32) != 0;
    }
    get awakened\u03A6() {
      return (this.__F & 8) != 0;
    }
    get rendered\u03A6() {
      return (this.__F & 512) != 0;
    }
    get suspended\u03A6() {
      return (this.__F & 4096) != 0;
    }
    get rendering\u03A6() {
      return (this.__F & 256) != 0;
    }
    get scheduled\u03A6() {
      return (this.__F & 128) != 0;
    }
    get hydrated\u03A6() {
      return (this.__F & 2) != 0;
    }
    get ssr\u03A6() {
      return (this.__F & 1024) != 0;
    }
    get scheduler() {
      return P;
    }
    schedule() {
      return P.on("commit", this), this.__F |= 128, this;
    }
    unschedule() {
      return P.un("commit", this), this.__F &= -129, this;
    }
    async suspend(t = null) {
      let e = this.flags.incr("@suspended");
      return this.__F |= 4096, Pl(t, Function) && (await t(), this.unsuspend()), this;
    }
    unsuspend() {
      return this.flags.decr("@suspended") == 0 && (this.__F &= -4097, this.commit()), this;
    }
    [Ga]() {
      if (this.visit(), this[cr]) return this[cr] = null;
    }
    [Xa](t, e = null) {
      if (this.mounted\u03A6 && t.moveBefore) t.moveBefore(this, e);
      else {
        let r = (this.__F & 32) != 0 && t == this.parentNode;
        r && G.moving.add(this), e ? t.insertBefore(this, e) : t.appendChild(this), r && G.moving.delete(this);
      }
      return this;
    }
    [Qa](t, e) {
      if (this.mounted\u03A6 && t.moveBefore) t.moveBefore(this[kl] || this, e);
      else {
        let r = this[kl] || this, s = (this.__F & 32) != 0 && t == this.parentNode;
        s && G.moving.add(this), e ? t.insertBefore(r, e) : t.appendChild(r), s && G.moving.delete(this);
      }
      return this;
    }
    [Ja]() {
      return this.__F & 1024 && (this.__F = this.__F & -1025, this.classList.remove("_ssr_"), this.flags$ext && this.flags$ext.indexOf("_ssr_") == 0 && (this.flags$ext = this.flags$ext.slice(5)), this.__F & 512 || (this.innerHTML = "")), globalThis.DEBUG_IMBA && G.push(this), this[cr] && (this[cr] = null), this;
    }
    [Za]() {
      return globalThis.DEBUG_IMBA && G.pop(this), this;
    }
    connectedMoveCallback() {
      this.remount();
    }
    connectedCallback() {
      let t = this.__F, e = t & 1, r = t & 8;
      if (t & 16384) {
        this.__F = t & -16385, this.remount();
        return;
      }
      if (!e && !(t & 1024)) {
        Fl.queue(this);
        return;
      }
      if (t & 48) return;
      this.__F |= 16, e || this[fr](), t & 2 || (this.flags$ext = this.className, this.__F |= 2, this.hydrate(), this.commit()), r || (this.awaken(), this.__F |= 8), q(this, "mount", [this]);
      let s = this.mount();
      return s && Pl(s.then, Function) && s.then(P.commit), t = this.__F = (this.__F | 32) & -17, t & 64 && this.schedule(), this[It] && P.schedule(this, this[It]), this;
    }
    disconnectedCallback() {
      var t;
      if (!(this.__F & 16384)) {
        if (G.moving.size) {
          for (let e of Wa(G.moving)) if ((t = e == null ? void 0 : e.contains) != null && t.call(e, this)) {
            this.__F |= 16384;
            return;
          }
        }
        if (this.__F = this.__F & -49, this.__F & 128 && this.unschedule(), q(this, "unmount", [this]), this.unmount(), this[It]) return P.unschedule(this, this[It]);
      }
    }
    dataForTagName(t) {
    }
  };
  c(ji, ec, "Component", 16);
  var Ot = ji;
  function rc(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var Ml = /* @__PURE__ */ Symbol.for("#__init__");
  var ic = { cm: 1, mm: 1, Q: 1, pc: 1, pt: 1, px: 1, em: 1, ex: 1, ch: 1, rem: 1, vw: 1, vh: 1, vmin: 1, vmax: 1, s: 1, ms: 1, fr: 1, "%": 1, in: 1, turn: 1, grad: 1, rad: 1, deg: 1, Hz: 1, kHz: 1 };
  var Rl = { prefix: 1, suffix: 1, content: 1 };
  var Hi = { rose: [[356, 100, 97], [356, 100, 95], [353, 96, 90], [353, 96, 82], [351, 95, 71], [350, 89, 60], [347, 77, 50], [345, 83, 41], [343, 80, 35], [342, 75, 30]], pink: [[327, 73, 97], [326, 78, 95], [326, 85, 90], [327, 87, 82], [329, 86, 70], [330, 81, 60], [333, 71, 51], [335, 78, 42], [336, 74, 35], [336, 69, 30]], fuchsia: [[289, 100, 98], [287, 100, 95], [288, 96, 91], [291, 93, 83], [292, 91, 73], [292, 84, 61], [293, 69, 49], [295, 72, 40], [295, 70, 33], [297, 64, 28]], purple: [[270, 100, 98], [269, 100, 95], [269, 100, 92], [269, 97, 85], [270, 95, 75], [271, 91, 65], [271, 81, 56], [272, 72, 47], [273, 67, 39], [274, 66, 32]], violet: [[250, 100, 98], [251, 91, 95], [251, 95, 92], [252, 95, 85], [255, 92, 76], [258, 90, 66], [262, 83, 58], [263, 70, 50], [263, 69, 42], [264, 67, 35]], indigo: [[226, 100, 97], [226, 100, 94], [228, 96, 89], [230, 94, 82], [234, 89, 74], [239, 84, 67], [243, 75, 59], [245, 58, 51], [244, 55, 41], [242, 47, 34]], blue: [[214, 100, 97], [214, 95, 93], [213, 97, 87], [212, 96, 78], [213, 94, 68], [217, 91, 60], [221, 83, 53], [224, 76, 48], [226, 71, 40], [224, 64, 33]], sky: [[204, 100, 97], [204, 94, 94], [201, 94, 86], [199, 95, 74], [198, 93, 60], [199, 89, 48], [200, 98, 39], [201, 96, 32], [201, 90, 27], [202, 80, 24]], cyan: [[183, 100, 96], [185, 96, 90], [186, 94, 82], [187, 92, 69], [188, 86, 53], [189, 94, 43], [192, 91, 36], [193, 82, 31], [194, 70, 27], [196, 64, 24]], teal: [[166, 76, 97], [167, 85, 89], [168, 84, 78], [171, 77, 64], [172, 66, 50], [173, 80, 40], [175, 84, 32], [175, 77, 26], [176, 69, 22], [176, 61, 19]], emerald: [[152, 81, 96], [149, 80, 90], [152, 76, 80], [156, 72, 67], [158, 64, 52], [160, 84, 39], [161, 94, 30], [163, 94, 24], [163, 88, 20], [164, 86, 16]], green: [[138, 76, 97], [141, 84, 93], [141, 79, 85], [142, 77, 73], [142, 69, 58], [142, 71, 45], [142, 76, 36], [142, 72, 29], [143, 64, 24], [144, 61, 20]], lime: [[78, 92, 95], [80, 89, 89], [81, 88, 80], [82, 85, 67], [83, 78, 55], [84, 81, 44], [85, 85, 35], [86, 78, 27], [86, 69, 23], [88, 61, 20]], yellow: [[55, 92, 95], [55, 97, 88], [53, 98, 77], [50, 98, 64], [48, 96, 53], [45, 93, 47], [41, 96, 40], [35, 92, 33], [32, 81, 29], [28, 73, 26]], amber: [[48, 100, 96], [48, 96, 89], [48, 97, 77], [46, 97, 65], [43, 96, 56], [38, 92, 50], [32, 95, 44], [26, 90, 37], [23, 83, 31], [22, 78, 26]], orange: [[33, 100, 96], [34, 100, 92], [32, 98, 83], [31, 97, 72], [27, 96, 61], [25, 95, 53], [21, 90, 48], [17, 88, 40], [15, 79, 34], [15, 75, 28]], red: [[0, 86, 97], [0, 93, 94], [0, 96, 89], [0, 94, 82], [0, 91, 71], [0, 84, 60], [0, 72, 51], [0, 74, 42], [0, 70, 35], [0, 63, 31]], warmer: [[60, 9, 98], [60, 5, 96], [20, 6, 90], [24, 6, 83], [24, 5, 64], [25, 5, 45], [33, 5, 32], [30, 6, 25], [12, 6, 15], [24, 10, 10]], warm: [[0, 0, 98], [0, 0, 96], [0, 0, 90], [0, 0, 83], [0, 0, 64], [0, 0, 45], [0, 0, 32], [0, 0, 25], [0, 0, 15], [0, 0, 9]], gray: [[0, 0, 98], [240, 5, 96], [240, 6, 90], [240, 5, 84], [240, 5, 65], [240, 4, 46], [240, 5, 34], [240, 5, 26], [240, 4, 16], [240, 6, 10]], cool: [[210, 20, 98], [220, 14, 96], [220, 13, 91], [216, 12, 84], [218, 11, 65], [220, 9, 46], [215, 14, 34], [217, 19, 27], [215, 28, 17], [221, 39, 11]], cooler: [[210, 40, 98], [210, 40, 96], [214, 32, 91], [213, 27, 84], [215, 20, 65], [215, 16, 47], [215, 19, 35], [215, 25, 27], [217, 33, 17], [222, 47, 11]] };
  var sc = new RegExp("^(" + Object.keys(Hi).join("|") + ")(\\d+(?:\\.\\d+)?)$");
  var nc = /^([xyz])$/;
  var oc = /^([tlbr]|size|[whtlbr]|[mps][tlbrxy]?|[rcxy]?[gs])$/;
  var lc = `*,::before,::after {
box-sizing: border-box;
border-width: 0;
border-style: solid;
border-color: currentColor;
}`;
  var hc = /* @__PURE__ */ Symbol();
  var Ui = class Ui2 {
    constructor(t = null) {
      this[Ml](t);
    }
    [Ml](t = null, e = true, r = true) {
      var s;
      this.entries = t && (s = t.entries) !== void 0 ? s : {};
    }
    register(t, e) {
      let r = this.entries[t];
      r ? r && (r.css = e, r.node && (r.node.textContent = e)) : (r = this.entries[t] = { sourceId: t, css: e }, this.entries.resets || this.register("resets", lc), r.node = globalThis.document.createElement("style"), r.node.setAttribute("data-id", t), r.node.textContent = r.css, globalThis.document.head.appendChild(r.node));
    }
    toString() {
      return Object.values(this.entries).map(function(t) {
        return t.css;
      }).join(`

`);
    }
    toValue(t, e, r, s = null) {
      let n;
      Rl[r] && (t = String(t));
      let o = typeof t;
      if (o == "number") {
        if (e || (nc.test(r) ? e = "px" : oc.test(r) ? e = "u" : r == "rotate" && (e = "turn", t = (t % 1).toFixed(4))), e) return ic[e] ? t + e : e == "u" ? t * 4 + "px" : "calc(var(--u_" + e + ",1px) * " + t + ")";
      } else if (o == "string") {
        if (r && Rl[r] && t[0] != '"' && t[0] != "'" && (t.indexOf('"') >= 0 ? t.indexOf("'") == -1 && (t = "'" + t + "'") : t = '"' + t + '"'), n = t.match(sc)) {
          let h = Hi[n[1]][parseInt(n[2])], u = "100%";
          if (typeof s == "number" ? u = s + "%" : typeof s == "string" && (u = s), h) return "hsla(" + h[0] + "," + h[1] + "%," + h[2] + "%," + u + ")";
        }
      } else if (t && rc(t.toStyleString, Function)) return t.toStyleString();
      return t;
    }
    parseDimension(t) {
      if (typeof t == "string") {
        let [e, r, s] = t.match(/^([-+]?[\d\.]+)(%|\w+)$/);
        return [parseFloat(r), s];
      } else if (typeof t == "number") return [t];
    }
  };
  c(Ui, hc, "Styles", 16);
  var qi = Ui;
  var uc = new qi();
  var Gm = Object.keys(Hi);
  var ac = /* @__PURE__ */ Symbol();
  var Bi = class Bi2 {
    css$(t, e, r) {
      return this.style[t] = e;
    }
    css$var(t, e, r, s, n = null) {
      let o = uc.toValue(e, r, s, n);
      this.style.setProperty(t, o);
    }
  };
  c(Bi, ac, "Element", 1, N);
  function cc(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var Dl = /* @__PURE__ */ Symbol.for("#insertInto");
  var zl = /* @__PURE__ */ Symbol.for("#removeFrom");
  function fc(i, t, e = {}) {
    let r = t || globalThis.document.body, s = i;
    if (cc(i, Function)) {
      let n = i, o = e.tick || (e.tick = function() {
        let l = e.context || (e.context = new ct(r, null)), h = k.context;
        k.context = l;
        let u = i(l, e);
        return k.context == l && (k.context = h), e.node != u && (e.node && globalThis.imba.unmount(e.node), u ? ((e.node = u)[Dl](r), u.tick == Ot.prototype.tick && (u.tick = e.tick, u.scheduled\u03A6), M(u, "unmount", function() {
          if (e.node == u) return e.node = null, P.unlisten("commit", e.tick);
        })) : (e.node = u, P.unlisten("commit", e.tick))), u;
      });
      return P.listen("commit", o), o();
    } else s.__F |= 64;
    return s[Dl](r), s;
  }
  function dc(i) {
    return i && i[zl] && i.parentNode && i[zl](i.parentNode), i;
  }
  var Vl = globalThis.imba || (globalThis.imba = {});
  Vl.mount = fc;
  Vl.unmount = dc;
  function Z(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function ve(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Se = /* @__PURE__ */ Symbol.for("##onchange");
  var we = /* @__PURE__ */ Symbol.for("#afterVisit");
  var xe = /* @__PURE__ */ Symbol.for("##oninput");
  var dr = /* @__PURE__ */ Symbol.for("##onclick");
  var _e = /* @__PURE__ */ Symbol.for("##bound");
  var yt = /* @__PURE__ */ Symbol.for("##visitContext");
  function ug() {
    return globalThis.imba.uses_dom_bind = true, true;
  }
  var pc = { INPUT: true, SELECT: true, TEXTAREA: true, BUTTON: true };
  var Wi = function(i) {
    return Z(i, Array) || i && Z(i.has, Function);
  };
  var Yi = function(i, t) {
    return i == t ? true : Z(i, Array) ? i.indexOf(t) >= 0 : i && Z(i.has, Function) ? i.has(t) : i && Z(i.contains, Function) ? i.contains(t) : false;
  };
  var Gi = function(i, t) {
    if (Z(i, Array)) return i.push(t);
    if (i && Z(i.add, Function)) return i.add(t);
  };
  var Xi = function(i, t) {
    if (Z(i, Array)) {
      let e = i.indexOf(t);
      if (e >= 0) return i.splice(e, 1);
    } else if (i && Z(i.delete, Function)) return i.delete(t);
  };
  function mc(i) {
    function t() {
      return i[0] ? i[0][i[1]] : void 0;
    }
    function e(r) {
      return i[0] ? i[0][i[1]] = r : null;
    }
    return { get: t, set: e };
  }
  var gc = /* @__PURE__ */ Symbol();
  var Qi = class Qi2 {
    getRichValue() {
      return this.value;
    }
    setRichValue(t) {
      return this.value = t;
    }
    bind$(t, e) {
      let r = e || [];
      return t == "data" && !this[_e] && pc[this.nodeName] && (this[_e] = true, this[Se] && this.addEventListener("change", this[Se] = this[Se].bind(this)), this[xe] && this.addEventListener("input", this[xe] = this[xe].bind(this), { capture: true }), this[dr] && this.addEventListener("click", this[dr] = this[dr].bind(this), { capture: true })), Object.defineProperty(this, t, Z(r, Array) ? mc(r) : r), r;
    }
  };
  c(Qi, gc, "Element", 1, N);
  Object.defineProperty(N.prototype, "richValue", { get: function() {
    return this.getRichValue();
  }, set: function(i) {
    return this.setRichValue(i);
  } });
  var yc = /* @__PURE__ */ Symbol();
  var Ji = class Ji2 {
    [Se](t) {
      let e = this.data, r = this.$$value;
      this.$$value = void 0;
      let s = this.getRichValue();
      if (this.multiple) {
        if (r) for (let n = 0, o = ve(r), l = o.length; n < l; n++) {
          let h = o[n];
          s.indexOf(h) == -1 && Xi(e, h);
        }
        for (let n = 0, o = ve(s), l = o.length; n < l; n++) {
          let h = o[n];
          (!r || r.indexOf(h) == -1) && Gi(e, h);
        }
      } else this.data = s[0];
      return L(), this;
    }
    getRichValue() {
      var t;
      if (this.$$value) return this.$$value;
      t = [];
      for (let e = 0, r = ve(this.selectedOptions), s = r.length; e < s; e++) {
        let n = r[e];
        t.push(n.richValue);
      }
      return this.$$value = t;
    }
    syncValue() {
      let t = this.data;
      if (this.multiple) {
        let e = [];
        for (let r = 0, s = ve(this.options || []), n = s.length; r < n; r++) {
          let o = s[r], l = o.richValue, h = Yi(t, l);
          o.selected = h, h && e.push(l);
        }
        this.$$value = e;
      } else for (let e = 0, r = ve(this.options || []), s = r.length; e < s; e++) {
        let o = r[e].richValue;
        if (o == t) {
          this.$$value = [o], this.selectedIndex = e;
          break;
        }
      }
    }
    [we]() {
      if (this.syncValue(), this[yt]) return this[yt] = null;
    }
  };
  c(Ji, yc, "HTMLSelectElement", 1, cl);
  var $c = /* @__PURE__ */ Symbol();
  var Zi = class Zi2 {
    setRichValue(t) {
      return this.$$value = t, this.value = t;
    }
    getRichValue() {
      return this.$$value !== void 0 ? this.$$value : this.value;
    }
  };
  c(Zi, $c, "HTMLOptionElement", 1, ml);
  var bc = /* @__PURE__ */ Symbol();
  var ts = class ts2 {
    setRichValue(t) {
      return this.$$value = t, this.value = t;
    }
    getRichValue() {
      return this.$$value !== void 0 ? this.$$value : this.value;
    }
    [xe](t) {
      return this.data = this.value, L();
    }
    [we]() {
      let t = this.data;
      if (t == null && (t = ""), this[_e] && this.value != t && (this.value = t), this[yt]) return this[yt] = null;
    }
  };
  c(ts, bc, "HTMLTextAreaElement", 1, dl);
  var vc = /* @__PURE__ */ Symbol();
  var es = class es2 {
    [xe](t) {
      let e = this.type;
      if (!(e == "checkbox" || e == "radio") && !(e == "number" && Number.isNaN(this.valueAsNumber))) return this.$$value = void 0, this.data = this.richValue, L();
    }
    [Se](t) {
      let e = this.data, r = this.richValue;
      if (this.type == "checkbox" || this.type == "radio") {
        let s = this.checked;
        Wi(e) ? s ? Gi(e, r) : Xi(e, r) : this.data = s ? r : false;
      }
      return L();
    }
    setRichValue(t) {
      this.$$value !== t && (this.$$value = t, this.value !== t && (this.value = t));
    }
    getRichValue() {
      if (this.$$value !== void 0) return this.$$value;
      let t = this.value, e = this.type;
      if (e == "range" || e == "number") {
        let r = this.valueAsNumber;
        Number.isNaN(r) && (r = Number(t.replace(/\,/, ".") + 0)), Number.isNaN(r) && (r = null), t = r;
      } else e == "checkbox" && (t == null || t === "on") && (t = true);
      return t;
    }
    [we]() {
      if (this[_e]) {
        let t = this.type;
        if (t == "checkbox" || t == "radio") {
          let e = this.data;
          e === true || e === false || e == null ? this.checked = !!e : this.checked = Yi(e, this.richValue);
        } else this.richValue = this.data;
      }
      this[yt] && (this[yt] = null);
    }
  };
  c(es, vc, "HTMLInputElement", 1, fl);
  var Sc = /* @__PURE__ */ Symbol();
  var rs = class rs2 {
    get checked() {
      return this.$checked;
    }
    set checked(t) {
      t != this.$checked && (this.$checked = t, this.flags.toggle("checked", !!t));
    }
    setRichValue(t) {
      return this.$$value = t, this.value = t;
    }
    getRichValue() {
      return this.$$value !== void 0 ? this.$$value : this.value;
    }
    [dr](t) {
      let e = this.data, r = this.checked, s = this.richValue;
      return Wi(e) ? r ? Xi(e, s) : Gi(e, s) : this.$$value == null ? this.data = !r : this.data = r ? null : s, this[we](), L();
    }
    [we]() {
      if (this[_e]) {
        let t = this.data, e = this.$$value == null ? true : this.$$value;
        Wi(t) ? this.checked = Yi(t, e) : this.checked = t == e;
      }
      this[yt] && (this[yt] = null);
    }
  };
  c(rs, Sc, "HTMLButtonElement", 1, pl);
  function xc(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function Wl(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var wc = /* @__PURE__ */ Symbol.for("#getSlot");
  var _c = /* @__PURE__ */ Symbol.for("#container");
  var Tc = /* @__PURE__ */ Symbol.for("#afterVisit");
  var Te = /* @__PURE__ */ Symbol.for("#__init__");
  var pr = /* @__PURE__ */ Symbol.for("#listeners");
  var X = /* @__PURE__ */ Symbol.for("#slot");
  var Ec = /* @__PURE__ */ Symbol.for("#parent");
  var H = /* @__PURE__ */ Symbol.for("##container");
  var mr = /* @__PURE__ */ Symbol.for("#domTarget");
  var Yl = /* @__PURE__ */ Symbol.for("#insertInto");
  var Nc = /* @__PURE__ */ Symbol.for("#removeFrom");
  var Cc = /* @__PURE__ */ Symbol.for("#teleport");
  var Ic = /* @__PURE__ */ Symbol.for("#self");
  var Oc = /* @__PURE__ */ Symbol.for("#target");
  var Pc = /* @__PURE__ */ Symbol();
  var ss = class ss2 extends Ot {
    constructor() {
      super(...arguments), super[Te] || this[Te]();
    }
    [Te](t = null, e = true, r = true) {
      e && super[Te] && super[Te](...arguments), this.to = t ? t.to : void 0;
    }
    build() {
      return this[pr] = [], this.win = globalThis, this.doc = globalThis.document;
    }
    setup() {
      return this.setAttribute("style", "display:none !important;");
    }
    [wc](t, e) {
      return this[X] || (this[X] = or(0, this[Ec])), this[X];
    }
    get [_c]() {
      if (!this[H]) {
        let t = this.className;
        this[H] = this.doc.createElement("div"), this[H].className = t, this[H].style.cssText = "display:contents !important;";
      }
      return this[H];
    }
    get domTarget() {
      return this[mr] || (this[mr] = xc(this.to, N) ? this.to : this.closest(this.to) || this.doc.querySelector(this.to));
    }
    get eventTarget() {
      return this.domTarget;
    }
    get style() {
      return this[H] ? this[H].style : super.style;
    }
    get classList() {
      return this[H] ? this[H].classList : super.classList;
    }
    get className() {
      return this[H] ? this[H].className : super.className;
    }
    set className(t) {
      this[H] ? this[H].className = t : super.className = t;
    }
    [Tc]() {
      if (this.mounted\u03A6 && this[X] && !this[X].parentNode) return this[X][Yl](this.target);
    }
    mount() {
      for (let e = 0, r = Wl(this[pr]), s = r.length; e < s; e++) {
        let [n, o, l] = r[e];
        this.eventTarget.addEventListener(n, o, l);
      }
      let t = this.domTarget;
      return this[X] && this[X][Yl](t), this;
    }
    unmount() {
      for (let t = 0, e = Wl(this[pr]), r = e.length; t < r; t++) {
        let [s, n, o] = e[t];
        this.eventTarget.removeEventListener(s, n, o);
      }
      return this[X] && this[X][Nc](this.domTarget), this[mr] = null, this;
    }
    addEventListener(t, e, r = {}) {
      var s;
      if (e[Cc] = this, e[Ic] = this, this[pr].push([t, e, r]), this.mounted\u03A6 && ((s = this.eventTarget) != null && s.addEventListener)) return this.eventTarget.addEventListener(t, e, r);
    }
  };
  c(ss, Pc, "TeleportHook", 24);
  var gr = ss;
  var Lc = /* @__PURE__ */ Symbol();
  var ns = class ns2 extends gr {
    get domTarget() {
      return this.doc.body;
    }
    get eventTarget() {
      return this.win;
    }
    addEventListener(t, e, r = {}) {
      return e[Oc] = this.domTarget.parentNode, super.addEventListener(...arguments);
    }
    on$resize(t, e, r, s) {
      return this.addEventListener("resize", r, s), r;
    }
  };
  c(ns, Lc, "GlobalHook", 8);
  var is = ns;
  globalThis.customElements && (globalThis.customElements.define("i-teleport", gr), globalThis.customElements.define("i-global", is));
  function Q(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  function kc(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var et = /* @__PURE__ */ Symbol.for("#__init__");
  var br = /* @__PURE__ */ Symbol.for("#insertInto");
  var vr = /* @__PURE__ */ Symbol.for("#removeFrom");
  var Fc = /* @__PURE__ */ Symbol.for("#all");
  var Ee = /* @__PURE__ */ Symbol.for("#phase");
  var tt = /* @__PURE__ */ Symbol.for("#nodes");
  var Mc = /* @__PURE__ */ Symbol.for("#sizes");
  var Pt = /* @__PURE__ */ Symbol.for("#linked");
  var Gl = /* @__PURE__ */ Symbol.for("#mode");
  var Xl = /* @__PURE__ */ Symbol.for("#enabled");
  var Rc = /* @__PURE__ */ Symbol.for("#easer");
  var Yt = /* @__PURE__ */ Symbol.for("#group");
  var yr = /* @__PURE__ */ Symbol.for("#_easer_");
  var $r = /* @__PURE__ */ Symbol();
  var Ac = /* @__PURE__ */ Symbol();
  var us = class us2 extends zt {
    constructor() {
      super(...arguments), super[et] || this[et]();
    }
    [et](t = null, e = true, r = true) {
      var s;
      e && super[et] && super[et](...arguments), this.selectors = t && (s = t.selectors) !== void 0 ? s : {};
    }
    addSelectors(t, e) {
      var s;
      return ((s = this.selectors)[e] || (s[e] = [])).push(...t), true;
    }
    getSelectors(...t) {
      let e = [];
      for (let r = 0, s = Q(t), n = s.length; r < n; r++) {
        let o = s[r];
        this.selectors[o] && e.push(...this.selectors[o]);
      }
      return e && e.length ? e.join(",") : null;
    }
    nodesForBase(t, e = "transition") {
      let r = [t], s = (this.selectors[e] || []).join(",");
      if (s == "") return r;
      let n = t.querySelectorAll(s);
      for (let o = 0, l = Q(n), h = l.length; o < h; o++) {
        let u = l[o];
        u.closest("._ease_") == t && r.push(u);
      }
      return r[Fc] = n, r;
    }
    nodesWithSize(t, e = "in") {
      let r = this.getSelectors("_off_sized", "_" + e + "_sized");
      return r ? t.filter(function(s) {
        return s.matches(r);
      }) : [];
    }
  };
  c(us, Ac, "Transitions", 16);
  var os = us;
  var ls = new os();
  var Dc = globalThis.imba || (globalThis.imba = {});
  Dc.transitions = ls;
  var zc = /* @__PURE__ */ Symbol();
  var as = class as2 extends zt {
    [et](t = null, e = true, r = true) {
      var s;
      e && super[et] && super[et](...arguments), this.flushing\u03A6 = t && (s = t.flushing\u03A6) !== void 0 ? s : false, this.mutations = t && (s = t.mutations) !== void 0 ? s : [];
    }
    constructor(t) {
      super(), super[et] || this[et](), this.callback = t;
    }
    insert(t, e, r) {
      return this.mutations.push({ target: t, addedNodes: [e], removedNodes: [], nextSibling: r });
    }
    remove(t, e) {
      return this.mutations.push({ target: t, addedNodes: [], removedNodes: [e] });
    }
    flush() {
      let t = this.mutations.slice(0);
      if (!t.length) return this;
      this.mutations = [], kc(this.callback, Function) && this.callback(t), this.emit("start", this, t), this.flushing\u03A6 = true;
      for (let e of Q(t)) {
        for (let r of Q(e.addedNodes)) r[br](e.target, e.nextSibling);
        for (let r of Q(e.removedNodes)) r[vr](e.target);
      }
      return this.flushing\u03A6 = false, this.emit("end", this, t);
    }
  };
  c(as, zc, "EaseGroup", 16);
  var Vc = /* @__PURE__ */ Symbol();
  var cs = class cs2 extends zt {
    constructor(t) {
      super(), this.dom = t, this[Ee] = null, this[tt] = [], this[Mc] = /* @__PURE__ */ new Map();
    }
    log(...t) {
    }
    get flags() {
      return this.dom.flags;
    }
    link(t) {
      return this[Pt] || (this[Pt] = /* @__PURE__ */ new Set()), this[Pt].add(t);
    }
    unlink(t) {
      return this[Pt].delete(t);
    }
    flag(t) {
      for (let e = 0, r = Q(this[tt]), s = r.length; e < s; e++) r[e].flags.add(t);
      return this;
    }
    unflag(t) {
      for (let e = 0, r = Q(this[tt]), s = r.length; e < s; e++) r[e].flags.remove(t);
      return this;
    }
    commit() {
      return this.dom.offsetWidth;
    }
    enable(t) {
      return t && (this[Gl] = t), this[Xl] != true && (this[Xl] = true, true) ? (this.dom[br] = this[br].bind(this), this.dom[vr] = this[vr].bind(this), this.flags.add("_ease_")) : this;
    }
    disable() {
      return this.flags.remove("_ease_"), true;
    }
    supports\u039Esize\u039Ekeywords() {
      var e;
      var t = wo(this);
      return (e = t[$r]) != null || (t[$r] = { support: CSS.supports("interpolate-size", "allow-keywords") && globalThis.window.getComputedStyle(globalThis.document.body)["interpolate-size"] == "allow-keywords" }), t[$r].support;
    }
    set phase(t) {
      var r, s, n, o, l, h, u, d, a, $, x, f, p, g, m, v, S, y, b, T, E, J, lt, _t;
      let e = this[Ee];
      this[Ee] != t && (this[Ee] = t, true) && (e && this.unflag("@" + e), t && this.flag("@" + t), t ? this.flags.add("_easing_") : this.flags.remove("_easing_"), t || (this.unflag("@out"), this.unflag("@in"), this.unflag("@off"), this[tt] = null), t == "enter" && e == "leave" && ((s = (r = this.dom) == null ? void 0 : r.emit) == null || s.call(r, "outcancel"), (o = (n = this.dom) == null ? void 0 : n.transition\u039Eout\u039Ecancel) == null || o.call(n, this)), t == "leave" && e == "enter" && ((h = (l = this.dom) == null ? void 0 : l.emit) == null || h.call(l, "incancel"), (d = (u = this.dom) == null ? void 0 : u.transition\u039Ein\u039Ecancel) == null || d.call(u, this)), t == "enter" && (($ = (a = this.dom) == null ? void 0 : a.emit) == null || $.call(a, "in"), (f = (x = this.dom) == null ? void 0 : x.transition\u039Ein) == null || f.call(x, this)), t == "leave" && ((g = (p = this.dom) == null ? void 0 : p.emit) == null || g.call(p, "out"), (v = (m = this.dom) == null ? void 0 : m.transition\u039Eout) == null || v.call(m, this)), e == "leave" && !t && ((y = (S = this.dom) == null ? void 0 : S.emit) == null || y.call(S, "outend"), (T = (b = this.dom) == null ? void 0 : b.transition\u039Eout\u039Eend) == null || T.call(b, this)), e == "enter" && !t && ((J = (E = this.dom) == null ? void 0 : E.emit) == null || J.call(E, "inend"), (_t = (lt = this.dom) == null ? void 0 : lt.transition\u039Ein\u039Eend) == null || _t.call(lt, this)));
    }
    get phase() {
      return this[Ee];
    }
    get leaving\u03A6() {
      return this.phase == "leave";
    }
    get entering\u03A6() {
      return this.phase == "enter";
    }
    get idle\u03A6() {
      return this.phase == null;
    }
    track(t) {
      var e = this;
      let r = { before: Ze().getAnimations() };
      return this.commit(), t(), this.commit(), r.after = Ze().getAnimations(), r.fresh = r.after.filter(function(s) {
        return r.before.indexOf(s) == -1;
      }), r.deep = r.fresh.filter(function(s) {
        let n;
        return !!((n = s.effect.target) && n.closest("._ease_") != e.dom);
      }), r.own = r.fresh.filter(function(s) {
        return r.deep.indexOf(s) == -1;
      }), r.own.length ? r.finished = new Promise(function(s) {
        let n = new Set(r.own), o = function() {
          if (n.delete(this), n.size == 0) return s();
        };
        for (let l = 0, h = Q(r.own), u = h.length; l < u; l++) {
          let d = h[l];
          d[Rc] = e, d.addEventListener("finish", o, { once: true }), d.addEventListener("cancel", o, { once: true });
        }
      }) : r.finished = Promise.resolve(true), r;
    }
    getAnimatedNodes() {
      let t = ls.nodesForBase(this.dom);
      return this[Pt] && (t = t.concat(Array.from(this[Pt]))), t;
    }
    getNodeSizes(t = "in", e = this[tt]) {
      let r = ls.nodesWithSize(e, t), s = /* @__PURE__ */ new Map();
      for (let n = 0, o = Q(r), l = o.length; n < l; n++) {
        let h = o[n], u = window.getComputedStyle(h);
        s.set(h, { width: u.width, height: u.height });
      }
      return s;
    }
    applyNodeSizes(t) {
      for (let [e, r] of Q(t)) e.style.width = r.width, e.style.height = r.height;
      return t;
    }
    clearNodeSizes(t) {
      if (t) {
        for (let [e, r] of Q(t)) e.style.removeProperty("width"), e.style.removeProperty("height");
        return t;
      }
    }
    [br](t, e) {
      var h, u;
      var r = this;
      if (this[Yt] && !this[Yt].flushing\u03A6) return this[Yt].insert(t, this.dom, e), this.dom;
      let s;
      if (this.entering\u03A6) return this.dom;
      let n = function() {
        if (s && r.clearNodeSizes(s), r.entering\u03A6) return r.phase = null;
      };
      if (this.leaving\u03A6) return this.track(function() {
        return r.phase = "enter", r.unflag("@off"), r.unflag("@out");
      }).finished.then(n, function(a) {
        return r.log("error cancel leave", a);
      }), this.dom;
      let o = Ze().contains(t);
      return e ? this.dom.nextSibling != e && t.insertBefore(this.dom, e) : this.dom.parentNode != t && t.appendChild(this.dom), this[tt] = this.getAnimatedNodes(), this.flag("_instant_"), this.unflag("@out"), this.commit(), this.supports\u039Esize\u039Ekeywords() || (s = this[tt].sized = this.getNodeSizes("in")), (u = (h = this.dom) == null ? void 0 : h.transition\u039Ein\u039Einit) == null || u.call(h, this), this.flag("@off"), this.flag("@in"), this.flag("@enter"), this.commit(), this.unflag("_instant_"), this.track(function() {
        return r.phase = "enter", s && r.applyNodeSizes(s), r.unflag("@off"), r.unflag("@in");
      }).finished.then(n, function(d) {
        return s && r.clearNodeSizes(s), r.log("cancelled insert into", d);
      }), this.dom;
    }
    [vr](t) {
      var e = this;
      if (this[Yt] && !this[Yt].flushing\u03A6) {
        this[Yt].remove(t, this.dom);
        return;
      }
      if (this.leaving\u03A6) return;
      let r, s = function() {
        if (e.phase == "leave") return e.dom.emit("easeoutend", {}), t.removeChild(e.dom), e.phase = null;
      };
      if (this.entering\u03A6 && this[Gl] != "forward") {
        let o = this.track(function() {
          if (e.flag("@off"), e.flag("@in"), e.unflag("@out"), e.phase = "leave", e[tt].sized) return e.clearNodeSizes(e[tt].sized);
        });
        this.log("cancel enter anims own", o.own, o), o.finished.then(s, function(l) {
          return e.log("error cancel entering", l);
        });
        return;
      }
      this[tt] = this.getAnimatedNodes(), this.supports\u039Esize\u039Ekeywords() || (r = this.getNodeSizes("out"), this.applyNodeSizes(r)), this.flag("@leave");
      let n = this.track(function() {
        if (e.phase = "leave", e.flag("@off"), e.flag("@out"), r) return e.clearNodeSizes(r);
      });
      if (!n.own.length) {
        s();
        return;
      }
      n.finished.then(s, function() {
        return true;
      });
    }
  };
  c(cs, Vc, "Easer", 16);
  var hs = cs;
  var Kc = /* @__PURE__ */ Symbol();
  var fs = class fs2 {
    transition\u039Ein\u039Einit(t) {
      return true;
    }
    transition\u039Ein(t) {
      return true;
    }
    transition\u039Ein\u039Eend(t) {
      return true;
    }
    transition\u039Ein\u039Ecancel(t) {
      return true;
    }
    transition\u039Eout(t) {
      return true;
    }
    transition\u039Eout\u039Eend(t) {
      return true;
    }
    transition\u039Eout\u039Ecancel(t) {
      return true;
    }
    get ease() {
      return this[yr] || (this[yr] = new hs(this));
    }
    set ease(t) {
      var e, r;
      if (t == false) {
        (r = (e = this[yr]) == null ? void 0 : e.disable) == null || r.call(e);
        return;
      }
      this.ease.enable(t);
    }
  };
  c(fs, Kc, "Element", 1, Element);
  function th() {
    return globalThis.imba.uses_events_keyboard = true, true;
  }
  var jc = /* @__PURE__ */ Symbol();
  var ds = class ds2 {
    \u03B1esc() {
      return this.keyCode == 27;
    }
    \u03B1tab() {
      return this.keyCode == 9;
    }
    \u03B1enter() {
      return this.keyCode == 13;
    }
    \u03B1space() {
      return this.keyCode == 32;
    }
    \u03B1up() {
      return this.keyCode == 38;
    }
    \u03B1down() {
      return this.keyCode == 40;
    }
    \u03B1left() {
      return this.keyCode == 37;
    }
    \u03B1right() {
      return this.keyCode == 39;
    }
    \u03B1del() {
      return this.keyCode == 8 || this.keyCode == 46;
    }
    \u03B1key(t) {
      if (typeof t == "string") return this.key == t;
      if (typeof t == "number") return this.keyCode == t;
    }
    \u03B1shift() {
      return !!this.shiftKey;
    }
    \u03B1alt() {
      return !!this.altKey;
    }
    \u03B1ctrl() {
      return !!this.ctrlKey;
    }
    \u03B1meta() {
      return !!this.metaKey;
    }
    \u03B1mod() {
      let t = globalThis.navigator.platform;
      return /^(Mac|iPhone|iPad|iPod)/.test(t || "") ? !!this.metaKey : !!this.ctrlKey;
    }
  };
  c(ds, jc, "KeyboardEvent", 1, ul);
  function Sr() {
    return globalThis.imba.uses_events_mouse = true, true;
  }
  var qc = /* @__PURE__ */ Symbol();
  var ps = class ps2 {
    \u03B1left() {
      return this.button == 0;
    }
    \u03B1middle() {
      return this.button == 1;
    }
    \u03B1right() {
      return this.button == 2;
    }
    \u03B1shift() {
      return !!this.shiftKey;
    }
    \u03B1alt() {
      return !!this.altKey;
    }
    \u03B1ctrl() {
      return !!this.ctrlKey;
    }
    \u03B1meta() {
      return !!this.metaKey;
    }
    \u03B1mod() {
      let t = globalThis.navigator.platform;
      return /^(Mac|iPhone|iPad|iPod)/.test(t || "") ? !!this.metaKey : !!this.ctrlKey;
    }
  };
  c(ps, qc, "MouseEvent", 1, ll);
  function rt(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function ms(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Hc = /* @__PURE__ */ Symbol.for("#extendType");
  var Uc = /* @__PURE__ */ Symbol.for("#modifierState");
  var xr = /* @__PURE__ */ Symbol.for("#sharedModifierState");
  var rh = /* @__PURE__ */ Symbol.for("#onceHandlerEnd");
  var gs = /* @__PURE__ */ Symbol.for("#extendDescriptors");
  var A = /* @__PURE__ */ Symbol.for("#context");
  var wr = /* @__PURE__ */ Symbol.for("#defaultPrevented");
  var ys = /* @__PURE__ */ Symbol.for("#stopPropagation");
  var ih = /* @__PURE__ */ Symbol.for("#self");
  var Bc = /* @__PURE__ */ Symbol.for("#target");
  var Wc = /* @__PURE__ */ Symbol.for("#teleport");
  th();
  Sr();
  var Yc = /* @__PURE__ */ Symbol();
  var $s = class $s2 {
    [Hc](t) {
      var e, r;
      let s = t[gs] || (t[gs] = (e = Object.getOwnPropertyDescriptors(t.prototype), r = e.constructor, delete e.constructor, e));
      return Object.defineProperties(this, s);
    }
  };
  c($s, Yc, "CustomEvent", 1, CustomEvent);
  var Gc = /* @__PURE__ */ Symbol();
  var bs = class bs2 {
    get original() {
      return this.originalEvent || this;
    }
    get [Uc]() {
      var t, e;
      return (t = this[A])[e = this[A].step] || (t[e] = {});
    }
    get [xr]() {
      var t, e;
      return (t = this[A].handler)[e = this[A].step] || (t[e] = {});
    }
    [rh](t) {
      return M(this[A], "end", t);
    }
    \u03B1sel(t) {
      return !!this.target.matches(String(t));
    }
    \u03B1closest(t) {
      return !!this.target.closest(String(t));
    }
    \u03B1prevent() {
      return this[wr] = true, this.preventDefault(), true;
    }
    \u03B1trap() {
      return this[ys] = true, this.stopImmediatePropagation(), this[wr] = true, this.preventDefault(), true;
    }
    \u03B1focin(t) {
      var r;
      let e = this[A].element;
      return e = rt(t, Element) ? t : t ? e.closest(t) : e, (r = e == null ? void 0 : e.contains) == null ? void 0 : r.call(e, globalThis.document.activeElement);
    }
    \u03B1log(...t) {
      return console.info(...t), true;
    }
    \u03B1trusted() {
      return !!this.isTrusted;
    }
    \u03B1untrusted() {
      return !this.isTrusted;
    }
    \u03B1if(t) {
      return !!t;
    }
    \u03B1wait(t = 250) {
      return new Promise(function(e) {
        return setTimeout(e, ue(t));
      });
    }
    \u03B1self() {
      return this.target == this[A].element;
    }
    \u03B1cooldown(t = 250) {
      let e = this[xr];
      return e.active ? false : (e.active = true, e.target = this[A].element, e.target.flags.incr("cooldown"), this[rh](function() {
        return setTimeout(function() {
          return e.target.flags.decr("cooldown"), e.active = false;
        }, ue(t));
      }), true);
    }
    \u03B1throttle(t = 250, e = "throttled") {
      let r = this[xr];
      return r.active ? (r.next && r.next(false), new Promise(function(s) {
        return r.next = function(n) {
          return r.next = null, s(n);
        };
      })) : (r.active = true, r.el || (r.el = this[A].element), e && r.el.flags.incr(e), M(this[A], "end", function() {
        let s = ue(t);
        return r.interval = setInterval(function() {
          r.next ? r.next(true) : (clearInterval(r.interval), e && r.el.flags.decr(e), r.active = false);
        }, s);
      }), true);
    }
    \u03B1debounce(t = 250) {
      let e = this[xr], r = this;
      return e.queue || (e.queue = []), e.queue.push(e.last = r), new Promise(function(s) {
        return setTimeout(function() {
          return e.last == r ? (r.debounced = e.queue, e.last = null, e.queue = [], s(true)) : s(false);
        }, ue(t));
      });
    }
    \u03B1flag(t, e) {
      let { element: r, step: s, state: n, id: o, current: l } = this[A], h = rt(e, Element) ? e : e ? r.closest(e) : r;
      if (!h) return true;
      this[A].commit = true, n[s] = o, h.flags.incr(t);
      let u = Date.now();
      return M(l, "end", function() {
        let d = Date.now() - u, a = Math.max(250 - d, 0);
        return setTimeout(function() {
          return h.flags.decr(t);
        }, a);
      }), true;
    }
    \u03B1busy(t) {
      return this.\u03B1flag("busy", t);
    }
    \u03B1outside() {
      let { handler: t } = this[A];
      if (t && t[ih]) return !t[ih].parentNode.contains(this.target);
    }
    async \u03B1post(t, e = {}) {
      return await globalThis.fetch(t, { method: "POST", ...e });
    }
    async \u03B1fetch(t, e = {}) {
      return await globalThis.fetch(t, e);
    }
  };
  c(bs, Gc, "Event", 1, Event);
  var Xc = /* @__PURE__ */ Symbol();
  var vs = class vs2 {
    \u03B1self() {
      let t = this[A].element;
      return this.type == "focusout" ? this.relatedTarget && !t.contains(this.relatedTarget) : this.type == "focusin" ? !this.relatedTarget || !t.contains(this.relatedTarget) : this.target == t;
    }
  };
  c(vs, Xc, "FocusEvent", 1, FocusEvent);
  function Fg() {
    return globalThis.imba.uses_events = true, true;
  }
  var Qc = /* @__PURE__ */ Symbol();
  var Ss = class Ss2 {
    constructor(t, e) {
      this.params = t, this.closure = e;
    }
    getHandlerForMethod(t, e) {
      return t ? t[e] ? t : this.getHandlerForMethod(t.parentNode, e) : null;
    }
    abortCurrentHandlers() {
      var t;
      if (this.currentEvents) for (let e of ms(this.currentEvents)) e.aborted = true, (t = e == null ? void 0 : e.resolver) == null || t.call(e, true);
      return this;
    }
    emit(t, ...e) {
      return q(this, t, e);
    }
    on(t, ...e) {
      return j(this, t, ...e);
    }
    once(t, ...e) {
      return M(this, t, ...e);
    }
    un(t, ...e) {
      return Nt(this, t, ...e);
    }
    get passive\u03A6() {
      return this.params.passive;
    }
    get capture\u03A6() {
      return this.params.capture;
    }
    get silent\u03A6() {
      return this.params.silent;
    }
    get global\u03A6() {
      return this.params.global;
    }
    async handleEvent(t) {
      if (this.disabled) return;
      let e = this[Bc] || t.currentTarget, r = this.params, s = null, n = r.silence || r.silent;
      this.count || (this.count = 0), this.state || (this.state = {});
      let o = this.lastState = { element: e, event: t, modifiers: r, handler: this, id: ++this.count, step: -1, state: this.state, commit: null, called: false, current: null, aborted: false };
      if (o.current = o, t.handle$mod && t.handle$mod.apply(o, r.options || []) == false) return;
      let l = Event[this.type + "$handle"] || Event[t.type + "$handle"] || this.guard;
      if (!(l && l.apply(o, r.options || []) == false)) {
        this.currentEvents || (this.currentEvents = /* @__PURE__ */ new Set()), this.currentEvents.add(o);
        for (let h = 0, u = Object.keys(r), d = u.length, a, $; h < d && (a = u[h], $ = r[a], !o.aborted); h++) {
          if (o.step++, a[0] == "_") continue;
          a.indexOf("~") > 0 && (a = a.split("~")[0]);
          let x = null, f = [t, o], p, g = null, m, v = false, S = typeof a == "string";
          if (a[0] == "$" && a[1] == "_" && rt($[0], Function)) t[A] = o, a = $[0], o.called = true, a.passive || (o.commit = true), f = [t, o].concat($.slice(1)), g = e;
          else if (rt($, Array)) {
            f = $.slice(), x = f;
            for (let y = 0, b = ms(f), T = b.length; y < T; y++) {
              let E = b[y];
              if (typeof E == "string" && E[0] == "~" && E[1] == "$") {
                let lt = E.slice(2).split("."), _t = o[lt.shift()] || t;
                for (let Wr = 0, bo = ms(lt), Tu = bo.length; Wr < Tu; Wr++) {
                  let Eu = bo[Wr];
                  _t = _t ? _t[Eu] : void 0;
                }
                f[y] = _t;
              }
            }
          }
          if (typeof a == "string" && (m = a.match(/^(emit|flag|mod|moved|pin|fit|refit|map|remap|css)-(.+)$/)) && (x || (x = f = []), f.unshift(m[2]), a = m[1]), a == "trap") t[ys] = true, t.stopImmediatePropagation(), t[wr] = true, t.preventDefault();
          else if (a == "stop") t[ys] = true, t.stopImmediatePropagation();
          else if (a == "prevent") t[wr] = true, t.preventDefault();
          else if (a == "commit") o.commit = true;
          else if (a == "once") e.removeEventListener(t.type, this);
          else {
            if (a == "options" || a == "silence" || a == "silent") continue;
            if (a == "emit") {
              let y = f[0], b = f[1];
              o.called = true;
              let T = new CustomEvent(y, { bubbles: true, detail: b });
              T.originalEvent = t;
              let J = (this[Wc] || e).dispatchEvent(T);
            } else if (typeof a == "string") {
              a[0] == "!" && (v = true, a = a.slice(1));
              let y = "\u03B1" + a, b = t[y];
              b || (b = this.type && Event[this.type + "$" + a + "$mod"]), b || (b = t[a + "$mod"] || Event[t.type + "$" + a] || Event[a + "$mod"]), rt(b, Function) ? (a = b, g = o, f = x || [], t[y] && (g = t, t[A] = o)) : a[0] == "_" ? (a = a.slice(1), g = this.closure) : g = this.getHandlerForMethod(e, a);
            }
          }
          try {
            rt(a, Function) ? p = a.apply(g || e, f) : g && (p = g[a].apply(g, f)), p && rt(p.then, Function) && p != P.$promise && (o.commit && !n && P.commit(), p = await p);
          } catch (y) {
            s = y;
            break;
          }
          if (v && p === true || !v && p === false) break;
          o.value = p;
        }
        if (q(o, "end", o), o.commit && !n && P.commit(), this.currentEvents.delete(o), this.currentEvents.size == 0 && this.emit("idle"), s != null) {
          if (this.type != "error") {
            let h = rt(s, Error) ? s.message : s, u = new CustomEvent("error", { detail: h, bubbles: true, cancelable: true });
            u.error = s, u.originalEvent = t;
            let d = e.dispatchEvent(u);
            if (u.defaultPrevented) return;
          }
          throw s;
        }
        return o;
      }
    }
  };
  c(Ss, Qc, "EventHandler", 16);
  var _r = Ss;
  var Jc = /* @__PURE__ */ Symbol();
  var xs = class xs2 {
    on$(t, e, r) {
      let s = "on$" + t, n = e.capture || false, o = e.passive, l, h = n;
      return o && (h = { passive: o, capture: n }), rt(this[s], Function) ? (this[s].length > 2 && (l = new _r(e, r)), l = this[s](e, r, l, h)) : (l = new _r(e, r), this.addEventListener(t, l, h)), l;
    }
    on$error(t, e, r, s) {
      var n;
      return (n = t.options) != null && n.length && (r.guard = function(...o) {
        let l = this.event.error;
        return !!o.find(function(u) {
          return rt(l, u);
        });
      }), this.addEventListener("error", r, s), r;
    }
  };
  c(xs, Jc, "Element", 1, Element);
  function Zc(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var tf = /* @__PURE__ */ Symbol();
  var Gt;
  var Tr = new (Gt = class {
    get ios\u03A6() {
      let t = globalThis.navigator.platform || "";
      return !!(t.match(/iPhone|iPod|iPad/) || t == "MacIntel" && globalThis.navigator.maxTouchPoints > 2);
    }
  }, c(Gt, tf, null, 0), Gt)();
  function Xt(i, t) {
    let e = t;
    return Zc(i, Element) ? i : typeof i == "string" ? i == "this" || i == "" ? e : i == "up" ? e.parentNode : i == "op" ? e.offsetParent : e.closest(i) || e.querySelector(i) || globalThis.document.querySelector(i) : null;
  }
  function $t(i) {
    if (typeof i == "string") {
      let [t, e, r] = i.match(/^([-+]?[\d\.]+)(%|\w+)$/);
      return [parseFloat(e), r];
    } else if (typeof i == "number") return [i];
  }
  function Er(i, t = 1) {
    let e = 1 / t;
    return Math.round(i * e) / e;
  }
  function ef(i, t, e) {
    return t > e ? Math.max(e, Math.min(t, i)) : Math.min(e, Math.max(t, i));
  }
  function ws(i, t, e, r, s = 0.1) {
    let [n, o] = $t(e), [l, h] = $t(r), [u, d] = $t(s);
    return o == "%" && (n = (t - i) * (n / 100)), h == "%" && (l = (t - i) * (l / 100)), d == "%" && (u = (l - n) * (u / 100)), function(a, $) {
      let x = (a - i) / (t - i), f = n + (l - n) * x;
      return s && (f = Er(f, u)), $ && (f = ef(f, n, l)), f;
    };
  }
  Sr();
  var rf = /* @__PURE__ */ Symbol();
  var Ts = class Ts2 {
    \u03B1primary() {
      return !!this.isPrimary && (this.pointerType != "mouse" || this.button == 0);
    }
    \u03B1secondary() {
      return !this.isPrimary && this.button != 0;
    }
    \u03B1mouse() {
      return this.pointerType == "mouse";
    }
    \u03B1pen() {
      return this.pointerType == "pen";
    }
    \u03B1touch() {
      return this.pointerType == "touch";
    }
    \u03B1pressure(t = 0.5) {
      return this.pressure >= t;
    }
    \u03B1lock() {
      return true;
    }
  };
  c(Ts, rf, "PointerEvent", 1, hl);
  function Qt(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var uh = /* @__PURE__ */ Symbol.for("#capture");
  var it = /* @__PURE__ */ Symbol.for("#step");
  var sf = /* @__PURE__ */ Symbol.for("#cancel");
  var Es = /* @__PURE__ */ Symbol.for("#reframe");
  var ah = /* @__PURE__ */ Symbol.for("#mods");
  var Ns = /* @__PURE__ */ Symbol.for("#dx");
  var Cs = /* @__PURE__ */ Symbol.for("#dy");
  var bt = /* @__PURE__ */ Symbol.for("#context");
  var Nr = /* @__PURE__ */ Symbol.for("#locked");
  var mh = /* @__PURE__ */ Symbol.for("#teardown");
  var ch = /* @__PURE__ */ Symbol.for("#x");
  var fh = /* @__PURE__ */ Symbol.for("#y");
  var nf = /* @__PURE__ */ Symbol.for("#pinTarget");
  var dh = null;
  var of = /* @__PURE__ */ Symbol();
  var Os = class Os2 {
    constructor(t, e, r) {
      this.phase = "init", this.events = [], this.originalEvent = t, this.handler = e, this.target = this.currentTarget = r, this[ah] = {};
    }
    set event(t) {
      this.events.push(t);
    }
    get ctrlKey() {
      return this.originalEvent.ctrlKey;
    }
    get altKey() {
      return this.originalEvent.altKey;
    }
    get shiftKey() {
      return this.originalEvent.shiftKey;
    }
    get metaKey() {
      return this.originalEvent.metaKey;
    }
    get isPrimary() {
      return this.originalEvent.isPrimary;
    }
    get pointerType() {
      return this.originalEvent.pointerType;
    }
    get start() {
      return this.originalEvent;
    }
    get originalTarget() {
      return this.originalEvent.target;
    }
    get event() {
      return this.events[this.events.length - 1];
    }
    get elapsed() {
      return this.event.timeStamp - this.events[0].timeStamp;
    }
    get type() {
      return this.event.type;
    }
    get pointerId() {
      return this.originalEvent.pointerId;
    }
    get pressure() {
      return this.event.pressure;
    }
    get clientX() {
      return this.event.clientX;
    }
    get clientY() {
      return this.event.clientY;
    }
    get offsetX() {
      return this.event.offsetX;
    }
    get offsetY() {
      return this.event.offsetY;
    }
    get active\u03A6() {
      return this.phase != "ended";
    }
    get ended\u03A6() {
      return this.phase == "ended";
    }
    get dx() {
      return this[Ns] == null ? this.event.x - this.start.x : this[Ns];
    }
    get dy() {
      return this[Cs] == null ? this.event.y - this.start.y : this[Cs];
    }
    get dr() {
      return Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    }
    stopImmediatePropagation() {
      return this.cancelBubble = true, this.event.stopImmediatePropagation(), this;
    }
    stopPropagation() {
      return this.cancelBubble = true, this.event.stopPropagation(), this;
    }
    preventDefault() {
      return this.defaultPrevented = true, this.event.preventDefault();
    }
    emit(t, ...e) {
      return q(this, t, e);
    }
    on(t, ...e) {
      return j(this, t, ...e);
    }
    once(t, ...e) {
      return M(this, t, ...e);
    }
    un(t, ...e) {
      return Nt(this, t, ...e);
    }
    \u03B1flag(t, e) {
      let { element: r } = this[bt], s = Date.now(), n = Qt(e, N) ? e : e ? r.closest(e) : r;
      return this[it].setup != true && (this[it].setup = true, true) && (n.flags.incr(t), M(this, "end", function() {
        return n.flags.decr(t);
      })), true;
    }
    \u03B1lock() {
      return this[uh](), true;
    }
    [uh]() {
      if (this[Nr] != true && (this[Nr] = true, true)) return this[bt].element.setPointerCapture(this.pointerId);
    }
    get [it]() {
      var t, e;
      return (t = this[ah])[e = this[bt].step] || (t[e] = {});
    }
    [sf]() {
      return this[mh]();
    }
    \u03B1moved(t, e) {
      let r = this[it], { element: s, state: n, event: o } = this[bt];
      if (!r.setup) {
        let a = t || 4;
        typeof t == "string" && t.match(/^(up|down|left|right|x|y)$/) && (r.dir = t, a = e || 4), typeof e == "string" && e.match(/^(up|down|left|right|x|y)$/) && (r.dir = e), r.setup = true;
        let [$, x] = $t(a);
        r.threshold = $, r.sy = $, r.x0 = this.x, r.y0 = this.y, r.dir || (r.dir = "dist"), r.x = r.left = r.right = r.y = r.up = r.down = r.dist = 0, x && x != "px" && console.warn("only px threshold allowed in @touch.moved");
      }
      if (r.active) return true;
      if (r.cancelled) return false;
      let l = r.threshold, h = this.x - r.x0, u = this.y - r.y0;
      r.x = Math.max(r.x, Math.abs(h)), r.y = Math.max(r.y, Math.abs(u)), r.left = Math.max(r.left, -h), r.right = Math.max(r.right, h), r.up = Math.max(r.up, -u), r.down = Math.max(r.down, u), r.dist = Math.max(r.dist, Math.sqrt(h * h + u * u));
      let d = r[r.dir];
      if (d > l && d >= r.x && d >= r.y) {
        r.active = true;
        let a = n.pinTarget;
        return s.flags.incr("@move"), a && a.flags.incr("@move"), this.preventDefault(), M(this, "end", function() {
          return a && a.flags.decr("@move"), s.flags.decr("@move");
        }), true;
      } else if (r.x > l || r.y > l) return r.cancelled = true, false;
      return false;
    }
    \u03B1hold(t = 250) {
      var e = this;
      let r = this[it], s = this[bt].element;
      if (r.cancelled) return false;
      if (r.setup && !r.active) {
        let n = this.clientX, o = this.clientY, l = n - r.x, h = o - r.y;
        Math.sqrt(l * l + h * h) > 5 && !r.cancelled && (clearTimeout(r.timeout), r.cancelled = true);
      }
      if (r.setup != true && (r.setup = true, true)) {
        r.active = false, r.x = this.clientX, r.y = this.clientY;
        let n;
        return r.timeout = setTimeout(function() {
          return r.active = true, e.preventDefault(), s.flags.incr("@hold"), n && n(true), n = null;
        }, t), M(this, "end", function() {
          return r.active && s.flags.decr("@hold"), clearTimeout(r.timeout), n && n(false), n = null;
        }), new Promise(function(o) {
          return n = o;
        });
      }
      return r.active;
    }
    \u03B1sync(t, e = "x", r = "y") {
      let s = this[it];
      return s.setup != true && (s.setup = true, true) ? (s.x = t[e] || 0, s.y = t[r] || 0, s.tx = this.x, s.ty = this.y) : (e && (t[e] = s.x + (this.x - s.tx)), r && (t[r] = s.y + (this.y - s.ty))), this[bt].commit = true, true;
    }
    \u03B1apply(t, e = "x", r = "y") {
      return e && (t[e] = this.x), r && (t[r] = this.y), this[bt].commit = true, true;
    }
    \u03B1css(t = "x", e = "y") {
      let r = this[it];
      if (r.setup != true && (r.setup = true, true)) r.el = this[bt].element, r.x = r.el[ch] || 0, r.y = r.el[fh] || 0, r.tx = this.x, r.ty = this.y;
      else {
        let s = r.el[ch] = r.x + (this.x - r.tx), n = r.el[fh] = r.y + (this.y - r.ty);
        t && r.el.style.setProperty("--x", s + "px"), e && r.el.style.setProperty("--y", n + "px");
      }
      return true;
    }
    \u03B1end() {
      return this.phase == "ended";
    }
    \u03B1shift() {
      return !!this.shiftKey;
    }
    \u03B1alt() {
      return !!this.altKey;
    }
    \u03B1ctrl() {
      return !!this.ctrlKey;
    }
    \u03B1meta() {
      return !!this.metaKey;
    }
    \u03B1primary() {
      return !!this.isPrimary && (this.pointerType != "mouse" || this.originalEvent.button == 0);
    }
    \u03B1mouse() {
      return this.pointerType == "mouse";
    }
    \u03B1pen() {
      return this.pointerType == "pen";
    }
    \u03B1touch() {
      return this.pointerType == "touch";
    }
    \u03B1pressure(t = 0.5) {
      return this.pressure >= t;
    }
    \u03B1log(...t) {
      return console.info(...t), true;
    }
    \u03B1left() {
      return this.originalEvent.button == 0;
    }
    \u03B1middle() {
      return this.originalEvent.button == 1;
    }
    \u03B1right() {
      return this.originalEvent.button == 2;
    }
    \u03B1round(t = 1, e = t) {
      return this.x = Er(this.x, t), this.y = Er(this.y, e), true;
    }
    [Es](...t) {
      let e = this[it];
      if (e.setup != true && (e.setup = true, true)) {
        let r = this.target, s = t.length, n = t[0], o = 0, l = "100%", h = 0, u = typeof n;
        u == "number" || u == "string" && /^([-+]?\d[\d\.]*)(%|\w+)$/.test(n) || Qt(n, Array) ? n = null : u == "string" && (n == "this" || n == "" ? n = r : n == "up" ? n = r.parentNode : n == "op" ? n = r.offsetParent : n = r.closest(n) || r.querySelector(n)), n == null && (s++, t.unshift(n = r)), s == 2 ? h = t[1] : s > 2 && ([o, l, h = 0] = t.slice(1));
        let d = n.getBoundingClientRect();
        Qt(o, Array) || (o = [o, o]), Qt(l, Array) || (l = [l, l]), Qt(h, Array) || (h = [h, h]), e.rect = d, e.x = ws(d.left, d.right, o[0], l[0], h[0]), e.y = ws(d.top, d.bottom, o[1], l[1], h[1]), this.x0 = this.x = e.x(this.x, e.clamp), this.y0 = this.y = e.y(this.y, e.clamp);
      } else {
        let r = this.x = e.x(this.x, e.clamp), s = this.y = e.y(this.y, e.clamp);
        this[Ns] = r - this.x0, this[Cs] = s - this.y0;
      }
      return true;
    }
    \u03B1fit(...t) {
      return this[it].clamp = true, this[Es](...t);
    }
    \u03B1reframe(...t) {
      return this[Es](...t);
    }
    \u03B1pin(...t) {
      var r;
      let e = this[it];
      if (e.setup != true && (e.setup = true, true)) {
        let s = Xt(t[0], this.target);
        Qt(s, N) || t.unshift(s = this.target);
        let n = t[1] || 0, o = (r = t[2]) != null ? r : t[2] = n, l = s.getBoundingClientRect();
        e.x = this.clientX - (l.left + l.width * n), e.y = this.clientY - (l.top + l.height * o), s && (this[nf] = s, s.flags.incr("_touch_"), M(this, "end", function() {
          return s.flags.decr("_touch_");
        }));
      }
      return this.x -= e.x, this.y -= e.y, true;
    }
  };
  c(Os, of, "Touch", 16);
  var Is = Os;
  var lf = /* @__PURE__ */ Symbol();
  var Ps = class Ps2 {
    on$touch(t, e, r, s) {
      return r.type = "touch", this.addEventListener("pointerdown", r, { passive: false }), Tr.ios\u03A6 && globalThis.parent != globalThis && dh != true && (dh = true, true) && globalThis.parent.postMessage("setupTouchFix"), r;
    }
  };
  c(Ps, lf, "Element", 1, N);
  if (globalThis.parent == globalThis && Tr.ios\u03A6) {
    let i = function(t) {
      if (t.data == "setupTouchFix") return globalThis.addEventListener("touchmove", function() {
        return false;
      }, { passive: false }), globalThis.removeEventListener("message", i);
    };
    globalThis.addEventListener("message", i);
  }
  Je.touch$handle = function() {
    let i = this.event, t = this.element, e = this.state.pointerId, r = this.modifiers, s = this.handler, n = Tr.ios\u03A6;
    if (this.current = this.state, e != null) return e == i.pointerId;
    if (r.ctrl && !i.ctrlKey || r.alt && !i.altKey || r.meta && !i.metaKey || r.shift && !i.shiftKey || r.if && !r.if[0] || r.self && i.target != t || r.primary && !i.isPrimary || r.pen && i.pointerType != "pen" || r.mouse && i.pointerType != "mouse" || r.touch && i.pointerType != "touch" || r.sel && !i.target.matches(String(r.sel[0])) || r["!sel"] && i.target.matches(String(r["!sel"][0]))) return;
    let o = this.state = s.state = this.current = new Is(i, s, t);
    e = o.pointerId;
    let l = function(f) {
      return f.preventDefault(), false;
    }, h = null, u = /* @__PURE__ */ Symbol(), d = function(f) {
      let p = o.clientX, g = o.clientY, m = f.clientX, v = f.clientY;
      (o[Nr] || o.defaultPrevented) && (f.pointerId == o.pointerId || p == m && g == v) && (f.preventDefault(), f.stopPropagation()), d && (globalThis.removeEventListener("click", d, { capture: true }), d = null);
    }, a = function(f) {
      if (!(o.type == "touchmove" && f.changedTouches[0].identifier != e) && (o.defaultPrevented || o[Nr])) return f.preventDefault();
    }, $ = function(f) {
      let p = f.type, g = o.phase;
      if (f.pointerId && o.pointerId != f.pointerId || f[u]) return;
      f[u] = true;
      let m = p == "pointerup" || p == "pointercancel";
      if (f.pressure == 0 && f.pointerType == "mouse" && p == "pointermove" && o.originalEvent.pressure > 0) return h(f);
      p == "pointercancel" ? (o.x = o.clientX, o.y = o.clientY) : (o.x = f.clientX, o.y = f.clientY), o.event = f, m && (o.phase = "ended");
      try {
        s.handleEvent(o);
      } catch {
      }
      if (g == "init" && !m && (o.phase = "active"), m && h) return h(f);
    }, x = false;
    return h = function(f) {
      if (!x && (x = true, t.flags.decr("_touch_"), o.phase != "ended" && (o.phase = "ended", o.x = o.clientX, o.y = o.clientY, s.handleEvent(o)), o.emit("end"), r.passive || --s.prevents == 0 && t.style.removeProperty("touch-action"), s.state = {}, globalThis.removeEventListener("pointermove", $, { passive: !!r.passive }), globalThis.removeEventListener("pointerup", $), globalThis.removeEventListener("pointercancel", $), setTimeout(function() {
        if (d && (globalThis.removeEventListener("click", d, { capture: true }), d = null), n && a) return globalThis.removeEventListener("touchend", a), globalThis.removeEventListener("touchmove", a, { passive: false }), a = null;
      }, 100), !r.passive)) return globalThis.document.removeEventListener("selectstart", l, { capture: true });
    }, o[mh] = h, r.passive || (s.prevents || (s.prevents = 0), s.prevents++, t.style.setProperty("touch-action", "none"), t.offsetWidth), t.flags.incr("_touch_"), globalThis.addEventListener("pointermove", $, { passive: !!r.passive }), globalThis.addEventListener("pointerup", $), globalThis.addEventListener("pointercancel", $), globalThis.addEventListener("click", d, { capture: true }), n && !r.passive && (globalThis.addEventListener("touchend", a), globalThis.addEventListener("touchmove", a, { passive: false })), r.passive || globalThis.document.addEventListener("selectstart", l, { capture: true }), $(i), false;
  };
  function vh(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  function gh(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var hf = /* @__PURE__ */ Symbol.for("#context");
  var uf = /* @__PURE__ */ Symbol.for("#extendType");
  var yh = new (globalThis.WeakMap || Map)();
  var Ls = { threshold: [0] };
  var af = {};
  Je.intersect$handle = function() {
    let i = this.event.detail.observer;
    return this.modifiers._observer == i;
  };
  var cf = /* @__PURE__ */ Symbol();
  var Fs = class Fs2 extends R {
    \u03B1in() {
      return this.delta >= 0 && this.entry.isIntersecting;
    }
    \u03B1out() {
      return this.delta < 0;
    }
    \u03B1css(t = "ratio") {
      return this.target.style.setProperty("--ratio", this.ratio), true;
    }
    \u03B1flag(t, e) {
      let { state: r, step: s } = this[hf], n = Xt(e || "", this.target);
      return this.isIntersecting && !r[s] ? (n.flags.incr(t), r[s] = true) : r[s] && !this.isIntersecting && (n.flags.decr(t), r[s] = false), true;
    }
  };
  c(Fs, cf, "IntersectionEvent", 0);
  var ks = Fs;
  function ff(i, t) {
    return function(e, r) {
      let s = r.prevRatios || (r.prevRatios = /* @__PURE__ */ new WeakMap());
      for (let n = 0, o = vh(e), l = o.length; n < l; n++) {
        let h = o[n], u = s.get(h.target) || 0, d = h.intersectionRatio, a = { entry: h, ratio: d, from: u, delta: d - u, observer: r }, $ = new R(i, { bubbles: false, detail: a });
        $[uf](ks), $.entry = h, $.isIntersecting = h.isIntersecting, $.delta = a.delta, $.ratio = a.ratio, s.set(h.target, d), h.target.dispatchEvent($);
      }
    };
  }
  function $h(i = Ls) {
    let t = i.threshold.join("-") + i.rootMargin;
    !i.root && Ls.root && (i.root || (i.root = Ls.root));
    let e = i.root || af, r = yh.get(e);
    return r || yh.set(e, r = {}), r[t] || (r[t] = new IntersectionObserver(ff("intersect", t), i));
  }
  var df = /* @__PURE__ */ Symbol();
  var Ms = class Ms2 {
    on$intersect(t, e, r, s) {
      let n;
      if (t.options) {
        let o = [], l = { threshold: o };
        for (let h = 0, u = vh(t.options), d = u.length; h < d; h++) {
          let a = u[h];
          gh(a, N) || gh(a, gl) ? l.root = a : typeof a == "number" ? o.push(a) : typeof a == "string" ? l.rootMargin = a : typeof a == "object" && Object.assign(l, a);
        }
        if (o.length == 1) {
          let h = o[0];
          if (h > 1) for (o[0] = 0; o.length < h; ) o.push(o.length / (h - 1));
        }
        o.length == 0 && o.push(0), n = $h(l);
      } else n = $h();
      return t._observer = n, n.observe(this), this.addEventListener("intersect", r, s), r;
    }
  };
  c(Ms, df, "Element", 1, N);
  function pf(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Rs = /* @__PURE__ */ Symbol.for("#width");
  var As = /* @__PURE__ */ Symbol.for("#height");
  var mf = /* @__PURE__ */ Symbol.for("#extendType");
  var Ds = null;
  var gf = /* @__PURE__ */ Symbol();
  var Vs = class Vs2 extends R {
    \u03B1css(t = "1elw", e = "1elh", r = "", s = "") {
      var o;
      let n = (o = this.entry) == null ? void 0 : o.target;
      if (r == "px" && (s = r, r = ""), n && n.offsetParent) {
        let l = $t(t), h = $t(e), u = Xt(r, n), d = l ? "--u_" + l[1] : "--" + t, a = h ? "--u_" + h[1] : "--" + e, $ = l ? this.width / l[0] : this.width, x = h ? this.height / h[0] : this.height;
        u.style.setProperty(d, $ + s), u.style.setProperty(a, x + s);
      }
      return true;
    }
    get width() {
      var t;
      return (t = this[Rs]) != null ? t : this[Rs] = this.entry.target.offsetWidth;
    }
    get height() {
      var t;
      return (t = this[As]) != null ? t : this[As] = this.entry.target.offsetHeight;
    }
  };
  c(Vs, gf, "ResizeEvent", 0);
  var zs = Vs;
  function yf() {
    return globalThis.ResizeObserver || Ds || (console.warn(":resize not supported in this browser"), Ds = { observe: function() {
      return true;
    } }), globalThis.imbaResizeObserver = Ds || (Ds = new ResizeObserver(function(i) {
      for (let t = 0, e = pf(i), r = e.length; t < r; t++) {
        let s = e[t], n = new R("resize", { bubbles: false, detail: s });
        n.entry = s, n.rect = s.contentRect, n[mf](zs), s.target.dispatchEvent(n);
        let o = new R("resized", { bubbles: true, detail: s });
        s.target.dispatchEvent(o);
      }
    }));
  }
  var $f = /* @__PURE__ */ Symbol();
  var Ks = class Ks2 {
    on$resize(t, e, r, s) {
      return yf().observe(this), this.addEventListener("resize", r, s), r;
    }
  };
  c(Ks, $f, "Element", 1, N);
  function bf(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var vf = /* @__PURE__ */ Symbol.for("#extendType");
  var Sf = /* @__PURE__ */ Symbol.for("#options");
  var xf = /* @__PURE__ */ Symbol();
  var qs = class qs2 extends R {
  };
  c(qs, xf, "MutationEvent", 0);
  var js = qs;
  var wf = /* @__PURE__ */ Symbol();
  var Hs = class Hs2 {
    on$mutate(t, e, r, s) {
      var n = this, o, l, h, u;
      r.observer || (r.observer = new MutationObserver(function(a) {
        let $ = new R("mutate", { bubbles: !!t.bubble, detail: a });
        return $[vf](js), n.dispatchEvent($);
      }));
      let d = r[Sf] = {};
      return t.subtree && (o = t.subtree, delete t.subtree, d.subtree = true), t.text && (l = t.text, delete t.text, d.characterData = true, d.characterDataOldValue = true), t.childList && (h = t.childList, delete t.childList, d.childList = true), t.attributes && (bf(t.attributes, Array) && (d.attributeFilter = t.attributes), u = t.attributes, delete t.attributes, d.attributes = true), !d.attributes && !d.childList && (d.childList = true), r.observer.observe(this, d), this.addEventListener("mutate", r, s), r;
    }
  };
  c(Hs, wf, "Element", 1, N);
  var Us;
  var wh = /* @__PURE__ */ Symbol();
  function _f() {
    if (!Us) return Us = function(i) {
      if (i[wh]) return;
      i[wh] = true;
      let t = globalThis.document.activeElement;
      if (t && t.matches("input,textarea")) {
        let e = new R("selection", { detail: { start: t.selectionStart, end: t.selectionEnd } });
        return t.dispatchEvent(e);
      }
    }, globalThis.document.addEventListener("selectionchange", Us);
  }
  var Tf = /* @__PURE__ */ Symbol();
  var Bs = class Bs2 {
    on$selection(t, e, r, s) {
      return _f(), this.addEventListener("selection", r, s), r;
    }
  };
  c(Bs, Tf, "Element", 1, N);
  var Ws = /* @__PURE__ */ Symbol.for("#string");
  var Ys = /* @__PURE__ */ Symbol.for("#html");
  var st = { win: { sep: "+", name: "win", order: ["meta", "ctrl", "mod", "alt", "option", "shift"].reverse(), labels: { option: "alt", mod: "ctrl", meta: "win" } }, mac: { sep: "", name: "mac", order: ["ctrl", "alt", "option", "shift", "mod", "command"].reverse(), labels: { left: "\u2192", up: "\u2191", down: "\u2193", right: "\u2190", plus: "+", tab: "\u21E5", meta: "\u2318", mod: "\u2318", ctrl: "\u2303", option: "\u2325", alt: "\u2325", del: "\u2326", shift: "\u21E7", enter: "\u21A9", esc: "\u238B", backspace: "\u232B" } } };
  st.auto = st.win;
  (globalThis.navigator.platform || "").match(/iPhone|iPod|iPad|Mac/) && (st.auto = st.mac);
  var Gs = {};
  function Th(i, t = "auto") {
    let e = "" + i + ":" + t;
    if (Gs[e]) return Gs[e];
    let r = st[t] || st.win, s = i.split(" ").map(function(n) {
      return n.split("+").sort(function(u, d) {
        return r.order.indexOf(d) - r.order.indexOf(u);
      }).map(function(u) {
        let d = r.labels[u] || u;
        return d = d[0].toUpperCase() + (d.slice(1) || "");
      });
    });
    return Gs[e] = s;
  }
  function Eh(i, t) {
    let e = Th(i, t), r = st[t] || st.win;
    return e[Ws] || (e[Ws] = e.map(function(s) {
      return s.join(r.sep);
    }).join(" "));
  }
  function Nh(i, t) {
    let e = Th(i, t), r = st[t] || st.win;
    return e[Ys] || (e[Ys] = e.map(function(s) {
      return "<kbd>" + s.map(function(n) {
        return "<kbd>" + n + "</kbd>";
      }).join("") + "</kbd>";
    }).join(" "));
  }
  var vt = { 8: "backspace", 9: "tab", 13: "enter", 16: "shift", 17: "ctrl", 18: "alt", 20: "capslock", 27: "esc", 32: "space", 33: "pageup", 34: "pagedown", 35: "end", 36: "home", 37: "left", 38: "up", 39: "right", 40: "down", 45: "ins", 46: "del", 91: "meta", 93: "meta", 224: "meta" };
  var Ch = { 106: "*", 107: "+", 109: "-", 110: ".", 111: "/", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\", 221: "]", 222: "'" };
  var Ih = { "~": "`", "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", "+": "=", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/", "|": "\\" };
  var Oh = { option: "alt", command: "meta", return: "enter", escape: "esc", plus: "+", mod: /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? "meta" : "ctrl" };
  var Ne;
  for (nt = 1; nt < 20; ++nt) vt[111 + nt] = "f" + nt;
  var nt;
  for (nt = 0; nt <= 9; ++nt) vt[nt + 96] = nt.toString();
  function Xs(i, t, e) {
    if (i.addEventListener) {
      i.addEventListener(t, e, false);
      return;
    }
    i.attachEvent("on" + t, e);
  }
  function Qs(i, t, e) {
    if (i.removeEventListener) {
      i.removeEventListener(t, e, false);
      return;
    }
    i.detachEvent("on" + t, e);
  }
  function Ph(i) {
    if (i.type == "keypress") {
      var t = String.fromCharCode(i.which);
      return i.shiftKey || (t = t.toLowerCase()), t;
    }
    return vt[i.which] ? vt[i.which] : Ch[i.which] ? Ch[i.which] : String.fromCharCode(i.which).toLowerCase();
  }
  function Ef(i, t) {
    return i.sort().join(",") === t.sort().join(",");
  }
  function Nf(i) {
    var t = [];
    return i.shiftKey && t.push("shift"), i.altKey && t.push("alt"), i.ctrlKey && t.push("ctrl"), i.metaKey && t.push("meta"), t;
  }
  function Cf(i) {
    if (i.preventDefault) {
      i.preventDefault();
      return;
    }
    i.returnValue = false;
  }
  function If(i) {
    if (i.stopPropagation) {
      i.stopPropagation();
      return;
    }
    i.cancelBubble = true;
  }
  function Js(i) {
    return i == "shift" || i == "ctrl" || i == "alt" || i == "meta";
  }
  function Of() {
    if (!Ne) {
      Ne = {};
      for (var i in vt) i > 95 && i < 112 || vt.hasOwnProperty(i) && (Ne[vt[i]] = i);
    }
    return Ne;
  }
  function Pf(i, t, e) {
    return e || (e = Of()[i] ? "keydown" : "keypress"), e == "keypress" && t.length && (e = "keydown"), e;
  }
  function Lf(i) {
    return i === "+" ? ["+"] : (i = i.replace(/\+{2}/g, "+plus"), i.split("+"));
  }
  function Lh(i, t) {
    var e, r, s, n = [];
    for (e = Lf(i), s = 0; s < e.length; ++s) r = e[s], Oh[r] && (r = Oh[r]), t && t != "keypress" && Ih[r] && (r = Ih[r], n.push("shift")), Js(r) && n.push(r);
    return t = Pf(r, n, t), { key: r, modifiers: n, action: t };
  }
  function kh(i, t) {
    return i === null || i === document ? false : i === t ? true : kh(i.parentNode, t);
  }
  function D(i) {
    var t = this;
    if (i = i || document, !(t instanceof D)) return new D(i);
    t.handleKeyEvent = d, t.target = i, t._callbacks = {}, t._directMap = {};
    var e = {}, r, s = false, n = false, o = false;
    function l(f) {
      f = f || {};
      var p = false, g;
      for (g in e) {
        if (f[g]) {
          p = true;
          continue;
        }
        e[g] = 0;
      }
      p || (o = false);
    }
    function h(f, p, g, m, v, S) {
      var y, b, T = [], E = g.type;
      if (!t._callbacks[f]) return [];
      for (E == "keyup" && Js(f) && (p = [f]), y = 0; y < t._callbacks[f].length; ++y) if (b = t._callbacks[f][y], !(!m && b.seq && e[b.seq] != b.level) && E == b.action && (E == "keypress" && !g.metaKey && !g.ctrlKey || Ef(p, b.modifiers))) {
        var J = !m && b.combo == v, lt = m && b.seq == m && b.level == S;
        (J || lt) && t._callbacks[f].splice(y, 1), T.push(b);
      }
      return T;
    }
    function u(f, p, g, m) {
      t.stopCallback(p, p.target || p.srcElement, g, m) || f(p, g) === false && (Cf(p), If(p));
    }
    t._handleKey = function(f, p, g) {
      var m = h(f, p, g), v, S = {}, y = 0, b = false;
      for (v = 0; v < m.length; ++v) m[v].seq && (y = Math.max(y, m[v].level));
      for (v = 0; v < m.length; ++v) {
        if (m[v].seq) {
          if (m[v].level != y) continue;
          b = true, S[m[v].seq] = 1, u(m[v].callback, g, m[v].combo, m[v].seq);
          continue;
        }
        b || u(m[v].callback, g, m[v].combo);
      }
      var T = g.type == "keypress" && n;
      g.type == o && !Js(f) && !T && l(S), n = b && g.type == "keydown";
    };
    function d(f) {
      typeof f.which != "number" && (f.which = f.keyCode);
      var p = Ph(f);
      if (p) {
        if (f.type == "keyup" && s === p) {
          s = false;
          return;
        }
        t.handleKey(p, Nf(f), f);
      }
    }
    function a() {
      clearTimeout(r), r = setTimeout(l, 1e3);
    }
    function $(f, p, g, m) {
      e[f] = 0;
      function v(E) {
        return function() {
          o = E, ++e[f], a();
        };
      }
      function S(E) {
        u(g, E, f), m !== "keyup" && (s = Ph(E)), setTimeout(l, 10);
      }
      for (var y = 0; y < p.length; ++y) {
        var b = y + 1 === p.length, T = b ? S : v(m || Lh(p[y + 1]).action);
        x(p[y], T, m, f, y);
      }
    }
    function x(f, p, g, m, v) {
      t._directMap[f + ":" + g] = p, f = f.replace(/\s+/g, " ");
      var S = f.split(" "), y;
      if (S.length > 1) {
        $(f, S, p, g);
        return;
      }
      y = Lh(f, g), t._callbacks[y.key] = t._callbacks[y.key] || [], h(y.key, y.modifiers, { type: y.action }, m, f, v), t._callbacks[y.key][m ? "unshift" : "push"]({ callback: p, modifiers: y.modifiers, action: y.action, seq: m, level: v, combo: f });
    }
    t._bindMultiple = function(f, p, g) {
      for (var m = 0; m < f.length; ++m) x(f[m], p, g);
    }, t.enable = function() {
      Xs(i, "keypress", d), Xs(i, "keydown", d), Xs(i, "keyup", d);
    }, t.disable = function() {
      Qs(i, "keypress", d), Qs(i, "keydown", d), Qs(i, "keyup", d);
    }, t.enable();
  }
  D.prototype.bind = function(i, t, e) {
    var r = this;
    return i = i instanceof Array ? i : [i], r._bindMultiple.call(r, i, t, e), r;
  };
  D.prototype.unbind = function(i, t) {
    var e = this;
    return e.bind.call(e, i, function() {
    }, t);
  };
  D.prototype.trigger = function(i, t) {
    var e = this;
    return e._directMap[i + ":" + t] && e._directMap[i + ":" + t]({}, i), e;
  };
  D.prototype.reset = function() {
    var i = this;
    return i._callbacks = {}, i._directMap = {}, i;
  };
  D.prototype.stopCallback = function(i, t) {
    var e = this;
    return (" " + t.className + " ").indexOf(" mousetrap ") > -1 || kh(t, e.target) ? false : t.tagName == "INPUT" || t.tagName == "SELECT" || t.tagName == "TEXTAREA" || t.isContentEditable;
  };
  D.prototype.handleKey = function() {
    var i = this;
    return i._handleKey.apply(i, arguments);
  };
  D.addKeycodes = function(i) {
    for (var t in i) i.hasOwnProperty(t) && (vt[t] = i[t]);
    Ne = null;
  };
  D.init = function() {
    var i = D(document);
    for (var t in i) t.charAt(0) !== "_" && (D[t] = /* @__PURE__ */ (function(e) {
      return function() {
        return i[e].apply(i, arguments);
      };
    })(t));
  };
  function Jt(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  function kf(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var Zs = /* @__PURE__ */ Symbol.for("#updateHotKeys");
  var Ff = /* @__PURE__ */ Symbol.for("#context");
  var Mf = /* @__PURE__ */ Symbol.for("#inInput");
  var en = /* @__PURE__ */ Symbol.for("#inEditable");
  var Rf = /* @__PURE__ */ Symbol.for("#hotkeyTarget");
  var Ah = /* @__PURE__ */ Symbol.for("#hotkeyCombos");
  var Lt = /* @__PURE__ */ Symbol.for("#hotkeyHandlers");
  var kt = /* @__PURE__ */ Symbol.for("#combos");
  var Fh = /* @__PURE__ */ Symbol.for("#extendType");
  var tn = /* @__PURE__ */ Symbol.for("#defaultPrevented");
  var rn = /* @__PURE__ */ Symbol.for("#target");
  var Af = /* @__PURE__ */ Symbol.for("#stopPropagation");
  var Df = /* @__PURE__ */ Symbol.for("#visit");
  var Mh = /* @__PURE__ */ Symbol.for("#key");
  var zf;
  try {
    zf = (globalThis.navigator.platform || "").match(/iPhone|iPod|iPad|Mac/);
  } catch {
  }
  var sn = { esc: true };
  var Vf = /* @__PURE__ */ Symbol();
  var on = class on2 extends R {
    \u03B1focus(t) {
      let e = this[Ff].element, r = e.ownerDocument;
      return t && (e = e.querySelector(t) || e.closest(t) || r.querySelector(t)), e == r.body ? r.activeElement != r.body && r.activeElement.blur() : e.focus(), true;
    }
    \u03B1local() {
      return true;
    }
    \u03B1repeat() {
      return true;
    }
  };
  c(on, Vf, "HotkeyEvent", 0);
  var Cr = on;
  var Kf = function(i, t, e) {
    return t.tagName == "INPUT" && (e == "down" || e == "up") ? false : t.tagName == "INPUT" || t.tagName == "SELECT" || t.tagName == "TEXTAREA" ? sn[e] ? (i[Mf] = true, i[en] = true, false) : true : t.contentEditable && (t.contentEditable == "true" || t.contentEditable == "plaintext-only") ? sn[e] ? (i[en] = true, false) : true : false;
  };
  var jf = /* @__PURE__ */ Symbol();
  var ln = class ln2 {
    constructor() {
      this.combos = { "*": {} }, this.identifiers = {}, this.labels = {}, this.handler = this.handle.bind(this), this.mousetrap = null, this.hothandler = this.handle.bind(this);
    }
    addKeycodes(t) {
      return D.addKeycodes(t);
    }
    trigger(t) {
      var e, r;
      return (r = (e = this.mousetrap) == null ? void 0 : e.trigger) == null ? void 0 : r.call(e, t);
    }
    register(t, e = {}) {
      return this.mousetrap || (this.mousetrap = D(globalThis.document), this.mousetrap.stopCallback = Kf), this.combos[t] || (this.combos[t] = true, this.mousetrap.bind(t, this.handler)), (e.capture || e.force) && (sn[t] = true), this;
    }
    comboIdentifier(t) {
      var e;
      return (e = this.identifiers)[t] || (e[t] = t.replace(/\+/g, "_").replace(/\ /g, "-").replace(/\*/g, "all").replace(/\|/g, " "));
    }
    humanize(t, e = "auto") {
      return Eh(t, e);
    }
    htmlify(t, e = "auto") {
      return Nh(t, e);
    }
    matchCombo(t) {
      return true;
    }
    handleEvent(t) {
      var r, s;
      return (s = (r = this.mousetrap) == null ? void 0 : r.handleKeyEvent) == null ? void 0 : s.call(r, t);
    }
    handle(t, e) {
      var x;
      let r = t.target && t.target[Rf] || t.target || globalThis.document.body, s = Array.from(globalThis.document.querySelectorAll("[data-hotkey]")), n = r.ownerDocument, o = r, l = [];
      for (; o && o != n && o.hotkeys !== true; ) o = o.parentNode;
      s = s.reverse().filter(function(f) {
        let p = f[Ah], g = p && p[e], m = p && p["*"];
        if (!(g || m)) return false;
        let v = f[Lt], S = f;
        for (; S && S != n; ) {
          if (S.hotkeys === false) return false;
          if (S.hotkeys === true && !S.contains(r)) {
            let y = true;
            for (let b = 0, T = Jt(v), E = T.length; b < E; b++) {
              let J = T[b];
              (J[kt][e] || J[kt]["*"]) && J.global\u03A6 && (y = false);
            }
            if (y) return false;
          }
          S = S.parentNode;
        }
        return true;
      });
      let h = globalThis.document.activeElement;
      if (s.length > 1) {
        let f = s.filter(function(g) {
          return h.contains(g);
        });
        f.length && (s = f);
        let p = s.filter(function(g) {
          try {
            return !g.hidden\u03A6;
          } catch {
          }
        });
        p.length > 0 && (s = p);
      }
      if (!s.length) return;
      let u = new R("beforehotkey", { bubbles: true, detail: this.detail });
      if (u[Fh](Cr), u.hotkey = e, r.dispatchEvent(u), u[tn]) return;
      let d = { combo: e, originalEvent: t, targets: s }, a = new R("hotkey", { bubbles: true, detail: d });
      a[Fh](Cr), a.originalEvent = t, a.hotkey = e, r.dispatchEvent(a);
      for (let f = 0, p = Jt(s), g = p.length; f < g; f++) {
        let m = p[f];
        for (let v = 0, S = Jt(m[Lt]), y = S.length; v < y; v++) {
          let b = S[v];
          if (b[kt][e] || b[kt]["*"]) {
            if (b.params.local && !b[rn].contains(r) || b.params.unobstructed && !m.unobstructed\u03A6) continue;
            if (!t[en] || b.capture\u03A6 || b.params.force) {
              let T = b[rn];
              (o && (o.contains(T) || T.contains(o)) || b.global\u03A6) && l.push(b);
            }
          }
        }
      }
      let $ = [];
      for (let f = 0, p = Jt(l), g = p.length; f < g; f++) {
        let m = p[f], v;
        (!t.repeat || m.params.repeat) && (v = m.handleEvent(a));
        let S = m.lastState || {};
        if ($.push(S), (!m.passive\u03A6 && S.called || a[tn]) && ((x = t == null ? void 0 : t.preventDefault) == null || x.call(t)), !(m.passive\u03A6 || S.called == false && !a[Af] && !a[tn])) break;
      }
      return $;
    }
  };
  c(ln, jf, "HotKeyManager", 16);
  var nn = ln;
  var qf = new nn();
  var Dh = function(i, t) {
    let e = t.element;
    kf(e, N) && (e.matches("input,textarea,select,option") ? e.focus() : e.click());
  };
  Dh.passive = true;
  var Hf = /* @__PURE__ */ Symbol();
  var hn = class hn2 {
    on$hotkey(t, e, r, s) {
      var n = this;
      return this[Lt] || (this[Lt] = []), this[Lt].push(r), r[rn] = this, t.$_ || (t.$_ = [Dh]), t[Df] = function() {
        return n[Zs]();
      }, this[Zs](), r;
    }
    [Zs]() {
      let t = {};
      for (let e = 0, r = Jt(this[Lt]), s = r.length; e < s; e++) {
        let n = r[e], o = n.params, l = o.options[0];
        if (n[Mh] != l && (n[Mh] = l, true)) {
          n[kt] = {};
          for (let h = 0, u = Jt(l.split("|")), d = u.length; h < d; h++) {
            let a = u[h];
            qf.register(a, o), n[kt][a] = true;
          }
        }
        Object.assign(t, n[kt]);
      }
      return this[Ah] = t, this.dataset.hotkey = Object.keys(t).join(" "), this;
    }
  };
  c(hn, Hf, "Element", 1, N);
  var Zt = typeof Reflect == "object" ? Reflect : null;
  var zh = Zt && typeof Zt.apply == "function" ? Zt.apply : function(t, e, r) {
    return Function.prototype.apply.call(t, e, r);
  };
  var Ir;
  Zt && typeof Zt.ownKeys == "function" ? Ir = Zt.ownKeys : Object.getOwnPropertySymbols ? Ir = function(t) {
    return Object.getOwnPropertyNames(t).concat(Object.getOwnPropertySymbols(t));
  } : Ir = function(t) {
    return Object.getOwnPropertyNames(t);
  };
  function Uf(i) {
    console && console.warn && console.warn(i);
  }
  var Kh = Number.isNaN || function(t) {
    return t !== t;
  };
  function _() {
    _.init.call(this);
  }
  _.EventEmitter = _;
  _.prototype._events = void 0;
  _.prototype._eventsCount = 0;
  _.prototype._maxListeners = void 0;
  var Vh = 10;
  function Or(i) {
    if (typeof i != "function") throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof i);
  }
  Object.defineProperty(_, "defaultMaxListeners", { enumerable: true, get: function() {
    return Vh;
  }, set: function(i) {
    if (typeof i != "number" || i < 0 || Kh(i)) throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + i + ".");
    Vh = i;
  } });
  _.init = function() {
    (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) && (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0), this._maxListeners = this._maxListeners || void 0;
  };
  _.prototype.setMaxListeners = function(t) {
    if (typeof t != "number" || t < 0 || Kh(t)) throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + t + ".");
    return this._maxListeners = t, this;
  };
  function jh(i) {
    return i._maxListeners === void 0 ? _.defaultMaxListeners : i._maxListeners;
  }
  _.prototype.getMaxListeners = function() {
    return jh(this);
  };
  _.prototype.emit = function(t) {
    for (var e = [], r = 1; r < arguments.length; r++) e.push(arguments[r]);
    var s = t === "error", n = this._events;
    if (n !== void 0) s = s && n.error === void 0;
    else if (!s) return false;
    if (s) {
      var o;
      if (e.length > 0 && (o = e[0]), o instanceof Error) throw o;
      var l = new Error("Unhandled error." + (o ? " (" + o.message + ")" : ""));
      throw l.context = o, l;
    }
    var h = n[t];
    if (h === void 0) return false;
    if (typeof h == "function") zh(h, this, e);
    else for (var u = h.length, d = Wh(h, u), r = 0; r < u; ++r) zh(d[r], this, e);
    return true;
  };
  function qh(i, t, e, r) {
    var s, n, o;
    if (Or(e), n = i._events, n === void 0 ? (n = i._events = /* @__PURE__ */ Object.create(null), i._eventsCount = 0) : (n.newListener !== void 0 && (i.emit("newListener", t, e.listener ? e.listener : e), n = i._events), o = n[t]), o === void 0) o = n[t] = e, ++i._eventsCount;
    else if (typeof o == "function" ? o = n[t] = r ? [e, o] : [o, e] : r ? o.unshift(e) : o.push(e), s = jh(i), s > 0 && o.length > s && !o.warned) {
      o.warned = true;
      var l = new Error("Possible EventEmitter memory leak detected. " + o.length + " " + String(t) + " listeners added. Use emitter.setMaxListeners() to increase limit");
      l.name = "MaxListenersExceededWarning", l.emitter = i, l.type = t, l.count = o.length, Uf(l);
    }
    return i;
  }
  _.prototype.addListener = function(t, e) {
    return qh(this, t, e, false);
  };
  _.prototype.on = _.prototype.addListener;
  _.prototype.prependListener = function(t, e) {
    return qh(this, t, e, true);
  };
  function Bf() {
    if (!this.fired) return this.target.removeListener(this.type, this.wrapFn), this.fired = true, arguments.length === 0 ? this.listener.call(this.target) : this.listener.apply(this.target, arguments);
  }
  function Hh(i, t, e) {
    var r = { fired: false, wrapFn: void 0, target: i, type: t, listener: e }, s = Bf.bind(r);
    return s.listener = e, r.wrapFn = s, s;
  }
  _.prototype.once = function(t, e) {
    return Or(e), this.on(t, Hh(this, t, e)), this;
  };
  _.prototype.prependOnceListener = function(t, e) {
    return Or(e), this.prependListener(t, Hh(this, t, e)), this;
  };
  _.prototype.removeListener = function(t, e) {
    var r, s, n, o, l;
    if (Or(e), s = this._events, s === void 0) return this;
    if (r = s[t], r === void 0) return this;
    if (r === e || r.listener === e) --this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : (delete s[t], s.removeListener && this.emit("removeListener", t, r.listener || e));
    else if (typeof r != "function") {
      for (n = -1, o = r.length - 1; o >= 0; o--) if (r[o] === e || r[o].listener === e) {
        l = r[o].listener, n = o;
        break;
      }
      if (n < 0) return this;
      n === 0 ? r.shift() : Wf(r, n), r.length === 1 && (s[t] = r[0]), s.removeListener !== void 0 && this.emit("removeListener", t, l || e);
    }
    return this;
  };
  _.prototype.off = _.prototype.removeListener;
  _.prototype.removeAllListeners = function(t) {
    var e, r, s;
    if (r = this._events, r === void 0) return this;
    if (r.removeListener === void 0) return arguments.length === 0 ? (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0) : r[t] !== void 0 && (--this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : delete r[t]), this;
    if (arguments.length === 0) {
      var n = Object.keys(r), o;
      for (s = 0; s < n.length; ++s) o = n[s], o !== "removeListener" && this.removeAllListeners(o);
      return this.removeAllListeners("removeListener"), this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0, this;
    }
    if (e = r[t], typeof e == "function") this.removeListener(t, e);
    else if (e !== void 0) for (s = e.length - 1; s >= 0; s--) this.removeListener(t, e[s]);
    return this;
  };
  function Uh(i, t, e) {
    var r = i._events;
    if (r === void 0) return [];
    var s = r[t];
    return s === void 0 ? [] : typeof s == "function" ? e ? [s.listener || s] : [s] : e ? Yf(s) : Wh(s, s.length);
  }
  _.prototype.listeners = function(t) {
    return Uh(this, t, true);
  };
  _.prototype.rawListeners = function(t) {
    return Uh(this, t, false);
  };
  _.listenerCount = function(i, t) {
    return typeof i.listenerCount == "function" ? i.listenerCount(t) : Bh.call(i, t);
  };
  _.prototype.listenerCount = Bh;
  function Bh(i) {
    var t = this._events;
    if (t !== void 0) {
      var e = t[i];
      if (typeof e == "function") return 1;
      if (e !== void 0) return e.length;
    }
    return 0;
  }
  _.prototype.eventNames = function() {
    return this._eventsCount > 0 ? Ir(this._events) : [];
  };
  function Wh(i, t) {
    for (var e = new Array(t), r = 0; r < t; ++r) e[r] = i[r];
    return e;
  }
  function Wf(i, t) {
    for (; t + 1 < i.length; t++) i[t] = i[t + 1];
    i.pop();
  }
  function Yf(i) {
    for (var t = new Array(i.length), e = 0; e < t.length; ++e) t[e] = i[e].listener || i[e];
    return t;
  }
  function un(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var an = /* @__PURE__ */ Symbol.for("#getQueryParam");
  var Yh = /* @__PURE__ */ Symbol.for("#setQueryParam");
  var cn = /* @__PURE__ */ Symbol.for("#query");
  var Gf = /* @__PURE__ */ Symbol();
  var te = class te2 {
    static parse(t, e) {
      return un(t, te2) ? t : new te2(t, e);
    }
    constructor(t, e) {
      this.router = e, this.parse(t);
    }
    parse(t) {
      var r;
      let e;
      return un(t, URL) || (t = new URL(t, this.router.origin)), (e = (r = this.router) == null ? void 0 : r.aliases[t.pathname]) && (t.pathname = e), this.url = t, this;
    }
    get active\u03A6() {
      return this.router.location == this;
    }
    reparse() {
      return this.parse(this.url);
    }
    get searchParams() {
      return this.url.searchParams;
    }
    search() {
      let t = this.searchParams ? this.searchParams.toString() : "";
      return t ? "?" + t : "";
    }
    update(t) {
      if (un(t, Object)) for (let e = 0, r = Object.keys(t), s = r.length, n, o; e < s; e++) n = r[e], o = t[n], this.searchParams.set(n, o);
      else typeof t == "string" && this.parse(t);
      return this;
    }
    clone() {
      return new te2(this.url.href, this.router);
    }
    equals(t) {
      return this.toString() == String(t);
    }
    get href() {
      return this.url.href;
    }
    get path() {
      return this.url.href.slice(this.url.origin.length);
    }
    get pathname() {
      return this.url.pathname;
    }
    get query() {
      return this[cn] || (this[cn] = new Proxy({}, { get: this[an].bind(this), set: this[Yh].bind(this) }));
    }
    toString() {
      return this.href;
    }
    [an](t, e) {
      return this.searchParams.get(e);
    }
    [Yh](t, e, r) {
      var n;
      let s = (n = this[an](t, e)) != null ? n : "";
      return r = r != null ? r : "", s != r && (r == null || r == "" ? this.searchParams.delete(e) : this.searchParams.set(e, r), this.active\u03A6 && (this.router.history.replaceState({}, null, this.path), this.router.touch())), true;
    }
  };
  c(te, Gf, "Location", 16);
  var St = te;
  function Gh(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  function Xf(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  function fn() {
    return function() {
      return true;
    };
  }
  var Qf = /* @__PURE__ */ Symbol();
  var ee = class ee2 {
    constructor(t, e = "") {
      this.store = t || {}, this.cache = { raw: {}, rich: {} }, this.ns = e, this.local = t == globalThis.sessionStorage, this.children = /* @__PURE__ */ new Map();
    }
    serialize(t, e) {
      return JSON.stringify(t);
    }
    deserialize(t, e) {
      return JSON.parse(t);
    }
    getItem(t) {
      let e = String(this.ns) + ":" + t;
      if (Gh(this.store, ee2)) return this.store.getItem(e);
      if (this.local && this.cache.rich[e] != null) return this.cache.rich[e];
      let r = this.store.getItem(e);
      if (r != null) return this.cache.raw[e] == r ? this.cache.rich[e] : (this.cache.raw[e] = r, this.cache.rich[e] = this.deserialize(r, e));
    }
    setItem(t, e) {
      var r, s;
      let n = String(this.ns) + ":" + t;
      if (Gh(this.store, ee2)) return this.store.setItem(n, e);
      let o = this.cache.rich[n], l = typeof e;
      if (this.local && (this.cache.rich[n] = e), o !== e || l == "object") {
        let h = this.store.getItem(n);
        if (e == null) return this.store.removeItem(n), r = this.cache.rich[n], delete this.cache.rich[n], s = this.cache.raw[n], delete this.cache.raw[n], L();
        {
          let u = this.serialize(e, n);
          if (this.cache.rich[n] = e, this.cache.raw[n] = u, h != u) return this.store.setItem(n, u), L();
        }
      }
    }
    removeItem(t) {
      var e;
      let r = String(this.ns) + ":" + t;
      return e = this.cache[r], delete this.cache[r], this.store.removeItem(r);
    }
    get(t, e, r) {
      return this.getItem(e);
    }
    set(t, e, r, s) {
      return this.setItem(e, r), true;
    }
    apply(t, e, [r]) {
      let s = this.children.get(r);
      return s || this.children.set(r, s = new Proxy(fn(), new ee2(this, r))), s;
    }
    deleteProperty(t, e) {
      return this.removeItem(e), true;
    }
    ownKeys(t) {
      let e = ["prototype"], r = this.ns + ":";
      for (let s = 0, n = Xf(Object.keys(this.store)), o = n.length; s < o; s++) {
        let l = n[s];
        l.indexOf(r) == 0 && e.push(l.slice(r.length));
      }
      return e;
    }
  };
  c(ee, Qf, "Storage", 16);
  var Pr = ee;
  var Cy = new Proxy(fn(), new Pr(globalThis.localStorage));
  var Xh = new Proxy(fn(), new Pr(globalThis.sessionStorage));
  function Jf(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var Ce = /* @__PURE__ */ Symbol.for("#states");
  var Qh = /* @__PURE__ */ new WeakMap();
  var Zf = /* @__PURE__ */ Symbol();
  var dn = class dn2 {
    static from(t, e) {
      return e ? new this(t, e) : null;
    }
    constructor(t, e, r = false) {
      Qh.set(this, t), this.path = e.path, this.data = e.data || {}, this.index = e.index, this.type = e.type, this.local = r;
    }
    get history() {
      return Qh.get(this);
    }
    get next() {
      return this.history.at(this.index + 1);
    }
    get prev() {
      return this.history.at(this.index - 1);
    }
    toJSON() {
      return { path: this.path, data: this.data, index: this.index, type: this.type };
    }
    save() {
      return this.history.cache[this.index] = this, this;
    }
    toString() {
      return "" + this.history.id + "|" + this.index;
    }
  };
  c(dn, Zf, "State", 16);
  var Ie = dn;
  var td = /* @__PURE__ */ Symbol();
  var pn = class pn2 {
    constructor(t) {
      this.router = t, this.store = Xh("router"), this[Ce] = [], this.cache = {}, this.index = -1;
      let e = globalThis.history.state, r;
      if (typeof e == "string") {
        let s = e.split("|");
        this.id = parseInt(s[0]), this.index = parseInt(s[1]), this.cache = this.store(this.id);
      } else this.id = this.store.id = (this.store.id || 0) + 1, this.cache = this.store(this.id);
      this.index == -1 && this.replaceState({ initial: true }, null, t.path);
    }
    get length() {
      return this.cache.length;
    }
    get state() {
      return this.at(this.index);
    }
    get states() {
      let t = this.length, e = 0;
      for (; e < t; ) this.at(e++);
      return this[Ce];
    }
    get currentStates() {
      return this.states.slice(0, this.length);
    }
    get next() {
      return this.state.next;
    }
    get prev() {
      return this.state.prev;
    }
    slice(t, e = this.length) {
      let r = [];
      for (; t < e; ) r.push(this.at(t++));
      return r;
    }
    at(t) {
      var e;
      if (!(t >= this.length)) return (e = this[Ce])[t] || (e[t] = Ie.from(this, this.cache[t]));
    }
    buildState(t, e, r = true) {
      let s = { data: t, index: this.index + 1, path: e || this.router.path, type: r ? "push" : "replace" };
      return new Ie(this, s, true);
    }
    pushState(t, e, r, s = true) {
      return Jf(t, Ie) || (t = this.buildState(t, r, s)), this.index = t.index, this.cache[this.index] = t, this[Ce][this.index] = t, this[Ce].length = this.cache.length = Math.max(t.index + 1, 0), globalThis.history[s ? "pushState" : "replaceState"](String(t), e || null, t.path), this;
    }
    replaceState(t, e, r) {
      return this.pushState(t, e, r, false);
    }
  };
  c(pn, td, "History", 16);
  var Lr = pn;
  var ed = /* @__PURE__ */ Symbol();
  var mn = class mn2 {
    constructor(t, e, r, s) {
      this.params = s, this.router = t, e && (this.location = St.parse(e), this.original = this.location.clone()), this.referrer = r;
    }
    get apply() {
      return this.params.apply || [];
    }
    get revert() {
      return this.params.revert || [];
    }
    get state() {
      return this.params.state;
    }
    get mode() {
      return this.params.mode;
    }
    redirect(t) {
      var e, r;
      return (r = (e = this.location) == null ? void 0 : e.update) == null || r.call(e, t), this;
    }
    get path() {
      var t;
      return (t = this.location) == null ? void 0 : t.path;
    }
    get url() {
      var t, e;
      return (e = (t = this.location) == null ? void 0 : t.toString) == null ? void 0 : e.call(t);
    }
    set path(t) {
      this.location.path = t;
    }
    abort(t = false) {
      return this.aborted = true, t && (this.forceAbort = t), this;
    }
    match(t) {
      return this.location ? this.router.route(t).match(this.path) : null;
    }
  };
  c(mn, ed, "Request", 16);
  var Oe = mn;
  function Jh(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var kr = /* @__PURE__ */ Symbol.for("#routes");
  var gn = /* @__PURE__ */ Symbol.for("#match");
  var rd = /* @__PURE__ */ Symbol.for("#symbol");
  var Zh = /* @__PURE__ */ Symbol.for("#matches");
  var yn = /* @__PURE__ */ new Map();
  var $n = {};
  var bn = {};
  var id = /.*/;
  function sd(i) {
    if (!yn.has(i)) {
      let t = /* @__PURE__ */ new Map();
      return yn.set(i, t), t;
    }
    return yn.get(i);
  }
  function nd(i, t) {
    let e = sd(i);
    if (!e.has(t)) {
      let r = Object.create(i);
      return Object.assign(r, t), e.set(t, r), r;
    }
    return e.get(t);
  }
  var od = /* @__PURE__ */ Symbol();
  var xn = class xn2 {
  };
  c(xn, od, "Match", 0);
  var vn = xn;
  function ld(i) {
    if ($n[i]) return $n[i];
    let t = $n[i] = { url: i }, e = i.indexOf("?"), r = i.indexOf("#");
    if (r >= 0 && (t.hash = i.slice(r + 1), i = t.url = i.slice(0, r)), e >= 0) {
      let s = t.query = i.slice(e + 1);
      i = i.slice(0, e), t.query = bn[s] || (bn[s] = new URLSearchParams(s));
    }
    return t.path = i, t;
  }
  var hd = /* @__PURE__ */ Symbol();
  var wn = class wn2 {
    constructor(t) {
      this.router = t, this.fullPath = "", this[kr] = {}, this[gn] = new vn(), this[gn].path = "";
    }
    route(t) {
      var e;
      return (e = this[kr])[t] || (e[t] = new Sn(this.router, t, this));
    }
    match() {
      return this[gn];
    }
    resolve(t) {
      return "/";
    }
  };
  c(wn, hd, "RootRoute", 16);
  var Fr = wn;
  var ud = /* @__PURE__ */ Symbol();
  var Mr = class Mr2 {
    constructor(t, e, r) {
      this.parent = r || t.rootRoute, this.router = t, this.status = 200, this.path = e, this[rd] = /* @__PURE__ */ Symbol(), this[Zh] = {}, this[kr] = {};
    }
    route(t) {
      var e;
      return (e = this[kr])[t] || (e[t] = new Mr2(this.router, t, this));
    }
    get fullPath() {
      return "" + this.parent.fullPath + "/" + this.$path;
    }
    load(t) {
      return this.router.queue.add(t);
    }
    set path(t) {
      var e = this;
      if (this.$path == t) return;
      if (this.raw = t, this.$path = t, this.groups = [], this.cache = {}, this.dynamic = false, t.indexOf("?") >= 0) {
        let s = t.split("?");
        t = s.shift(), this.query = {};
        for (let n = 0, o = Jh(s.join("?").split("&")), l = o.length; n < l; n++) {
          let h = o[n];
          if (!h) continue;
          let [u, d] = h.split("=");
          u[0] == "!" && (this.dynamic = true, u = u.slice(1), d = false), d === "" && (d = false), d && d[0] == ":" && (this.dynamic = true), this.query[u] = d || d !== false;
        }
      }
      if (t = t.replace(/\:(\w+|\*)(\.)?/g, function(s, n, o) {
        e.dynamic = true, n != "*" && e.groups.push(n);
        let l = e.router.matchers[n] || (o ? "([^/#.?]+)" : "([^/#?]+)");
        return o ? "" + l + "." : l;
      }), t == "" && this.query) return;
      if (t == "*") return this.regex = id, this;
      t = "^" + t;
      let r = t[t.length - 1];
      (r == "$" || r == "/") && (t = t.slice(0, -1) + "(?=/?[#?]|/?$)"), r != "/" && r != "$" && t != "^/" && (t = t + "(?=[/#?]|$)"), this.regex = new RegExp(t);
    }
    match(t = this.router.path) {
      var l, h, u;
      let e, r = this.parent.match(t);
      if (!r) return null;
      let s = ld(t), n = s.url, o = "";
      if (r.path && s.path.indexOf(r.path) == 0 && (o = r.path + "/", n = n.slice(o.length)), e = this.regex ? n.match(this.regex) : [""]) {
        let d = o + e[0], a = [this.$path], $ = {};
        if (this.groups.length) for (let p = 0, g = Jh(e), m = g.length, v; p < m; p++) {
          let S = g[p];
          (v = this.groups[p - 1]) && ($[v] = S, a.push(S));
        }
        if (this.query) for (let p = this.query, g = 0, m = Object.keys(p), v = m.length, S, y; g < v; g++) {
          S = m[g], y = p[S];
          let b = S, T = (h = (l = s.query) == null ? void 0 : l.get) == null ? void 0 : h.call(l, S);
          if (y === false) {
            if (T) return null;
            a.push("1");
            continue;
          }
          if (y[0] == ":" && (b = y.slice(1), y = true), y == true && T || y == T) $[b] = T, a.push(T);
          else return null;
        }
        let x = a.join("*");
        $ = (u = this[Zh])[x] || (u[x] = $);
        let f = nd(r, $);
        return f.path = d, f;
      }
      return null;
    }
    resolve(t = this.router.path) {
      if (this.raw[0] == "/" && !this.dynamic) return this.raw.replace(/\$/g, "");
      let e = this.parent.match(t), r = this.parent.resolve(t), s;
      if (this.dynamic) {
        let n = this.match(t);
        return n ? n.path : null;
      }
      return this.raw[0] == "?" ? s = (r || "/") + this.raw : s = r + "/" + this.raw, s.replace(/\$/g, "").replace(/\/\/+/g, "/");
    }
  };
  c(Mr, ud, "Route", 16);
  var Sn = Mr;
  function au(i, t) {
    var e;
    return typeof t == "string" ? typeof i === t : (e = t[Symbol.hasInstance]) == null ? void 0 : e.call(t, i);
  }
  var Nn = /* @__PURE__ */ Symbol.for("#enter");
  var Cn = /* @__PURE__ */ Symbol.for("#resolved");
  var Rr = /* @__PURE__ */ Symbol.for("#leave");
  var tu = /* @__PURE__ */ Symbol.for("#afterVisitRouted");
  var eu = /* @__PURE__ */ Symbol.for("#afterVisitRouteTo");
  var re = /* @__PURE__ */ Symbol.for("#doc");
  var at = /* @__PURE__ */ Symbol.for("#version");
  var ad = /* @__PURE__ */ Symbol.for("#routes");
  var _n = /* @__PURE__ */ Symbol.for("#origin");
  var Tn = /* @__PURE__ */ Symbol.for("#request");
  var Pe = /* @__PURE__ */ Symbol.for("#hash");
  var B = /* @__PURE__ */ Symbol.for("#routeTo");
  var Le = /* @__PURE__ */ Symbol.for("#path");
  var ot = /* @__PURE__ */ Symbol.for("#match");
  var ke = /* @__PURE__ */ Symbol.for("#options");
  var cd = /* @__PURE__ */ Symbol.for("#cache");
  var ru = /* @__PURE__ */ Symbol.for("#unmatched");
  var wt = /* @__PURE__ */ Symbol.for("#active");
  var fd = /* @__PURE__ */ Symbol.for("#resolvedPath");
  var dd = /* @__PURE__ */ Symbol.for("#dataKey");
  var pd = /* @__PURE__ */ Symbol.for("#activeKey");
  var Fe = /* @__PURE__ */ Symbol.for("#urlKey");
  var xt = /* @__PURE__ */ Symbol.for("#dataMap");
  var ie = /* @__PURE__ */ Symbol.for("#href");
  var V = /* @__PURE__ */ Symbol.for("#route");
  var iu = /* @__PURE__ */ Symbol.for("#context");
  var su = /* @__PURE__ */ Symbol.for("#afterVisit");
  var nu = /* @__PURE__ */ Symbol.for("#routeHandler");
  var md = /* @__PURE__ */ Symbol.for("#parentNode");
  var gd = /* @__PURE__ */ Symbol.for("#visitContext");
  var ou = /* @__PURE__ */ Symbol.for("##visitContext");
  var yd = /* @__PURE__ */ Symbol.for("#attachToParent");
  var $d = /* @__PURE__ */ Symbol.for("#detachFromParent");
  var En = /* @__PURE__ */ Symbol.for("#router");
  var Yy = Eo(function() {
    return globalThis.document.router;
  });
  var bd = /* @__PURE__ */ Symbol();
  var Pn = class Pn2 extends _ {
    constructor(t, e = {}) {
      super(), this[re] = t, this[at] = 0, this[ad] = {}, this.aliases = {}, this.redirects = {}, this.rules = {}, this.matchers = {}, this.options = e, this.busy = [], this.queue = new Ue(), this.root = new Fr(this), this.location = new St(e.url || t.location.href, this), this.history = new Lr(this), this.mode = e.mode || "history", this.queue.on("busy", function() {
        return globalThis.document.flags.incr("_routing_");
      }), this.queue.on("idle", function() {
        return globalThis.document.flags.decr("_routing_"), L();
      }), this.setup();
    }
    get origin() {
      return this[_n] || (this[_n] = this[re].location.origin);
    }
    get query() {
      return this.location.query;
    }
    init() {
      return this.refresh({ mode: "replace" }), this;
    }
    alias(t, e) {
      return this.aliases[t] = e, this.location.reparse(), this;
    }
    touch() {
      return this[at]++;
    }
    option(t, e) {
      return e == null ? this.options[t] : (this.options[t] = e, this);
    }
    get realpath() {
      let t = this[re].location;
      return t.href.slice(t.origin.length);
    }
    get state() {
      return this.history.state;
    }
    get states() {
      return this.history.currentStates;
    }
    set state(t) {
      this.state.data = t, this.state.save();
    }
    get ctx() {
      return this[Tn];
    }
    pushState(t, e, r) {
      return this.history.pushState(t, e || null, String(r));
    }
    replaceState(t, e, r) {
      return this.history.replaceState(t, e || null, String(r));
    }
    refresh(t = {}) {
      var e = this;
      if (this.refreshing) return;
      this.refreshing = true;
      let r = this.location, s = St.parse(t.location || this.realpath, this), n = t.mode, o = this[Tn];
      if (!s.equals(r) || !o || t.state) {
        let l = new Oe(this, s, r, t);
        this[Tn] = l, this.emit("beforechange", l), l.aborted && (!l.forceAbort && globalThis.window.confirm("Are you sure you want to leave? You might have unsaved changes") ? l.aborted = false : n == "pop" ? this.pushState(this.state, null, String(r)) : n == "replace" && this.replaceState(this.state, null, String(r))), l.aborted || (this.location = l.location, n == "push" ? this.pushState(l.state, null, String(this.location)) : n == "replace" ? this.replaceState(l.state, null, String(this.location)) : n == "pop" && (this.history.index = t.index), this.refreshing = false, this.emit("change", l), this.touch(), L());
      }
      return P.add(function() {
        let l = e[re].location.hash;
        if (l != e[Pe]) return e.emit("hashchange", e[Pe] = l);
      }), this.refreshing = false, this;
    }
    onpopstate(t) {
      let e = this.history.index, r = e, s = { pop: true, index: 0, from: e, mode: "pop" };
      try {
        if (typeof t.state == "string") {
          let [n, o] = t.state.split("|");
          r = s.index = parseInt(o), r < e ? s.revert = this.history.slice(r + 1, e + 1).reverse() : r > e && (s.apply = this.history.slice(e + 1, r + 1));
        }
      } catch {
      }
      return this.refresh(s), this;
    }
    onbeforeunload(t) {
      let e = new Oe(this, null, this.location, { mode: "unload" });
      if (this.emit("beforechange", e), e.aborted) return true;
    }
    onhashchange(t) {
      return this.emit("hashchange", this[Pe] = this[re].location.hash), L();
    }
    setup() {
      this.onclick = this.onclick.bind(this), this.onhashchange = this.onhashchange.bind(this);
      let t = globalThis.window;
      return this[Pe] = this[re].location.hash, this.location = St.parse(this.realpath, this), t.onpopstate = this.onpopstate.bind(this), t.onbeforeunload = this.onbeforeunload.bind(this), t.addEventListener("hashchange", this.onhashchange), t.addEventListener("click", this.onclick, { capture: true }), t.document.documentElement.emit("routerinit", this), this.refresh, this;
    }
    onclick(t) {
      if (t.metaKey || t.altKey) return;
      let e = null, r = null, s = t.target;
      for (; s && (!e || !r); ) !e && s.nodeName == "A" && (e = s), !r && s[B] && (r = s), s = s.parentNode;
      if (e && r != e && (!r || r.contains(e))) {
        let n = e.getAttribute("href");
        n && !n.match(/\:\/\//) && (!e.getAttribute("target") || e.getAttribute("target") == "_self") && !e.classList.contains("external") && e.addEventListener("click", this.onclicklink.bind(this), { once: true });
      }
      return true;
    }
    onclicklink(t) {
      let e = t.currentTarget || t.target;
      e[B] && e[B].resolve();
      let r = e.getAttribute("href"), s = new URL(e.href), n = s.href.slice(s.origin.length), o = this.realpath.split("#")[0], l = n.split("#")[0];
      return o == l ? globalThis.document.location.hash = s.hash : e[B] ? e[B].go() : this.go(n), t.stopPropagation(), t.preventDefault();
    }
    get url() {
      return this.location.url;
    }
    get path() {
      let t = this.location.path;
      return this.aliases[t] || t;
    }
    get pathname() {
      return this.location.pathname;
    }
    serializeParams(t) {
      var e;
      if (au(t, Object)) {
        e = [];
        for (let s = 0, n = Object.keys(t), o = n.length, l, h; s < o; s++) l = n[s], h = t[l], e.push([l, globalThis.encodeURI(h)].join("="));
        return e.join("&");
      }
      return t || "";
    }
    get hash() {
      return this[Pe];
    }
    set hash(t) {
      let e = "#" + this.serializeParams(t);
      globalThis.history.replaceState(this.state, null, e);
    }
    match(t) {
      return this.route(t).match(this.path);
    }
    route(t) {
      return this.root.route(t);
    }
    go(t, e = null) {
      if (typeof t == "object" && e === null && (e = t, t = this.path), typeof t == "number") return globalThis.history.go(t), this;
      let r = this.location.clone().update(t), s = this.history.buildState(e, r.path, true);
      return this.refresh({ push: true, mode: "push", location: r, state: s, apply: [s] }), this;
    }
    replace(t, e = null) {
      typeof t == "object" && e === null && (e = t, t = this.path);
      let r = this.location.clone().update(t), s = this.history.buildState(e, r.path, false);
      return this.refresh({ replace: true, mode: "replace", location: r, state: s, apply: [s] });
    }
  };
  c(Pn, bd, "Router", 16);
  var In = Pn;
  var vd = /* @__PURE__ */ Symbol();
  var Ln = class Ln2 {
    constructor(t, e, r, s = {}) {
      this.parent = r, this.node = t, this[Le] = e, this[ot] = null, this[ke] = s, this[cd] = {}, this[ru] = {}, this[wt] = null, this[fd] = null, this[dd] = /* @__PURE__ */ Symbol(), this[pd] = /* @__PURE__ */ Symbol(), this[Fe] = /* @__PURE__ */ Symbol();
    }
    get router() {
      return this.node.ownerDocument.router;
    }
    get route() {
      var e, r;
      return (r = (e = (this.parent ? this.parent.route : this.router) || this.router) == null ? void 0 : e.route) == null ? void 0 : r.call(e, this[Le]);
    }
    get match() {
      return this[ot];
    }
    get params() {
      return this[ot] || this[ru];
    }
    get state() {
      let t = this[xt] || (this[xt] = /* @__PURE__ */ new Map()), e = this.params, r = this[xt].get(e);
      return r || this[xt].set(e, r = {}), r;
    }
    set state(t) {
      (this[xt] || (this[xt] = /* @__PURE__ */ new Map())).set(this.params, t);
    }
    set path(t) {
      this[Le] != t && (this[Le] = t, true) && this.router.touch();
    }
    get path() {
      return this[Le];
    }
    get isActive() {
      return !!this[wt];
    }
    get active\u03A6() {
      return !!this[wt];
    }
    resolve() {
      let t = this.router[at];
      if (!(this[at] != t && (this[at] = t, true))) return;
      let e = this.route, r = this[ke], s = this.router.path, n = e.match(s), o = this[wt], l = this[ot], h = n != l, u = n && n[this[Fe]];
      return n && (this[wt] = true, this[ot] = n, n[this[Fe]] = s), n && (h || u != s || !o) && this[Cn](n, l, u), !o && n && this[Nn](), !n && (o || o === null) && (this[wt] = false, this[Rr]()), this[ot];
    }
    [Nn]() {
      var t, e;
      return this.node.flags.remove("not-routed"), this.node.flags.add("routed"), (e = (t = this.node) == null ? void 0 : t.routeDidEnter) == null ? void 0 : e.call(t, this);
    }
    [Cn](t, e, r = "") {
      var s, n;
      return (n = (s = this.node) == null ? void 0 : s.routeDidResolve) == null ? void 0 : n.call(s, this, t, e, r);
    }
    [Rr]() {
      var t, e;
      return this.node.flags.add("not-routed"), this.node.flags.remove("routed"), (e = (t = this.node) == null ? void 0 : t.routeDidLeave) == null ? void 0 : e.call(t, this);
    }
  };
  c(Ln, vd, "ElementRoute", 16);
  var Ar = Ln;
  var Sd = /* @__PURE__ */ Symbol();
  var kn = class kn2 extends Ar {
    [Nn]() {
      return this;
    }
    [Cn]() {
      return this;
    }
    [Rr]() {
      return this;
    }
    resolve() {
      let t = this.router[at];
      if (!(this[at] != t && (this[at] = t, true))) return;
      let e = this[ke], r = this.route, s = this.router.path, n = this.route.resolve(s), o = this.route.match(s);
      o && (this[ot] = o, this[ot][this[Fe]] = s), e.sticky && this[ot] && (n = this[ot][this[Fe]]), this[ie] != n && (this[ie] = n, true) && this.node.nodeName == "A" && this.node.setAttribute("href", n), this.node.flags.toggle("active", !!o);
    }
    get url() {
      return this.resolve(), globalThis.location.origin + this[ie];
    }
    go() {
      return this.resolve(), this[ke] && this[ke].replace ? this.router.replace(this[ie]) : this.router.path == this[ie] ? true : this.router.go(this[ie]);
    }
  };
  c(kn, Sd, "ElementRouteTo", 0);
  var On = kn;
  var xd = /* @__PURE__ */ Symbol();
  var Fn = class Fn2 {
    get router() {
      return this.ownerDocument.router;
    }
  };
  c(Fn, xd, "Node", 1, Node);
  var wd = /* @__PURE__ */ Symbol();
  var Mn = class Mn2 {
    set route(t) {
      if (t == null) return;
      if (this[V]) {
        this[V].path = t;
        return;
      }
      let e = t[0] != "/" ? this[iu].route : null;
      this[V] = new Ar(this, t, e, this.route__), this[su] = this[tu];
    }
    get route() {
      return this[V];
    }
    set route\u039Eto(t) {
      var e = this;
      if (t == null) return;
      if (this[B]) {
        this[B].path = t;
        return;
      }
      let r = t[0] != "/" ? this[iu].route : null;
      this[V] = this[B] = new On(this, t, r, this.routeTo__), this[su] = this[eu], this.onclick = function(s) {
        if (!s.altKey && !s.metaKey && !s[nu]) return s.preventDefault(), s[nu] = e[B], e[B].go();
      };
    }
    [tu]() {
      if (this[V]) {
        let t = this[md], e = t && t[gd];
        if (e && e.matchedRoute && e.matchedRoute != this[V]) {
          this[V][wt] != false && (this[V][wt] = false, true) && (this[V][Rr](), this[V][at] = -1);
          return;
        }
        if (this[V].resolve(), this[V].active\u03A6) e.matchedRoute = this[V];
        else return;
      }
      if (this.visit && this.visit(), this[ou]) return this[ou] = null;
    }
    [eu]() {
      if (this[B] && this[B].resolve(), this.visit) return this.visit();
    }
    routeDidEnter(t) {
      return this[yd]();
    }
    routeDidLeave(t) {
      return this[$d]();
    }
    routeDidResolve(t, e, r) {
      var s = this;
      au(this.routed, Function) && e != r && this.router.queue.add(async function() {
        s.suspend();
        let n = await s.routed(e, t.state, r);
        return s.unsuspend();
      });
    }
  };
  c(Mn, wd, "Element", 1, Element);
  var _d = /* @__PURE__ */ Symbol();
  var Rn = class Rn2 {
    get router() {
      return this[En] || (this[En] = new In(this));
    }
  };
  c(Rn, _d, "Document", 1, Document);
  function z(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var Ae = /* @__PURE__ */ Symbol.for("##reactive");
  var Ft = /* @__PURE__ */ Symbol.for("##referenced");
  var Re = /* @__PURE__ */ Symbol.for("##dereferenced");
  var Dr = /* @__PURE__ */ Symbol.for("#map");
  var cu = /* @__PURE__ */ Symbol.for("#__init__");
  var Me = /* @__PURE__ */ Symbol.for("#child");
  var Kr = /* @__PURE__ */ Symbol.for("##spy");
  var se = /* @__PURE__ */ Symbol.for("#reactions");
  var zr = /* @__PURE__ */ Symbol.for("#promise");
  var C = { TOUCHING: 2, STALE: 4, OBJECT: 8, RUNNING: 16, INVALIDATING: 32, POSSIBLY_STALE: 64, AUTORUN: 128, DEACTIVATED: 256 };
  var I = 0;
  var Mt = null;
  var Td = 0;
  var vu = 1;
  var Yn = { META: /* @__PURE__ */ new Map(), VALUE: /* @__PURE__ */ new Map(), REF: /* @__PURE__ */ new Map() };
  var K;
  var jr = { root: null, ctx: null, get context() {
    return w;
  }, get atomics() {
    return Mt;
  }, get ownref() {
    return F;
  }, flush() {
    if (w == K) return K.flush();
  } };
  var F = /* @__PURE__ */ Symbol.for("~");
  var Gn = function(i, t) {
    return t.has(i) || t.set(i, /* @__PURE__ */ Symbol()), t.get(i);
  };
  var Ur = function(i) {
    return typeof i == "symbol" ? Gn(i, Yn.VALUE) : Symbol.for(i);
  };
  var Br = function(i) {
    return typeof i == "symbol" ? Gn(i, Yn.REF) : /* @__PURE__ */ Symbol.for("~" + i);
  };
  var O = function(i, t) {
    return I && w.add(i[F]), t;
  };
  var W = function(i, t) {
    return i[F].$$invalidated(0), t;
  };
  var ne = function(i, t, e) {
    let r = i[F];
    return r || (r = i[F] = new oe(), Object.defineProperties(i, e)), t && r.addSubscriber(t), i;
  };
  var Qn = function(i, t) {
    let e = i[F];
    return e && e.removeSubscriber(t), i;
  };
  var Ed = /* @__PURE__ */ Symbol();
  var Zn = class Zn2 {
    constructor(t) {
      this.changes = /* @__PURE__ */ new Map(), this.cleanup(), t && this.reset(t);
    }
    reset(t = []) {
      return this.array = t, this.initialLength = t.length;
    }
    cleanup() {
      return this.idx = 0, this.array = null, this.changes.clear(), this.dirty = false;
    }
    push(t) {
      if (this.initialLength == 0) {
        this.array.indexOf(t) < 0 && (this.changes.set(t, 1), this.array.push(t), this.idx++);
        return;
      }
      let e = this.idx, r = this.array[e];
      if (r === t) ++this.idx;
      else {
        if (e > 0 && this.array[e - 1] === t) return;
        let s = this.array.indexOf(t), n = this.changes.get(t);
        if (s === -1) this.array.splice(e, 0, t), this.changes.set(t, 1), this.idx++;
        else {
          if (s < e) return;
          s === e + 1 ? (r && this.changes.set(r, -1), this.array.splice(e, 1), ++this.idx) : (s > e && this.array.splice(s, 1), this.array.splice(e, 0, t));
        }
        n == -1 && this.changes.delete(t);
      }
    }
    end() {
      if (this.array.length >= this.idx) for (; this.array.length > this.idx; ) this.changes.set(this.array.pop(), -1);
      return this.array;
    }
    patch() {
      return this.end();
    }
  };
  c(Zn, Ed, "ArrayPatcher", 16);
  var An = Zn;
  function Jn(i) {
    var t, e;
    let r = Object.getOwnPropertyDescriptors(i.prototype);
    return t = r.name, delete r.name, e = r.constructor, delete r.constructor, r;
  }
  var Id = /* @__PURE__ */ Symbol();
  var Hr = class Hr2 {
    constructor(t, e = 0) {
      this.depth = e, this.parent = t, this.target = null, this.spy = null, this.patcher = new An();
    }
    get active\u03A6() {
      return w == this;
    }
    get root\u03A6() {
      return this == K;
    }
    get snapshot() {
      let t = [], e = this[Me];
      for (; e && e.target; ) t.push({ depth: e.depth, target: e.target, beacon: e.beacon }), e = e[Me];
      return t;
    }
    reset(t) {
      var r, s;
      this.target = t, this.beacon = t.beacon;
      let e = this.spy = t[Kr];
      return this.tracking = e && (r = e.tracking) != null ? r : true, this.patcher.reset(t.observing || (t.observing = [])), e && ((s = e == null ? void 0 : e.enter) == null || s.call(e, this)), this;
    }
    add(t, e) {
      var r, s;
      this.tracking && t && this.beacon && this.patcher.push(t), this.spy && ((s = (r = this.spy) == null ? void 0 : r.observed) == null || s.call(r, this, t, e));
    }
    react(t) {
      var e, r;
      return this.spy && ((r = (e = this.spy) == null ? void 0 : e.react) == null || r.call(e, this, t)), K.reactions.add(t);
    }
    push(t) {
      return jr.ctx = w = this.child.reset(t);
    }
    pop() {
      var e, r;
      let t = null;
      if (this.beacon) {
        t = this.patcher.end();
        let s = this.patcher.changes;
        if (s.size) for (let [o, l] of z(s)) l === 1 ? o.addSubscriber(this.beacon) : o.removeSubscriber(this.beacon);
      }
      return this.spy && ((r = (e = this.spy) == null ? void 0 : e.leave) == null || r.call(e, this)), this.patcher.cleanup(), this.target = this.beacon = null, w = this.parent, w == K ? (K.flush(), jr.ctx = null) : jr.ctx = w, t;
    }
    get child() {
      return this[Me] || (this[Me] = new Hr2(this, this.depth + 1));
    }
    get reactions() {
      return this[se] || (this[se] = /* @__PURE__ */ new Set());
    }
    flush() {
      if (!this[se]) return;
      let t = this[se];
      this[se] = null;
      for (let e of z(t)) e.call();
    }
  };
  c(Hr, Id, "Context", 16);
  var Dn = Hr;
  var Od = /* @__PURE__ */ Symbol();
  var to = class to2 extends Dn {
    add() {
      return true;
    }
  };
  c(to, Od, "Root", 0);
  var zn = to;
  var w = K = jr.root = new zn(null, 0);
  var Pd = function() {
    return w.tracking = false;
  };
  var xu = function(i, t, e, r, s) {
    let n = i[e], o = i[s];
    return o || (o = i[s] = new oe(r, t, n)), w.add(o, i), n;
  };
  var wu = function(i, t, e, r, s, n) {
    let o = i[e];
    if (r != o) {
      i[e] = r;
      let l = i[n];
      l && l.changed(0, r, o);
    }
  };
  var Ld = /* @__PURE__ */ Symbol();
  var eo = class eo2 {
    constructor(t, e, r) {
      return this.id = vu++, this.observer = null, this.observers = null, this.v = 0, this.o = t || null, r && r[Ft] && r[Ft](this), this;
    }
    get $$v() {
      return this.v;
    }
    changed(t, e, r) {
      if (Td++, this.v++, r && r[Re] && r[Re](this, e), e && e[Ft] && e[Ft](this, r), this.observer && this.observer.$$invalidated(t + 1, this, e, r), this.observers) for (let s of z(this.observers)) s.$$invalidated(t + 1, this, e, r);
      w == K && w.flush();
    }
    invalidated(t, e) {
      return console.warn("Ref.invalidated is deprecated - use $$invalidated"), this.$$invalidated(t, e);
    }
    $$invalidated(t, e) {
      if (Mt) return Mt.add(this), true;
      if (this.v++, t > 30) {
        console.warn("Ref observer chain too deep", this, e);
        return;
      }
      if (this.observer && this.observer.$$invalidated(t + 1, this), this.observers) for (let r of z(this.observers)) r.$$invalidated(t + 1, this);
      return t == 0 && w == K && w.flush(), true;
    }
    addSubscriber(t) {
      this.observer ? (this.observers || (this.observers = /* @__PURE__ */ new Set()), this.observers.add(t)) : this.observer = t;
    }
    removeSubscriber(t) {
      this.observer == t && (this.observer = null);
      let e = this.observers;
      e && e.delete(t);
    }
    reportChanged() {
      return this.changed(0);
    }
    reportObserved(t) {
      return w.add(this, t);
    }
  };
  c(eo, Ld, "Ref", 16);
  var oe = eo;
  var kd = /* @__PURE__ */ Symbol();
  var ro = class ro2 extends Array {
    push() {
      return W(this, super.push(...arguments));
    }
    pop() {
      return W(this, super.pop(...arguments));
    }
    unshift() {
      return W(this, super.unshift(...arguments));
    }
    shift() {
      return W(this, super.shift(...arguments));
    }
    splice() {
      return W(this, super.splice(...arguments));
    }
    at() {
      return O(this, super.at(...arguments));
    }
    map() {
      return O(this, super.map(...arguments));
    }
    flatMap() {
      return O(this, super.flatMap(...arguments));
    }
    flat() {
      return O(this, super.flat(...arguments));
    }
    filter() {
      return O(this, super.filter(...arguments));
    }
    find() {
      return O(this, super.find(...arguments));
    }
    slice() {
      return O(this, super.slice(...arguments));
    }
    sort() {
      return O(this, super.sort(...arguments));
    }
    get len() {
      return O(this, this.length);
    }
    set len(t) {
      this.length = t, W(this);
    }
    toIterable() {
      return I && w.add(this[F]), this;
    }
    [Symbol.iterator]() {
      return O(this, super[Symbol.iterator](...arguments));
    }
  };
  c(ro, kd, "ObservableArray", 8);
  var Vn = ro;
  var du = Jn(Vn);
  var Fd = /* @__PURE__ */ Symbol();
  var io = class io2 {
    get len() {
      return this.length;
    }
    set len(t) {
      this.length = t;
    }
    get [Ae]() {
      return ne(this, null, du);
    }
    [Ft](t) {
      return ne(this, t, du);
    }
    [Re](t) {
      return Qn(this, t);
    }
  };
  c(io, Fd, "Array", 1, Array);
  var mu = Set.prototype.has;
  var Md = /* @__PURE__ */ Symbol();
  var so = class so2 extends Set {
    has() {
      return O(this, super.has(...arguments));
    }
    keys() {
      return O(this, super.keys(...arguments));
    }
    values() {
      return O(this, super.values(...arguments));
    }
    entries() {
      return O(this, super.entries(...arguments));
    }
    add(t) {
      return mu.call(this, t) ? this : W(this, super.add(...arguments));
    }
    delete(t) {
      return mu.call(this, t) ? W(this, super.delete(...arguments)) : this;
    }
    clear() {
      return this.size ? W(this, super.clear(...arguments)) : this;
    }
  };
  c(so, Md, "ObservableSet", 8);
  var Kn = so;
  var gu = Jn(Kn);
  var Rd = /* @__PURE__ */ Symbol();
  var no = class no2 {
    get [Ae]() {
      return ne(this, null, gu);
    }
    [Ft](t) {
      return ne(this, t, gu);
    }
    [Re](t) {
      return Qn(this, t);
    }
  };
  c(no, Rd, "Set", 1, Set);
  var Ad = /* @__PURE__ */ Symbol();
  var oo = class oo2 extends Map {
    get() {
      return O(this, super.get(...arguments));
    }
    has() {
      return O(this, super.has(...arguments));
    }
    keys() {
      return O(this, super.keys(...arguments));
    }
    values() {
      return O(this, super.values(...arguments));
    }
    entries() {
      return O(this, super.entries(...arguments));
    }
    set() {
      return W(this, super.set(...arguments));
    }
    clear() {
      return W(this, super.clear(...arguments));
    }
    delete() {
      return W(this, super.delete(...arguments));
    }
  };
  c(oo, Ad, "ObservableMap", 8);
  var jn = oo;
  var $u = Jn(jn);
  var Dd = /* @__PURE__ */ Symbol();
  var lo = class lo2 {
    get [Ae]() {
      return ne(this, null, $u);
    }
    [Ft](t) {
      return ne(this, t, $u);
    }
    [Re](t) {
      return Qn(this, t);
    }
  };
  c(lo, Dd, "Map", 1, Map);
  var zd = /* @__PURE__ */ Symbol();
  var ho = class ho2 {
    constructor(t, e = {}) {
      var h;
      var r = this;
      this.name = t, this.options = e;
      let s = this.key = Ur(t), n = Br(t), o = this.descriptor = { enumerable: (h = e.enumerable) != null ? h : true, configurable: false, get: function() {
        return I ? xu(this, t, s, r, n) : this[s];
      }, set: function(u) {
        return I || this[n] ? wu(this, t, s, u, r, n) : this[s] = u;
      } }, l = this.lazyDescriptor = { enumerable: false, configurable: true, get: function() {
        return I ? (Object.defineProperty(this, t, o), this[t]) : this[s];
      }, set: function(u) {
        return this[s] = u, this[n] = null, Object.defineProperty(this, t, o);
      } };
    }
  };
  c(ho, zd, "PropertyType", 16);
  var Vd = /* @__PURE__ */ Symbol();
  var uo = class uo2 {
    constructor(t = null) {
      this[cu](t);
    }
    [cu](t = null, e = true, r = true) {
      var s;
      this[Dr] = t && (s = t[Dr]) !== void 0 ? s : /* @__PURE__ */ new Map();
    }
    for(t) {
      let e = this[Dr].get(t);
      return e || this[Dr].set(t, e = []), e;
    }
    get(t) {
      let e = this.for(t);
      return e[F] || e[Ae], I && O(e), e;
    }
    add(t, e) {
      return this.for(t).push(e);
    }
    delete(t, e) {
      let r = this.for(t), s = r.indexOf(e);
      r.splice(s, 1);
    }
  };
  c(uo, Vd, "RefIndex", 16);
  var Hn = uo;
  var Kd = /* @__PURE__ */ Symbol();
  var ao = class ao2 {
    constructor(t, e) {
      var r = this;
      this.name = t, this.key = e, this.index = new Hn();
      let s = Br(t), n = this.descriptor = { enumerable: true, configurable: false, get: function() {
        return I ? xu(this, t, e, r, s) : this[e];
      }, set: function(l) {
        let h = this[e];
        if (I || this[s] ? wu(this, t, e, l, r, s) : this[e] = l, h != l && (h && r.index.delete(h, this), l)) return r.index.add(l, this);
      } }, o = this.lazyDescriptor = { set: function(l) {
        return this[e] = l, l && r.index.add(l, this), Object.defineProperty(this, t, n), this[s] = null;
      } };
    }
    where(t) {
      return this.index.get(t);
    }
  };
  c(ao, Kd, "RefType", 16);
  var jd = /* @__PURE__ */ Symbol();
  var co = class co2 {
    constructor(t, e, r, s) {
      this.observing = null, this.observers = null, this.flags = 68, this.target = t, this.func = e, this.vkey = r, this.type = s, this.v = 0;
    }
    get beacon() {
      return this;
    }
    addSubscriber(t) {
      if (t == this) {
        console.warn("@computed depends on itself");
        return;
      }
      this.observer ? (this.observers || (this.observers = []), this.observers.push(t)) : this.observer = t;
    }
    removeSubscriber(t) {
      if (this.observer == t) return this.observer = null;
      let e = this.observers, r = e ? e.indexOf(t) : -1;
      r >= 0 && e.splice(r, 1);
    }
    $$invalidated(t, e) {
      if (this.flags |= C.STALE | C.POSSIBLY_STALE, t > 40) {
        console.warn("Memo invalidated observer chain too deep", this, e);
        return;
      }
      if (this.observer && this.observer.$$invalidated(t + 1, this), !!this.observers) {
        for (let r = 0, s = z(this.observers), n = s.length; r < n; r++) s[r].$$invalidated(t + 1, this);
        return this;
      }
    }
    deactivate() {
      if (this.observing) for (let t = 0, e = z(this.observing), r = e.length; t < r; t++) e[t].removeSubscriber(this);
      return this.observing = null, this;
    }
    value() {
      if (I && w.add(this), !(this.flags & C.POSSIBLY_STALE)) return this.target[this.vkey];
      I++, this.flags |= C.RUNNING, w.push(this);
      let t = this.func.call(this.target);
      w.pop(this);
      let e = this.target[this.vkey], r = false;
      if (t && e && t.constructor === e.constructor && t instanceof Array) {
        let s = t.length;
        if (s != e.length) r = true;
        else {
          let n = 0;
          for (; n < s; ) {
            if (t[n] != e[n]) {
              r = true;
              break;
            }
            n++;
          }
        }
      } else r = t !== e;
      return this.target[this.vkey] = t, this.flags &= ~(C.STALE | C.POSSIBLY_STALE | C.RUNNING), r && this.v++, I--, t;
    }
  };
  c(co, jd, "Memo", 16);
  var At = co;
  var qd = /* @__PURE__ */ Symbol();
  var fo = class fo2 {
    constructor(t, e) {
      var r = this;
      this.name = t;
      let s = Br(t), n = Ur(t), o = this.descriptor = { enumerable: false, configurable: false, get: function() {
        return this[s].value();
      } }, l = this.lazyDescriptor = { enumerable: false, configurable: true, get: function() {
        let h = this[s] = new At(this, e, n, r.type);
        return Object.defineProperty(this, t, o), h.value();
      } };
    }
  };
  c(fo, qd, "ComputedType", 16);
  var Hd = /* @__PURE__ */ Symbol();
  var po = class po2 {
    get beacon() {
      return this;
    }
    constructor(t, e, r = {}) {
      this.cb = t, this.context = e, this.options = r, this.flags = 0, this.id = vu++, this.cachedComputedVersions = /* @__PURE__ */ new WeakMap(), this.checkComputedValues = /* @__PURE__ */ new Set(), this.observing = [], this.timeout = null;
    }
    get running\u03A6() {
      return this.flags & C.RUNNING;
    }
    $$invalidated(t, e) {
      var r, s;
      e instanceof At ? (this.flags |= C.POSSIBLY_STALE, (s = (r = this.checkComputedValues) == null ? void 0 : r.add) == null || s.call(r, e)) : this.flags |= C.STALE, this.observing && w.react(this);
    }
    activate() {
      return this.observing = [], this.cachedComputedVersions = /* @__PURE__ */ new WeakMap(), this.checkComputedValues = /* @__PURE__ */ new Set(), this.call(), this;
    }
    deactivate() {
      if (this.timeout && clearTimeout(this.timeout), this.observing) for (let t = 0, e = z(this.observing), r = e.length; t < r; t++) e[t].removeSubscriber(this);
      return this.observing = this.checkComputedValues = this.cachedComputedVersions = null, this;
    }
    call() {
      var t = this;
      if (I && console.warn("should not call reaction inside an autorunning context?", K.snapshot, this), this.flags & C.POSSIBLY_STALE && !(this.flags & C.STALE)) {
        let e = false;
        for (let r of z(this.checkComputedValues)) {
          let s = this.cachedComputedVersions.get(r);
          r.value();
          let n = r.v;
          if (s != n) {
            e = true;
            break;
          }
        }
        if (!e) {
          this.flags &= ~C.POSSIBLY_STALE, this.checkComputedValues.clear();
          return;
        }
      }
      if (this.options.delay) {
        clearTimeout(this.timeout);
        let e = this.options.delay;
        typeof e != "number" && (e = 1e3), this.timeout = setTimeout(function() {
          return t.run();
        }, e);
        return;
      }
      return this.run();
    }
    run() {
      I++, this.flags |= C.RUNNING;
      let t = w.push(this), e = this.cb.call(this.context, Pd), r = w.pop(this);
      this.observing = r, this.checkComputedValues.clear();
      for (let s = 0, n = z(r), o = n.length; s < o; s++) {
        let l = n[s];
        l instanceof At && this.cachedComputedVersions.set(l, l.v);
      }
      return this.flags &= ~(C.RUNNING | C.STALE | C.POSSIBLY_STALE), I--, this.options.silent || L(), e;
    }
    dispose() {
      return this.deactivate(), this.cb = this.context = this.options = null, this;
    }
  };
  c(po, Hd, "Reaction", 16);
  var Rt = po;
  var Ud = /* @__PURE__ */ Symbol();
  var mo = class mo2 extends Rt {
    resolve(t) {
      return this.deactivate(), this.resolved = t;
    }
    then(...t) {
      var e = this;
      return this.resolved !== void 0 ? Promise.resolve(this.resolved).then(...t) : (this[zr] || (this[zr] = new Promise(function(r) {
        return e.resolve = function(s) {
          return e.deactivate(), e.resolved = s, r(s);
        };
      })), this[zr].then(...t));
    }
    run() {
      I++, this.flags |= C.RUNNING;
      let t = w.push(this), e = this.cb.call(this.context), r = w.pop(this);
      this.observing = r, this.checkComputedValues.clear();
      for (let s = 0, n = z(r), o = n.length; s < o; s++) {
        let l = n[s];
        l instanceof At && this.cachedComputedVersions.set(l, l.v);
      }
      return this.flags &= ~(C.RUNNING | C.STALE | C.POSSIBLY_STALE), I--, e != false && e != null && e != null && (this.resolve(e), this.options.silent || L()), e;
    }
  };
  c(mo, Ud, "Awaits", 0);
  var Bd = /* @__PURE__ */ Symbol();
  var go = class go2 {
    constructor(t, e) {
      this.scope = e, this.cb = t;
    }
    get ctx() {
      return w;
    }
    run(t = this.scope, e = [], r = false) {
      w.push(this);
      try {
        r && I++;
        let s = this.cb.apply(t, e);
        return r && I--, w.pop(this), s;
      } catch (s) {
        throw r && I--, w.pop(this), s;
      }
    }
  };
  c(go, Bd, "Action", 16);
  function Yd(i) {
    let t;
    return i && ((t = i.toIterable) ? t.call(i) : i);
  }
  var _u = /* @__PURE__ */ Symbol.for("#__init__");
  var De = /* @__PURE__ */ Symbol.for("#watchers");
  var Gd = /* @__PURE__ */ Symbol();
  var $o = class $o2 {
    constructor(t = null) {
      this[_u](t);
    }
    [_u](t = null, e = true, r = true) {
      var s;
      this.local = t && (s = t.local) !== void 0 ? s : false, this.session = t && (s = t.session) !== void 0 ? s : false, this.weak = t && (s = t.weak) !== void 0 ? s : false;
    }
    watch(t) {
      return (this[De] || (this[De] = [])).push(t);
    }
    $get(t, e) {
      return t[e];
    }
    $set(t, e, r, s) {
      if (this[De]) {
        let n = this.$get(e, r, s);
        if (n != t) {
          e[r] = t;
          for (let o = 0, l = Yd(this[De]), h = l.length; o < h; o++) {
            let d = l[o].call(e, t, n, this);
          }
        }
      } else e[r] = t;
    }
    $accessor(t, e, r, s, n) {
      return n[s] = this;
    }
  };
  c($o, Gd, "Accessor", 16);

  // public/mods/ffxiv/site/enhancements.js
  Fg(), Sr(), ug(), Em();
  var $beforeReconcile$ = /* @__PURE__ */ Symbol.for("#beforeReconcile");
  var $placeChild$ = /* @__PURE__ */ Symbol.for("#placeChild");
  var $getSlot$ = /* @__PURE__ */ Symbol.for("#getSlot");
  var $afterVisit$ = /* @__PURE__ */ Symbol.for("#afterVisit");
  var $$up$ = /* @__PURE__ */ Symbol.for("##up");
  var $appendChild$ = /* @__PURE__ */ Symbol.for("#appendChild");
  var $afterReconcile$ = /* @__PURE__ */ Symbol.for("#afterReconcile");
  var $$register$ = /* @__PURE__ */ Symbol.for("##register");
  var \u03B5SELF = /* @__PURE__ */ Symbol();
  var \u03B5T = /* @__PURE__ */ Symbol();
  var \u03B5T2 = /* @__PURE__ */ Symbol();
  var \u03B5T3 = /* @__PURE__ */ Symbol();
  var bt\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5T4 = /* @__PURE__ */ Symbol();
  var \u03B5i = /* @__PURE__ */ Symbol();
  var \u03B5 = /* @__PURE__ */ Symbol();
  var \u03B5T5 = /* @__PURE__ */ Symbol();
  var \u03B52 = /* @__PURE__ */ Symbol();
  var \u03B5T6 = /* @__PURE__ */ Symbol();
  var bw\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5T7 = /* @__PURE__ */ Symbol();
  var \u03B5i2 = /* @__PURE__ */ Symbol();
  var \u03B53 = /* @__PURE__ */ Symbol();
  var \u03B5T8 = /* @__PURE__ */ Symbol();
  var \u03B5i3 = /* @__PURE__ */ Symbol();
  var \u03B54 = /* @__PURE__ */ Symbol();
  var \u03B5T9 = /* @__PURE__ */ Symbol();
  var \u03B5i4 = /* @__PURE__ */ Symbol();
  var \u03B55 = /* @__PURE__ */ Symbol();
  var \u03B5T10 = /* @__PURE__ */ Symbol();
  var \u03B50\u03B9 = /* @__PURE__ */ Symbol();
  var \u03B5SELF2 = /* @__PURE__ */ Symbol();
  var \u03B5T11 = /* @__PURE__ */ Symbol();
  var cb\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5T12 = /* @__PURE__ */ Symbol();
  var cc\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B56 = /* @__PURE__ */ Symbol();
  var ce\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5i5 = /* @__PURE__ */ Symbol();
  var \u03B57 = /* @__PURE__ */ Symbol();
  var \u03B5T13 = /* @__PURE__ */ Symbol();
  var cg\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5T14 = /* @__PURE__ */ Symbol();
  var \u03B5i6 = /* @__PURE__ */ Symbol();
  var \u03B58 = /* @__PURE__ */ Symbol();
  var \u03B5i7 = /* @__PURE__ */ Symbol();
  var \u03B59 = /* @__PURE__ */ Symbol();
  var \u03B5T15 = /* @__PURE__ */ Symbol();
  var \u03B50\u03B92 = /* @__PURE__ */ Symbol();
  var \u03B5T16 = /* @__PURE__ */ Symbol();
  var ck\u03C6 = /* @__PURE__ */ Symbol();
  var \u03B5T17 = /* @__PURE__ */ Symbol();
  var cl\u03C6 = /* @__PURE__ */ Symbol();
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var c$0 = /* @__PURE__ */ Symbol();
  var ProjectFinderComponent = class extends Ot {
    [__init__$]($$ = null, deep = true, fields = true) {
      var $0;
      super[__init__$](...arguments);
      this.projects = $$ && ($0 = $$.projects) !== void 0 ? $0 : [];
      this.query = $$ && ($0 = $$.query) !== void 0 ? $0 : "";
      this.handler = $$ && ($0 = $$.handler) !== void 0 ? $0 : null;
    }
    get matches() {
      const term = this.query.trim().toLowerCase();
      return this.projects.filter(function(project) {
        return (project.name + " " + project.description + " " + project.tags.join(" ")).toLowerCase().includes(term);
      });
    }
    open() {
      this.query = "";
      this.commit();
      this.querySelector("dialog").showModal();
      return this.querySelector("input").focus();
    }
    close() {
      return this.querySelector("dialog").close();
    }
    shortcut(event) {
      const target = event.target;
      if (event.key == "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !target.closest("input,textarea,select,[contenteditable]")) {
        event.preventDefault();
        return this.open();
      }
      ;
    }
    mount() {
      this.handler = this.shortcut.bind(this);
      return window.addEventListener("keydown", this.handler);
    }
    unmount() {
      return window.removeEventListener("keydown", this.handler);
    }
    render() {
      var self = this, \u03C40if, \u03C4SELF, \u03B9SELF, \u0394SELF, $1 = this._ns_ || "", \u03C4T, \u03B9T, \u0394T, \u03C4T2, \u03C4T3, \u03B9T2, \u0394T2, \u03C4bsS, \u03C4T4, \u03C4T5, \u03C4T6, \u03C4T7, \u03C4T8, \u03C4T9, \u03B9T3, \u0394T3, \u03C5T, \u03C1T, \u03C4T10, \u03B9T4, \u0394T4, \u03C5T2, \u03C4T11, \u03C4, \u03BA, \u03C1, \u03C4T12, \u03B9T5, \u03BAT, \u0394T5, \u03C4T13, \u03B9T6, \u0394T6, \u03C5T3, \u03C4T14, \u03C5T4, \u03C4T15, \u03C5T5, \u03C4T16, \u03C5T6, \u03B9T7, \u0394T7, \u03C1T2;
      \u03C4SELF = this;
      \u03C4SELF[$beforeReconcile$]();
      (\u03B9SELF = \u0394SELF = 1, \u03C4SELF[\u03B5SELF] === 1) || (\u03B9SELF = \u0394SELF = 0, \u03C4SELF[\u03B5SELF] = 1);
      (!\u03B9SELF || \u0394SELF & 2) && \u03C4SELF.flagSelf$("project-finder", null);
      (\u03B9T = \u0394T = 1, \u03C4T = \u03C4SELF[\u03B5T]) || (\u03B9T = \u0394T = 0, \u03C4SELF[\u03B5T] = \u03C4T = pm("button", \u03C4SELF, `chip ${$1}`, null, null));
      \u03B9T || (\u03C4T.type = "button");
      \u03B9T || \u03C4T.on$(`click`, { $_: [function(e, $$) {
        return self.open(e);
      }] }, this);
      \u03B9T || \u03C4T[$placeChild$]("Find a project ");
      \u03B9T || (\u03C4T2 = pm("kbd", \u03C4T, `${$1}`, "/", null));
      ;
      ;
      (\u03B9T2 = \u0394T2 = 1, \u03C4T3 = \u03C4SELF[\u03B5T2]) || (\u03B9T2 = \u0394T2 = 0, \u03C4SELF[\u03B5T2] = \u03C4T3 = wa("dialog", \u03C4SELF, `project-dialog ${$1}`, null, null));
      \u03C4bsS = \u03C4T3[$getSlot$]("__", \u03C4SELF);
      \u03B9T2 || \u03C4T3.set$("aria-label", "Find an FFXIV project");
      \u03B9T2 || (\u03C4T4 = pm("div", \u03C4bsS, `finder-heading ${$1}`, null, null));
      \u03B9T2 || (\u03C4T5 = pm("h2", \u03C4T4, `${$1}`, "Find your next tool", null));
      ;
      \u03B9T2 || (\u03C4T6 = pm("button", \u03C4T4, `chip ${$1}`, "Close", null));
      \u03B9T2 || (\u03C4T6.type = "button");
      \u03B9T2 || \u03C4T6.on$(`click`, { $_: [function(e, $$) {
        return self.close(e);
      }] }, this);
      \u03B9T2 || \u03C4T6.set$("aria-label", "Close project search");
      ;
      ;
      \u03B9T2 || (\u03C4T7 = pm("label", \u03C4bsS, `finder-search ${$1}`, null, null));
      \u03B9T2 || (\u03C4T8 = pm("span", \u03C4T7, `${$1}`, "Search projects", null));
      ;
      (\u03B9T3 = \u0394T3 = 1, \u03C4T9 = \u03C4SELF[\u03B5T3]) || (\u03B9T3 = \u0394T3 = 0, \u03C4SELF[\u03B5T3] = \u03C4T9 = pm("input", \u03C4T7, `${$1}`, null, null));
      \u03B9T3 || (\u03C4T9.type = "search");
      \u03C5T = \u03C4SELF[bt\u03C6] || (\u03C4SELF[bt\u03C6] = \u03C4T9.bind$("data", [this, "query"]));
      \u03B9T3 || (\u03C4T9.placeholder = "HUD, music, glasses, terminal\u2026");
      \u03B9T3 || \u03C4T9.set$("autocomplete", "off");
      \u03B9T3 || !\u03C4T9.setup || \u03C4T9.setup(\u0394T3, \u03C1T);
      \u03C4T9[$afterVisit$](\u0394T3);
      ;
      ;
      (\u03B9T4 = \u0394T4 = 1, \u03C4T10 = \u03C4SELF[\u03B5T4]) || (\u03B9T4 = \u0394T4 = 0, \u03C4SELF[\u03B5T4] = \u03C4T10 = pm("p", \u03C4bsS, `finder-count ${$1}`, null, null));
      \u03B9T4 || (\u03C4T10.role = "status");
      \u03B9T4 || \u03C4T10.set$("aria-live", "polite");
      \u03C5T2 = this.matches.length, \u03C5T2 === \u03C4SELF[\u03B5] && \u03B9T4 || (\u03C4SELF[\u03B5i] = \u03C4T10[$placeChild$](\u03C4SELF[\u03B5] = \u03C5T2, 128, \u03C4SELF[\u03B5i]));
      \u03B9T4 || \u03C4T10[$placeChild$](" projects");
      ;
      (\u03C4T11 = \u03C4SELF[\u03B5T5]) || (\u03C4SELF[\u03B5T5] = \u03C4T11 = pm("ul", \u03C4bsS, `finder-results ${$1}`, null, null));
      (\u03C4 = \u03C4SELF[\u03B52]) || (\u03C4SELF[\u03B52] = \u03C4 = Dm(128, \u03C4T11));
      \u03BA = 0;
      \u03C1 = \u03C4.$;
      for (let $2 = 0, $3 = iterable$(this.matches), $4 = $3.length; $2 < $4; $2++) {
        let project = $3[$2];
        (\u03B9T5 = \u0394T5 = 1, \u03C4T12 = \u03C1.get(\u03BAT = project.id)) || (\u03B9T5 = \u0394T5 = 0, \u03C1.set(\u03BAT, \u03C4T12 = pm("li", null, `${$1}`, null, null)));
        \u03B9T5 || (\u03C4T12[$$up$] = \u03C4);
        (\u03B9T6 = \u0394T6 = 1, \u03C4T13 = \u03C4T12[\u03B5T6]) || (\u03B9T6 = \u0394T6 = 0, \u03C4T12[\u03B5T6] = \u03C4T13 = pm("a", \u03C4T12, `${$1}`, null, null));
        \u03C5T3 = project.page, \u03C5T3 === \u03C4T12[bw\u03C6] || (\u03C4T13.href = \u03C4T12[bw\u03C6] = \u03C5T3);
        (\u03C4T14 = \u03C4T12[\u03B5T7]) || (\u03C4T12[\u03B5T7] = \u03C4T14 = pm("strong", \u03C4T13, `${$1}`, null, null));
        \u03C5T4 = project.name, \u03C5T4 === \u03C4T12[\u03B53] && \u03B9T6 || (\u03C4T12[\u03B5i2] = \u03C4T14[$placeChild$](\u03C4T12[\u03B53] = \u03C5T4, 384, \u03C4T12[\u03B5i2]));
        ;
        (\u03C4T15 = \u03C4T12[\u03B5T8]) || (\u03C4T12[\u03B5T8] = \u03C4T15 = pm("span", \u03C4T13, `${$1}`, null, null));
        \u03C5T5 = project.punchline, \u03C5T5 === \u03C4T12[\u03B54] && \u03B9T6 || (\u03C4T12[\u03B5i3] = \u03C4T15[$placeChild$](\u03C4T12[\u03B54] = \u03C5T5, 384, \u03C4T12[\u03B5i3]));
        ;
        (\u03C4T16 = \u03C4T12[\u03B5T9]) || (\u03C4T12[\u03B5T9] = \u03C4T16 = pm("small", \u03C4T13, `${$1}`, null, null));
        \u03C5T6 = project.status, \u03C5T6 === \u03C4T12[\u03B55] && \u03B9T6 || (\u03C4T12[\u03B5i4] = \u03C4T16[$placeChild$](\u03C4T12[\u03B55] = \u03C5T6, 384, \u03C4T12[\u03B5i4]));
        ;
        ;
        \u03C4.push(\u03C4T12, \u03BA++, \u03BAT);
      }
      ;
      \u03C4[$afterVisit$](\u03BA);
      ;
      \u03C40if = null;
      if (this.matches.length == 0) {
        (\u03B9T7 = \u0394T7 = 1, \u03C40if = \u03C4SELF[\u03B5T10]) || (\u03B9T7 = \u0394T7 = 0, \u03C4SELF[\u03B5T10] = \u03C40if = pm("li", null, `finder-empty ${$1}`, "No matching projects. Try \u201CHUD\u201D, \u201Cmusic\u201D or \u201Cglasses\u201D.", null));
        \u03B9T7 || (\u03C40if[$$up$] = \u03C4T11);
      }
      ;
      \u03C4SELF[\u03B50\u03B9] = \u03C4T11[$placeChild$](\u03C40if, 0, \u03C4SELF[\u03B50\u03B9]);
      ;
      \u03B9T2 || !\u03C4T3.setup || \u03C4T3.setup(\u0394T2, \u03C1T2);
      \u03C4T3[$afterVisit$](\u0394T2);
      \u03B9T2 || \u03C4SELF[$appendChild$](\u03C4T3);
      ;
      \u03C4SELF[$afterReconcile$](\u0394SELF);
      return \u03C4SELF;
    }
    static {
      register$(this, c$0, "project-finder", 2);
      bm("project-finder", this, {});
    }
  };
  var c$1 = /* @__PURE__ */ Symbol();
  var QueueControlsComponent = class extends Ot {
    [__init__$]($$ = null, deep = true, fields = true) {
      var $0;
      super[__init__$](...arguments);
      this.model = $$ ? $$.model : void 0;
      this.query = $$ && ($0 = $$.query) !== void 0 ? $0 : "";
      this.project = $$ && ($0 = $$.project) !== void 0 ? $0 : "";
      this.status = $$ && ($0 = $$.status) !== void 0 ? $0 : "";
      this.visible = $$ && ($0 = $$.visible) !== void 0 ? $0 : 0;
    }
    apply() {
      const term = this.query.trim().toLowerCase();
      this.visible = 0;
      for (let $5 = 0, $6 = iterable$(this.model.entries), $7 = $6.length; $5 < $7; $5++) {
        let entry = $6[$5];
        const row = globalThis.document.getElementById(entry.id);
        const show = (!this.project || entry.mod == this.project) && (!this.status || entry.status == this.status) && (entry.title + " " + entry.pitch + " " + entry.mod).toLowerCase().includes(term);
        if (row) {
          const wasHidden = row.hidden;
          row.hidden = !show;
          if (show) {
            this.visible++;
            if (wasHidden && !reducedMotion.matches) {
              row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
            }
            ;
          }
          ;
        }
        ;
      }
      ;
      const url = new URL(window.location.href);
      for (let [key, value] of [["q", this.query], ["project", this.project], ["status", this.status]]) {
        if (value) {
          url.searchParams.set(key, value);
        } else {
          url.searchParams.delete(key);
        }
        ;
      }
      ;
      return window.history.replaceState(null, "", url);
    }
    changeQuery(event) {
      this.query = event.target.value;
      return this.apply();
    }
    changeProject(event) {
      this.project = event.target.value;
      return this.apply();
    }
    changeStatus(event) {
      this.status = event.target.value;
      return this.apply();
    }
    clear() {
      this.query = this.project = this.status = "";
      return this.apply();
    }
    mount() {
      const params = new URL(window.location.href).searchParams;
      this.query = params.get("q") || "";
      this.project = params.get("project") || "";
      this.status = params.get("status") || "";
      if (!Object.hasOwn(this.model.counts, this.project)) {
        this.project = "";
      }
      ;
      if (!["queued", "verification_pending"].includes(this.status)) {
        this.status = "";
      }
      ;
      this.apply();
      return this.commit();
    }
    unmount() {
      var $8;
      $8 = [];
      for (let $9 = 0, $10 = iterable$(this.model.entries), $11 = $10.length; $9 < $11; $9++) {
        let entry = $10[$9];
        const row = globalThis.document.getElementById(entry.id);
        $8.push(row && (row.hidden = false));
      }
      ;
      return $8;
    }
    render() {
      var self = this, \u03C40if2, \u03C4SELF2, \u03B9SELF2, \u0394SELF2, $12 = this._ns_ || "", \u03C4T17, \u03C4T18, \u03C4T19, \u03C4T20, \u03B9T8, \u0394T8, \u03C5T7, \u03C1T3, \u03C4T21, \u03C4T22, \u03C4T23, \u03B9T9, \u0394T9, \u03C5T8, \u03C4T24, \u03C42, \u03BA2, \u03C12, \u03C4T25, \u03B9T10, \u03BAT2, \u0394T10, \u03C5T9, \u03C1T4, \u03C4T26, \u03C4T27, \u03C4T28, \u03B9T11, \u0394T11, \u03C5T10, \u03C4T29, \u03C4T30, \u03C4T31, \u03C1T5, \u03C4T32, \u03C4T33, \u03B9T12, \u0394T12, \u03C5T11, \u03B9T13, \u0394T13;
      \u03C4SELF2 = this;
      \u03C4SELF2[$beforeReconcile$]();
      (\u03B9SELF2 = \u0394SELF2 = 1, \u03C4SELF2[\u03B5SELF2] === 1) || (\u03B9SELF2 = \u0394SELF2 = 0, \u03C4SELF2[\u03B5SELF2] = 1);
      (!\u03B9SELF2 || \u0394SELF2 & 2) && \u03C4SELF2.flagSelf$("queue-controls", null);
      \u03B9SELF2 || (\u03C4T17 = pm("div", \u03C4SELF2, `queue-fields ${$12}`, null, null));
      \u03B9SELF2 || (\u03C4T18 = pm("label", \u03C4T17, `${$12}`, null, null));
      \u03B9SELF2 || (\u03C4T19 = pm("span", \u03C4T18, `${$12}`, "Find a feature", null));
      ;
      (\u03B9T8 = \u0394T8 = 1, \u03C4T20 = \u03C4SELF2[\u03B5T11]) || (\u03B9T8 = \u0394T8 = 0, \u03C4SELF2[\u03B5T11] = \u03C4T20 = pm("input", \u03C4T18, `${$12}`, null, null));
      \u03B9T8 || (\u03C4T20.type = "search");
      \u03C5T7 = \u03C4SELF2[cb\u03C6] || (\u03C4SELF2[cb\u03C6] = \u03C4T20.bind$("data", [this, "query"]));
      \u03B9T8 || \u03C4T20.on$(`input`, { $_: [function(e, $$) {
        return self.changeQuery(e);
      }] }, this);
      \u03B9T8 || (\u03C4T20.placeholder = "Search the accepted queue");
      \u03B9T8 || \u03C4T20.set$("autocomplete", "off");
      \u03B9T8 || !\u03C4T20.setup || \u03C4T20.setup(\u0394T8, \u03C1T3);
      \u03C4T20[$afterVisit$](\u0394T8);
      ;
      ;
      \u03B9SELF2 || (\u03C4T21 = pm("label", \u03C4T17, `${$12}`, null, null));
      \u03B9SELF2 || (\u03C4T22 = pm("span", \u03C4T21, `${$12}`, "Project", null));
      ;
      (\u03B9T9 = \u0394T9 = 1, \u03C4T23 = \u03C4SELF2[\u03B5T12]) || (\u03B9T9 = \u0394T9 = 0, \u03C4SELF2[\u03B5T12] = \u03C4T23 = pm("select", \u03C4T21, `${$12}`, null, null));
      \u03C5T8 = \u03C4SELF2[cc\u03C6] || (\u03C4SELF2[cc\u03C6] = \u03C4T23.bind$("data", [this, "project"]));
      \u03B9T9 || \u03C4T23.on$(`change`, { $_: [function(e, $$) {
        return self.changeProject(e);
      }] }, this);
      \u03B9T9 || (\u03C4T24 = pm("option", \u03C4T23, `${$12}`, "All projects", null));
      \u03B9T9 || (\u03C4T24.richValue = "");
      ;
      (\u03C42 = \u03C4SELF2[\u03B56]) || (\u03C4SELF2[\u03B56] = \u03C42 = Dm(256, \u03C4T23));
      \u03BA2 = 0;
      \u03C12 = \u03C42.$;
      for (let $13 = 0, $14 = iterable$(Object.keys(this.model.counts)), $15 = $14.length; $13 < $15; $13++) {
        let mod = $14[$13];
        (\u03B9T10 = \u0394T10 = 1, \u03C4T25 = \u03C12.get(\u03BAT2 = mod)) || (\u03B9T10 = \u0394T10 = 0, \u03C12.set(\u03BAT2, \u03C4T25 = pm("option", null, `${$12}`, null, null)));
        \u03B9T10 || (\u03C4T25[$$up$] = \u03C42);
        mod === \u03C4T25[ce\u03C6] || (\u03C4T25.richValue = \u03C4T25[ce\u03C6] = mod);
        \u03C5T9 = mod, \u03C5T9 === \u03C4T25[\u03B57] && \u03B9T10 || (\u03C4T25[\u03B5i5] = \u03C4T25[$placeChild$](\u03C4T25[\u03B57] = \u03C5T9, 384, \u03C4T25[\u03B5i5]));
        \u03C42.push(\u03C4T25, \u03BA2++, \u03BAT2);
      }
      ;
      \u03C42[$afterVisit$](\u03BA2);
      ;
      \u03B9T9 || !\u03C4T23.setup || \u03C4T23.setup(\u0394T9, \u03C1T4);
      \u03C4T23[$afterVisit$](\u0394T9);
      ;
      ;
      \u03B9SELF2 || (\u03C4T26 = pm("label", \u03C4T17, `${$12}`, null, null));
      \u03B9SELF2 || (\u03C4T27 = pm("span", \u03C4T26, `${$12}`, "Delivery status", null));
      ;
      (\u03B9T11 = \u0394T11 = 1, \u03C4T28 = \u03C4SELF2[\u03B5T13]) || (\u03B9T11 = \u0394T11 = 0, \u03C4SELF2[\u03B5T13] = \u03C4T28 = pm("select", \u03C4T26, `${$12}`, null, null));
      \u03C5T10 = \u03C4SELF2[cg\u03C6] || (\u03C4SELF2[cg\u03C6] = \u03C4T28.bind$("data", [this, "status"]));
      \u03B9T11 || \u03C4T28.on$(`change`, { $_: [function(e, $$) {
        return self.changeStatus(e);
      }] }, this);
      \u03B9T11 || (\u03C4T29 = pm("option", \u03C4T28, `${$12}`, "All accepted features", null));
      \u03B9T11 || (\u03C4T29.richValue = "");
      ;
      \u03B9T11 || (\u03C4T30 = pm("option", \u03C4T28, `${$12}`, "Implementation review", null));
      \u03B9T11 || (\u03C4T30.richValue = "queued");
      ;
      \u03B9T11 || (\u03C4T31 = pm("option", \u03C4T28, `${$12}`, "Acceptance pending", null));
      \u03B9T11 || (\u03C4T31.richValue = "verification_pending");
      ;
      \u03B9T11 || !\u03C4T28.setup || \u03C4T28.setup(\u0394T11, \u03C1T5);
      \u03C4T28[$afterVisit$](\u0394T11);
      ;
      ;
      \u03B9SELF2 || (\u03C4T32 = pm("button", \u03C4T17, `chip ${$12}`, "Clear filters", null));
      \u03B9SELF2 || (\u03C4T32.type = "button");
      \u03B9SELF2 || \u03C4T32.on$(`click`, { $_: [function(e, $$) {
        return self.clear(e);
      }] }, this);
      ;
      ;
      (\u03B9T12 = \u0394T12 = 1, \u03C4T33 = \u03C4SELF2[\u03B5T14]) || (\u03B9T12 = \u0394T12 = 0, \u03C4SELF2[\u03B5T14] = \u03C4T33 = pm("p", \u03C4SELF2, `queue-result ${$12}`, null, null));
      \u03B9T12 || (\u03C4T33.role = "status");
      \u03B9T12 || \u03C4T33.set$("aria-live", "polite");
      \u03C5T11 = this.visible, \u03C5T11 === \u03C4SELF2[\u03B58] && \u03B9T12 || (\u03C4SELF2[\u03B5i6] = \u03C4T33[$placeChild$](\u03C4SELF2[\u03B58] = \u03C5T11, 128, \u03C4SELF2[\u03B5i6]));
      \u03B9T12 || \u03C4T33[$placeChild$](" of ");
      \u03C5T11 = this.model.total, \u03C5T11 === \u03C4SELF2[\u03B59] && \u03B9T12 || (\u03C4SELF2[\u03B5i7] = \u03C4T33[$placeChild$](\u03C4SELF2[\u03B59] = \u03C5T11, 0, \u03C4SELF2[\u03B5i7]));
      \u03B9T12 || \u03C4T33[$placeChild$](" features");
      ;
      \u03C40if2 = null;
      if (this.visible == 0) {
        (\u03B9T13 = \u0394T13 = 1, \u03C40if2 = \u03C4SELF2[\u03B5T15]) || (\u03B9T13 = \u0394T13 = 0, \u03C4SELF2[\u03B5T15] = \u03C40if2 = pm("p", null, `${$12}`, "No matches. Clear the filters to see the full accepted queue.", null));
        \u03B9T13 || (\u03C40if2[$$up$] = \u03C4SELF2);
      }
      ;
      \u03C4SELF2[\u03B50\u03B92] = \u03C4SELF2[$placeChild$](\u03C40if2, 0, \u03C4SELF2[\u03B50\u03B92]);
      \u03C4SELF2[$afterReconcile$](\u0394SELF2);
      return \u03C4SELF2;
    }
    static {
      register$(this, c$1, "queue-controls", 2);
      bm("queue-controls", this, {});
    }
  };
  async function enhance() {
    var \u03C4T34, \u03F2\u03C4 = Gp(), \u03B9T14, \u0394T14, \u03C5T12, \u03C4T35, \u03B9T15, \u0394T15;
    const finderSlot = globalThis.document.querySelector("[data-project-finder]");
    if (finderSlot) {
      try {
        const response = await fetch("/mods/ffxiv/projects.json", { credentials: "omit" });
        if (response.ok) {
          const registry = await response.json();
          const finder = fc(((\u03B9T14 = \u0394T14 = 1, \u03C4T34 = \u03F2\u03C4[\u03B5T16]) || (\u03B9T14 = \u0394T14 = 0, \u03C4T34 = \u03F2\u03C4[\u03B5T16] = \u03C4T34 = wa("project-finder", null, null, null, null)), \u03B9T14 || (\u03C4T34[$$up$] = \u03F2\u03C4._), \u03B9T14 || \u03C4T34[$$register$]?.(\u03F2\u03C4, \u03B5T16), \u03C5T12 = registry.projects, \u03C5T12 === \u03C4T34[ck\u03C6] || (\u03C4T34.projects = \u03C4T34[ck\u03C6] = \u03C5T12), \u03B9T14 || \u03F2\u03C4.sym || !\u03C4T34.setup || \u03C4T34.setup(\u0394T14, \u03F2\u03C4, \u03B5T16), \u03F2\u03C4.sym || \u03C4T34[$afterVisit$](\u0394T14), \u03C4T34), finderSlot);
          const fallback = finderSlot.querySelector("[data-finder-fallback]");
          if (fallback) {
            fallback.remove();
          }
          ;
        }
        ;
      } catch ($16) {
      }
      ;
    }
    ;
    const queueSlot = globalThis.document.querySelector("[data-queue-controls]");
    if (queueSlot) {
      try {
        const response = await fetch("/mods/ffxiv/roadmap/queue.json", { credentials: "omit" });
        if (response.ok) {
          const model = await response.json();
          return fc(((\u03B9T15 = \u0394T15 = 1, \u03C4T35 = \u03F2\u03C4[\u03B5T17]) || (\u03B9T15 = \u0394T15 = 0, \u03C4T35 = \u03F2\u03C4[\u03B5T17] = \u03C4T35 = wa("queue-controls", null, null, null, null)), \u03B9T15 || (\u03C4T35[$$up$] = \u03F2\u03C4._), \u03B9T15 || \u03C4T35[$$register$]?.(\u03F2\u03C4, \u03B5T17), model === \u03C4T35[cl\u03C6] || (\u03C4T35.model = \u03C4T35[cl\u03C6] = model), \u03B9T15 || \u03F2\u03C4.sym || !\u03C4T35.setup || \u03C4T35.setup(\u0394T15, \u03F2\u03C4, \u03B5T17), \u03F2\u03C4.sym || \u03C4T35[$afterVisit$](\u0394T15), \u03C4T35), queueSlot);
        }
        ;
      } catch ($17) {
        return void 0;
      }
      ;
    }
    ;
  }
  enhance();
})();
