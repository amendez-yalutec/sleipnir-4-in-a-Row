/**
 * Reporter de evidencias: al terminar cada corrida escribe `resumen.md` en su carpeta y agrega una
 * línea a evidencias/e2e/INDICE.md, para encontrar cualquier corrida por fecha, hora y modo.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { EVIDENCE_ROOT, currentRun } from './run.ts';

const ICON: Record<TestResult['status'], string> = {
  passed: '✅',
  failed: '❌',
  timedOut: '⏱️',
  skipped: '⏭️',
  interrupted: '⛔',
};

function git(command: string): string {
  try {
    return execSync(`git ${command}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '—';
  }
}

export default class EvidenceReporter implements Reporter {
  private readonly run = currentRun();
  private readonly started = new Date();
  private readonly rows: string[] = [];
  private readonly counts: Record<TestResult['status'], number> = {
    passed: 0,
    failed: 0,
    timedOut: 0,
    skipped: 0,
    interrupted: 0,
  };

  onTestEnd(test: TestCase, result: TestResult): void {
    // Con reintentos, cuenta solo el último intento de cada prueba.
    if (result.retry < test.retries && result.status !== 'passed' && result.status !== 'skipped') {
      return;
    }
    this.counts[result.status]++;
    const project = test.parent.project()?.name ?? '—';
    const shots = result.attachments.filter((a) => a.contentType === 'image/png').length;
    const seconds = (result.duration / 1000).toFixed(1);
    this.rows.push(
      `| ${ICON[result.status]} | ${project} | ${test.title} | ${seconds} s | ${shots} |`,
    );
  }

  onEnd(result: FullResult): void {
    mkdirSync(this.run.dir, { recursive: true });
    const total = Object.values(this.counts).reduce((a, b) => a + b, 0);
    const fallas = this.counts.failed + this.counts.timedOut + this.counts.interrupted;
    const estado = result.status === 'passed' ? '✅ en verde' : `❌ ${fallas} con falla`;
    const duracion = ((Date.now() - this.started.getTime()) / 1000).toFixed(0);
    const commit = `${git('rev-parse --abbrev-ref HEAD')} @ ${git('rev-parse --short HEAD')}`;

    writeFileSync(
      join(this.run.dir, 'resumen.md'),
      [
        `# Corrida E2E ${this.run.id}`,
        '',
        '| Dato | Valor |',
        '|---|---|',
        `| Fecha y hora | ${this.started.toLocaleString('es-GT')} |`,
        `| Modo | ${this.run.mode === 'demora' ? 'con pausas (navegador visible)' : 'automático'} |`,
        `| Rama y commit | ${commit} |`,
        `| Resultado | ${estado}: ${this.counts.passed} de ${total} pasaron |`,
        `| Duración | ${duracion} s |`,
        '',
        '## Pruebas',
        '',
        '| | Dispositivo | Prueba | Tiempo | Capturas |',
        '|---|---|---|---|---|',
        ...this.rows.sort(),
        '',
        '## Dónde está cada cosa',
        '',
        '- `capturas/<dispositivo>/<prueba>/NN-paso.png`: la evidencia paso a paso.',
        '- `reporte/index.html`: reporte de Playwright (`npx playwright show-report <carpeta>/reporte`).',
        '- `resultados/`: videos y trazas (en modo demora, video de cada prueba).',
        '',
      ].join('\n'),
    );

    const index = join(EVIDENCE_ROOT, 'INDICE.md');
    if (!existsSync(index)) {
      writeFileSync(
        index,
        '# Corridas E2E\n\n| Corrida | Modo | Resultado | Commit | Carpeta |\n|---|---|---|---|---|\n',
      );
    }
    const folder = relative(EVIDENCE_ROOT, this.run.dir);
    appendFileSync(
      index,
      `| ${this.run.id} | ${this.run.mode} | ${estado} (${this.counts.passed}/${total}) | ${commit} | [${folder}](${folder}/resumen.md) |\n`,
    );
    console.log(`\nEvidencias: ${this.run.dir}/resumen.md`);
  }
}
