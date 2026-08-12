// The standing migration framework. Any time a future phase adds a
// component/field to the sim, write a small, named migration function keyed
// to the snapshot version it upgrades FROM, register it below, and bump
// CURRENT_SNAPSHOT_VERSION. This is what makes "additive sim changes without
// losing the world" actually true rather than aspirational — treat it as
// binding for all future work, not just this pass. See v1.ts for a worked
// (illustrative, not real) example of the pattern.

export const CURRENT_SNAPSHOT_VERSION = 1;

/** A migration transforms a v(N) raw object into a v(N+1) raw object.
 * Deliberately untyped (`unknown -> unknown`) rather than typed against
 * SnapshotVN <-> SnapshotVN+1 interfaces: old snapshots don't type-check
 * against current interfaces by definition, that's the whole reason a
 * migration exists. */
export type Migration = (old: unknown) => unknown;

/** Keyed by the version a migration runs FROM. migrations[1] is "the
 * function that turns a v1 payload into a v2 payload," registered once a v2
 * shape actually exists. Empty today — there is only one snapshot version
 * so far, so there is nothing to migrate from yet. */
const migrations: Record<number, Migration> = {
  // 1: migrateV1ToV2,
};

/**
 * Applies every migration in sequence from `raw.v` up to
 * CURRENT_SNAPSHOT_VERSION, one version-step at a time, so each migration
 * function only ever has to reason about a single delta rather than the
 * cumulative distance from an arbitrarily old version to current. Throws if
 * a required migration isn't registered (a stored snapshot older than any
 * migration this build knows how to run) rather than silently guessing.
 */
export function runMigrations(raw: { v: number; [key: string]: unknown }): unknown {
  let data: unknown = raw;
  let version = raw.v;

  while (version < CURRENT_SNAPSHOT_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(
        `No migration registered to upgrade snapshot from v${version} (current version is v${CURRENT_SNAPSHOT_VERSION})`,
      );
    }
    data = migrate(data);
    version += 1;
  }

  return data;
}
