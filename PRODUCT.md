# Product

## Register

product

## Users

Owners and admins of ARK / gaming Discord communities who run the Arkoris bot.
They reach the dashboard after logging in with Discord, usually to configure or
check one specific thing (welcome messages, role menus, tickets, staff pay,
branding, /pop, events). They are fluent in Discord itself and expect the tool
to behave like a natural extension of it. Context is task-focused: get in,
change a setting, confirm it looks right, get out.

## Product Purpose

A point-and-click control panel for the Arkoris Discord bot, so server staff can
configure every module from the web instead of chat commands — and, critically,
**see how the result will look inside Discord before they ship it**. Success =
a staff member can set up or adjust a module confidently in under a minute and
trust that what they see is what their members will see.

## Brand Personality

Native, calm, capable. The dashboard should feel like it was built by the same
people who built Discord — quiet, dependable, unflashy. Voice is plain and
specific, never hype. It is a tool for people mid-task, not a landing page.

## Anti-references

- The current dashboard: busy walls of stacked cards, big-number "hero metric"
  stat grids, repeated identical icon-cards, neon green on everything.
- Generic Bootstrap/Tailwind admin templates (Material-y, purple gradients).
- Marketing-flavored product UI: oversized hero copy, decorative motion,
  illustration-heavy empty states that don't teach.
- Loud, fully-saturated accents on inactive elements.

## Design Principles

1. **Feels like Discord.** Borrow Discord's surface, component vocabulary, and
   color semantics (online = green dot, blurple = primary action) so the tool
   disappears into the platform it manages.
2. **Show it in Discord.** Anywhere the user edits something that renders in
   Discord (embeds, welcome, role menus, tickets), show a faithful live Discord
   preview. WYSIWYG against the real target, not an abstract form.
3. **Mostly neutral.** Neutral dark grays carry the UI. One accent (blurple) for
   primary action and current selection only. Arkoris green is a restrained
   brand touch; semantic green means "online / installed."
4. **Calm over crowded.** Each screen leads with one clear thing. Cut decoration.
   No hero-metric template, no identical-card grids, no eyebrow scaffolding.
5. **Earned familiarity.** Standard affordances, one consistent component set,
   every state designed: hover, focus-visible, active, loading (skeletons),
   empty (that teaches), error.

## Accessibility & Inclusion

WCAG 2.1 AA: body text ≥4.5:1, large/UI text ≥3:1 against its own surface.
Visible focus-visible rings on every interactive element. Full keyboard paths
(no hover-only actions). `prefers-reduced-motion` alternative for every
transition. Semantic markup (real headings, landmarks, labels, button/link
semantics, accessible names).

## Notes

All redesign work happens in the private preview fork only:
`dashboard-next-app.js` + `dashboard-next.css` (scoped under `.dash-next-preview`).
The live `dashboard.html` / `dashboard-app.js` stay untouched until we merge.
The new Discord design system lives as `--dsc-*` tokens in `dashboard-next.css`.
