// Ejecuta todas las pruebas: node tests/run-all.mjs (o npm test).
import {execFileSync} from 'node:child_process';
for(const t of ['test-core.mjs','test-assistant.mjs'])execFileSync(process.execPath,['tests/'+t],{stdio:'inherit'});
