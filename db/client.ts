/**
 * Drizzle + expo-sqlite client. One DB handle, one schema, one source of truth.
 *
 * NOTE: the db is opened synchronously on first import. Screens that need data
 * should use the hooks from ./hooks.ts which wrap `useLiveQuery` for reactivity.
 */
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import * as schema from "./schema";

const sqlite = SQLite.openDatabaseSync("duelbrain.db", {
  enableChangeListener: true, // required for drizzle's useLiveQuery
});

export const db = drizzle(sqlite, { schema, logger: __DEV__ });
export { schema };
