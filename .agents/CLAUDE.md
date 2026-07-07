## Application Building Context

Read the following files in order before implementing
or making any architectural decision:

1. `context/project-overview.md` — product definition,
   goals, features, and scope
2. `context/architecture.md` — system structure,
   boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography,
   and component conventions
4. `context/code-standards.md` — implementation rules
   and conventions
5. `context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps
7. **Context7** — retrieve the latest documentation for the
   tech stack before writing code against any library.
   Use the Context7 MCP tools (`resolve-library-id` then
   `get-library-docs`) to fetch up-to-date docs for the
   libraries listed below. Do not rely on memorized API
   shapes — always confirm against Context7 when a
   library's API surface matters for the current unit.

### Tech stack libraries to look up via Context7

| Library         | Context7 query    | Why                                               |
| --------------- | ----------------- | ------------------------------------------------- |
| React 18        | `react`           | Hooks, component patterns, suspense               |
| React Router 6  | `react-router`    | Route definitions, loaders, data APIs             |
| Vite 5          | `vite`            | Build config, PWA plugin, env vars                |
| `@directus/sdk` | `@directus/sdk`   | REST client, typed schema, realtime, file uploads |
| Directus 12     | `directus`        | Collections, relations, ACLs, flows, hooks        |
| lucide-react    | `lucide-react`    | Icon imports, sizing, tree-shaking                |
| zod             | `zod`             | Schema validation at the Directus boundary        |
| vite-plugin-pwa | `vite-plugin-pwa` | Service worker, manifest, install prompt          |
| TypeScript      | `typescript`      | Strict mode, utility types, config                |

### When to use Context7

- Before writing code that calls a library API you haven't used recently
- Before adding a new dependency (confirm the API surface first)
- When a build or type error suggests an API has changed
- When implementing Directus SDK calls (the SDK evolves fast — always confirm method names and signatures)

### When NOT to use Context7

- For CSS or HTML — no library involved
- For project-internal conventions — those live in `context/code-standards.md`
- For the pipeline domain logic — that's project-specific, not a library concern

Update `context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

## Rules That Never Change

- Never use hardcoded hex values or raw Tailwind color classes
- Update `context/progress-tracker.md` and `context/ui-registry.md` after every feature (all context lives in `context/`)
- Before any third party library — load its installed skill first, then read `context/library-docs.md` for project-specific rules
- If the same problem persists after one corrective prompt — stop immediately and run `/recover`

## Available Skills

- `/architect` — before any complex feature. Think before building.
- `/imprint` — after any new UI component. Capture patterns.
- `/review` — before demo or when something feels off.
- `/recover` — when something breaks after one failed correction.
- `/remember save` — when a feature spans multiple sessions.
- `/remember restore` — when returning after a multi-session feature.
