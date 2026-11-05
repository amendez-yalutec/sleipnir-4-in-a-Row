/** Acciones del equipo en el árbitro: crear una práctica y registrar la entrega. */
import { type FormEvent, useState } from 'react';
import type { HouseBot } from '../arbiter/client.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardTitle } from '../ui/card.tsx';
import { Field } from '../ui/field.tsx';

const REPO = /^https?:\/\/(github\.com|bitbucket\.org)\/.+/;
const COMMIT = /^[0-9a-fA-F]{7,40}$/;

const selectClass =
  'min-h-12 w-full rounded-control border border-line-strong bg-surface px-4 text-base focus-visible:ring-4 focus-visible:ring-halo focus-visible:outline-none';

export interface TeamActionsProps {
  /** El árbitro solo permite prácticas y entregas en la fase de prácticas. */
  readonly open: boolean;
  readonly onPractice: (opponent: HouseBot, first: 1 | 2) => void;
  readonly onSubmit: (repoUrl: string, commit: string) => void;
}

export function TeamActions({ open, onPractice, onSubmit }: TeamActionsProps) {
  const [opponent, setOpponent] = useState<HouseBot>('casa-basico');
  const [first, setFirst] = useState<1 | 2>(1);
  const [repo, setRepo] = useState('');
  const [commit, setCommit] = useState('');
  const [errors, setErrors] = useState<{ repo?: string; commit?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...(!REPO.test(repo.trim()) && {
        repo: 'Debe ser un repositorio de github.com o bitbucket.org.',
      }),
      ...(!COMMIT.test(commit.trim()) && { commit: 'Hash hexadecimal de 7 a 40 caracteres.' }),
    };
    setErrors(next);
    if (!next.repo && !next.commit) onSubmit(repo.trim(), commit.trim());
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-6">
        <CardTitle>Práctica contra la casa</CardTitle>
        <label className="block space-y-1 text-sm font-semibold">
          <span>Rival</span>
          <select
            className={selectClass}
            value={opponent}
            onChange={(event) => setOpponent(event.target.value as HouseBot)}
          >
            <option value="casa-basico">casa-basico (gana y bloquea)</option>
            <option value="casa-aleatorio">casa-aleatorio (al azar)</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold">
          <span>Abre la partida</span>
          <select
            className={selectClass}
            value={first}
            onChange={(event) => setFirst(event.target.value === '2' ? 2 : 1)}
          >
            <option value="1">Nuestro bot</option>
            <option value="2">La casa</option>
          </select>
        </label>
        <Button className="w-full" disabled={!open} onClick={() => onPractice(opponent, first)}>
          Crear práctica
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <CardTitle>Entrega</CardTitle>
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field
            label="URL del repositorio"
            type="url"
            placeholder="https://github.com/…"
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            error={errors.repo}
          />
          <Field
            label="Hash del commit"
            placeholder="a1b2c3d"
            autoComplete="off"
            value={commit}
            onChange={(event) => setCommit(event.target.value)}
            error={errors.commit}
          />
          <Button type="submit" className="w-full" disabled={!open}>
            Registrar entrega
          </Button>
        </form>
      </Card>
      {!open && (
        <p className="text-sm text-muted md:col-span-2">
          Las prácticas y las entregas solo están abiertas en la fase de prácticas.
        </p>
      )}
    </div>
  );
}
