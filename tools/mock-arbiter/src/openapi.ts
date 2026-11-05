/**
 * Validadores ajv construidos directamente desde `spec/arbitro-openapi.json` (JSON Schema 2020-12).
 * El mock valida con ellos lo que recibe y las pruebas de contrato, lo que responde: si el jueves
 * cambia el archivo, las pruebas muestran qué dejó de coincidir.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const SPEC_ID = 'arbitro-openapi';
export const SPEC_PATH = new URL('../../../spec/arbitro-openapi.json', import.meta.url);

const spec: unknown = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

// El documento OpenAPI trae claves que no son de JSON Schema (openapi, paths, example,
// discriminator…): strict: false las ignora; las palabras de validación se aplican igual.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormatsModule.default(ajv);
ajv.addSchema(spec as object, SPEC_ID);

const escape = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1');

function at(pointer: string): unknown {
  let node: unknown = spec;
  for (const raw of pointer.replace(/^#\//, '').split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined;
  }
  return node;
}

/** Validador del esquema en ese puntero, p. ej. `#/components/schemas/Turn`. */
export function schemaAt(pointer: string): ValidateFunction {
  // ajv resuelve el puntero dentro del documento agregado y guarda el validador compilado.
  const validate = at(pointer) === undefined ? undefined : ajv.getSchema(`${SPEC_ID}${pointer}`);
  if (!validate) throw new Error(`El OpenAPI no tiene ${pointer}`);
  return validate;
}

/** Esquema JSON de una respuesta documentada, resolviendo `$ref` a `components/responses`. */
export function responseSchema(path: string, method: string, status: number): ValidateFunction {
  let pointer = `#/paths/${escape(path)}/${method}/responses/${status}`;
  const response = at(pointer);
  if (response === undefined)
    throw new Error(`Respuesta no documentada: ${method} ${path} ${status}`);
  const ref = (response as { $ref?: unknown }).$ref;
  if (typeof ref === 'string') pointer = ref;
  return schemaAt(`${pointer}/content/${escape('application/json')}/schema`);
}

/** Ejemplos de respuesta del propio OpenAPI, para validarlos contra sus esquemas. */
export function responseExamples(path: string, method: string, status: number): unknown[] {
  const content = at(
    `#/paths/${escape(path)}/${method}/responses/${status}/content/${escape('application/json')}`,
  ) as { example?: unknown; examples?: Record<string, { value: unknown }> } | undefined;
  if (!content) return [];
  const named = Object.values(content.examples ?? {}).map((example) => example.value);
  return content.example === undefined ? named : [content.example, ...named];
}

/** Copia del documento OpenAPI, para servirlo en `/api/openapi.json`. */
export function specDocument(): Record<string, unknown> {
  return structuredClone(spec) as Record<string, unknown>;
}

export function describeErrors(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: '; ' });
}
