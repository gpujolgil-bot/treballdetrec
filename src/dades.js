/* ===== Dades: importació d'Excel i edició d'alumnes i professorat ===== */

/* --- Coincidència de noms (tutors, professorat, alumnes) --- */
const tokensNom = s => normTxt(String(s || '').replace(/\(.*?\)/g, ' ')).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
const esquelet = w => w.replace(/[aeiouy]/g, '');
function nomsCompatibles(a, b) {
  if (!a || !b) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const ea = esquelet(a), eb = esquelet(b);
  return ea.length >= 2 && eb.length >= 2 && (ea.startsWith(eb) || eb.startsWith(ea));
}
/* Retorna la clau del professor/a que millor encaixa amb un text, o null */
function trobaProf(text, teachers) {
  teachers = teachers || S.teachers;
  const t = tokensNom(text); if (!t.length) return null;
  let best = null, bs = 0, empat = false;
  for (const k in teachers) {
    const tk = tokensNom(teachers[k].nom); if (!tk.length) continue;
    const comuns = t.filter(w => tk.includes(w)).length;
    const cognom = t.slice(1).some(w => tk.slice(1).includes(w)) || (t.length === 1 && tk.slice(1).includes(t[0]));
    const pila = nomsCompatibles(t[0], tk[0]);
    let s = 0;
    if (comuns >= 2) s = comuns + (pila ? 1 : 0);
    else if (cognom && pila) s = 1.5;
    if (s > bs) { bs = s; best = k; empat = false; } else if (s && s === bs) empat = true;
  }
  return bs && !empat ? best : null;
}
const titolCas = s => String(s || '').trim().toLowerCase().split(/\s+/).map((w, i) => (i && ['de', 'del', 'i', 'la', 'el', 'da'].includes(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const SINONIMS_DEPT = [
  [/educacio fisica|^ef$/, 'Educació Física'], [/farm|sanit|infermer|salut/, 'Sanitàries'], [/matem/, 'Matemàtiques'], [/tecnol/, 'Tecnologia'],
  [/informat/, 'Informàtica'], [/experim|biolog|fisica|quimic|geolog|cienc/, 'Experimentals'], [/catal/, 'Català'], [/castell|espanyol|lengua|llati|grec|clas/, 'Castellà'],
  [/angl|franc|aleman|idiom|ingl/, 'Idiomes'], [/orient/, 'Orientació'], [/social|histor|geograf|filosof|econom|psicolog|art historia/, 'Socials'],
  [/expressi|music|plast|visual|dibuix|arts?\b/, 'Expressió'], [/admin/, 'Administratiu'], [/\bfol\b/, 'FOL'], [/pqpi/, 'PQPI']
];
function normDept(s) {
  const n = normTxt(s).trim(); if (!n) return '';
  const exacte = DEPTS.find(d => normTxt(d) === n); if (exacte) return exacte;
  for (const [re, d] of SINONIMS_DEPT) if (re.test(n)) return d;
  return '';
}
const clauAlumne = (cognoms, nom) => (tokensNom(cognoms)[0] || '') + '|' + (tokensNom(nom)[0] || '');
function partNomComplet(s) {
  s = String(s || '').trim();
  if (s.includes(',')) { const [c, n] = s.split(','); return { cognoms: c.trim(), nom: (n || '').trim() }; }
  const w = s.split(/\s+/); return { nom: w[0] || '', cognoms: w.slice(1).join(' ') };
}

/* --- Camps que es poden importar --- */
const CAMPS_IMP = {
  alumnes: [
    ['nomComplet', 'Alumne (Cognoms, Nom)', /alumne|nom i cognom|nom complet|estudiant|^alumn/],
    ['cognoms', 'Cognoms', /cognom|apellid/],
    ['nom', 'Nom', /^nom$|^nombre$|^nom de pila/],
    ['grup', 'Grup', /grup|grupo|classe|^curs$/],
    ['titol', 'Títol (definitiu)', /titol definitiu|titulo definitivo|^titol$|^titulo$|titol del treball/],
    ['titolProv', 'Títol provisional', /provisional/],
    ['ambit', 'Àmbit / departament', /departament|ambit|materia|area/],
    ['tutor', 'Tutor/a', /^tutor|tutor definitiu|tutora|professor tutor/],
    ['cotutor', 'Cotutor/a', /cotutor/],
    ['descripcio', 'Descripció', /descrip/],
    ['estat', 'Estat', /^estat|^estado/]
  ],
  professorat: [
    ['nomComplet', 'Nom complet', /nom i cognom|nom complet|professor|docent|^nom$|^nombre$/],
    ['cognoms', 'Cognoms', /cognom|apellid/],
    ['dept', 'Departament', /departament|departamento|^dept|especialitat/],
    ['email', 'Correu', /correu|e-?mail|mail/],
    ['cap', 'Cap de departament', /^cap|jefe/]
  ]
};

function detectaCapcalera(files, tipus) {
  const camps = CAMPS_IMP[tipus];
  let millor = -1, mp = 1;
  for (let r = 0; r < Math.min(files.length, 10); r++) {
    const n = (files[r] || []).filter(c => camps.some(([, , re]) => re.test(normTxt(c).trim()))).length;
    if (n > mp) { mp = n; millor = r; }
  }
  return millor;
}
function endevinaMapatge(files, cap, tipus) {
  const map = {}, usades = new Set();
  const camps = CAMPS_IMP[tipus];
  if (cap >= 0) {
    const h = (files[cap] || []).map(c => normTxt(c).trim());
    for (const [camp, , re] of camps) {
      // per al títol, prioritza «definitiu»
      const idx = h.findIndex((x, i) => !usades.has(i) && x && re.test(x) && !(camp === 'tutor' && /cotutor|peticio/.test(x)) && !(camp === 'nomComplet' && tipus === 'alumnes' && /^nom$/.test(x)) && !(camp === 'titol' && /provisional/.test(x)));
      map[camp] = idx; if (idx >= 0) usades.add(idx);
    }
    if (map.cognoms >= 0 && map.nom >= 0) map.nomComplet = -1;
  } else {
    // Sense capçalera: endevina pel contingut
    const dades = files.slice(0, 40), ncol = Math.max(0, ...dades.map(r => r.length));
    const col = i => dades.map(r => String(r[i] == null ? '' : r[i]).trim()).filter(Boolean);
    for (const k of camps.map(c => c[0])) map[k] = -1;
    for (let i = 0; i < ncol; i++) {
      const v = col(i); if (!v.length) continue;
      const coma = v.filter(x => /^[^,]{2,},\s*\S/.test(x)).length / v.length;
      const curt = v.filter(x => x.length <= 6).length / v.length;
      const profs = v.filter(x => trobaProf(x)).length / v.length;
      const mails = v.filter(x => /@/.test(x)).length / v.length;
      const depts = v.filter(x => normDept(x)).length / v.length;
      if (mails > .5 && tipus === 'professorat' && map.email < 0) map.email = i;
      else if (coma > .5 && map.nomComplet < 0) map.nomComplet = i;
      else if (tipus === 'alumnes' && profs > .3 && map.tutor < 0) map.tutor = i;
      else if (depts > .5 && (tipus === 'alumnes' ? map.ambit : map.dept) < 0) map[tipus === 'alumnes' ? 'ambit' : 'dept'] = i;
      else if (tipus === 'alumnes' && curt > .7 && !/^\d+([.,]\d+)?$/.test(v[0]) && map.grup < 0) map.grup = i;
      else if (tipus === 'professorat' && map.nomComplet < 0 && v.filter(x => x.split(/\s+/).length >= 2).length / v.length > .7) map.nomComplet = i;
    }
  }
  return map;
}

/* Llegeix un fitxer d'Excel, ODS o CSV amb SheetJS */
async function llegeixFitxer(file) {
  if (typeof XLSX === 'undefined') throw new Error('No s\'ha carregat el lector d\'Excel. Recarrega la pàgina.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const fulls = {};
  for (const n of wb.SheetNames) fulls[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
  return { nom: file.name, fulls, ordre: wb.SheetNames };
}

/* --- Aplicar la importació --- */
function filesMapejades(imp) {
  const files = imp.fulls[imp.full] || [], cap = imp.cap;
  const v = (r, camp) => { const i = imp.map[camp]; return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; };
  return files.slice(cap + 1).filter(r => r.some(c => String(c).trim())).map(r => {
    const o = {}; for (const [camp] of CAMPS_IMP[imp.tipus]) o[camp] = v(r, camp); return o;
  });
}

function importaAlumnes(imp) {
  const files = filesMapejades(imp), avisos = [], nousProf = new Set();
  const nous = [];
  const tutorDe = text => {
    text = String(text || '').trim();
    if (!text || /^\?+$/.test(text) || /^(cataleg|si|no|-+|pendent|sense tutor)$/.test(normTxt(text).trim())) return { tutors: [] };
    if (/te fet|t[eé] fet|ja fet|aprovat|convalid/i.test(normTxt(text))) { const m = text.match(/\((\d+(?:[.,]\d+)?)\)/); return { tutors: [], fet: true, nota: 'Ja té el TR fet' + (m ? ` (nota ${m[1]})` : '') }; }
    const ks = text.split(/\s*[\/;]\s*|\s+i\s+/).map(p => {
      if (!p.trim()) return null;
      let k = trobaProf(p);
      if (!k) { const nom = titolCas(p); k = nom; if (!S.teachers[k]) { S.teachers[k] = { nom, depts: ['Experimentals'], email: '', pool: true, cap: [], foraOrg: true, nou: true, creatImport: true }; nousProf.add(nom); } }
      return k;
    }).filter(Boolean);
    return { tutors: [...new Set(ks)] };
  };
  for (const f of files) {
    let { cognoms, nom } = f;
    if (f.nomComplet && (!cognoms || !nom)) { const p = partNomComplet(f.nomComplet); cognoms = cognoms || p.cognoms; nom = nom || p.nom; }
    if (!cognoms && !nom) continue;
    if (/^(cognoms|alumne|nom)$/i.test(normTxt(cognoms))) continue;
    const t = { cognoms, nom, grup: f.grup, titol: f.titol || f.titolProv, nota: !f.titol && f.titolProv ? 'Títol provisional' : '', descripcio: f.descripcio };
    t.ambitTxt = f.ambit; t.ambit = normDept(f.ambit);
    if (f.ambit && !t.ambit) avisos.push(`${cognoms}, ${nom}: no reconec el departament «${f.ambit}».`);
    t.estat = /baixa/i.test(f.estat + ' ' + f.grup) ? 'baixa' : /fet/i.test(normTxt(f.estat)) ? 'fet' : 'actiu';
    if (/baixa/i.test(t.grup)) t.grup = '';
    if (imp.map.tutor >= 0 || imp.map.cotutor >= 0) {
      const a = tutorDe(f.tutor), b = tutorDe(f.cotutor);
      t.tutors = [...new Set([...a.tutors, ...b.tutors])];
      if (a.fet) { t.estat = 'fet'; t.nota = a.nota; }
    }
    nous.push(t);
  }
  // professorat nou: departament a partir de l'àmbit del primer treball que tutoritza
  for (const t of nous) for (const k of t.tutors || []) if (S.teachers[k] && S.teachers[k].nou && t.ambit) { S.teachers[k].depts = [t.ambit]; delete S.teachers[k].nou; }
  for (const k in S.teachers) delete S.teachers[k].nou;

  let afegits = 0, actualitzats = 0;
  if (imp.mode === 'substitueix') {
    S.treballs = []; S.tribunals = []; S.enviaments = {};
  }
  const index = {}; S.treballs.forEach(t => { index[clauAlumne(t.cognoms, t.nom)] = t; });
  nous.forEach((n, i) => {
    let t = imp.mode === 'actualitza' ? index[clauAlumne(n.cognoms, n.nom)] : null;
    if (t) {
      if (n.grup) t.grup = n.grup;
      if (n.titol) t.titol = n.titol;
      if (n.descripcio) t.descripcio = n.descripcio;
      if (n.ambit) { t.ambit = n.ambit; t.ambitDeduit = false; }
      if (n.tutors && (imp.map.tutor >= 0 || imp.map.cotutor >= 0)) { if (n.tutors.length) t.tutors = n.tutors; }
      if (n.estat !== 'actiu') t.estat = n.estat;
      if (n.nota) t.nota = n.nota;
      actualitzats++;
    } else {
      t = { id: 'a' + Date.now().toString(36) + i, cognoms: n.cognoms, nom: n.nom, grup: n.grup || '', titol: n.titol || '', descripcio: n.descripcio || '', nota: n.nota || '',
        ambit: n.ambit || '', ambitDeduit: false, tutors: n.tutors || [], estat: n.estat, tribunal: null };
      S.treballs.push(t); index[clauAlumne(t.cognoms, t.nom)] = t; afegits++;
    }
  });
  for (const t of S.treballs) if (!t.ambit && t.tutors[0] && S.teachers[t.tutors[0]]) { t.ambit = S.teachers[t.tutors[0]].depts[0]; t.ambitDeduit = true; }
  for (const t of S.treballs) for (const k of t.tutors) if (S.teachers[k]) S.teachers[k].pool = true;
  if (nousProf.size) avisos.unshift(`Tutors que no eren a la llista de professorat (els he afegit; revisa'n el nom i el departament): ${[...nousProf].join(', ')}.`);
  return { afegits, actualitzats, avisos };
}

function relligaProfessorat(nousTeachers) {
  // Torna a lligar tutors, membres afegits i enviaments amb la nova llista de professorat
  const vells = S.teachers, map = {};
  for (const k in vells) {
    const n = nousTeachers[k] ? k : trobaProf(vells[k].nom, nousTeachers);
    if (n) map[k] = n;
  }
  const usats = new Set([...S.treballs.flatMap(t => t.tutors), ...S.tribunals.flatMap(t => t.extra || [])]);
  for (const k of usats) if (!map[k] && vells[k]) { nousTeachers[k] = Object.assign({}, vells[k], { foraOrg: true }); map[k] = k; }
  for (const t of S.treballs) t.tutors = t.tutors.map(k => map[k] || k);
  for (const tr of S.tribunals) tr.extra = (tr.extra || []).map(k => map[k] || k);
  const e = {}; for (const k in S.enviaments || {}) if (map[k]) e[map[k]] = S.enviaments[k]; S.enviaments = e;
  S.teachers = nousTeachers;
}
function afegeixProfs(llista, mode) {
  // llista: [{nom, dept, email, cap}]
  let afegits = 0, actualitzats = 0; const avisos = [];
  const base = mode === 'substitueix' ? {} : S.teachers;
  for (const p of llista) {
    const nom = titolCas(p.nom); if (!nom || /administrador/i.test(nom)) continue;
    const dept = normDept(p.dept) || (p.dept ? '' : '');
    if (p.dept && !dept) avisos.push(`${nom}: no reconec el departament «${p.dept}».`);
    const k = trobaProf(nom, base) || (base[nom] ? nom : null);
    if (k && base[k]) {
      const t = base[k];
      if (dept && !t.depts.includes(dept)) { if (mode === 'substitueix') t.depts.push(dept); else t.depts = [dept]; }
      if (p.email) t.email = p.email;
      if (p.cap && dept && !t.cap.includes(dept)) t.cap.push(dept);
      t.foraOrg = false; actualitzats++;
    } else {
      const vell = S.teachers[trobaProf(nom)] || {};
      base[nom] = { nom, depts: [dept || 'Experimentals'], email: p.email || vell.email || '', pool: false, cap: p.cap && dept ? [dept] : [], foraOrg: false };
      afegits++;
    }
  }
  if (mode === 'substitueix') relligaProfessorat(base);
  for (const t of S.treballs) for (const k of t.tutors) if (S.teachers[k]) S.teachers[k].pool = true;
  return { afegits, actualitzats, avisos };
}
function importaProfessorat(imp) {
  const llista = filesMapejades(imp).map(f => {
    let nom = f.nomComplet || '';
    if (f.cognoms && !/\s/.test(nom.trim())) nom = `${nom} ${f.cognoms}`;
    if (nom.includes(',')) { const p = partNomComplet(nom); nom = `${p.nom} ${p.cognoms}`; }
    return { nom, dept: f.dept, email: /@/.test(f.email) ? f.email.trim() : '', cap: /^(s[ií]|x|cap|1|true)$/i.test(f.cap.trim()) };
  }).filter(p => p.nom.trim());
  return afegeixProfs(llista, imp.mode);
}
/* Format de l'organigrama: «Experimentals Cap Departament: NOM» i a sota un nom per línia */
function parseOrganigrama(text) {
  const out = []; let dept = null, cap = '';
  for (const linia of String(text).split(/\r?\n/)) {
    const l = linia.trim().replace(/^"|"$/g, ''); if (!l) continue;
    const m = l.match(/^(.+?)\s+Cap(?: de)? Departament:\s*(.*)$/i);
    if (m) { dept = m[1].trim(); cap = m[2].trim(); continue; }
    if (/^departaments?\s+\d{4}/i.test(normTxt(l))) continue;
    if (dept) out.push({ nom: l, dept, cap: normTxt(l) === normTxt(cap) });
  }
  return out;
}

/* --- Pantalla Dades --- */
function selProf(id, sel, attrs) {
  const ks = profsOrdenats(Object.keys(S.teachers));
  return `<select id="${id}" ${attrs}><option value="">—</option>${ks.map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(nomP(k))}</option>`).join('')}</select>`;
}
function selDept(id, sel, attrs, buit) {
  return `<select id="${id}" ${attrs}>${buit ? `<option value="">${buit}</option>` : ''}${DEPTS.map(d => `<option ${d === sel ? 'selected' : ''}>${esc(d)}</option>`).join('')}${sel && !DEPTS.includes(sel) ? `<option selected>${esc(sel)}</option>` : ''}</select>`;
}

function renderDades(m) {
  const vista = UI.dades || 'alumnes';
  const seg = `<div class="seg" role="group" aria-label="Dades">${[['alumnes', `Alumnes (${S.treballs.length})`], ['profes', `Professorat (${Object.keys(S.teachers).length})`], ['importa', 'Importa / curs nou']].map(([v, x]) => `<button data-dvista="${v}" aria-pressed="${vista === v}">${x}</button>`).join('')}</div>`;
  let cos = '';
  if (vista === 'alumnes') cos = editorAlumnes();
  else if (vista === 'profes') cos = editorProfes();
  else cos = pantallaImporta();
  m.innerHTML = `<div class="wrap"><div class="toolbar">${seg}<span class="sp"></span>${vista !== 'importa' ? `<input type="search" id="dd-q" placeholder="Cerca" aria-label="Cerca" value="${esc(UI.ddq || '')}">` : ''}${vista === 'alumnes' ? '<button class="btn pri" id="dd-nou-al">Afegeix alumne</button>' : vista === 'profes' ? '<button class="btn pri" id="dd-nou-pf">Afegeix professor/a</button>' : ''}</div>${cos}</div>`;
}

function editorAlumnes() {
  const q = normTxt(UI.ddq || '');
  const ts = S.treballs.filter(t => !q || normTxt([t.cognoms, t.nom, t.titol, t.grup, ...t.tutors.map(nomP)].join(' ')).includes(q));
  return `<p class="tier" style="margin:0 0 8px">Els canvis s'apliquen a l'acte. Si canvies el tutor o l'àmbit d'un alumne que ja és en un tribunal, revisa després el tribunal (o fes «Nova proposta»).</p>
  <div class="taula-w editor"><table><thead><tr><th>Cognoms</th><th>Nom</th><th>Grup</th><th>Títol</th><th>Àmbit</th><th>Tutor/a</th><th>Cotutor/a</th><th>Estat</th><th></th></tr></thead><tbody>
  ${ts.map(t => `<tr id="ed-${t.id}">
    <td><input id="e-cog-${t.id}" data-ed-al="${t.id}" data-camp="cognoms" value="${esc(t.cognoms)}" aria-label="Cognoms"></td>
    <td><input id="e-nom-${t.id}" data-ed-al="${t.id}" data-camp="nom" value="${esc(t.nom)}" aria-label="Nom" class="curt"></td>
    <td><input id="e-grup-${t.id}" data-ed-al="${t.id}" data-camp="grup" value="${esc(t.grup)}" aria-label="Grup" class="mini"></td>
    <td><input id="e-tit-${t.id}" data-ed-al="${t.id}" data-camp="titol" value="${esc(t.titol)}" aria-label="Títol" class="llarg"></td>
    <td>${selDept('e-amb-' + t.id, t.ambit, `data-ed-al="${t.id}" data-camp="ambit" aria-label="Àmbit"`, '—')}</td>
    <td>${selProf('e-tut-' + t.id, t.tutors[0], `data-ed-al="${t.id}" data-camp="tut0" aria-label="Tutor/a"`)}</td>
    <td>${selProf('e-cot-' + t.id, t.tutors[1], `data-ed-al="${t.id}" data-camp="tut1" aria-label="Cotutor/a"`)}</td>
    <td><select id="e-est-${t.id}" data-ed-al="${t.id}" data-camp="estat" aria-label="Estat">${Object.keys(ESTATS_UI).map(e => `<option value="${e}" ${e === t.estat ? 'selected' : ''}>${ESTATS_UI[e]}</option>`).join('')}</select></td>
    <td><button class="btn sm ghost esb" data-esb-al="${t.id}" aria-label="Esborra ${esc(alumne(t))}">Esborra</button></td>
  </tr>`).join('') || '<tr><td colspan="9" class="buit-txt">Cap alumne.</td></tr>'}
  </tbody></table></div>`;
}
const ESTATS_UI = { actiu: 'Necessita tribunal', fet: 'Ja té el TR fet', baixa: 'Baixa' };

function editorProfes() {
  const q = normTxt(UI.ddq || ''), c = carregues(S);
  const ks = Object.keys(S.teachers).filter(k => !q || normTxt(nomP(k) + ' ' + deptP(k) + ' ' + (S.teachers[k].email || '')).includes(q))
    .sort((a, b) => dept0(a).localeCompare(dept0(b), 'ca') || nomP(a).localeCompare(nomP(b), 'ca'));
  return `<p class="tier" style="margin:0 0 8px">«Disponible» vol dir que es pot afegir a un tribunal on faltin membres. Els tutors hi són sempre pels seus alumnes.</p>
  <div class="taula-w editor"><table><thead><tr><th>Nom i cognoms</th><th>Departament</th><th>2n departament</th><th>Correu</th><th>Disponible</th><th>Cap</th><th class="n">Tutories</th><th></th></tr></thead><tbody>
  ${ks.map(k => { const p = S.teachers[k]; return `<tr>
    <td><input id="p-nom-${esc(k)}" data-ed-pf="${esc(k)}" data-camp="nom" value="${esc(p.nom)}" aria-label="Nom">${p.foraOrg ? ' <span class="pill avis" title="Afegit des d\'un tutor que no era a la llista">revisa</span>' : ''}</td>
    <td>${selDept('p-d1-' + k, p.depts[0], `data-ed-pf="${esc(k)}" data-camp="d1" aria-label="Departament"`)}</td>
    <td>${selDept('p-d2-' + k, p.depts[1] || '', `data-ed-pf="${esc(k)}" data-camp="d2" aria-label="Segon departament"`, '—')}</td>
    <td><input id="p-em-${esc(k)}" data-ed-pf="${esc(k)}" data-camp="email" value="${esc(p.email || '')}" type="email" aria-label="Correu"></td>
    <td><input type="checkbox" data-ed-pf="${esc(k)}" data-camp="pool" ${p.pool ? 'checked' : ''} aria-label="Disponible"></td>
    <td><input type="checkbox" data-ed-pf="${esc(k)}" data-camp="cap" ${p.cap && p.cap.length ? 'checked' : ''} aria-label="Cap de departament"></td>
    <td class="n">${c[k] ? c[k].tutor : 0}</td>
    <td><button class="btn sm ghost esb" data-esb-pf="${esc(k)}" aria-label="Esborra ${esc(p.nom)}">Esborra</button></td>
  </tr>`; }).join('')}
  </tbody></table></div>`;
}

function pantallaImporta() {
  const imp = UI.imp;
  let pas2 = '';
  if (imp) {
    const files = imp.fulls[imp.full] || [];
    const ncol = Math.max(0, ...files.slice(0, 50).map(r => r.length));
    const lletra = i => XLSX.utils.encode_col(i);
    const mostra = i => { const v = files.slice(imp.cap + 1).map(r => String(r[i] || '').trim()).find(Boolean); return v ? ` · ${v.slice(0, 28)}` : ''; };
    const capTxt = i => imp.cap >= 0 && files[imp.cap] && files[imp.cap][i] ? ` (${String(files[imp.cap][i]).slice(0, 24)})` : '';
    const opts = sel => `<option value="-1">— No l'importis —</option>` + Array.from({ length: ncol }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>Columna ${lletra(i)}${capTxt(i)}${mostra(i)}</option>`).join('');
    const prev = filesMapejades(imp).slice(0, 6);
    const camps = CAMPS_IMP[imp.tipus];
    pas2 = `<div class="panell"><h2>2. Revisa les columnes</h2>
      <p>Fitxer <b>${esc(imp.nom)}</b>. He provat d'endevinar quina columna correspon a cada dada; corregeix el que calgui.</p>
      <div class="row">
        ${imp.ordre.length > 1 ? `<label class="field">Full<select id="im-full">${imp.ordre.map(n => `<option ${n === imp.full ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
        <label class="field">Fila de capçalera<select id="im-cap"><option value="-1" ${imp.cap < 0 ? 'selected' : ''}>No n'hi ha</option>${files.slice(0, 10).map((r, i) => `<option value="${i}" ${i === imp.cap ? 'selected' : ''}>Fila ${i + 1}: ${esc(r.filter(Boolean).slice(0, 3).join(' · ').slice(0, 50))}</option>`).join('')}</select></label>
      </div>
      <div class="mapa">${camps.map(([camp, etiqueta]) => `<label class="field">${esc(etiqueta)}<select id="im-m-${camp}" data-imcamp="${camp}">${opts(imp.map[camp])}</select></label>`).join('')}</div>
      <h3>Previsualització</h3>
      <div class="taula-w"><table><thead><tr>${camps.filter(([c]) => imp.map[c] >= 0).map(([, e]) => `<th>${esc(e)}</th>`).join('')}</tr></thead>
        <tbody>${prev.map(r => `<tr>${camps.filter(([c]) => imp.map[c] >= 0).map(([c]) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="row">
        <label class="chk"><input type="radio" name="im-mode" value="actualitza" ${imp.mode === 'actualitza' ? 'checked' : ''}> Afegeix i actualitza ${imp.tipus === 'alumnes' ? '(els alumnes que ja hi són es completen amb les columnes triades)' : '(manté la resta de professorat)'}</label>
        <label class="chk"><input type="radio" name="im-mode" value="substitueix" ${imp.mode === 'substitueix' ? 'checked' : ''}> Substitueix ${imp.tipus === 'alumnes' ? 'tots els alumnes i esborra els tribunals' : 'tota la llista de professorat'}</label>
      </div>
      <div class="row"><button class="btn" id="im-cancel">Cancel·la</button><button class="btn pri" id="im-fes">Importa ${filesMapejades(imp).length} files</button></div>
    </div>`;
  }
  return `
    <div class="panell"><h2>Curs nou</h2>
      <p>Per començar un altre curs: buida els alumnes, els tribunals i l'estat dels correus, i conserva el professorat (amb els correus). Després importa l'Excel d'alumnes.</p>
      <div class="row"><label class="field">Nom del curs<input id="cn-curs" value="${esc(S.curs || '')}" placeholder="Curs 2027-2028" style="width:200px"></label><button class="btn" id="cn-fes">Comença el curs nou</button></div>
    </div>
    <div class="panell"><h2>1. Importa un Excel</h2>
      <p>Accepta .xlsx, .xls, .ods i .csv. Pots importar els alumnes en dos passos si tens els títols en un fitxer i els tutors en un altre: el primer amb «Substitueix», el segon amb «Afegeix i actualitza».</p>
      <div class="row">
        <label class="field">Què importes<select id="im-tipus"><option value="alumnes" ${(UI.impTipus || 'alumnes') === 'alumnes' ? 'selected' : ''}>Alumnes i treballs</option><option value="professorat" ${UI.impTipus === 'professorat' ? 'selected' : ''}>Professorat i departaments</option></select></label>
        <label class="btn pri" for="im-fitxer">Tria el fitxer…</label><input type="file" id="im-fitxer" accept=".xlsx,.xls,.ods,.csv" hidden>
      </div>
    </div>
    ${pas2}
    <div class="panell"><h2>Enganxa l'organigrama</h2>
      <p>Si tens el professorat en el format de l'organigrama del centre (una línia «Departament Cap Departament: NOM» i a sota un nom per línia), enganxa'l aquí.</p>
      <textarea id="og-text" rows="6" placeholder="Experimentals Cap Departament: GERARD PUJOL&#10;BARBARA CORTES&#10;MONTSE GABAS&#10;…"></textarea>
      <div class="row"><label class="chk"><input type="radio" name="og-mode" value="actualitza" checked> Afegeix i actualitza</label><label class="chk"><input type="radio" name="og-mode" value="substitueix"> Substitueix tota la llista</label><button class="btn pri" id="og-fes">Importa l'organigrama</button></div>
    </div>`;
}

async function demanaText(titol, text, valor) {
  return new Promise(res => {
    const bg = document.createElement('div'); bg.className = 'dlg-bg';
    bg.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dt-t"><h2 id="dt-t">${esc(titol)}</h2><p>${esc(text)}</p><input id="dt-v" value="${esc(valor || '')}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--ink)"><div class="row"><button class="btn" data-x="0">Cancel·la</button><button class="btn pri" data-x="1">D'acord</button></div></div>`;
    bg.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button[data-x]'); if (b) { const v = $('#dt-v', bg).value; bg.remove(); res(b.dataset.x === '1' ? v : null); } });
    document.body.appendChild(bg); $('#dt-v', bg).focus();
  });
}
function informeImport(r, que) {
  const msg = `${que}: ${r.afegits} nous, ${r.actualitzats} actualitzats.`;
  if (r.avisos.length) dialeg('Importació feta', msg + ' ' + r.avisos.slice(0, 6).join(' ') + (r.avisos.length > 6 ? ` (i ${r.avisos.length - 6} avisos més)` : ''), [{ txt: 'D\'acord', v: true, pri: true }]);
  else toast(msg);
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.dvista) { UI.dades = b.dataset.dvista; UI.ddq = ''; return render(); }
  if (b.id === 'dd-nou-al') {
    muta(() => { S.treballs.unshift({ id: 'a' + Date.now().toString(36), cognoms: '', nom: '', grup: '', titol: '', descripcio: '', nota: '', ambit: '', ambitDeduit: false, tutors: [], estat: 'actiu', tribunal: null }); });
    const i = $('#main input[data-camp="cognoms"]'); if (i) i.focus(); return;
  }
  if (b.id === 'dd-nou-pf') {
    const nom = await demanaText('Afegeix professor/a', 'Nom i cognoms:', '');
    if (!nom || !nom.trim()) return;
    const n = titolCas(nom); if (S.teachers[n]) { toast('Ja hi és.'); return; }
    UI.ddq = n; muta(() => { S.teachers[n] = { nom: n, depts: ['Experimentals'], email: '', pool: false, cap: [] }; }); return;
  }
  if (b.dataset.esbAl) {
    const t = S.treballs.find(x => x.id === b.dataset.esbAl);
    const ok = await dialeg('Esborrar alumne', `S'esborrarà ${alumne(t) || 'aquesta fila'}${t.tribunal ? ' i sortirà del seu tribunal' : ''}.`, [{ txt: 'Cancel·la', v: false }, { txt: 'Esborra', v: true, pri: true }]);
    if (ok) muta(() => { S.treballs = S.treballs.filter(x => x !== t); }); return;
  }
  if (b.dataset.esbPf) {
    const k = b.dataset.esbPf, n = S.treballs.filter(t => t.tutors.includes(k)).length;
    const ok = await dialeg('Esborrar professor/a', `S'esborrarà ${nomP(k)}.${n ? ` Tutoritza ${n} alumne${n > 1 ? 's' : ''}, que quedaran sense tutor/a.` : ''}`, [{ txt: 'Cancel·la', v: false }, { txt: 'Esborra', v: true, pri: true }]);
    if (ok) muta(() => { delete S.teachers[k]; S.treballs.forEach(t => t.tutors = t.tutors.filter(x => x !== k)); S.tribunals.forEach(tr => tr.extra = (tr.extra || []).filter(x => x !== k)); delete (S.enviaments || {})[k]; }); return;
  }
  if (b.id === 'cn-fes') {
    const curs = $('#cn-curs').value.trim() || S.curs;
    const ok = await dialeg('Començar un curs nou', `S'esborraran els ${S.treballs.length} alumnes, els ${S.tribunals.length} tribunals i l'estat dels correus. Es manté el professorat. Ho pots desfer amb «Desfés» fins que desis.`, [{ txt: 'Cancel·la', v: false }, { txt: 'Comença', v: true, pri: true }]);
    if (ok) { muta(() => { S.curs = curs; S.treballs = []; S.tribunals = []; S.enviaments = {}; }); toast('Curs nou preparat. Ara importa l\'Excel d\'alumnes.'); }
    return;
  }
  if (b.id === 'im-cancel') { UI.imp = null; return render(); }
  if (b.id === 'im-fes') {
    const imp = UI.imp; let r;
    muta(() => {
      r = imp.tipus === 'alumnes' ? importaAlumnes(imp) : importaProfessorat(imp);
      // professorat creat per una importació anterior que ja no tutoritza ningú (p. ex. un tutor provisional)
      for (const k in S.teachers) if (S.teachers[k].creatImport && !S.treballs.some(t => t.tutors.includes(k))) delete S.teachers[k];
      const pendents = S.treballs.filter(t => preparat(t) && !t.tribunal).length;
      if (imp.tipus === 'alumnes' && pendents && !S.tribunals.some(t => t.bloq)) { proposa(S, { seed: Date.now() }); UI.proposta = true; }
    });
    UI.imp = null; render();
    informeImport(r, imp.tipus === 'alumnes' ? 'Alumnes' : 'Professorat');
    if (imp.tipus === 'alumnes' && UI.proposta && !r.avisos.length) toast(`Importat. He fet una proposta de ${S.tribunals.length} tribunals: la tens a la pestanya Tribunals.`);
    else if (imp.tipus === 'alumnes' && S.treballs.some(t => preparat(t) && !t.tribunal)) toast('Hi ha treballs nous sense tribunal. Fes «Nova proposta» a Tribunals o mou-los a mà.');
    return;
  }
  if (b.id === 'og-fes') {
    const llista = parseOrganigrama($('#og-text').value);
    if (!llista.length) { toast('No he trobat cap departament. Cada departament ha de començar amb una línia «Nom Cap Departament: NOM».'); return; }
    const mode = (document.querySelector('input[name="og-mode"]:checked') || {}).value || 'actualitza';
    let r; muta(() => { r = afegeixProfs(llista, mode); });
    return informeImport(r, 'Professorat');
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.edAl) {
    const t = S.treballs.find(x => x.id === el.dataset.edAl), c = el.dataset.camp, v = el.value;
    muta(() => {
      if (c === 'tut0' || c === 'tut1') {
        const a = t.tutors.slice(); a[c === 'tut0' ? 0 : 1] = v || null;
        t.tutors = a.filter(Boolean).filter((k, i, x) => x.indexOf(k) === i);
        if (v && S.teachers[v]) S.teachers[v].pool = true;
        if (!t.ambit && t.tutors[0]) { t.ambit = dept0(t.tutors[0]); t.ambitDeduit = true; }
      } else if (c === 'ambit') { t.ambit = v; t.ambitDeduit = false; }
      else t[c] = v;
    }, { noRender: true });
    renderCap(); return;
  }
  if (el.dataset.edPf) {
    const k = el.dataset.edPf, p = S.teachers[k], c = el.dataset.camp;
    muta(() => {
      if (c === 'nom') p.nom = el.value.trim() || p.nom;
      else if (c === 'd1') { p.depts[0] = el.value; p.foraOrg = false; }
      else if (c === 'd2') { p.depts = [p.depts[0], el.value].filter(Boolean); }
      else if (c === 'email') p.email = el.value.trim();
      else if (c === 'pool') p.pool = el.checked;
      else if (c === 'cap') p.cap = el.checked ? [p.depts[0]] : [];
    }, { noRender: true });
    renderCap(); return;
  }
  if (el.id === 'im-tipus') { UI.impTipus = el.value; if (UI.imp) { UI.imp.tipus = el.value; UI.imp.cap = detectaCapcalera(UI.imp.fulls[UI.imp.full], el.value); UI.imp.map = endevinaMapatge(UI.imp.fulls[UI.imp.full], UI.imp.cap, el.value); } return render(); }
  if (el.id === 'im-fitxer' && el.files[0]) {
    try {
      const f = await llegeixFitxer(el.files[0]);
      const tipus = UI.impTipus || 'alumnes';
      const full = f.ordre.find(n => (f.fulls[n] || []).length > 1) || f.ordre[0];
      const cap = detectaCapcalera(f.fulls[full], tipus);
      UI.imp = Object.assign(f, { tipus, full, cap, map: endevinaMapatge(f.fulls[full], cap, tipus), mode: S.treballs.length && tipus === 'alumnes' ? 'actualitza' : (tipus === 'alumnes' ? 'substitueix' : 'actualitza') });
      render();
    } catch (x) { toast('No he pogut llegir el fitxer: ' + (x.message || x)); }
    return;
  }
  if (el.id === 'im-full') { const imp = UI.imp; imp.full = el.value; imp.cap = detectaCapcalera(imp.fulls[imp.full], imp.tipus); imp.map = endevinaMapatge(imp.fulls[imp.full], imp.cap, imp.tipus); return render(); }
  if (el.id === 'im-cap') { const imp = UI.imp; imp.cap = parseInt(el.value, 10); imp.map = endevinaMapatge(imp.fulls[imp.full], imp.cap, imp.tipus); return render(); }
  if (el.dataset.imcamp) { UI.imp.map[el.dataset.imcamp] = parseInt(el.value, 10); return render(); }
  if (el.name === 'im-mode') { UI.imp.mode = el.value; return render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'dd-q') { UI.ddq = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#dd-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});
