/**
 * `npm run dev`: API del bot (:8080, sin torneo salvo que .env diga otra cosa) + Vite (:5173) con
 * recarga en caliente. Ctrl+C detiene los dos.
 */
import { type ChildProcess, spawn } from 'node:child_process';

const processes: ChildProcess[] = [
  spawn('npm', ['run', 'bot'], {
    stdio: 'inherit',
    env: { ...process.env, ARBITRO_ENABLED: process.env.ARBITRO_ENABLED ?? 'false' },
  }),
  spawn('npm', ['run', 'web'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of processes) child.kill('SIGINT');
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
for (const child of processes) {
  child.once('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
console.log('API en http://127.0.0.1:8080 · app en http://localhost:5173 (Ctrl+C para salir)');
