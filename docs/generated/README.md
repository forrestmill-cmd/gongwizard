# GongWizard Generated Documentation

Auto-generated from source code using Repomix + Claude.
Last updated: 2026-03-04 — **STALE. Regenerate with `/doc-update` before trusting
anything structural here.**

> **2026-11-20 hand-patch, and why it was needed.** These docs described
> `gemini-2.0-flash-lite` for ~8 months — the 2026-03-04 commit that fixed the
> code ("replace deprecated gemini-2.0 models") never regenerated them, so the
> doc stayed a fossil of that incident and was still naming a retired model
> while the code ran a different one. On 2026-11-20 the smart tier moved off
> `gemini-2.5-pro` (deprecated 2026-11-02), and rather than leave a second
> fossil the model names were patched by hand across architecture-overview,
> api-routes, configuration-reference, data-flows and lib-modules.
>
> That patch covers MODEL NAMES ONLY. Everything else predates 2026-11-20 and
> is known stale — in particular `smartStream` was **deleted** (zero callers),
> and model ids + the per-generation request shape now live in
> `src/lib/gemini-generation-shape.ts`, which these docs do not mention at all.
> `recent-changes.md` is a git-log record and is deliberately left untouched.
> See "Gemini model pinning" in the root `CLAUDE.md` for the current contract.

## Documents

- [Architecture Overview](architecture-overview.md) — System design, component relationships, and technology stack
- [API Routes](api-routes.md) — All HTTP endpoints with request/response schemas and auth details
- [Component Tree](component-tree.md) — Page hierarchy, component structure, hooks, and UI library usage
- [Data Flows](data-flows.md) — Sequence diagrams for auth, connection, call fetch, export, and AI research pipeline
- [Lib Modules](lib-modules.md) — Shared library code, dependency graph, and configuration constants
- [Configuration Reference](configuration-reference.md) — Environment variables, build config, feature flags, and third-party services

## Bonus Reports

- [TODO Report](todo-report.md) — TODO/FIXME/HACK scan results
- [Dependency Audit](dependency-audit.md) — Unused and misplaced dependency analysis
- [Recent Changes](recent-changes.md) — Git history and development focus summary

## How to Regenerate

Run `/doc-update` in Claude Code from within the project directory.
