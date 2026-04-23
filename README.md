# DuelBrain

Analytics-first Yu-Gi-Oh! companion app. React Native + Expo. iOS + Android.

Design brief, data-model decisions, and scanner research live in the parent
project notes (`../yugioh-app-notes.md`, `../scanner-validation-handoff.md`).

## Status

- [x] Expo SDK 54 + expo-router + TypeScript scaffold
- [x] SQLite via `expo-sqlite` + Drizzle ORM; schema mirrors the locked data model
- [x] Match logger (primary daily-use screen)
- [x] Decks list (read-only v1)
- [x] Stats dashboard (per-archetype winrates, split on went-first)
- [ ] Deck editor / card picker
- [ ] Tech suggester (reads `tech_answers` table; curated rows not seeded yet)
- [ ] Card scanner (ORB + FAISS pipeline validated; mobile port is v2)

## Run

```bash
npm install
npx expo start            # then press 'a' for Android, 'i' for iOS
```

Expo Go cannot host native SQLite + the eventual OpenCV scanner — use a
development build once you wire native modules:

```bash
npx expo prebuild         # only once
npx expo run:android      # requires Android Studio + a running device/emulator
```

## Layout

```
app/                file-based routes (expo-router)
  _layout.tsx       root: runs migrations + seed, shows spinner until ready
  (tabs)/
    _layout.tsx     bottom tabs: Log / Decks / Stats
    index.tsx      MATCH LOGGER — primary screen
    decks.tsx      deck list (read-only v1)
    stats.tsx      per-archetype winrate dashboard
db/
  schema.ts         Drizzle schema (10 tables, matches notes/data-model)
  loss_reason.ts    locked 7-value enum + suggester action map
  client.ts         drizzle + expo-sqlite handle
  migrate.ts        useAppDatabase() hook: migrations + seed
  seed.ts           archetype seed + default deck
  migrations/       drizzle-kit output (0000_init.sql + manifest)
metro.config.js     wires .sql imports + .wasm asset handling
babel.config.js     adds babel-plugin-inline-import for SQL files
drizzle.config.ts   drizzle-kit config (output dir, expo driver)
```

## Development commands

```bash
npx expo start                        # dev server
npx drizzle-kit generate --name <msg> # regenerate migrations after schema edits
npx tsc --noEmit                      # typecheck
npm run lint                          # eslint
```

## Key invariants (do not break)

- Match stats join through `deck_version_id`, **never** `deck_id`.
- `went_first` is required on every game.
- `loss_reason` is a closed enum of 7 values. Every value maps to one
  suggester action. Add new reasons only if they map to a new action.
- Deck list versioning: `deck_versions.is_current` is enforced unique per deck
  via partial unique index.
