/**
 * Build para Vercel con la Build Output API v3 (https://vercel.com/docs/build-output-api):
 * 1. compila la app web (apps/web/dist) y la copia como estáticos;
 * 2. empaqueta la API de la app (apps/bot/src/vercel/handler.ts) en una sola función de Node;
 * 3. escribe las rutas: /api/* → función; el resto, estáticos con fallback a index.html.
 *
 * Uso: `npm run build:vercel` (Vercel lo corre solo, ver vercel.json).
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'rolldown';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api', 'index.func');

/** La misma CSP que helmet pone a la API (apps/bot/src/http/security.ts), ahora también en la web. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

rmSync(out, { recursive: true, force: true });

console.log('1/3 app web');
execSync('npm run build', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'apps', 'web', 'dist'), join(out, 'static'), { recursive: true });

console.log('2/3 función de la API');
mkdirSync(fn, { recursive: true });
await build({
  input: join(root, 'apps', 'bot', 'src', 'vercel', 'handler.ts'),
  platform: 'node',
  logLevel: 'warn',
  // Con platform: 'node', rolldown resuelve los `require` de las dependencias CommonJS (fastify).
  output: { file: join(fn, 'index.mjs'), format: 'esm' },
});
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // La búsqueda corta a THINK_HARD_MS (1.8 s); el margen cubre el arranque en frío.
      maxDuration: 10,
    },
    null,
    2,
  ),
);

console.log('3/3 rutas');
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '/(.*)',
          headers: {
            'Content-Security-Policy': CSP,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          },
          continue: true,
        },
        { src: '^/api/(.*)$', dest: '/api/index' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Listo: ${out}`);
