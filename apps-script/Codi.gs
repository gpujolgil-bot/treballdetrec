/**
 * Tribunals del Treball de Recerca: backend sobre Google Sheets.
 *
 * Aquest codi va lligat al Google Sheets (Extensions > Apps Script).
 * - Desa i llegeix les dades dels fulls Alumnes, Professorat, Tribunals, Config i Enviaments.
 * - Envia els correus (o crea esborranys) des del compte que implementa l'aplicació web.
 * - Serveix la mateixa web (fitxer index.html del projecte d'Apps Script).
 *
 * Instal·lació: vegeu el README del repositori.
 */

const FULLS = {
  Alumnes: ['ID', 'Cognoms', 'Nom', 'Grup', 'Títol', 'Àmbit', 'Tutor/a', 'Cotutor/a', 'Estat', 'Tribunal', 'Descripció', 'Nota'],
  Professorat: ['Nom', 'Departament', 'Correu', 'Disponible', 'Cap de departament', 'Observacions'],
  Tribunals: ['Tribunal', 'Data', 'Hora', 'Aula', 'Bloquejat', 'Membres afegits', 'Membres (automàtic)', 'Alumnes (automàtic)'],
  Config: ['Clau', 'Valor'],
  Enviaments: ['Professor/a', 'Correu', 'Tipus', 'Data', 'Tribunals', 'Empremta']
};
const DEPARTAMENTS = ['Administratiu', 'Castellà', 'Català', 'Educació Física', 'Experimentals', 'Expressió', 'FOL', 'Idiomes', 'Informàtica', 'Matemàtiques', 'Orientació', 'PQPI', 'Sanitàries', 'Socials', 'Tecnologia'];

/* ---------- Web ---------- */

function doGet(e) {
  if (e && e.parameter && e.parameter.api) {
    return resposta_(api_(e.parameter.api, e.parameter.clau, {}));
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Tribunals del Treball de Recerca')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* Accés des de GitHub Pages (només si l'aplicació web és accessible per a "Qualsevol"). */
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return resposta_({ ok: false, error: 'Petició no vàlida' }); }
  return resposta_(api_(req.accio, req.clau, req));
}

function api_(accio, clau, req) {
  try {
    if (accio === 'llegeix') return llegeix(clau);
    if (accio === 'desa') return desa(req.fulls, req.versio, clau);
    if (accio === 'correu') return correu(req.missatge, req.esborrany, clau);
    return { ok: false, error: 'Acció desconeguda' };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Dades ---------- */

/* Totes les funcions públiques demanen la clau, tant si es criden des de la web
   servida per Apps Script (google.script.run) com des de GitHub Pages. Així les dades
   queden protegides encara que l'aplicació web sigui accessible per a "Qualsevol". */
function clauBona_(clau) {
  const bona = PropertiesService.getScriptProperties().getProperty('CLAU_API');
  return !!bona && clau === bona;
}

function versio_() {
  return PropertiesService.getDocumentProperties().getProperty('VERSIO') || 'inicial';
}
function novaVersio_() {
  const v = new Date().toISOString();
  PropertiesService.getDocumentProperties().setProperty('VERSIO', v);
  return v;
}

/** Retorna el contingut dels fulls com a text, tal com es veu al Sheets. */
function llegeix(clau) {
  if (!clauBona_(clau)) return { ok: false, error: 'clau' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fulls = {};
  Object.keys(FULLS).forEach(function (nom) {
    const sh = ss.getSheetByName(nom);
    if (!sh || sh.getLastRow() === 0) { fulls[nom] = [FULLS[nom]]; return; }
    fulls[nom] = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), FULLS[nom].length)).getDisplayValues();
  });
  let quota = null;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { }
  return { ok: true, fulls: fulls, versio: versio_(), quota: quota, compte: Session.getEffectiveUser().getEmail() };
}

/**
 * Desa tots els fulls. Si versioBase no coincideix amb la versió actual
 * (algú ha editat el full o ha desat des d'una altra pantalla), retorna conflicte.
 * versioBase = null força l'escriptura.
 */
function desa(fulls, versioBase, clau) {
  if (!clauBona_(clau)) return { ok: false, error: 'clau' };
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    if (versioBase && versioBase !== versio_()) return { ok: false, error: 'conflicte', versio: versio_() };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(FULLS).forEach(function (nom) {
      const files = fulls && fulls[nom];
      if (!files || !files.length) return;
      const sh = full_(ss, nom);
      const amplada = files.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
      const norm = files.map(function (r) { const c = r.slice(); while (c.length < amplada) c.push(''); return c; });
      if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, Math.max(sh.getMaxColumns(), amplada)).clearContent();
      sh.getRange(1, 1, norm.length, amplada).setNumberFormat('@').setValues(norm);
    });
    SpreadsheetApp.flush();
    return { ok: true, versio: novaVersio_() };
  } finally {
    lock.releaseLock();
  }
}

/** Envia un correu o en crea l'esborrany des del compte que executa l'aplicació. */
function correu(m, esborrany, clau) {
  if (!clauBona_(clau)) return { ok: false, error: 'clau' };
  if (!m || !m.to || !m.to.length) return { ok: false, error: 'Falta el destinatari' };
  const opts = { htmlBody: m.html };
  if (m.remitent) opts.name = m.remitent;
  if (m.cc && m.cc.length) opts.cc = m.cc.join(',');
  if (m.adjunts && m.adjunts.length) {
    opts.attachments = m.adjunts.map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.b64), a.tipus || 'application/pdf', a.nom);
    });
  }
  if (esborrany) GmailApp.createDraft(m.to.join(','), m.assumpte, m.text, opts);
  else GmailApp.sendEmail(m.to.join(','), m.assumpte, m.text, opts);
  let quota = null;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { }
  return { ok: true, quota: quota };
}

/* ---------- Configuració del full ---------- */

function full_(ss, nom) {
  let sh = ss.getSheetByName(nom);
  if (!sh) sh = ss.insertSheet(nom);
  return sh;
}

/** Crea els fulls que faltin, posa capçaleres, validacions i genera la clau de l'API. */
function configura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(FULLS).forEach(function (nom) {
    const sh = full_(ss, nom);
    const cap = FULLS[nom];
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, cap.length).setValues([cap]);
    sh.getRange(1, 1, 1, cap.length).setFontWeight('bold').setBackground('#17695a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), cap.length).setNumberFormat('@');
  });
  const regla = function (valors) { return SpreadsheetApp.newDataValidation().requireValueInList(valors, true).setAllowInvalid(true).build(); };
  const al = ss.getSheetByName('Alumnes');
  al.getRange(2, 9, al.getMaxRows() - 1, 1).setDataValidation(regla(['Necessita tribunal', 'Ja té el TR fet', 'Baixa']));
  al.getRange(2, 6, al.getMaxRows() - 1, 1).setDataValidation(regla(DEPARTAMENTS));
  const pr = ss.getSheetByName('Professorat');
  pr.getRange(2, 4, pr.getMaxRows() - 1, 1).setDataValidation(regla(['Sí', 'No']));
  const tr = ss.getSheetByName('Tribunals');
  tr.getRange(2, 5, tr.getMaxRows() - 1, 1).setDataValidation(regla(['Sí', '']));
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLAU_API')) props.setProperty('CLAU_API', Utilities.getUuid().replace(/-/g, ''));
  novaVersio_();
  SpreadsheetApp.getUi().alert('Fulls preparats.\n\nClau d\'accés (la demana l\'eina la primera vegada que l\'obres en un navegador):\n' + props.getProperty('CLAU_API'));
}

function mostraClau() {
  const clau = PropertiesService.getScriptProperties().getProperty('CLAU_API') || '(encara no n\'hi ha: executa «Configura els fulls»)';
  SpreadsheetApp.getUi().alert('Clau d\'accés:\n' + clau);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tribunals TREC')
    .addItem('Configura els fulls', 'configura')
    .addItem('Mostra la clau d\'accés', 'mostraClau')
    .addToUi();
}

/* Qualsevol edició a mà del full canvia la versió, perquè la web no la trepitgi sense avisar. */
function onEdit(e) {
  novaVersio_();
}
