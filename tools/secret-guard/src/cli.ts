/**
 * Hook pre-commit (lo llama `.husky/pre-commit`): bloquea el commit si se intenta subir un archivo
 * `.env` o el valor real de `TEAM_TOKEN`. Corre directo con Node (≥ 22.18 ejecuta TypeScript).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLeaks, parseEnv } from './find-leaks.ts';

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const root = git(['rev-parse', '--show-toplevel']).trim();
const envPath = join(root, '.env');
const token = existsSync(envPath)
  ? parseEnv(readFileSync(envPath, 'utf8')).TEAM_TOKEN
  : process.env.TEAM_TOKEN;

const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  .split('\n')
  .filter((file) => file !== '');
const diff = git(['diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff']);

const leaks = findLeaks({ files, diff, token });
if (leaks.length > 0) {
  console.error('\n✋ Commit bloqueado por la guardia de secretos:\n');
  for (const leak of leaks) console.error(`  • ${leak.file}: ${leak.reason}`);
  console.error(
    '\nSaca esos cambios del stage (git restore --staged <archivo>) y vuelve a intentar.\n',
  );
  process.exit(1);
}
