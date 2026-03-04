# Recent Changes Summary

## Last 20 Commits

| Hash | Date | Author | Message |
|------|------|--------|---------|
| db15aca | 2026-03-04 11:09:44 -0600 | forrestmill-cmd | Add date range picker to Connect page |
| eaf78fd | 2026-03-04 02:12:32 -0600 | forrestmill-cmd | Fix scoring: replace deprecated gemini-2.0 models with gemini-2.5-flash-lite |
| 337c599 | 2026-03-04 02:00:35 -0600 | forrestmill-cmd | Update HOW IT WORKS text and smoke test for auto-load |
| 8386890 | 2026-03-04 01:27:11 -0600 | forrestmill-cmd | Auto-load 90 days, stream progress, remove date picker |
| ff6719d | 2026-03-04 01:14:35 -0600 | forrestmill-cmd | Fix 60s hang: stop retrying Gong 404 "No calls found" errors |
| 41ba6b9 | 2026-03-03 23:44:32 -0600 | forrestmill-cmd | Show top 5 tracker chips with occurrence counts on every call card |
| 1498128 | 2026-03-03 23:23:02 -0600 | forrestmill-cmd | Replace tracker/topic chip filters with standard multi-select dropdowns |
| 113c26a | 2026-03-03 23:01:26 -0600 | forrestmill-cmd | Fix broken tracker pipeline + simplify UI to two-column layout |
| 2f8cb78 | 2026-03-03 19:48:16 -0600 | forrestmill-cmd | docs: update project documentation (post-refactor) |
| 7d58056 | 2026-03-03 19:40:58 -0600 | forrestmill-cmd | Add dependency audit report |
| 67206be | 2026-03-03 19:38:03 -0600 | forrestmill-cmd | fix: remove unused isExternal variable introduced in refactor |
| ddc2343 | 2026-03-03 19:37:04 -0600 | forrestmill-cmd | refactor: add maintainability comments |
| b3c695d | 2026-03-03 19:36:58 -0600 | forrestmill-cmd | refactor: simplify complexity |
| 5c51f0b | 2026-03-03 19:36:45 -0600 | forrestmill-cmd | refactor: remove dead code |
| 7fdf7f9 | 2026-03-03 19:36:39 -0600 | forrestmill-cmd | refactor: fix bugs |
| bc6a5a0 | 2026-03-03 15:59:19 -0600 | forrestmill-cmd | docs: update project documentation (pre-refactor) |
| db486f3 | 2026-03-03 15:44:25 -0600 | forrestmill-cmd | chore: commit pre-refactor working changes |
| fa69322 | 2026-03-03 15:37:39 -0600 | forrestmill-cmd | Massive token efficiency + fix utterance timestamp unit bug |
| 612ffbe | 2026-03-03 14:46:01 -0600 | forrestmill-cmd | Drop GPT-4o, go full Gemini across analysis pipeline |
| b47b0ef | 2026-03-03 12:00:03 -0600 | forrestmill-cmd | feat: surface Analyze feature + rework AI Q&A output |

## Files Most Frequently Changed (Last 10 Commits)

### Most Active Files
1. **src/app/calls/page.tsx** — 979 changes (primary UI page for calls list and display)
2. **src/app/api/gong/calls/route.ts** — 332 changes (Gong API proxy and data fetching)
3. **docs/generated/** — 1,918 combined changes across auto-generated documentation
4. **src/components/ui/\*.tsx** — 668 changes (new UI components added: calendar, command, dialog, multi-select, popover)

### Component & Library Updates
- **lib-modules.md** — 700 changes (AI providers, Gong API, transcript formatting)
- **component-tree.md** — 531 changes (UI restructuring during refactor)
- **data-flows.md** — 454 changes (API integration documentation)
- **configuration-reference.md** — 420 changes

### Supporting Files
- **src/components/analyze-panel.tsx** — 6 changes
- **CLAUDE.md** — 7 changes (project documentation updates)
- **Smoke test suite** — 30+ changes (test coverage improvements)

## Development Focus Summary

Recent development focused on **stabilizing the core calls interface and upgrading the AI infrastructure**. Major activities include a comprehensive refactor to simplify UI complexity, replacement of deprecated GPT-4o models with Gemini 2.5 Flash-Lite for cost efficiency, implementation of auto-loading 90-day call history with streaming progress, and hardening the Gong API proxy to handle edge cases (404 retries, tracker pipeline fixes). The tracker/topic filtering system was rebuilt with standard multi-select dropdowns, and top call metadata is now surfaced per-card for better UX.

