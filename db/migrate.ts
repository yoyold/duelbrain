/**
 * Runs drizzle migrations on app start, then seeds.
 * The `useMigrations` hook returns { success, error } so we can block UI until
 * DB is ready.
 */
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useEffect, useState } from "react";

import { db } from "./client";
import migrations from "./migrations/migrations";
import { seedIfNeeded } from "./seed";

export function useAppDatabase() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (success && !seeded) {
      seedIfNeeded()
        .then(() => setSeeded(true))
        .catch((e) => console.error("seed failed", e));
    }
  }, [success, seeded]);

  return { ready: success && seeded, error };
}
