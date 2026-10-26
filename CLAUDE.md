# Agent instructions

Read `docs/SPEC.md` before doing anything. It is the source of truth for scope and decisions.

## How to work
- Work on **one build-order step at a time**. When its check passes, stop and summarize what you did and how you verified it. Do not start the next step until told.
- Do not add features listed under "Out of scope for v1".
- If the spec is unclear or something in it turns out not to work (for example an Astro API behaves differently), stop and explain the problem with options. Do not silently change a decision.
- Prefer small, readable code over abstractions. No new dependencies without saying why.
- Test changes in `playground/`, not by publishing to npm. Restart the dev server after changing integration hooks.
- Never commit secrets. Env vars go in `.env`, which is gitignored.
