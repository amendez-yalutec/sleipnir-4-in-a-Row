// Imprime en Markdown el resumen de cobertura de Vitest, para el resumen del job de CI.
import { existsSync, readFileSync } from 'node:fs';

const SUMMARY = 'coverage/coverage-summary.json';

if (!existsSync(SUMMARY)) {
  console.log('## Cobertura\n\nNo hay reporte de cobertura (¿fallaron las pruebas?).');
  process.exit(0);
}

const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
const root = `${process.cwd()}/`;
const pct = (metric) => (typeof metric.pct === 'number' ? `${metric.pct.toFixed(1)} %` : '—');
const row = (name, m) =>
  `| ${name} | ${pct(m.lines)} | ${pct(m.branches)} | ${pct(m.functions)} | ${pct(m.statements)} |`;

const lines = [
  '## Cobertura',
  '',
  '| Archivo | Líneas | Ramas | Funciones | Sentencias |',
  '|---|---|---|---|---|',
  row('**Total**', summary.total),
  ...Object.entries(summary)
    .filter(([file, metrics]) => file !== 'total' && metrics.lines.total > 0)
    .map(([file, metrics]) => row(file.replace(root, ''), metrics)),
];
console.log(lines.join('\n'));
