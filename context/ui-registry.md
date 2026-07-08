# UI Registry

> Established by `/imprint audit` on 2026-07-07.
> This is the consistency baseline. Every component built after this must match these patterns.
> Token source of truth: `context/ui-context.md` + `context/ui-tokens.md`.
> CSS implementation: `src/styles/tokens.css`.

## Baseline — Established 2026-07-07

No UI components exist yet. This baseline defines the patterns every **first** component must follow. It is derived from `context/ui-context.md` (the dashboard design spec) — not from existing code (the current `src/` is the default Vite scaffold and will be replaced).

### Global rules (apply to every component)

| Property               | Correct token                               |
| ---------------------- | ------------------------------------------- |
| Font family            | `var(--font-sans)` (Outfit)                 |
| Page background        | `var(--bg-base)`                            |
| Surface (cards/panels) | `var(--bg-surface)`                         |
| Surface hover          | `var(--bg-surface-hover)`                   |
| Primary text           | `var(--text-primary)`                       |
| Secondary text         | `var(--text-secondary)`                     |
| Muted text             | `var(--text-muted)`                         |
| Border default         | `var(--border-default)`                     |
| Border subtle          | `var(--border-subtle)`                      |
| Accent                 | `var(--accent-primary)`                     |
| Accent hover           | `var(--accent-primary-dark)`                |
| Text on accent         | `var(--text-on-accent)`                     |
| Focus ring             | `var(--focus-ring)` + `var(--focus-offset)` |
| Transition             | `var(--duration-fast) var(--ease-default)`  |
| No hardcoded hex       | **Ever.** Use tokens.                       |

### Card / Panel

| Property      | Token                              |
| ------------- | ---------------------------------- |
| Background    | `var(--bg-surface)`                |
| Border        | `1px solid var(--border-default)`  |
| Border radius | `var(--radius-lg)` (12px)          |
| Padding       | `var(--space-lg)` (16px)           |
| Shadow        | `var(--shadow-md)`                 |
| Heading       | `var(--text-h3)`                   |
| Section gap   | `var(--space-lg)` between sections |

### Button — Primary

| Property         | Token                                        |
| ---------------- | -------------------------------------------- |
| Background       | `var(--accent-primary)`                      |
| Text color       | `var(--text-on-accent)`                      |
| Font             | `var(--text-button)`                         |
| Padding          | `var(--space-sm) var(--space-lg)` (8px 16px) |
| Border radius    | `var(--radius-md)` (8px)                     |
| Hover background | `var(--accent-primary-dark)`                 |
| Focus            | `var(--focus-ring)`                          |
| Border           | none                                         |

### Button — Ghost / Secondary

| Property         | Token                     |
| ---------------- | ------------------------- |
| Background       | transparent               |
| Text color       | `var(--text-secondary)`   |
| Hover background | `var(--bg-surface-hover)` |
| Hover text       | `var(--text-primary)`     |
| Border radius    | `var(--radius-md)`        |
| Border           | none                      |

### Input

| Property      | Token                             |
| ------------- | --------------------------------- |
| Background    | `var(--bg-surface)`               |
| Border        | `1px solid var(--border-default)` |
| Border radius | `var(--radius-md)` (8px)          |
| Padding       | `var(--space-sm) var(--space-md)` |
| Font          | `var(--text-body)`                |
| Text color    | `var(--text-primary)`             |
| Placeholder   | `var(--text-muted)`               |
| Focus border  | `var(--accent-primary)`           |
| Focus ring    | `var(--focus-ring)`               |

### Badge / Pill

| Property      | Token                    |
| ------------- | ------------------------ |
| Background    | `var(--bg-badge)`        |
| Text color    | `var(--text-badge)`      |
| Font          | `var(--text-caption)`    |
| Padding       | `2px var(--space-sm)`    |
| Border radius | `var(--radius-sm)` (6px) |

### Navigation item (top bar)

| Property              | Token                             |
| --------------------- | --------------------------------- |
| Font                  | `var(--text-nav)`                 |
| Text color (inactive) | `var(--text-secondary)`           |
| Text color (active)   | `var(--text-on-accent)`           |
| Background (active)   | `var(--accent-primary)`           |
| Background (hover)    | `var(--bg-surface-hover)`         |
| Border radius         | `var(--radius-md)`                |
| Padding               | `var(--space-sm) var(--space-md)` |

### Stage pill (dashboard)

| Property         | Token                             |
| ---------------- | --------------------------------- |
| Background       | `var(--bg-surface)`               |
| Border           | `1px solid var(--border-default)` |
| Border radius    | `var(--radius-lg)` (12px)         |
| Padding          | `var(--space-md) var(--space-lg)` |
| Count font       | `var(--text-h3)`                  |
| Label font       | `var(--text-label)`               |
| Hover border     | `var(--accent-primary)`           |
| Hover background | `var(--bg-surface-hover)`         |

### Table

| Property     | Token                                        |
| ------------ | -------------------------------------------- |
| Row hover    | `var(--bg-surface-hover)`                    |
| Border       | none (borderless rows)                       |
| Header font  | `var(--text-label)`                          |
| Body font    | `var(--text-body)`                           |
| Cell padding | `var(--space-md) var(--space-lg)`            |
| Numbers      | right-aligned, `var(--font-sans)` 500 weight |

### Notification item

| Property  | Token                                      |
| --------- | ------------------------------------------ |
| Layout    | left-aligned, full width                   |
| Divider   | `1px solid var(--border-subtle)`           |
| Timestamp | `var(--text-caption)`, `var(--text-muted)` |
| Order ID  | `var(--text-label)`, `var(--text-primary)` |
| Hover     | `var(--bg-surface-hover)`                  |

### Avatar

| Property      | Token                                        |
| ------------- | -------------------------------------------- |
| Size          | 40px default                                 |
| Border radius | `var(--radius-full)`                         |
| Background    | `var(--accent-primary)`                      |
| Text          | `var(--text-on-accent)`, `var(--text-label)` |

### Modal

| Property      | Token                     |
| ------------- | ------------------------- |
| Overlay       | `rgba(0, 0, 0, 0.4)`      |
| Surface       | `var(--bg-surface)`       |
| Border radius | `var(--radius-xl)` (16px) |
| Padding       | `var(--space-xl)` (24px)  |
| Shadow        | `var(--shadow-lg)`        |
| Max width     | 600px                     |

---

## Built components (2026-07-07)

The Vite scaffold (`src/App.tsx`, `src/App.css`, `src/index.css`) has been removed. The following real components now exist and follow the baseline above:

- **`Card`** (`src/components/Card/`) — matches Card / Panel baseline. `flush` prop for self-padded cards.
- **`Button`** (`src/components/Button/`) — `primary` (teal) + `ghost` variants, per Button baseline.
- **`Avatar`** (`src/components/Avatar/`) — circular initials, `--accent-primary` bg, per Avatar baseline.
- **`MetricCard`** (`src/components/MetricCard/`) — dashboard top-row metric: bordered icon tile + range dropdown toggle + 40px number + label.
- **`StagePill`** (`src/components/StagePill/`) — clickable count + label pill, per Stage pill baseline.
- **`TopNav`** (`src/layouts/TopNav/`) — sticky top bar: brand + nav links (active = teal pill) + search + icon buttons (bell w/ notification dot, settings) + user chip. Per Navigation baseline.
- **Dashboard sections** (`src/pages/Dashboard/sections/`) — `IntakePanel`, `ApprovalPanel`, `OpenOrdersPanel` (per Table baseline). (The notifications panel was originally a right-column `NotificationsPanel` section but is now a popover — see below.)
- **`NotificationsPopover`** (`src/components/NotificationsPopover/`) — bell button + dropdown dialog toggled from the TopNav bell. Replaces the dashboard's right-column notifications panel so it no longer takes page real estate. Anchored top-right under the bell, 360px wide, max 70vh scroll, header with "N new" badge, grouped date list per Notification item baseline. Closes on outside-click or Escape. Enter animation: opacity 0→1 + translateY(-8px)→0 over 200ms (per ui-context.md dropdown enter); disabled under `prefers-reduced-motion`.

New patterns introduced this session (append if reused):

- **Metric icon tile**: 44×44, `--radius-md`, `1px solid var(--border-default)`, icon `--text-primary`.
- **Range dropdown toggle**: bordered `--radius-md` chip, `--text-label`/`--text-secondary`, `ChevronDown` 16px. Hover → `--accent-primary` border.
- **Notification date group header**: `--text-label`, `--text-secondary`, above a divider-separated entry list.
- **Popover/dropdown**: anchored to its trigger, `--shadow-lg`, `--radius-lg`, max 70vh scroll, outside-click + Escape to close, 200ms enter animation (opacity + translateY), disabled under reduced-motion.

## Built components (2026-07-08)

- **`OpenOrdersPanel` updated** — now wired to Directus (`useOpenOrders` hook). New "Items" column with expand/collapse toggle.

New patterns introduced this session (append if reused):

- **Expand/collapse toggle (table row)**: inline-flex button in a table cell, `--text-body`/`--text-primary`, `--radius-sm`, `--space-xs`/`--space-sm` padding. Shows count ("N items"/"N item") + `ChevronDown` 16px (`--text-secondary`). Hover → `--bg-surface-hover`. Disabled state (0 items): `--text-secondary`, no cursor, no arrow. Expanded state: chevron rotates 180° via `transform: rotate(180deg)` with `transition: transform 0.2s ease`. Expanded sub-row: `colSpan` full width, `--bg-surface-hover` inner panel with `--radius-md`, `--space-md`/`--space-lg` padding, flex column gap `--space-sm`.
- **Loading / error / empty states (panel)**: `--text-body`, `--space-md` padding. Error uses `--status-danger` color (fallback `#c0392b`). Muted/empty uses `--text-secondary`.

---

## How this registry is used

At the start of any session involving UI work, read this file before writing any component. When building a new card, check the Card baseline above. When building a new button, check the Button baseline. Match the exact tokens.

After building any new component, run `/imprint` to capture its specific patterns and append them to this registry.
