import { useEffect, useRef } from 'react';
import { Brand } from '../layout/brand.js';
import { LabelledInput } from '../ui/labelled-input.js';

export type Credentials = { name: string; email: string; password: string; token: string };
export function AuthScreen({
  setup,
  enabled,
  busy,
  notice,
  onSubmit,
}: {
  setup: boolean;
  enabled: boolean;
  busy: boolean;
  notice: string;
  onSubmit: (credentials: Credentials, clearSecrets: () => void) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  return (
    <main id="main" className="auth-page">
      <div className="auth-wrap">
        <Brand />
        <section className="card auth-card">
          <h1>{setup ? 'Set up Sedna' : 'Sign in'}</h1>
          <p className="muted">
            {setup
              ? `Create the admin account for ${location.host}.`
              : `Sign in to edit content on ${location.host}.`}
          </p>
          <div
            id="notice"
            className="notice error"
            role="status"
            aria-live="polite"
            hidden={!notice}
          >
            {notice}
          </div>
          {setup && !enabled ? (
            <p className="setup-off">
              Account setup is turned off. Ask your developer to set SEDNA_SETUP_TOKEN, then reload
              this page.
            </p>
          ) : (
            <form
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const read = (key: string) => String(data.get(key) ?? '');
                const element = event.currentTarget;
                onSubmit(
                  {
                    name: read('name'),
                    email: read('email'),
                    password: read('password'),
                    token: read('setup-token'),
                  },
                  () => {
                    for (const name of ['password', 'setup-token']) {
                      const input = element.elements.namedItem(name);
                      if (input instanceof HTMLInputElement) input.value = '';
                    }
                  },
                );
              }}
            >
              {setup && (
                <LabelledInput
                  id="name"
                  name="name"
                  label="Name"
                  type="text"
                  autoComplete="name"
                  maxLength={200}
                  required
                  disabled={busy}
                />
              )}
              <LabelledInput
                id="email"
                name="email"
                label="Email address"
                type="email"
                autoComplete="username"
                required
                disabled={busy}
              />
              <LabelledInput
                id="password"
                name="password"
                label="Password"
                type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={setup ? 12 : 1}
                maxLength={128}
                required
                disabled={busy}
                hint={setup ? 'Use 12 to 128 characters.' : undefined}
              />
              {setup && (
                <LabelledInput
                  id="setup-token"
                  name="setup-token"
                  label="Setup token"
                  type="password"
                  autoComplete="off"
                  minLength={32}
                  required
                  disabled={busy}
                  hint="Ask your developer for the SEDNA_SETUP_TOKEN value."
                />
              )}
              <button type="submit" className="primary" disabled={busy}>
                {setup ? 'Create admin account' : 'Sign in'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
