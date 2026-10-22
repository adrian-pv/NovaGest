# Capturas del manual

Imágenes del frontend real ejecutado en Edge sin ventana, con respuestas de API simuladas y datos ficticios. No son capturas del entorno desplegado ni prueba de las reglas del backend.

El script `../generar-capturas.mjs` abre nueve pantallas, comprueba que no haya errores de JavaScript ni avisos inesperados y guarda los PNG. Los identificadores y montos son datos de ejemplo; no contienen credenciales, tokens reales ni información de usuarios.

Para reproducirlas en Windows:

1. Desde `frontend/`, ejecutar `npm ci` y `npm run dev -- --host 127.0.0.1` (usar `npm.cmd` en PowerShell si corresponde).
2. En otra terminal, desde la raíz del repositorio:

```powershell
$herramientasManual = Join-Path $env:TEMP 'novagest-capturas-tools'
npm.cmd install --prefix $herramientasManual playwright --no-audit --no-fund
$env:PLAYWRIGHT_MODULE = Join-Path $herramientasManual 'node_modules/playwright/index.mjs'
node docs/manual/generar-capturas.mjs
```

El script usa Edge en su ubicación habitual de Windows. Para otro navegador Chromium instalado, definir `MANUAL_BROWSER` con la ruta del ejecutable. `MANUAL_BASE_URL` permite otro puerto local; solo admite localhost o 127.0.0.1.

Las dependencias se instalan en una carpeta temporal y no se agregan al frontend. Las imágenes se regeneran sin retocarlas; el manual explica su alcance.
