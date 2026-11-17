/* ===== Conversió entre el Google Sheets i l'estat de l'eina ===== */
const CAPS = {
  Alumnes: ['ID', 'Cognoms', 'Nom', 'Grup', 'Títol', 'Àmbit', 'Tutor/a', 'Cotutor/a', 'Estat', 'Tribunal', 'Descripció', 'Nota'],
  Professorat: ['Nom', 'Departament', 'Correu', 'Disponible', 'Cap de departament', 'Observacions'],
  Tribunals: ['Tribunal', 'Data', 'Hora', 'Aula', 'Bloquejat', 'Membres afegits', 'Tutors assistents', 'Jurat (automàtic)', 'Alumnes (automàtic)'],
  Config: ['Clau', 'Valor'],
  Enviaments: ['Professor/a', 'Correu', 'Tipus', 'Data', 'Tribunals', 'Empremta']
};
const ESTATS = { actiu: 'Necessita tribunal', fet: 'Ja té el TR fet', baixa: 'Baixa' };

function _files(f, nom) {
  const v = (f && f[nom]) || [];
  if (!v.length) return [];
  const cap = v[0].map(x => String(x).trim());
  return v.slice(1).filter(r => r.some(c => String(c).trim() !== '')).map(r => {
    const o = {}; cap.forEach((c, i) => { o[c] = r[i] == null ? '' : String(r[i]).trim(); }); return o;
  });
}
const _si = v => /^(s[ií]|si|x|true|1|yes)$/i.test(String(v || '').trim());
function normData(v) {
  v = String(v || '').trim(); if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return v;
}
function normHora(v) {
  v = String(v || '').trim(); const m = v.match(/^(\d{1,2})[:.h](\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v;
}

function estatDesDeFulls(f) {
  const cfg = {}; _files(f, 'Config').forEach(r => { if (r.Clau) cfg[r.Clau] = r.Valor; });
  const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  const S = {
    v: 3, curs: cfg.curs || 'Curs 2026-2027', savedAt: null,
    config: { midaTribunal: parseInt(cfg.midaTribunal, 10) || 4, afinitats: json(cfg.afinitats, null) || JSON.parse(JSON.stringify(AFINITATS_DEFECTE)), model: json(cfg.model, {}) },
    correu: json(cfg.correu, {}), teachers: {}, treballs: [], tribunals: [], enviaments: {}
  };
  for (const r of _files(f, 'Professorat')) {
    if (!r.Nom) continue;
    const depts = r.Departament.split('/').map(x => x.trim()).filter(Boolean);
    S.teachers[r.Nom] = { nom: r.Nom, depts: depts.length ? depts : ['Experimentals'], email: r.Correu, pool: !/^no$/i.test(r.Disponible), cap: _si(r['Cap de departament']) ? [depts[0]] : [],
      foraOrg: /organigrama/i.test(r.Observacions), afegit: /afegit/i.test(r.Observacions), obs: r.Observacions };
  }
  const prof = (nom, ambit) => {
    nom = String(nom || '').trim(); if (!nom) return null;
    if (S.teachers[nom]) return nom;
    const n = normTxt(nom), k = Object.keys(S.teachers).find(x => normTxt(x) === n);
    if (k) return k;
    S.teachers[nom] = { nom, depts: [ambit || 'Experimentals'], email: '', pool: true, cap: [], foraOrg: true, obs: 'No surt a l\'organigrama' };
    return nom;
  };
  const trNums = new Set();
  for (const r of _files(f, 'Tribunals')) {
    const n = parseInt(r.Tribunal, 10); if (!n || trNums.has(n)) continue; trNums.add(n);
    S.tribunals.push({ id: 'T' + n, num: n, data: normData(r.Data), hora: normHora(r.Hora), aula: r.Aula, bloq: _si(r.Bloquejat),
      extra: (r['Membres afegits'] || '').split(/[;\n]/).map(x => prof(x)).filter(Boolean),
      tutorsFora: (r['Tutors assistents'] || '').split(/[;\n]/).map(x => prof(x)).filter(Boolean) });
  }
  let i = 0;
  for (const r of _files(f, 'Alumnes')) {
    i++; if (!r.Cognoms && !r.Nom) continue;
    const estat = Object.keys(ESTATS).find(k => normTxt(ESTATS[k]) === normTxt(r.Estat)) || (/fet/i.test(r.Estat) ? 'fet' : /baixa/i.test(r.Estat) ? 'baixa' : 'actiu');
    const ambit = DEPTS.find(d => normTxt(d) === normTxt(r['Àmbit'])) || r['Àmbit'];
    const tutors = [prof(r['Tutor/a'], ambit), prof(r['Cotutor/a'], ambit)].filter(Boolean);
    const n = parseInt(r.Tribunal, 10);
    if (n && !trNums.has(n)) { trNums.add(n); S.tribunals.push({ id: 'T' + n, num: n, data: '', hora: '', aula: '', bloq: false, extra: [], tutorsFora: [] }); }
    S.treballs.push({ id: r.ID || 'a' + i, cognoms: r.Cognoms, nom: r.Nom, grup: r.Grup, titol: r['Títol'], descripcio: r['Descripció'], nota: r.Nota,
      ambit, ambitDeduit: /deduït/i.test(r.Nota), tutors: [...new Set(tutors)], estat, tribunal: n ? 'T' + n : null });
  }
  S.tribunals.sort((a, b) => a.num - b.num);
  for (const r of _files(f, 'Enviaments')) {
    const k = prof(r['Professor/a']); if (!k) continue;
    S.enviaments[k] = { tipus: /esborrany/i.test(r.Tipus) ? 'esborrany' : 'enviat', quan: r.Data, empremta: r.Empremta };
  }
  return S;
}

function fullsDesDeEstat(S) {
  const nom = k => (S.teachers[k] ? S.teachers[k].nom : k);
  const out = {};
  out.Alumnes = [CAPS.Alumnes, ...S.treballs.map(t => {
    const tr = t.tribunal && S.tribunals.find(x => x.id === t.tribunal);
    return [t.id, t.cognoms, t.nom, t.grup, t.titol, t.ambit, t.tutors[0] ? nom(t.tutors[0]) : '', t.tutors[1] ? nom(t.tutors[1]) : '', ESTATS[t.estat] || ESTATS.actiu, tr ? tr.num : '', t.descripcio || '', t.nota || ''];
  })];
  const ks = Object.keys(S.teachers).sort((a, b) => (S.teachers[a].depts[0] || '').localeCompare(S.teachers[b].depts[0] || '', 'ca') || nom(a).localeCompare(nom(b), 'ca'));
  out.Professorat = [CAPS.Professorat, ...ks.map(k => {
    const p = S.teachers[k];
    const obs = p.obs || [p.foraOrg ? 'No surt a l\'organigrama' : '', p.afegit ? 'Afegit a l\'eina' : ''].filter(Boolean).join('. ');
    return [p.nom, p.depts.join(' / '), p.email || '', p.pool ? 'Sí' : 'No', p.cap && p.cap.length ? 'Sí' : '', obs];
  })];
  out.Tribunals = [CAPS.Tribunals, ...S.tribunals.slice().sort((a, b) => a.num - b.num).map(tr => [
    tr.num, tr.data || '', tr.hora || '', tr.aula || '', tr.bloq ? 'Sí' : '', (tr.extra || []).map(nom).join('; '), (tr.tutorsFora || []).map(nom).join('; '),
    membresTrib(S, tr).map(nom).join('; '), treballsDe(S, tr).map(t => `${t.cognoms}, ${t.nom}`).join('; ')])];
  out.Config = [CAPS.Config, ['curs', S.curs || ''], ['midaTribunal', String(S.config.midaTribunal || 4)], ['afinitats', JSON.stringify(S.config.afinitats)], ['model', JSON.stringify(S.config.model || {})], ['correu', JSON.stringify(S.correu || {})]];
  out.Enviaments = [CAPS.Enviaments, ...Object.keys(S.enviaments || {}).filter(k => S.teachers[k]).map(k => {
    const e = S.enviaments[k];
    return [nom(k), S.teachers[k].email || '', e.tipus === 'enviat' ? 'Enviat' : 'Esborrany', e.quan, S.tribunals.filter(tr => membresTrib(S, tr).includes(k)).map(tr => tr.num).join(', '), e.empremta || ''];
  })];
  // Tot com a text perquè el Sheets no reinterpreti dates, hores ni números
  for (const f in out) out[f] = out[f].map(r => r.map(c => c == null ? '' : String(c)));
  return out;
}

/* Per passar l'estat de l'eina antiga (claus normalitzades) a claus = nom */
function rekeyPerNom(S) {
  const map = {}, T = {};
  for (const k in S.teachers) { const n = S.teachers[k].nom; map[k] = n; T[n] = S.teachers[k]; }
  S.teachers = T;
  for (const t of S.treballs) t.tutors = t.tutors.map(k => map[k] || k);
  for (const tr of S.tribunals) { tr.extra = (tr.extra || []).map(k => map[k] || k); tr.tutorsFora = (tr.tutorsFora || []).map(k => map[k] || k); }
  const e = {}; for (const k in (S.enviaments || {})) e[map[k] || k] = S.enviaments[k]; S.enviaments = e;
  return S;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { estatDesDeFulls, fullsDesDeEstat, rekeyPerNom, CAPS };
