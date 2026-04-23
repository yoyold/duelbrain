# DuelBrain — Assistant rules

Yu-Gi-Oh! analytics app (React Native + Expo, iOS + Android). Local SQLite via
Drizzle, TypeScript strict. See `db/schema.ts` for the data model; see
`yugioh-app-notes.md` in the parent directory for product context.

## Git policy (STRICT)

These rules are non-negotiable. Violating them is a mistake, not a preference.

1. **Never auto-commit.** Do not run `git commit`, `git commit --amend`,
   or any command that creates a commit unless the user has explicitly asked
   for a commit in the current message. "Save this", "done", "continue", or
   similar do not count as permission to commit. When in doubt, stage only
   and ask.

2. **Never push without explicit instruction.** Same rule as commit: only
   push when the user says "push" (or equivalent). `git push` is not implied
   by "commit it".

3. **No Claude / AI co-author lines, ever.** Commit messages must not contain:
   - `Co-Authored-By: Claude ...`
   - `Co-Authored-By: Anthropic ...`
   - `Generated with Claude Code`
   - any other AI attribution trailer or footer
   The commit author is the user. Do not add yourself as contributor or
   co-author in any form, in commit bodies, PR descriptions, or changelogs.

4. **No `--no-verify`, `--no-gpg-sign`, or hook-skipping flags** unless the
   user explicitly asks. If a hook fails, fix the root cause.

5. **Stage, don't commit, by default.** When the user asks you to "bring
   changes into git" or similar ambiguous phrasing, stage the files and
   stop. Let the user trigger the commit.

## Code style

- TypeScript strict. No `any` unless justified with a comment.
- Comments should explain *why* or surface invariants, not narrate *what*.
- Prefer named exports; reserve `default export` for route files where
  expo-router requires it.
- Drizzle schema is the source of truth for DB shape. Migrations are
  generated, not hand-edited, via `npx drizzle-kit generate`.

## Invariants that must not be broken silently

- Match stats join through `deck_version_id`, never `deck_id` directly.
  Saving a deck creates a new version; match history stays attributed to
  the exact list played.
- `went_first` is required on every `game` row.
- `loss_reason` is a closed 7-value enum (see `db/loss_reason.ts`). Do not
  add values without discussing the suggester-action mapping.
- Extra-deck classification uses the keyword rule in `db/deck_ops.ts`
  (`isExtraDeckType`). Pendulum-Normal / Pendulum-Effect belong in Main.
