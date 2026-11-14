import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// base './': la web funciona igual en la raíz o en una subcarpeta (p. ej. usuario.github.io/aula/).
// Tailwind (postcss.config.mjs) solo aporta la «base» (preflight): los estilos de Aula están en src/globals.css.
export default defineConfig({base:'./',plugins:[react()],server:{port:5174,strictPort:true}});
