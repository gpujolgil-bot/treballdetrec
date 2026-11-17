# Tribunals del Treball de Recerca

Eina per organitzar els tribunals del TREC de Batxillerat:

- Agrupa els treballs en **tribunals de 4**. Cada tribunal el formen els **4 tutors** dels treballs que hi presenten, i s'agrupen per **àmbits afins** (mateix departament o departaments afins).
- Permet moure alumnes, bloquejar tribunals, afegir membres, posar data, hora i aula, i detecta incidències (membres no afins, solapaments horaris, tribunals incomplets…).
- Genera **informes en PDF i Excel** (fitxes de tribunal, per professor/a, per departament, incidències).
- **Envia per correu** a cada professor/a el seu tribunal, amb els alumnes, el títol de cada treball i el PDF adjunt (o en crea els esborranys a Gmail).
- Les dades viuen en un **Google Sheets** (fulls `Alumnes`, `Professorat`, `Tribunals`, `Config`, `Enviaments`) que també es pot editar a mà.

## Protecció de dades

Aquest repositori és **públic** i només conté codi. **No hi pugis mai dades d'alumnes** (noms, títols, notes). Les dades només han de viure al Google Sheets del compte del centre. El `.gitignore` ja exclou `.xlsx`, `.ods`, `.csv` i `.json`.

## Com funciona

```
Google Sheets (dades)  ←→  Apps Script (apps-script/Codi.gs)  ←→  web (index.html)
                              · llegeix i desa els fulls
                              · envia els correus amb GmailApp
                              · serveix la web
```

La web s'obre des de l'URL de l'aplicació web d'Apps Script. Opcionalment, també es pot obrir des de GitHub Pages.

Totes les crides demanen una **clau d'accés** que genera el mateix full. La web la demana la primera vegada i la guarda al navegador.

## Instal·lació (compte del centre)

1. **Codi del servidor.** Al Google Sheets: *Extensions › Apps Script*. Substitueix el contingut de `Código.gs` pel de [`apps-script/Codi.gs`](apps-script/Codi.gs).
2. **La web.** A l'editor d'Apps Script: *Archivos › + › HTML*, posa-li el nom **`index`** (sense `.html`) i enganxa-hi tot el contingut d'[`index.html`](index.html). Desa (icona del disquet).
3. **Les dades.** Al Google Sheets: *Fitxer › Importa › Penja* el fitxer Excel amb les dades inicials i tria **«Insereix fulls nous»**. Després pots esborrar el `Full 1` buit.
4. **Configura.** Recarrega el Google Sheets. Apareix el menú **Tribunals TREC › Configura els fulls**. La primera vegada et demanarà permisos: accepta'ls amb el compte del centre. En acabar, et mostra la **clau d'accés**. La pots tornar a veure amb *Tribunals TREC › Mostra la clau d'accés*.
5. **Publica-la.** A Apps Script: *Implementar › Nueva implementación › tipus Aplicación web*.
   - *Ejecutar como:* **Yo**. Els correus surten d'aquest compte.
   - *Quién tiene acceso:* **Cualquier usuario de [domini del centre]** (recomanat), o *Solo yo*.
   - Copia l'URL que acaba en `/exec`.
6. Obre aquest URL, escriu la clau i ja ho tens.

### Si canvies el codi

Torna a enganxar `index.html` i/o `Codi.gs` a Apps Script. Després fes *Implementar › Gestionar implementaciones › editar (llapis) › Versión: Nueva versión*. Així l'URL es manté.

## Ús diari

- **Desa al full** escriu tots els canvis als fulls.
- Si edites el Google Sheets a mà (per exemple, per afegir un alumne o canviar un tutor), prem **Recarrega del full**.
- Si algú ha canviat el full mentre treballaves, l'eina t'avisa i et deixa recarregar o sobreescriure.
- Si un full no té cap tribunal, l'eina en fa una proposta automàtica en carregar-se.
- **Correus:**
  - Les adreces del professorat es poden escriure a la taula, enganxar una llista o generar amb el patró del centre (`{inicial}{cognom}@…`).
  - Amb un compte de Google Workspace es poden enviar uns 1.500 correus al dia; amb Gmail personal, uns 100.

## GitHub Pages (opcional)

Només funciona si l'aplicació web té l'accés *Cualquier usuario* (la clau continua protegint les dades).

1. *Settings › Pages › Deploy from a branch › main / (root)*.
2. Obre la pàgina i enganxa-hi l'URL `/exec` i la clau.

## Desenvolupament

El codi font és a `src/`:

| Fitxer | Contingut |
|---|---|
| `core.js` | Lògica d'agrupació i incidències |
| `sheets.js` | Conversió entre fulls i dades |
| `ui_body.js` | Interfície |
| `boot_sheets.js` | Connexió amb Apps Script |
| `style.css` | Estils |

`python3 build.py` regenera `index.html`.
