/** Formulario de conexión al árbitro: URL, team ID y token del equipo (panel "Mi equipo"). */
import { type FormEvent, useState } from 'react';
import { type ArbiterConfig, type ConfigErrors, validateConfig } from '../arbiter/config.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Field } from '../ui/field.tsx';

export interface ArbiterSettingsProps {
  readonly config: ArbiterConfig;
  readonly onSave: (config: ArbiterConfig) => void;
}

export function ArbiterSettings({ config, onSave }: ArbiterSettingsProps) {
  const [draft, setDraft] = useState(config);
  const [errors, setErrors] = useState<ConfigErrors>({});
  const set = (field: keyof ArbiterConfig) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateConfig(draft);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setDraft(result.config);
    onSave(result.config);
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-xl font-semibold">Conexión al árbitro</h2>
        <p className="text-sm text-muted">
          El token se guarda solo en esta pestaña y se borra al cerrarla. Va únicamente al árbitro.
        </p>
      </div>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field
          label="URL del árbitro"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://arbitro…"
          value={draft.url}
          onChange={set('url')}
          error={errors.url}
        />
        <Field
          label="Team ID"
          autoComplete="off"
          placeholder="eq6"
          hint="El id público del equipo en el árbitro; filtra las partidas."
          value={draft.teamId}
          onChange={set('teamId')}
          error={errors.teamId}
        />
        <Field
          label="Token del equipo"
          type="password"
          autoComplete="off"
          hint="Necesario para ver la posición, crear prácticas y registrar la entrega."
          value={draft.token}
          onChange={set('token')}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="flex-1">
            Guardar y probar
          </Button>
          {config.token && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setDraft((current) => ({ ...current, token: '' }));
                onSave({ ...config, token: '' });
              }}
            >
              Olvidar token
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
