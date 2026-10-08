// `npm start`: runs the app in dev mode (electron .), with the Electron download cache on D:.
import { spawn } from 'node:child_process';
import { bureau, cheminElectron, envCaches } from './caches.mjs';

const enfant = spawn(await cheminElectron(), ['.', ...process.argv.slice(2)], { cwd: bureau, stdio: 'inherit', env: envCaches() });
enfant.on('exit', (code) => process.exit(code ?? 0));
