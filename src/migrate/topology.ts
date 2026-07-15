import type { Db } from 'mongodb';

import { MongoatConnectionError } from '@/errors';

/**
 * Probes the connected server's topology via the driver `hello` command and
 * fail-loud-rejects a data-transaction migration when it is running against
 * a standalone MongoDB (no replica set, no mongos router) — transactions
 * require one or the other (driver error 20, `IllegalOperation`).
 *
 * `hello` (formerly `isMaster`) is the officially documented topology probe:
 * its response carries `setName` only when the node is a replica set member,
 * and `msg: 'isdbgrid'` when it is a mongos router (also transaction-capable
 * via sharded transactions). Absence of both means standalone.
 *
 * `allowNoTransaction` is an explicit, non-default, non-silent opt-in
 * (D-03/CR-02 idiom: fail loud by default, escape hatch always explicit) —
 * when set, topology detection resolves instead of throwing even against a
 * standalone server, letting the caller run data ops WITHOUT atomicity. The
 * caller (CLI, wired in a later plan) is responsible for surfacing a loud,
 * non-suppressible warning whenever this opt-in is exercised — this function
 * itself never silently degrades.
 *
 * @param db - The connected native `Db` to probe.
 * @param opts.allowNoTransaction - Explicit opt-in to bypass the replica-set
 * requirement (defaults to `false`).
 * @returns `{ hasReplicaSet }` reflecting the detected topology.
 * @throws {MongoatConnectionError} With `code: 'REPLICA_SET_REQUIRED'` when
 * the server is standalone and `allowNoTransaction` was not set.
 */
export async function assertReplicaSetOrThrow(
  db: Db,
  { allowNoTransaction = false }: { allowNoTransaction?: boolean } = {}
): Promise<{ hasReplicaSet: boolean }> {
  const hello = await db.command({ hello: 1 });
  const hasReplicaSet = Boolean(hello.setName) || hello.msg === 'isdbgrid';

  if (!hasReplicaSet && !allowNoTransaction) {
    throw new MongoatConnectionError(
      'This migration includes data operations that require a MongoDB replica set (or mongos) for transactions. ' +
        'Standalone MongoDB does not support transactions (driver error 20, IllegalOperation). ' +
        'Start MongoDB as a single-node replica set for local development, or pass --allow-no-transaction ' +
        'to run data operations WITHOUT atomicity (not recommended outside local dev).',
      { code: 'REPLICA_SET_REQUIRED' }
    );
  }

  return { hasReplicaSet };
}
