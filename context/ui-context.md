# UI Context

## Theme

Light-first design with a clean, modern workspace aesthetic. The interface uses a white page base with soft gray (`#F0F5F5`) for muted surfaces (for example the navbar and secondary card backgrounds). Primary interactive elements use a dark teal-blue accent (`#0C4458`) that carries the brand identity. The design supports both light and dark themes, with light as the default. Typography is clean and spacious using Google's Outfit font family. The overall feel is professional, approachable, and optimized for long-session use in a B2B/Horeca order-management context.

## Colors

All components must use these CSS custom property tokens — no hardcoded hex values.

### Light Theme (default)

| Role                 | CSS Variable            | Value                               | Usage                                       |
| -------------------- | ----------------------- | ----------------------------------- | ------------------------------------------- |
| Page background      | `--bg-base`             | `#FFFFFF`                           | Main app background                         |
| Surface              | `--bg-surface`          | `#FFFFFF`                           | Cards, panels, elevated surfaces            |
| Surface hover        | `--bg-surface-hover`    | `#F0F5F5`                           | Hover state for interactive surfaces        |
| Primary text         | `--text-primary`        | `#1A1D1F`                           | Headings, body text, high emphasis          |
| Secondary text       | `--text-secondary`      | `#7C7C7C`                           | Labels, metadata, medium emphasis           |
| Muted text           | `--text-muted`          | `#9CA3AF`                           | Timestamps, placeholders, low emphasis      |
| Primary accent       | `--accent-primary`      | `#0C4458`                           | Primary buttons, active nav, brand color    |
| Primary accent hover | `--accent-primary-dark` | `#082F3D`                           | Hover state for primary actions             |
| Accent on primary    | `--text-on-accent`      | `#FFFFFF`                           | Text on primary accent backgrounds          |
| Border default       | `--border-default`      | `#D6D6D6`                           | Default borders for cards, inputs, dividers |
| Border subtle        | `--border-subtle`       | `#F0F5F5`                           | Very subtle dividers                        |
| State error          | `--state-error`         | `#DC2626`                           | Error messages, destructive actions         |
| State success        | `--state-success`       | `#10B981`                           | Success states, confirmations               |
| State warning        | `--state-warning`       | `#F59E0B`                           | Warnings, caution states                    |
| State info           | `--state-info`          | `#3B82F6`                           | Info messages, neutral highlights           |
| Badge background     | `--bg-badge`            | `#EEF2FF`                           | Subtle badge/pill backgrounds               |
| Badge text           | `--text-badge`          | `#4F46E5`                           | Text on badge backgrounds                   |
| Notification dot     | `--notification-accent` | `#EF4444`                           | Red dot for unread notifications            |
| Shadow sm            | `--shadow-sm`           | `0 1px 2px 0 rgb(0 0 0 / 0.05)`     | Subtle elevation                            |
| Shadow md            | `--shadow-md`           | `0 4px 6px -1px rgb(0 0 0 / 0.1)`   | Card elevation                              |
| Shadow lg            | `--shadow-lg`           | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | Modal/dropdown elevation                    |

### Dark Theme

| Role                 | CSS Variable            | Value     | Usage                                       |
| -------------------- | ----------------------- | --------- | ------------------------------------------- |
| Page background      | `--bg-base`             | `#0F1419` | Main app background                         |
| Surface              | `--bg-surface`          | `#1A1D1F` | Cards, panels, elevated surfaces            |
| Surface hover        | `--bg-surface-hover`    | `#24272A` | Hover state for interactive surfaces        |
| Primary text         | `--text-primary`        | `#F5F6FA` | Headings, body text, high emphasis          |
| Secondary text       | `--text-secondary`      | `#9CA3AF` | Labels, metadata, medium emphasis           |
| Muted text           | `--text-muted`          | `#6C757D` | Timestamps, placeholders, low emphasis      |
| Primary accent       | `--accent-primary`      | `#2B7A8F` | Primary buttons, active nav, brand color    |
| Primary accent hover | `--accent-primary-dark` | `#1E4D5C` | Hover state for primary actions             |
| Accent on primary    | `--text-on-accent`      | `#FFFFFF` | Text on primary accent backgrounds          |
| Border default       | `--border-default`      | `#2C3035` | Default borders for cards, inputs, dividers |
| Border subtle        | `--border-subtle`       | `#24272A` | Very subtle dividers                        |

## Typography

| Role           | Font            | Variable      | Weights                 | Usage                                  |
| -------------- | --------------- | ------------- | ----------------------- | -------------------------------------- |
| UI text        | Outfit          | `--font-sans` | 300, 400, 500, 600, 700 | All UI text, labels, body copy         |
| Numbers/tables | Outfit          | `--font-sans` | 500, 600                | Order IDs, counts, table data          |
| Code/mono      | Source Code Pro | `--font-mono` | 400, 500                | Technical data, logs (if needed later) |

### Type Scale

| Element              | Size | Weight | Line Height | Letter Spacing |
| -------------------- | ---- | ------ | ----------- | -------------- |
| Page title           | 28px | 600    | 1.3         | -0.02em        |
| Section heading (h2) | 20px | 600    | 1.4         | -0.01em        |
| Card heading (h3)    | 16px | 600    | 1.5         | 0              |
| Body                 | 14px | 400    | 1.6         | 0              |
| Label / small        | 13px | 500    | 1.5         | 0              |
| Caption / timestamp  | 12px | 400    | 1.4         | 0.01em         |
| Button text          | 14px | 500    | 1           | 0              |
| Navigation item      | 14px | 500    | 1           | 0              |

## Spacing System

| Token | Value | Usage                        |
| ----- | ----- | ---------------------------- |
| `xs`  | 4px   | Tight spacing, icon gaps     |
| `sm`  | 8px   | Small padding, label gaps    |
| `md`  | 12px  | Default padding inside cards |
| `lg`  | 16px  | Card padding, section gaps   |
| `xl`  | 24px  | Large section gaps           |
| `2xl` | 32px  | Major layout separations     |
| `3xl` | 48px  | Page-level vertical rhythm   |

## Border Radius

| Context           | Value | Class          | Usage                           |
| ----------------- | ----- | -------------- | ------------------------------- |
| Small UI / badges | 6px   | `rounded-sm`   | Badges, pills, small buttons    |
| Buttons / inputs  | 8px   | `rounded-md`   | Buttons, form inputs, dropdowns |
| Cards / panels    | 12px  | `rounded-lg`   | Dashboard cards, content panels |
| Modals / overlays | 16px  | `rounded-xl`   | Modals, large overlays          |
| Avatar            | 50%   | `rounded-full` | User avatars                    |

## Component Library

**Plain CSS** — no component library. The prototype uses plain CSS (no Tailwind, no shadcn/ui). Components are hand-built React components with CSS Modules or global CSS classes. Icons are from **HugeIcons via Iconify** (`@iconify/react` + `@iconify-json/hugeicons`).

### Component Patterns (to be built)

- **Button** — solid primary (teal), ghost (transparent hover), outline, icon-only
- **Card** — white surface, 12px radius, subtle shadow, 16px padding
- **Badge** — rounded pill, light background, medium text
- **Avatar** — circular, initials fallback, 40px default size
- **Navigation** — top bar, active state = teal background, inactive = gray text
- **Input** — 8px radius, border, focus ring in teal
- **Dropdown** — 8px radius, shadow-lg, list items with hover
- **Notification item** — timestamp + order ID + action, left-aligned, subtle divider
- **Stage pill** — count + label, clickable, rounded-lg, border, hover state
- **Table** — borderless rows, hover row background, right-aligned numbers

## Layout Patterns

- **Top Navigation Bar**: Fixed height (~72px), white background, horizontal padding 24px. Logo left, nav items center-left, search + notifications + settings + avatar right. Bottom border subtle (`--border-subtle`). Active nav item has teal background with white text in a rounded-md pill.
- **Dashboard Grid**: 3-column metric cards at top (Total Orders, Delivered Orders, Returned Orders), each with icon, dropdown, large number, label. 2×4 grid of stage pills below (Intake, Cold Storage, Finance Gate, Production | Packing, Finalize, Dispatch, Delivered). Main content area below in 2-column layout: left = WhatsApp Intake + Need Approval + Open Orders table, right = Notifications panel.
- **Cards / Panels**: White surface, 12px radius, 16px padding, subtle shadow (`--shadow-md`). Headings are 16px/600, content has 16px vertical spacing between sections.
- **Sidebar (if needed later)**: Fixed left or right, white surface, border separator. Not present in the current dashboard design.
- **Modals**: Centered overlay, 16px radius, backdrop blur or dark overlay (rgba(0,0,0,0.4)), max-width 600px, 24px padding, shadow-lg.
- **Notifications Panel**: Right-side column, white card, scrollable, timestamp headers (light gray, uppercase, 12px), individual notification items with hover state.
- **WhatsApp Intake Panel**: Card with heading, message preview cards (light gray background, 12px radius, 12px padding, sender name bold, preview text truncated).

## Icons

**HugeIcons via Iconify** (`@iconify/react` + `@iconify-json/hugeicons`) — outlined icon style. Default size: `20px` for buttons and nav items, `16px` for inline indicators, `24px` for metric cards and CTA cards. Color inherits from parent text color or uses `--text-secondary` for muted icons.

### Key Icons Used

- Dashboard: `LayoutDashboard`
- Orders: `ClipboardList`
- Customers: `Users`
- Reports: `BarChart3`
- Search: `Search`
- Notifications: `Bell` (with red dot badge for unread count)
- Settings: `Settings`
- New Order: `Plus` or `CirclePlus`
- Delivered: `Truck`
- Returned: `ArrowDownCircle` or `RotateCcw`
- Dropdown: `ChevronDown`

## Interaction States

| State    | Visual Treatment                                                       |
| -------- | ---------------------------------------------------------------------- |
| Default  | Base colors, no effects                                                |
| Hover    | `--bg-surface-hover` for surfaces, `--accent-primary-dark` for buttons |
| Active   | Teal background (`--accent-primary`), white text for nav items         |
| Focus    | 2px solid ring in `--accent-primary`, 4px offset                       |
| Disabled | 50% opacity, no pointer events                                         |
| Loading  | Opacity 70%, spinner or skeleton in `--text-muted`                     |

## Responsive Breakpoints

| Breakpoint | Min Width | Target         | Layout Changes                                  |
| ---------- | --------- | -------------- | ----------------------------------------------- |
| `sm`       | 640px     | Large phones   | Single column, stacked cards                    |
| `md`       | 768px     | Tablets        | 2-column grid for stage pills, stacked panels   |
| `lg`       | 1024px    | Small desktops | 3-column metrics, 2×4 stage grid, 2-column main |
| `xl`       | 1280px    | Large desktops | Full dashboard layout (as shown)                |
| `2xl`      | 1536px    | Extra large    | Max-width container, centered                   |

## Accessibility

- **Focus indicators**: 2px solid ring in `--accent-primary`, 4px offset, visible on all interactive elements.
- **Color contrast**: All text meets WCAG AA (4.5:1 for body, 3:1 for large text).
- **Keyboard navigation**: Tab order follows visual layout, Escape closes modals/dropdowns, Enter/Space activates buttons.
- **ARIA labels**: All icon-only buttons have `aria-label`, status updates announced via `aria-live`.
- **Screen reader text**: Visually hidden text for counts, dates, and semantic context.

## Animation / Transitions

- **Default duration**: 150ms for hovers, 200ms for dropdowns/modals.
- **Easing**: `ease-in-out` for most, `ease-out` for entrances, `ease-in` for exits.
- **Hover transitions**: `background-color 150ms ease-in-out, color 150ms ease-in-out`.
- **Dropdown enter**: `opacity 0→1` + `transform translateY(-8px)→0` over 200ms.
- **Modal enter**: `opacity 0→1` + `transform scale(0.95)→1` over 200ms.
- **No motion preference**: Respect `prefers-reduced-motion`, disable all animations.
