import { AsyncLocalStorage } from 'node:async_hooks';

type Scope = { cleanups: (() => Promise<void>)[] };
const requests = new AsyncLocalStorage<Scope>();

/** Node servers reuse resources; Workers must keep database I/O within one request. */
export function runtimeResource<T>(create: () => T): () => T {
  let shared: T | undefined;
  const scoped = new WeakMap<Scope, T>();
  return () => {
    const scope = requests.getStore();
    if (!scope) {
      shared ??= create();
      return shared;
    }
    let value = scoped.get(scope);
    if (value === undefined) {
      value = create();
      scoped.set(scope, value);
    }
    return value;
  };
}

export function onRequestEnd(cleanup: () => Promise<void>) {
  requests.getStore()?.cleanups.push(cleanup);
}

export async function withRequestResources<T>(run: () => Promise<T>): Promise<T> {
  const scope: Scope = { cleanups: [] };
  return requests.run(scope, async () => {
    try {
      return await run();
    } finally {
      await Promise.all(scope.cleanups.map((cleanup) => cleanup()));
    }
  });
}
