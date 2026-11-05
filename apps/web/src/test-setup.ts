/**
 * Configuración de las pruebas de la web. Un `console.error` hace fallar la prueba en la que ocurre:
 * "0 errores en consola" es un criterio de la rúbrica (PLAN_FRONTEND.md §1).
 */
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

let errors: string[] = [];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (errors.length > 0) {
    throw new Error(`console.error durante la prueba:\n${errors.join('\n')}`);
  }
});
