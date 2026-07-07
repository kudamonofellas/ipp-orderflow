# UI Tokens — Quick Reference

> Source of truth: `context/ui-context.md`
> CSS implementation: `src/styles/tokens.css`
> This file is a quick-lookup for AI sessions. If values differ, `ui-context.md` wins.

## How to use

Every color, radius, spacing, shadow, and font in a component MUST reference a CSS custom property from `tokens.css`. **No hardcoded hex values.** No inline `style={{ color: '#...' }}`.

## Colors (light theme — default)

| Token            | Variable                     | Value     | Use for                     |
| ---------------- | ---------------------------- | --------- | --------------------------- |
| Page bg          | `var(--bg-base)`             | `#F5F6FA` | App background              |
| Surface          | `var(--bg-surface)`          | `#FFFFFF` | Cards, panels               |
| Surface hover    | `var(--bg-surface-hover)`    | `#F9FAFB` | Hover state                 |
| Text primary     | `var(--text-primary)`        | `#1A1D1F` | Headings, body              |
| Text secondary   | `var(--text-secondary)`      | `#6C757D` | Labels, metadata            |
| Text muted       | `var(--text-muted)`          | `#9CA3AF` | Timestamps, placeholders    |
| Accent           | `var(--accent-primary)`      | `#1E4D5C` | Primary buttons, active nav |
| Accent hover     | `var(--accent-primary-dark)` | `#163A47` | Button hover                |
| Text on accent   | `var(--text-on-accent)`      | `#FFFFFF` | Text on teal bg             |
| Border           | `var(--border-default)`      | `#E5E7EB` | Card/input borders          |
| Border subtle    | `var(--border-subtle)`       | `#F3F4F6` | Subtle dividers             |
| Error            | `var(--state-error)`         | `#DC2626` | Errors, destructive         |
| Success          | `var(--state-success)`       | `#10B981` | Confirmations               |
| Warning          | `var(--state-warning)`       | `#F59E0B` | Warnings                    |
| Info             | `var(--state-info)`          | `#3B82F6` | Info messages               |
| Badge bg         | `var(--bg-badge)`            | `#EEF2FF` | Pill backgrounds            |
| Badge text       | `var(--text-badge)`          | `#4F46E5` | Text on badges              |
| Notification dot | `var(--notification-accent)` | `#EF4444` | Unread indicator            |

## Typography

Font: **Outfit** (Google Fonts). Mono: **Source Code Pro**.

| Element         | Variable                 | Size / Weight |
| --------------- | ------------------------ | ------------- |
| Page title      | `var(--text-page-title)` | 28px / 600    |
| Section heading | `var(--text-h2)`         | 20px / 600    |
| Card heading    | `var(--text-h3)`         | 16px / 600    |
| Body            | `var(--text-body)`       | 14px / 400    |
| Label           | `var(--text-label)`      | 13px / 500    |
| Caption         | `var(--text-caption)`    | 12px / 400    |
| Button          | `var(--text-button)`     | 14px / 500    |
| Nav item        | `var(--text-nav)`        | 14px / 500    |

## Spacing

| Token              | Value |
| ------------------ | ----- |
| `var(--space-xs)`  | 4px   |
| `var(--space-sm)`  | 8px   |
| `var(--space-md)`  | 12px  |
| `var(--space-lg)`  | 16px  |
| `var(--space-xl)`  | 24px  |
| `var(--space-2xl)` | 32px  |
| `var(--space-3xl)` | 48px  |

## Border Radius

| Token                | Value | Use for         |
| -------------------- | ----- | --------------- |
| `var(--radius-sm)`   | 6px   | Badges, pills   |
| `var(--radius-md)`   | 8px   | Buttons, inputs |
| `var(--radius-lg)`   | 12px  | Cards, panels   |
| `var(--radius-xl)`   | 16px  | Modals          |
| `var(--radius-full)` | 50%   | Avatars         |

## Shadows

| Token              | Value                               |
| ------------------ | ----------------------------------- |
| `var(--shadow-sm)` | `0 1px 2px 0 rgb(0 0 0 / 0.05)`     |
| `var(--shadow-md)` | `0 4px 6px -1px rgb(0 0 0 / 0.1)`   |
| `var(--shadow-lg)` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` |

## Layout

| Token                      | Value  |
| -------------------------- | ------ |
| `var(--nav-height)`        | 72px   |
| `var(--nav-padding-x)`     | 24px   |
| `var(--content-max-width)` | 1536px |

## Breakpoints

Use in media queries: `@media (min-width: 768px) { ... }`

| Name | Width  |
| ---- | ------ |
| sm   | 640px  |
| md   | 768px  |
| lg   | 1024px |
| xl   | 1280px |
| 2xl  | 1536px |

## Transitions

| Token                    | Value       |
| ------------------------ | ----------- |
| `var(--duration-fast)`   | 150ms       |
| `var(--duration-normal)` | 200ms       |
| `var(--ease-default)`    | ease-in-out |
| `var(--ease-enter)`      | ease-out    |
| `var(--ease-exit)`       | ease-in     |

## Focus

`outline: var(--focus-ring); outline-offset: var(--focus-offset);`

## Dark theme

Activated via `<html data-theme="dark">`. All the same variables are overridden — components don't need dark-mode-specific rules.
