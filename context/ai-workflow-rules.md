# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow. The `context/` files define what to build, how to build it, and the current state of progress. Always implement against these specs — do not infer or invent behavior from scratch. The project context lives in `.agents/memories/project-context.md` and the imported session notes; the architecture, schema, UI, and code standards live in `context/`. When a spec is silent on a decision, resolve it in the relevant context file before writing code.

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large speculative changes
- Do not combine unrelated system boundaries in a single implementation step
- One pipeline stage per implementation unit (e.g. "Cold Storage UI" is one unit, "Finance gate" is another)
- A feature unit must be demoable end-to-end within its scope before moving on

## When to Split Work

Split an implementation step if it combines:

- UI changes and Directus schema changes (do schema first, then UI against it)
- Multiple unrelated pipeline stages or roles
- Frontend work and n8n/Evolution API workflow work (the frontend never calls n8n directly)
- Behavior not clearly defined in the context files
- More than one Directus collection creation + its UI in the same step

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files
- If a requirement is ambiguous, resolve it in the relevant context file before implementing
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing
- Do not invent Directus collection fields — check `context/schema/target-db-schema.md` first
- Do not invent pipeline states — use the enum in `architecture.md` Invariant #4
- Do not invent roles — use the six in `architecture.md` (Owner, Admin, Warehouse, Production, Finance, Courier)

## Protected Files

Do not modify the following unless explicitly instructed:

- `context/` — all project documentation (architecture, schema, ui-context, code-standards, this file). These are specs, not implementation. Update only when a decision changes.
- `.agents/memories/` — imported session notes and project context. Read-only reference.
- `context/schema/snapshot.json` — the live Directus schema snapshot. Reflects the actual DB, not a target.
- Any file under `node_modules/`, `dist/`, or `.vite/`
- `package.json` dependencies — only add when a feature genuinely requires it, and prefer the libraries already in the stack (React, React Router, Vite, lucide-react, `@directus/sdk`, zod)

## Filesystem Safety

- **Never run destructive filesystem commands** (`rd /s /q`, `rm -rf`, `Remove-Item -Recurse -Force`) on paths outside `d:\Ranto\AI Agents\IPP\IPP-OrderFlow\`. See `/memories/destructive-commands.md` for the incident that caused total workspace loss.
- All file edits stay within the `IPP-OrderFlow/` folder. No exceptions.
- When removing a file, use `Remove-Item -Path <exact path> -Force` (PowerShell native), never `cmd /c "rd /s /q ..."`.
- Before any delete, confirm the resolved path targets only the intended file/folder.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries → `context/architecture.md`
- Storage model or schema decisions → `context/architecture.md` + `context/schema/target-db-schema.md`
- Code conventions or standards → `context/code-standards.md`
- Feature scope → `context/project-overview.md`
- UI patterns or design tokens → `context/ui-context.md`
- Progress or open questions → `context/progress-tracker.md`

## Directus-First Rule

- The frontend talks to Directus only. Never add a Postgres, n8n, or Evolution API client to `src/`.
- Schema changes happen in Directus first (via the admin UI or CLI), then the snapshot is re-exported to `context/schema/snapshot.json`, then the frontend types in `src/types/` are updated to match.
- Never duplicate a Directus collection shape as a hardcoded TypeScript interface without a corresponding collection existing in Directus.

## Capability Matrix Enforcement

- Every order mutation (create, stage transition, line edit, return action) must pass through the `can()` capability check in `src/lib/domain.ts` before the Directus SDK call.
- Do not bypass the capability matrix with direct SDK writes from UI components, even if Directus ACLs would also block it.
- The Owner role is always allowed and is not stored in `role_permissions`.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `npm run build` passes
5. `npm run lint` passes (if configured)
6. No new TypeScript errors (`tsc --noEmit` clean)
7. The Directus schema (if changed) is reflected in `context/schema/snapshot.json`
8. Any new UI uses tokens from `ui-context.md` — no hardcoded hex values
