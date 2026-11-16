# Aula

**Probar:** https://javieragradanokrasimirova-ai.github.io/aula/ (con el modo demo no hace falta cuenta)

Una web para guardar lo de clase: **audios, fotos y apuntes** organizados por asignatura y fecha, tu **horario** con lo que toca ahora, y tus **entregas y exámenes** (también los de Moodle). Incluye un pequeño asistente (un dinosaurio) que entiende frases como «descárgame las clases del 27 de octubre» o «¿qué tengo mañana?». Funciona con reglas, sin inteligencia artificial.

## Dónde se guardan tus datos

- **En tu propio Google Drive**, en una carpeta «Aula»: `aula.json` (tus ajustes, clases y eventos) y `Archivos/` (lo que subes).
- Aula pide el permiso **`drive.file`**: solo puede ver lo que ella misma crea, no el resto de tu Drive.
- **No hay servidor de Aula.** La web es estática (GitHub Pages) y habla directamente con Google desde tu navegador.
- Sin cuenta también se puede probar: el **modo demo** guarda todo solo en ese navegador.

## Cómo funciona por dentro

| Archivo | Qué hace |
|---|---|
| `src/doc.ts` | Las operaciones sobre `aula.json` (clases, archivos, calendario, ajustes), como funciones puras |
| `src/store.ts` | El almacén: aplica los cambios de uno en uno sobre lo último guardado |
| `src/drive.ts` | Google Drive: inicio de sesión (Google Identity Services), lectura y escritura de `aula.json` y subidas reanudables |
| `src/demo.ts` | Modo demo (IndexedDB) |
| `public/aula-sw.js` | Service worker: sirve tus archivos (con permiso de Drive o desde el navegador) y arma ZIP en streaming |
| `src/import.ts` | Importa el ZIP de «Exportar todo» |
| `src/archive.tsx`, `calendar.tsx`, `schedule.tsx`, `settings-view.tsx`… | La interfaz |
| `src/assistant.ts` | El asistente (reglas) |

## Desarrollo

```sh
npm install
npm run dev        # http://127.0.0.1:5174
npm test           # pruebas del núcleo y del asistente
node tests/test-browser.mjs   # con «npm run dev» en marcha: service worker en Edge sin ventana
npm run build
```

Para entrar con Google en local hace falta un ID de cliente OAuth propio (Google Cloud Console, tipo «Aplicación web», con `http://localhost:5174` y `http://127.0.0.1:5174` como orígenes autorizados). Se pasa así: `VITE_GOOGLE_CLIENT_ID=… npm run dev`.

## Publicar

Cada `push` a `main` publica la web en GitHub Pages (`.github/workflows/pages.yml`). El ID de cliente de Google se guarda como variable del repositorio `VITE_GOOGLE_CLIENT_ID`.

## Moodle

Sin servidor, la web no puede leer Moodle directamente. Se exporta el calendario (`.ics`) desde Moodle y se importa en **Calendario → Trae tu calendario de Moodle**. Lo que marques (importancia, hechas) se conserva al volver a importarlo.

## Licencia

[MIT](LICENSE): puedes usar, copiar, modificar y compartir Aula libremente, manteniendo el aviso de autoría.
