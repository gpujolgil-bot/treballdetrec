import json
css = open('src/style.css', encoding='utf-8').read()
js = '\n'.join(open(f, encoding='utf-8').read() for f in ['src/core.js', 'src/sheets.js', 'src/ui_body.js', 'src/dades.js', 'src/boot_sheets.js'])
js = js.replace("if (typeof module !== 'undefined' && module.exports) module.exports", "if (false) module.exports")
assert '</script' not in js.lower()
buit = json.dumps({"treballs": [], "teachers": {}, "tribunals": [], "config": {}})
html = f'''<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tribunals del Treball de Recerca</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style id="app-css">{css}</style>
</head>
<body>
<div id="app"></div>
<script id="estat" type="application/json">{buit}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>
<script id="app-js">{js}</script>
</body>
</html>
'''
open('index.html', 'w', encoding='utf-8').write(html)
print(len(html))
