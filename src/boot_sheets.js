/* ===== Mode Google Sheets: Apps Script (google.script.run) o GitHub Pages (fetch amb clau) ===== */
const CFG_KEY = 'trec-tribunals-connexio';
let CFG_MEM = null; // per si el navegador no deixa guardar res (mode privat, iframe restringit)
function llegeixCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || CFG_MEM; } catch (e) { return CFG_MEM; } }
function desaCfg(c) { CFG_MEM = c; try { c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY); } catch (e) { } }
const esAppsScript = () => typeof google !== 'undefined' && google.script && google.script.run;

function api(accio, ...args) {
  const cfg = llegeixCfg();
  if (!cfg || !cfg.clau) return Promise.reject({ code: 'sense_connexio', message: 'Falta la clau d\'accés' });
  if (MODE === 'apps') {
    const n = { llegeix: 0, desa: 2, correu: 2 }[accio];
    const a = args.slice(); while (a.length < n) a.push(null); a.push(cfg.clau);
    return new Promise((res, rej) => {
      google.script.run.withSuccessHandler(res).withFailureHandler(e => rej({ code: 'tool_error', message: String((e && e.message) || e) }))[accio](...a);
    });
  }
  const cos = { accio, clau: cfg.clau };
  if (accio === 'desa') { cos.fulls = args[0]; cos.versio = args[1]; }
  if (accio === 'correu') { cos.missatge = args[0]; cos.esborrany = args[1]; }
  return fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cos), redirect: 'follow' })
    .then(r => r.json())
    .catch(e => { throw { code: 'xarxa', message: 'No s\'ha pogut contactar amb el Google Sheets. Revisa l\'URL i que l\'aplicació web sigui accessible.' }; });
}

function aplicaLectura(r) {
  S = estatDesDeFulls(r.fulls);
  S.savedAt = r.versio || null;
  normalitza();
  BASE_NORM = JSON.stringify(S);
  UI.compte = r.compte || UI.compte; if (r.quota != null) UI.quota = r.quota;
  UI.undo = []; UI.dirty = false; UI.proposta = false;
  if (!S.tribunals.length && S.treballs.some(preparat)) { proposa(S, { seed: 2026 }); UI.proposta = true; UI.dirty = true; }
}

async function carrega() {
  $('#main').innerHTML = '<div class="wrap"><div class="buit-txt">Llegint el Google Sheets…</div></div>';
  try {
    const r = await api('llegeix');
    if (!r || !r.ok) throw { code: r && r.error === 'clau' ? 'clau' : 'tool_error', message: r ? r.error : 'Resposta buida' };
    aplicaLectura(r);
    UI.esborrany = llegeixEsborrany();
    ruta();
  } catch (e) {
    if (e.code === 'clau' || e.code === 'sense_connexio' || (MODE === 'web' && e.code === 'xarxa')) return pantallaConnexio(e.code === 'clau' ? 'La clau no és correcta.' : e.code === 'xarxa' ? e.message : '');
    $('#cap').innerHTML = ''; $('#main').innerHTML = `<div class="wrap"><div class="panell"><h2>No s'ha pogut llegir el full</h2><p>${esc(e.message || e)}</p><div class="row"><button class="btn pri" id="b-reintenta">Torna-ho a provar</button></div></div></div>`;
  }
}

function pantallaConnexio(error) {
  const c = llegeixCfg() || {};
  $('#cap').innerHTML = `<header class="top"><div class="wrap"><div class="titol"><h1>Tribunals del Treball de Recerca</h1><div class="sub">Connecta l'eina amb el Google Sheets del centre</div></div></div></header>`;
  $('#main').innerHTML = `<div class="wrap" style="margin-top:20px"><div class="panell" style="max-width:640px">
    <h2>Connexió amb el Google Sheets</h2>
    <p>${MODE === 'web' ? 'Enganxa l\'URL de l\'aplicació web d\'Apps Script (acaba en <code>/exec</code>) i la' : 'Escriu la'} clau que surt al menú <b>Tribunals TREC › Mostra la clau d'accés</b> del Google Sheets. Es guarda només en aquest navegador.</p>
    ${error ? `<div class="banner warn"><span>${esc(error)}</span></div>` : ''}
    ${MODE === 'web' ? `<label class="field">URL de l'aplicació web<input id="cx-url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>` : ''}
    <label class="field">Clau d'accés<input id="cx-clau" value="${esc(c.clau || '')}" type="password" autocomplete="off"></label>
    <div class="row"><button class="btn pri" id="cx-connecta">Connecta</button></div>
  </div></div>`;
}

async function desa(forca) {
  const btn = $('#b-desa'); if (btn) { btn.disabled = true; btn.textContent = 'Desant…'; }
  try {
    const r = await api('desa', fullsDesDeEstat(S), forca ? null : S.savedAt);
    if (r && r.ok) {
      S.savedAt = r.versio; UI.dirty = false; BASE_NORM = JSON.stringify(S); esborraEsborrany(); renderCap();
      toast('Desat al Google Sheets.');
      return;
    }
    if (r && r.error === 'conflicte') {
      renderCap();
      const q = await dialeg('El full ha canviat', 'Algú ha editat el Google Sheets o ha desat des d\'una altra pantalla després que l\'obrissis. Pots recarregar-lo (perds els canvis d\'aquí) o sobreescriure\'l amb la teva versió.',
        [{ txt: 'Cancel·la', v: null }, { txt: 'Recarrega el full', v: 'r' }, { txt: 'Sobreescriu', v: 'w', pri: true }]);
      if (q === 'w') return desa(true);
      if (q === 'r') { esborraEsborrany(); return carrega(); }
      return;
    }
    throw { message: r ? r.error : 'Resposta buida' };
  } catch (e) {
    desaEsborrany(); renderCap();
    toast('No s\'ha pogut desar: ' + (e.message || e) + '. Els canvis es queden en aquest navegador.');
  }
}

/* Adaptadors perquè la resta de l'eina funcioni igual que a claude.ai */
function activaAdaptadors() {
  downloadsCap = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.html$/.test(filename) ? 'text/html' : /\.json$/.test(filename) ? 'application/json' : 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return { status: 'saved' };
    }
  };
  mcpCap = {
    callTool: async (server, tool, input) => {
      const m = { to: input.to, cc: input.cc || [], assumpte: input.subject, html: input.htmlBody, text: input.body,
        adjunts: (input.attachments || []).map(a => ({ nom: a.filename, b64: a.content, tipus: a.mimeType })) };
      let r;
      try { r = await api('correu', m, tool === 'create_draft'); }
      catch (e) { throw { code: e.code === 'xarxa' ? 'server_unavailable' : 'tool_error', message: e.message }; }
      if (!r || !r.ok) throw { code: 'tool_error', message: (r && r.error) || 'Error desconegut' };
      if (r.quota != null) UI.quota = r.quota;
      return { payload: r };
    }
  };
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'b-recarrega') {
    if (UI.dirty) {
      const ok = await dialeg('Recarregar el full', 'Tens canvis sense desar. Si recarregues, es perdran.', [{ txt: 'Cancel·la', v: false }, { txt: 'Recarrega', v: true, pri: true }]);
      if (!ok) return;
    }
    esborraEsborrany(); return carrega();
  }
  if (b.id === 'b-reintenta') return carrega();
  if (b.id === 'cx-connecta') {
    const url = MODE === 'web' ? $('#cx-url').value.trim() : '', clau = $('#cx-clau').value.trim();
    if (!clau) return pantallaConnexio('Escriu la clau.');
    if (MODE === 'web' && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return pantallaConnexio('L\'URL ha de ser la de l\'aplicació web d\'Apps Script (script.google.com/…/exec).');
    desaCfg({ url, clau }); return carrega();
  }
  if (b.id === 'cx-desconnecta') { desaCfg(null); return pantallaConnexio(''); }
});

/* ---- Arrencada ---- */
$('#app').innerHTML = '<div id="cap"></div><main id="main"></main>';
MODE = esAppsScript() ? 'apps' : 'web';
activaAdaptadors();
artifactCap = null;
if (!llegeixCfg()) pantallaConnexio('');
else carrega();
