/* ===== Nucli: tribunals de 4 treballs avaluats pels seus tutors (sense DOM) ===== */
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

function membresTrib(S, tr) {
  const out = [];
  for (const t of treballsDe(S, tr)) for (const k of t.tutors) if (!out.includes(k)) out.push(k);
  for (const k of tr.extra || []) if (!out.includes(k)) out.push(k);
  return out;
}
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
  for (const k of Object.keys(S.teachers)) c[k] = { tutor: 0, tribunals: [], extra: 0 };
  for (const t of actius(S)) for (const k of t.tutors) if (c[k]) c[k].tutor++;
  for (const tr of S.tribunals) {
    for (const k of membresTrib(S, tr)) if (c[k]) c[k].tribunals.push(tr.id);
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

function costTotal(S) {
  let c = 0;
  for (const tr of S.tribunals) c += costGrup(S, treballsDe(S, tr), midaT(S));
  return c;
}

/* Proposta: manté els tribunals bloquejats i reparteix la resta de treballs
   en tribunals de mida fixa, minimitzant el cost d'afinitat (recuit simulat). */
function proposa(S, opts) {
  const { seed = Date.now(), iter = 60000, intents = 4 } = opts || {};
  const rand = rng(seed), mida = midaT(S);
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
    let costs = grups.map(g => costGrup(S, g, mida));
    let total = costs.reduce((a, b) => a + b, 0);
    let T = 40;
    for (let it = 0; it < iter; it++) {
      const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
      if (a === b) continue;
      const i = Math.floor(rand() * grups[a].length), j = Math.floor(rand() * grups[b].length);
      const ga = grups[a].slice(), gb = grups[b].slice();
      const x = ga[i]; ga[i] = gb[j]; gb[j] = x;
      const ca = costGrup(S, ga, mida), cb = costGrup(S, gb, mida);
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
    const tr = { id: 'T' + Date.now().toString(36) + idx + Math.floor(rand() * 1e4), num, extra: [], data: vell.data || '', hora: vell.hora || '', aula: vell.aula || '', bloq: false };
    usats.add(num);
    S.tribunals.push(tr);
    g.forEach(t => { t.tribunal = tr.id; });
  });
  S.tribunals.sort((a, b) => a.num - b.num);
  completaMembres(S);
  return mc;
}

/* Si un tribunal no arriba a la mida (menys tutors diferents que places),
   hi afegeix professorat del pool, el més afí i amb menys tribunals. */
function completaMembres(S, nomesTr) {
  const mida = midaT(S);
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
  const out = [], mida = midaT(S);
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
    if (ws.length > mida) out.push({ niv: 'avis', tr: tr.id, msg: `Tribunal ${tr.num}: avalua ${ws.length} treballs (previst ${mida}).` });
    for (const k in r) if (r[k].length > 1) out.push({ niv: 'info', tr: tr.id, msg: `Tribunal ${tr.num}: ${nom(k)} hi té ${r[k].length} alumnes tutoritzats.` });
  }
  const trs = S.tribunals;
  for (let i = 0; i < trs.length; i++) for (let j = i + 1; j < trs.length; j++) {
    if (!solapa(trs[i], trs[j])) continue;
    const mj = membresTrib(S, trs[j]);
    for (const k of membresTrib(S, trs[i]).filter(x => mj.includes(x)))
      out.push({ niv: 'crit', tr: trs[i].id, msg: `${nom(k)} és als tribunals ${trs[i].num} i ${trs[j].num} el mateix dia i hora (${trs[i].data} ${trs[i].hora}).` });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DEPTS, AFINITATS_DEFECTE, proposa, carregues, incidencies, tier, preparat, poolKeys, membresTrib, treballsDe, avaluadors, costTotal, ambitPrincipal };
