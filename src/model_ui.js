/* ===== Model de tribunal: configuració i comparador d'escenaris ===== */
function panellModel() {
  const m = modelCfg(S), raw = S.config.model || {};
  const kSel = raw.maxTutors == null || raw.maxTutors === '' ? '' : String(m.K);
  const kOpts = [['', `Tots: el jurat són els ${m.N} tutors`]];
  for (let k = m.N - 1; k >= 0; k--) kOpts.push([String(k), k === 0 ? 'Cap: jurat independent (el tutor/a assisteix)' : `Com a màxim ${k}`]);
  const avisK = m.K >= 2 ? `<div class="banner warn"><span>Amb ${m.K >= m.N ? 'tots els tutors' : m.K + ' tutors'} al jurat, els tutors d'un mateix tribunal s'avaluen els alumnes entre ells: hi haurà parelles recíproques sí o sí. Per evitar-les del tot, posa com a màxim 1 tutor.</span></div>` : '';
  return `<div class="panell"><h2>Model de tribunal</h2>
    <p>Defineix com es formen els tribunals. Els canvis s'apliquen quan prems «Aplica i recalcula» o «Nova proposta». Abans pots comparar escenaris.</p>
    <div class="mapa">
      <label class="field">Treballs per tribunal<input type="number" min="2" max="8" id="cf-mida" value="${m.N}"></label>
      <label class="field">Persones al jurat (amb vot)<input type="number" min="2" max="8" id="cf-membres" value="${m.M}"></label>
      <label class="field">Tutors al jurat del seu propi tribunal<select id="cf-k">${kOpts.map(([v, t]) => `<option value="${v}" ${v === kSel ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="field">Avaluacions recíproques<select id="cf-rec">${[['permesa', 'Permeses'], ['evita', 'Evita-les si es pot'], ['prohibida', 'Prohibides (prioritat màxima)']].map(([v, t]) => `<option value="${v}" ${v === m.reciprocitat ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Màxim de tribunals per persona com a jurat<input type="number" min="0" max="6" id="cf-maxtrib" value="${m.maxTrib || ''}" placeholder="Sense límit"></label>
      <label class="chk" style="align-self:end;padding-bottom:6px"><input type="checkbox" id="cf-vota" ${m.tutorVota ? 'checked' : ''}> El tutor/a puntua el seu propi alumne</label>
    </div>
    ${avisK}
    <p class="tier">«Avaluacions recíproques»: quan A puntua un alumne de B i B puntua un alumne de A. És el que pot portar a «avui per tu, demà per mi».</p>
    <div class="row"><button class="btn" id="cf-compara" ${UI.compEnCurs ? 'disabled' : ''}>${UI.compEnCurs ? 'Calculant…' : 'Compara escenaris'}</button><button class="btn pri" id="cf-aplica">Aplica i recalcula</button></div>
    ${taulaComparador()}
  </div>`;
}

function escenaris() {
  const m = modelCfg(S), raw = S.config.model || {}, N = m.N;
  const llista = [
    ['La teva configuració', Object.assign({}, raw)],
    ['El jurat són els tutors', Object.assign({}, raw, { maxTutors: null, membres: N, reciprocitat: 'permesa' })],
    ['Com a màxim 2 tutors', Object.assign({}, raw, { maxTutors: Math.min(2, N - 1), membres: N, reciprocitat: 'evita' })],
    ['Com a màxim 1 tutor', Object.assign({}, raw, { maxTutors: 1, membres: N, reciprocitat: 'evita' })],
    [`Independent: ${Math.max(2, N - 1)} + tutor/a`, Object.assign({}, raw, { maxTutors: 0, membres: Math.max(2, N - 1), reciprocitat: 'evita' })],
    [`Independent: ${N} + tutor/a`, Object.assign({}, raw, { maxTutors: 0, membres: N, reciprocitat: 'evita' })]
  ];
  const vist = new Set(), out = [];
  for (const [nom, model] of llista) {
    const tmp = { config: Object.assign({}, S.config, { model }) }, mc = modelCfg(tmp);
    const clau = JSON.stringify([mc.N, mc.M, mc.K, mc.tutorVota, mc.reciprocitat, mc.maxTrib]);
    if (vist.has(clau)) continue; vist.add(clau); out.push({ nom, model, mc });
  }
  return out;
}

function compara() {
  const es = escenaris(), seed = Date.now();
  UI.comp = []; UI.compEnCurs = true; render();
  let i = 0;
  const pas = () => {
    if (i >= es.length) { UI.compEnCurs = false; render(); return; }
    const e = es[i++];
    const C = JSON.parse(JSON.stringify(S)); C.config.model = e.model;
    proposa(C, { seed, intents: 2, iter: 40000, iterJurat: 25000 });
    const assign = {}; C.treballs.forEach(t => { assign[t.id] = t.tribunal; });
    UI.comp.push({ nom: e.nom, model: e.model, mc: e.mc, met: metriques(C), tribunals: C.tribunals, assign });
    const b = $('#cf-compara'); if (b) b.textContent = `Calculant ${i + 1 <= es.length ? i + 1 : es.length} de ${es.length}…`;
    renderComparador();
    setTimeout(pas, 20);
  };
  setTimeout(pas, 30);
}
function renderComparador() { const el = $('#comparador'); if (el) el.outerHTML = taulaComparador(); }

function taulaComparador() {
  if (!UI.comp || !UI.comp.length) return '<div id="comparador"></div>';
  const fila = (r, i) => {
    const x = r.met, mc = r.mc;
    const desc = mc.K >= mc.N ? 'tots els tutors' : mc.K === 0 ? `${mc.M} sense tutors` : `${mc.M}, màx. ${mc.K} tutor${mc.K > 1 ? 's' : ''}`;
    return `<tr>
      <td><b>${esc(r.nom)}</b><div class="tier">Jurat: ${desc} · tutor/a ${mc.tutorVota ? 'puntua' : 'no puntua'}</div></td>
      <td class="n">${String(x.pctAfins).replace('.', ',')}%</td>
      <td class="n ${x.avaluacions[2] ? 'mal' : ''}">${x.avaluacions[2]}</td>
      <td class="n ${x.reciprocitats ? 'mal' : 'be'}">${x.reciprocitats}</td>
      <td class="n">${x.jurat}</td>
      <td class="n">${x.maxTrib}</td>
      <td class="n">${String(x.sessionsMitjana).replace('.', ',')} / ${x.sessionsMax}</td>
      <td class="n ${x.incomplets ? 'mal' : ''}">${x.incomplets}</td>
      <td><button class="btn sm pri" data-aplica-esc="${i}">Aplica</button></td>
    </tr>`;
  };
  return `<div id="comparador"><h3 style="margin-top:6px">Comparació d'escenaris</h3>
    <div class="taula-w"><table class="comp"><thead><tr><th>Escenari</th><th class="n">Afins</th><th class="n">No afins</th><th class="n">Parelles recíproques</th><th class="n">Persones al jurat</th><th class="n">Màx. tribunals per persona</th><th class="n">Sessions per persona (mitjana / màx.)</th><th class="n">Tribunals incomplets</th><th></th></tr></thead>
    <tbody>${UI.comp.map(fila).join('')}</tbody></table></div>
    <p class="tier">«Sessions» compta els tribunals on cada persona ha de ser, com a jurat o acompanyant el seu alumne. Els tribunals bloquejats es mantenen en tots els escenaris. Cada càlcul té una part aleatòria: si el tornes a fer, els números poden variar una mica.</p></div>`;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cf-compara') return compara();
  if (b.dataset.aplicaEsc) {
    const r = UI.comp[+b.dataset.aplicaEsc];
    muta(() => {
      S.config.model = JSON.parse(JSON.stringify(r.model));
      S.tribunals = JSON.parse(JSON.stringify(r.tribunals));
      S.treballs.forEach(t => { if (t.id in r.assign) t.tribunal = r.assign[t.id]; });
    }, { noRender: true });
    UI.comp = null; UI.proposta = true; toast(`Aplicat: ${r.nom}. Revisa els tribunals i desa.`);
    if (location.hash === '#tribunals') ruta(); else location.hash = 'tribunals';
    return;
  }
  if (b.id === 'cf-aplica') {
    const nb = S.tribunals.filter(t => t.bloq).length;
    const ok = await dialeg('Aplicar el model', `Es tornaran a fer els tribunals no bloquejats amb aquesta configuració (${descripcioModel()}).${nb ? ` Els ${nb} tribunals bloquejats es mantenen.` : ''} Ho pots desfer amb «Desfés».`, [{ txt: 'Cancel·la', v: false }, { txt: 'Recalcula', v: true, pri: true }]);
    if (!ok) return;
    muta(() => proposa(S, { seed: Date.now() }), { noRender: true });
    UI.proposta = true; toast('Tribunals recalculats.');
    if (location.hash === '#tribunals') ruta(); else location.hash = 'tribunals';
    return;
  }
  if (b.dataset.assist) { const tr = trib(S, b.dataset.assist), k = b.dataset.k; return muta(() => { tr.tutorsFora = [...new Set([...(tr.tutorsFora || []), k])]; tr.bloq = true; }); }
  if (b.dataset.membre) { const tr = trib(S, b.dataset.membre), k = b.dataset.k; return muta(() => { tr.tutorsFora = (tr.tutorsFora || []).filter(x => x !== k); tr.bloq = true; }); }
});
document.addEventListener('change', e => {
  const el = e.target, M = () => (S.config.model = S.config.model || {});
  if (el.id === 'cf-membres') { const v = parseInt(el.value, 10); if (v >= 2 && v <= 8) muta(() => { M().membres = v; }); return; }
  if (el.id === 'cf-k') return muta(() => { M().maxTutors = el.value === '' ? null : +el.value; if (el.value !== '' && !M().reciprocitat) M().reciprocitat = 'evita'; });
  if (el.id === 'cf-rec') return muta(() => { M().reciprocitat = el.value; });
  if (el.id === 'cf-maxtrib') { const v = parseInt(el.value, 10); return muta(() => { M().maxTrib = v > 0 ? v : 0; }); }
  if (el.id === 'cf-vota') return muta(() => { M().tutorVota = el.checked; });
});
