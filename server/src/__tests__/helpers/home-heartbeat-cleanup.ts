import { setTimeout as delay } from "node:timers/promises";
import {
  activityLog,
  agentRuntimeState,
  agentTaskSessions,
  agentWakeupRequests,
  createDb,
  heartbeatRunEvents,
  heartbeatRuns,
} from "@paperclipai/db";
import { eq, sql } from "drizzle-orm";

type HomeHeartbeatCleanupSnapshot = {
  activityLog: number;
  heartbeatRunEvents: number;
  heartbeatRuns: number;
  runningHeartbeatRuns: number;
  agentWakeupRequests: number;
  agentTaskSessions: number;
  agentRuntimeState: number;
};

const COUNT_SQL = sql<number>`count(*)::int`;

async function getCount(
  promise: Promise<Array<{ count: number }>>,
): Promise<number> {
  return await promise.then((rows) => rows[0]?.count ?? 0);
}

async function getHeartbeatCleanupSnapshot(
  db: ReturnType<typeof createDb>,
): Promise<HomeHeartbeatCleanupSnapshot> {
  const [
    activityLogCount,
    heartbeatRunEventsCount,
    heartbeatRunsCount,
    runningHeartbeatRunsCount,
    agentWakeupRequestsCount,
    agentTaskSessionsCount,
    agentRuntimeStateCount,
  ] = await Promise.all([
    getCount(db.select({ count: COUNT_SQL }).from(activityLog)),
    getCount(db.select({ count: COUNT_SQL }).from(heartbeatRunEvents)),
    getCount(db.select({ count: COUNT_SQL }).from(heartbeatRuns)),
    getCount(
      db
        .select({ count: COUNT_SQL })
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.status, "running")),
    ),
    getCount(db.select({ count: COUNT_SQL }).from(agentWakeupRequests)),
    getCount(db.select({ count: COUNT_SQL }).from(agentTaskSessions)),
    getCount(db.select({ count: COUNT_SQL }).from(agentRuntimeState)),
  ]);

  return {
    activityLog: activityLogCount,
    heartbeatRunEvents: heartbeatRunEventsCount,
    heartbeatRuns: heartbeatRunsCount,
    runningHeartbeatRuns: runningHeartbeatRunsCount,
    agentWakeupRequests: agentWakeupRequestsCount,
    agentTaskSessions: agentTaskSessionsCount,
    agentRuntimeState: agentRuntimeStateCount,
  };
}

function isQuiescentSnapshot(
  previous: HomeHeartbeatCleanupSnapshot,
  current: HomeHeartbeatCleanupSnapshot,
): boolean {
  return current.runningHeartbeatRuns === 0
    && previous.activityLog === current.activityLog
    && previous.heartbeatRunEvents === current.heartbeatRunEvents
    && previous.heartbeatRuns === current.heartbeatRuns
    && previous.agentWakeupRequests === current.agentWakeupRequests
    && previous.agentTaskSessions === current.agentTaskSessions
    && previous.agentRuntimeState === current.agentRuntimeState;
}

function isEmptySnapshot(snapshot: HomeHeartbeatCleanupSnapshot): boolean {
  return snapshot.activityLog === 0
    && snapshot.heartbeatRunEvents === 0
    && snapshot.heartbeatRuns === 0
    && snapshot.runningHeartbeatRuns === 0
    && snapshot.agentWakeupRequests === 0
    && snapshot.agentTaskSessions === 0
    && snapshot.agentRuntimeState === 0;
}

function formatSnapshot(snapshot: HomeHeartbeatCleanupSnapshot): string {
  return JSON.stringify(snapshot);
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return String(error);
}

async function waitForHeartbeatQuiescence(
  db: ReturnType<typeof createDb>,
  maxPolls = 12,
): Promise<HomeHeartbeatCleanupSnapshot> {
  let previous = await getHeartbeatCleanupSnapshot(db);

  for (let poll = 0; poll < maxPolls; poll += 1) {
    await delay(25 * (poll + 1));
    const current = await getHeartbeatCleanupSnapshot(db);
    if (isQuiescentSnapshot(previous, current)) {
      return current;
    }
    previous = current;
  }

  return previous;
}

export async function cleanupHomeHeartbeatSideEffects(
  db: ReturnType<typeof createDb>,
): Promise<void> {
  let lastSnapshot = await getHeartbeatCleanupSnapshot(db);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    lastSnapshot = await waitForHeartbeatQuiescence(db);

    try {
      await db.transaction(async (tx) => {
        await tx.delete(activityLog);
        await tx.delete(heartbeatRunEvents);
        await tx.delete(heartbeatRuns);
        await tx.delete(agentWakeupRequests);
        await tx.delete(agentTaskSessions);
        await tx.delete(agentRuntimeState);
      });

      lastSnapshot = await getHeartbeatCleanupSnapshot(db);
      if (isEmptySnapshot(lastSnapshot)) {
        return;
      }

      lastError = new Error(`Residual heartbeat rows remained after cleanup: ${formatSnapshot(lastSnapshot)}`);
    } catch (error) {
      lastError = error;
      lastSnapshot = await getHeartbeatCleanupSnapshot(db).catch(() => lastSnapshot);
    }

    if (attempt < 7) {
      await delay(50 * (attempt + 1));
    }
  }

  throw new Error(
    `Failed to cleanup Home heartbeat side effects. Last snapshot: ${formatSnapshot(lastSnapshot)}. Last error: ${formatError(lastError)}`,
  );
}
