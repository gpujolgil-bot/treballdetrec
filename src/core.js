/* ===== Nucli: agrupació de treballs en tribunals i assignació de jurats (sense DOM) ===== */
const DEPTS = ['Administratiu','Castellà','Català','Educació Física','Experimentals','Expressió','FOL','Idiomes','Informàtica','Matemàtiques','Orientació','PQPI','Sanitàries','Socials','Tecnologia'];
const AFINITATS_DEFECTE = {
  'Experimentals': ['Sanitàries','Matemàtiques','Tecnologia','Educació Física'],
  'Sanitàries': ['Experimentals','Educació Física','Orientació'],
  'Tecnologia': ['Experimentals','Matemàtiques','Informàtica'],
  'Informàtica': ['Tecnologia','Matemàtiques'],
  'Matemàtiques': ['Experimentals','Tecnologia','Informàtica'],
  'Educació Física': ['Experimentals','Sanitàries','Orientació'],
  'Orientació': ['Socials','Experimentals','Sanitàries','Educació Física'],
  'Socials': ['Orientació','Català','Castellà','Administratiu','FOL'],
  'Català': ['Castellà','Idiomes','Socials','Expressió'],
  'Castellà': ['Català','Idiomes','Socials','Expressió'],
  'Idiomes': ['Català','Castellà','Socials'],
  'Expressió': ['Català','Castellà','Socials','Educació Física'],
  'Administratiu': ['Socials','FOL'],
  'FOL': ['Socials','Administratiu','Orientació'],
  'PQPI': ['Orientació','Socials']
};
const COST_TIER = [0, 10, 60];

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function actius(S) { return S.treballs.filter(t => t.estat === 'actiu'); }
function preparat(t) { return t.estat === 'actiu' && t.tutors.length > 0 && !!t.ambit; }
function poolKeys(S) { return Object.keys(S.teachers).filter(k => S.teachers[k].pool); }
function midaT(S) { return S.config.midaTribunal || 4; }
/* Model de tribunal:
   N = treballs per tribunal; M = membres que avaluen (jurat amb vot);
   K = màxim de tutors que són membres del tribunal on presenten els seus alumnes
       (K >= N: el jurat són els tutors; K = 0: jurat independent i el tutor hi assisteix);
   tutorVota = el tutor puntua el seu alumne; reciprocitat = 'permesa' | 'evita' | 'prohibida';
   maxTrib = màxim de tribunals per persona com a membre (0 = sense límit). */
function modelCfg(S) {
  const m = (S.config && S.config.model) || {}, N = midaT(S);
  const K = m.maxTutors == null || m.maxTutors === '' ? N : Math.max(0, +m.maxTutors);
  return { N, M: +m.membres > 0 ? +m.membres : N, K: Math.min(K, N), tutorVota: m.tutorVota !== false,
    reciprocitat: m.reciprocitat || (K >= N ? 'permesa' : 'evita'), maxTrib: +m.maxTrib > 0 ? +m.maxTrib : 0 };
}
const esModelTutors = S => modelCfg(S).K >= modelCfg(S).N;
function trib(S, id) { return S.tribunals.find(x => x.id === id); }
function treballsDe(S, tr) { return S.treballs.filter(t => t.tribunal === tr.id && t.estat === 'actiu'); }

/* 0 = mateix departament que l'àmbit, 1 = departament afí, 2 = no afí */
function tier(S, k, ambit) {
  const t = S.teachers[k];
  if (!t || !ambit) return 2;
  if (t.depts.includes(ambit)) return 0;
  const af = S.config.afinitats[ambit] || [];
  return t.depts.some(d => af.includes(d)) ? 1 : 2;
}

function tutorsTrib(S, tr) {
  const out = [];
  for (const t of treballsDe(S, tr)) for (const k of t.tutors) if (!out.includes(k)) out.push(k);
  return out;
}
/* Jurat amb vot: tutors que no estan marcats com a assistents + avaluadors externs */
function membresTrib(S, tr) {
  const fora = tr.tutorsFora || [];
  const out = tutorsTrib(S, tr).filter(k => !fora.includes(k));
  for (const k of tr.extra || []) if (!out.includes(k)) out.push(k);
  return out;
}
/* Tutors que no formen part del jurat: assisteixen a la defensa del seu alumne */
function assistentsTrib(S, tr) {
  const fora = tr.tutorsFora || [];
  return tutorsTrib(S, tr).filter(k => fora.includes(k));
}
function participantsTrib(S, tr) { return [...new Set([...membresTrib(S, tr), ...assistentsTrib(S, tr)])]; }
function rolsTrib(S, tr) {
  const r = {};
  for (const t of treballsDe(S, tr)) for (const k of t.tutors) (r[k] = r[k] || []).push(t);
  return r;
}

/* Per a un treball: qui l'avalua a part del seu tutor i com d'afins són */
function avaluadors(S, t) {
  const tr = t.tribunal && trib(S, t.tribunal);
  if (!tr) return [];
  return membresTrib(S, tr).filter(k => !t.tutors.includes(k)).map(k => ({ k, tier: tier(S, k, t.ambit) }));
}

function ambitPrincipal(S, tr) {
  const c = {};
  for (const t of treballsDe(S, tr)) if (t.ambit) c[t.ambit] = (c[t.ambit] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0] || '';
}

function carregues(S) {
  const c = {};
  for (const k of Object.keys(S.teachers)) c[k] = { tutor: 0, tribunals: [], assisteix: [], extra: 0 };
  for (const t of actius(S)) for (const k of t.tutors) if (c[k]) c[k].tutor++;
  for (const tr of S.tribunals) {
    for (const k of membresTrib(S, tr)) if (c[k]) c[k].tribunals.push(tr.id);
    for (const k of assistentsTrib(S, tr)) if (c[k]) c[k].assisteix.push(tr.id);
    for (const k of tr.extra || []) if (c[k]) c[k].extra++;
  }
  return c;
}

/* Cost d'un grup de treballs (llista) com a tribunal, sense membres afegits */
function costGrup(S, ws, mida) {
  const tut = [];
  let cost = 0;
  for (const w of ws) for (const k of w.tutors) tut.push(k);
  const uniq = [...new Set(tut)];
  for (const w of ws) for (const k of uniq) if (!w.tutors.includes(k)) cost += COST_TIER[tier(S, k, w.ambit)];
  cost += (tut.length - uniq.length) * 400;              // mateix tutor dos cops al tribunal
  cost += Math.max(0, mida - uniq.length) * 25;           // caldrà afegir membres
  return cost;
}

function afiAmbits(S, a, b) {
  if (a === b) return 0;
  const af = S.config.afinitats || {};
  return ((af[a] || []).includes(b) || (af[b] || []).includes(a)) ? 1 : 2;
}
/* Cost d'un grup quan el jurat no són (tots) els tutors: homogeneïtat d'àmbits */
function costGrupAmbit(S, ws) {
  let c = 0;
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) c += [0, 10, 50][afiAmbits(S, ws[i].ambit, ws[j].ambit)];
  return c;
}
/* Parelles de professors que s'avaluen mútuament els alumnes (x vota un alumne de y i y un de x) */
function reciprocitats(S) {
  const e = new Set(), out = [];
  for (const tr of S.tribunals) {
    const mem = membresTrib(S, tr);
    for (const w of treballsDe(S, tr)) for (const x of mem) for (const y of w.tutors) if (x !== y) e.add(x + '\u0001' + y);
  }
  for (const k of e) { const [x, y] = k.split('\u0001'); if (x < y && e.has(y + '\u0001' + x)) out.push([x, y]); }
  return out;
}

function costTotal(S) {
  let c = 0;
  for (const tr of S.tribunals) c += costGrup(S, treballsDe(S, tr), midaT(S));
  return c;
}

/* Proposta: manté els tribunals bloquejats i reparteix la resta de treballs
   en tribunals de mida fixa, minimitzant el cost d'afinitat (recuit simulat). */
function proposa(S, opts) {
  const { seed = Date.now(), iter = 60000, intents = 4, iterJurat = 40000 } = opts || {};
  const rand = rng(seed), mida = midaT(S), mc0 = modelCfg(S);
  const cg = mc0.K >= mc0.N ? (g => costGrup(S, g, mc0.M)) : (g => costGrupAmbit(S, g));
  const bloq = S.tribunals.filter(t => t.bloq);
  const lliures = S.treballs.filter(t => preparat(t) && !(t.tribunal && bloq.some(b => b.id === t.tribunal)));
  for (const t of S.treballs) if (!bloq.some(b => b.id === t.tribunal)) t.tribunal = null;
  const vells = S.tribunals.filter(t => !t.bloq);
  S.tribunals = bloq.slice();
  if (!lliures.length) return 0;
  const n = Math.ceil(lliures.length / mida);
  const base = Math.floor(lliures.length / n), resta = lliures.length % n;
  const mides = Array.from({ length: n }, (_, i) => base + (i < resta ? 1 : 0));

  let millor = null, mc = Infinity;
  for (let r = 0; r < intents; r++) {
    // inicial: ordenat per àmbit amb soroll
    const ord = lliures.map(t => ({ t, k: t.ambit + rand() })).sort((a, b) => a.k < b.k ? -1 : 1).map(o => o.t);
    const grups = []; let p = 0;
    for (const m of mides) { grups.push(ord.slice(p, p + m)); p += m; }
    let costs = grups.map(cg);
    let total = costs.reduce((a, b) => a + b, 0);
    let T = 40;
    for (let it = 0; it < iter; it++) {
      const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
      if (a === b) continue;
      const i = Math.floor(rand() * grups[a].length), j = Math.floor(rand() * grups[b].length);
      const ga = grups[a].slice(), gb = grups[b].slice();
      const x = ga[i]; ga[i] = gb[j]; gb[j] = x;
      const ca = cg(ga), cb = cg(gb);
      const d = ca + cb - costs[a] - costs[b];
      if (d <= 0 || rand() < Math.exp(-d / T)) { grups[a] = ga; grups[b] = gb; costs[a] = ca; costs[b] = cb; total += d; }
      T = Math.max(0.05, T * 0.99985);
    }
    if (total < mc) { mc = total; millor = grups.map(g => g.slice()); }
  }
  // Ordena els tribunals per àmbit perquè la numeració tingui sentit
  const ambG = g => { const c = {}; g.forEach(t => c[t.ambit] = (c[t.ambit] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0]; };
  millor.sort((a, b) => ambG(a).localeCompare(ambG(b), 'ca'));
  const usats = new Set(S.tribunals.map(t => t.num));
  let num = 1;
  millor.forEach((g, idx) => {
    while (usats.has(num)) num++;
    const vell = vells[idx] || {};
    const tr = { id: 'T' + Date.now().toString(36) + idx + Math.floor(rand() * 1e4), num, extra: [], tutorsFora: [], data: vell.data || '', hora: vell.hora || '', aula: vell.aula || '', bloq: false };
    usats.add(num);
    S.tribunals.push(tr);
    g.forEach(t => { t.tribunal = tr.id; });
  });
  S.tribunals.sort((a, b) => a.num - b.num);
  if (mc0.K >= mc0.N) completaMembres(S);
  else assignaJurats(S, { seed: seed + 1, iter: iterJurat });
  return mc;
}

/* Assigna el jurat dels tribunals no bloquejats quan el model no és «els tutors són el jurat»:
   tria fins a K tutors com a membres i completa fins a M amb avaluadors del pool,
   buscant afinitat, càrrega repartida i (segons la configuració) cap reciprocitat. */
function assignaJurats(S, opts) {
  const { seed = Date.now(), iter = 40000 } = opts || {};
  const rand = rng(seed), mc = modelCfg(S);
  const PREC = { permesa: 0, evita: 250, prohibida: 4000 }[mc.reciprocitat] || 0;
  const pool = poolKeys(S);
  const trs = S.tribunals.filter(tr => treballsDe(S, tr).length);
  const lliures = trs.filter(tr => !tr.bloq);
  const info = trs.map(tr => ({ tr, ws: treballsDe(S, tr), tut: tutorsTrib(S, tr), fix: !!tr.bloq }));
  // estat inicial
  for (const it of info) {
    if (it.fix) { it.tm = it.tut.filter(k => !(it.tr.tutorsFora || []).includes(k)); it.ext = (it.tr.extra || []).slice(); continue; }
    const nT = Math.min(mc.K, mc.M, it.tut.length);
    const aff = k => it.ws.reduce((a, w) => a + (w.tutors.includes(k) ? 0 : COST_TIER[tier(S, k, w.ambit)]), 0);
    it.tm = it.tut.slice().sort((a, b) => aff(a) - aff(b)).slice(0, nT);
    it.ext = [];
    const cands = pool.filter(k => !it.tut.includes(k)).sort(() => rand() - .5);
    while (it.tm.length + it.ext.length < mc.M && cands.length) it.ext.push(cands.pop());
  }
  const membres = it => it.tm.concat(it.ext);
  function cost() {
    let c = 0; const load = {}; const e = new Set();
    for (const it of info) {
      const mem = membres(it);
      for (const m of mem) {
        load[m] = (load[m] || 0) + 1;
        for (const w of it.ws) if (!w.tutors.includes(m)) c += COST_TIER[tier(S, m, w.ambit)];
      }
      if (mem.length < mc.M) c += (mc.M - mem.length) * 800;
      if (PREC) for (const w of it.ws) for (const x of mem) for (const y of w.tutors) if (x !== y) e.add(x + '\u0001' + y);
    }
    if (PREC) for (const k of e) { const i = k.indexOf('\u0001'); if (e.has(k.slice(i + 1) + '\u0001' + k.slice(0, i))) c += PREC / 2; }
    for (const k in load) { const l = load[k]; c += l * l * 12; if (mc.maxTrib && l > mc.maxTrib) c += (l - mc.maxTrib) * 3000; }
    return c;
  }
  const lliuresI = info.filter(it => !it.fix);
  if (lliuresI.length) {
    let cur = cost(), T = 120;
    for (let n = 0; n < iter; n++) {
      const it = lliuresI[Math.floor(rand() * lliuresI.length)];
      let undo;
      if (rand() < .25 && it.tm.length && it.tm.length < it.tut.length) {
        const i = Math.floor(rand() * it.tm.length), fora = it.tut.filter(k => !it.tm.includes(k));
        const nou = fora[Math.floor(rand() * fora.length)], old = it.tm[i];
        if (it.ext.includes(nou)) continue;
        it.tm[i] = nou; undo = () => { it.tm[i] = old; };
      } else if (it.ext.length) {
        const i = Math.floor(rand() * it.ext.length), nou = pool[Math.floor(rand() * pool.length)];
        if (it.tut.includes(nou) || it.ext.includes(nou)) continue;
        const old = it.ext[i]; it.ext[i] = nou; undo = () => { it.ext[i] = old; };
      } else continue;
      const c2 = cost();
      if (c2 <= cur || rand() < Math.exp((cur - c2) / T)) cur = c2; else undo();
      T = Math.max(0.1, T * 0.99985);
    }
  }
  for (const it of lliuresI) {
    it.tr.extra = it.ext.slice();
    it.tr.tutorsFora = it.tut.filter(k => !it.tm.includes(k));
  }
}

/* Indicadors per comparar configuracions */
function metriques(S) {
  const ready = S.treballs.filter(preparat), av = [0, 0, 0];
  for (const t of ready) for (const a of avaluadors(S, t)) av[a.tier]++;
  const c = carregues(S), mc = modelCfg(S);
  const ks = Object.keys(c).filter(k => c[k].tribunals.length || c[k].assisteix.length);
  const ses = ks.map(k => new Set([...c[k].tribunals, ...c[k].assisteix]).size);
  const trs = S.tribunals.filter(tr => treballsDe(S, tr).length);
  const tot = av[0] + av[1] + av[2];
  return {
    tribunals: trs.length, assignats: ready.filter(t => t.tribunal).length, preparats: ready.length,
    avaluacions: av, pctAfins: tot ? Math.round((av[0] + av[1]) / tot * 1000) / 10 : 0,
    reciprocitats: reciprocitats(S).length, persones: ks.length,
    jurat: ks.filter(k => c[k].tribunals.length).length,
    maxTrib: Math.max(0, ...ks.map(k => c[k].tribunals.length)),
    sessionsMitjana: ses.length ? Math.round(ses.reduce((a, b) => a + b, 0) / ses.length * 10) / 10 : 0,
    sessionsMax: Math.max(0, ...ses),
    incomplets: trs.filter(tr => membresTrib(S, tr).length < mc.M).length
  };
}

/* Si un tribunal no arriba a la mida (menys tutors diferents que places),
   hi afegeix professorat del pool, el més afí i amb menys tribunals. */
function completaMembres(S, nomesTr) {
  const mida = modelCfg(S).M;
  for (const tr of S.tribunals) {
    if (nomesTr && tr.id !== nomesTr) continue;
    tr.extra = tr.extra || [];
    const ws = treballsDe(S, tr);
    if (!ws.length) continue;
    while (membresTrib(S, tr).length < mida) {
      const c = carregues(S), mem = membresTrib(S, tr);
      let best = null, bs = Infinity;
      for (const k of poolKeys(S)) {
        if (mem.includes(k)) continue;
        const s = ws.reduce((a, w) => a + COST_TIER[tier(S, k, w.ambit)], 0) + c[k].tribunals.length * 8;
        if (s < bs) { bs = s; best = k; }
      }
      if (!best) break;
      tr.extra.push(best);
    }
  }
}

function solapa(a, b) { return a.data && a.hora && a.data === b.data && a.hora === b.hora; }

function incidencies(S) {
  const out = [], mcf = modelCfg(S), mida = mcf.M;
  const nom = k => (S.teachers[k] ? S.teachers[k].nom : k);
  const al = t => `${t.cognoms}, ${t.nom}`;
  for (const t of actius(S)) {
    if (!t.tutors.length) out.push({ niv: 'crit', t: t.id, msg: `${al(t)}: no té tutor/a assignat.` });
    if (!t.ambit) out.push({ niv: 'crit', t: t.id, msg: `${al(t)}: falta l'àmbit (departament) del treball.` });
    if (preparat(t) && !t.tribunal) out.push({ niv: 'crit', t: t.id, msg: `${al(t)}: no està en cap tribunal.` });
    if (t.tribunal) {
      const no = avaluadors(S, t).filter(a => a.tier === 2);
      if (no.length) out.push({ niv: 'avis', t: t.id, msg: `${al(t)} (${t.ambit}): ${no.map(a => nom(a.k)).join(', ')} ${no.length > 1 ? 'no són' : 'no és'} de departaments afins.` });
    }
    if (!t.titol && t.tutors.length) out.push({ niv: 'info', t: t.id, msg: `${al(t)}: no hi ha títol.` });
    if (t.ambitDeduit) out.push({ niv: 'info', t: t.id, msg: `${al(t)}: àmbit deduït del departament del tutor/a (${t.ambit}). Revisa'l.` });
    for (const k of t.tutors) if (S.teachers[k] && S.teachers[k].foraOrg) out.push({ niv: 'info', t: t.id, msg: `${al(t)}: ${nom(k)} no surt a l'organigrama; departament provisional ${S.teachers[k].depts[0]}.` });
  }
  for (const tr of S.tribunals) {
    const ws = treballsDe(S, tr), mem = membresTrib(S, tr), r = rolsTrib(S, tr);
    if (!ws.length) { out.push({ niv: 'info', tr: tr.id, msg: `Tribunal ${tr.num}: no té cap treball.` }); continue; }
    if (mem.length < mida) out.push({ niv: 'crit', tr: tr.id, msg: `Tribunal ${tr.num}: només té ${mem.length} membres (cal ${mida}).` });
    if (ws.length > mcf.N) out.push({ niv: 'avis', tr: tr.id, msg: `Tribunal ${tr.num}: avalua ${ws.length} treballs (previst ${mcf.N}).` });
    for (const k in r) if (r[k].length > 1) out.push({ niv: 'info', tr: tr.id, msg: `Tribunal ${tr.num}: ${nom(k)} hi té ${r[k].length} alumnes tutoritzats.` });
    const tm = mem.filter(k => r[k]).length;
    if (!esModelTutors(S) && tm > mcf.K) out.push({ niv: 'avis', tr: tr.id, msg: `Tribunal ${tr.num}: hi ha ${tm} tutors al jurat (màxim configurat ${mcf.K}).` });
  }
  if (mcf.reciprocitat !== 'permesa') {
    const c = carregues(S);
    for (const [x, y] of reciprocitats(S)) {
      const tx = c[x] ? c[x].tribunals.map(id => trib(S, id)).filter(Boolean).map(t => t.num) : [];
      const ty = c[y] ? c[y].tribunals.map(id => trib(S, id)).filter(Boolean).map(t => t.num) : [];
      out.push({ niv: mcf.reciprocitat === 'prohibida' ? 'crit' : 'avis', p: x, msg: `${nom(x)} i ${nom(y)} s'avaluen mútuament els alumnes (jurat als tribunals ${[...new Set([...tx, ...ty])].sort((a, b) => a - b).join(' i ')}).` });
    }
  }
  const trs = S.tribunals;
  for (let i = 0; i < trs.length; i++) for (let j = i + 1; j < trs.length; j++) {
    if (!solapa(trs[i], trs[j])) continue;
    const mj = participantsTrib(S, trs[j]);
    for (const k of participantsTrib(S, trs[i]).filter(x => mj.includes(x)))
      out.push({ niv: 'crit', tr: trs[i].id, msg: `${nom(k)} és als tribunals ${trs[i].num} i ${trs[j].num} el mateix dia i hora (${trs[i].data} ${trs[i].hora}).` });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DEPTS, AFINITATS_DEFECTE, proposa, assignaJurats, metriques, reciprocitats, modelCfg, carregues, incidencies, tier, preparat, poolKeys, membresTrib, assistentsTrib, tutorsTrib, treballsDe, avaluadors, costTotal, ambitPrincipal };
