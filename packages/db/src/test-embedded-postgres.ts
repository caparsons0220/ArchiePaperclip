import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { applyPendingMigrations, ensurePostgresDatabase } from "./client.js";

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

export type EmbeddedPostgresTestSupport = {
  supported: boolean;
  reason?: string;
};

export type EmbeddedPostgresTestDatabase = {
  connectionString: string;
  cleanup(): Promise<void>;
};

let embeddedPostgresSupportPromise: Promise<EmbeddedPostgresTestSupport> | null = null;
const TRANSIENT_RM_ERROR_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

function getErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function isTransientRemoveDirError(error: unknown): boolean {
  return TRANSIENT_RM_ERROR_CODES.has(getErrorCode(error));
}

async function removeDirWithRetry(targetPath: string, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isTransientRemoveDirError(error) || attempt === attempts - 1) {
        throw error;
      }
      await delay(50 * (attempt + 1));
    }
  }
}

async function cleanupEmbeddedPostgresDataDir(
  instance: EmbeddedPostgresInstance,
  dataDir: string,
  {
    warnOnlyOnTransientFailure = false,
  }: {
    warnOnlyOnTransientFailure?: boolean;
  } = {},
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await instance.stop().catch(() => {});
    await delay(50 * (attempt + 1));

    try {
      await removeDirWithRetry(dataDir, 3);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientRemoveDirError(error)) {
        throw error;
      }
    }
  }

  if (lastError && warnOnlyOnTransientFailure && isTransientRemoveDirError(lastError)) {
    console.warn(
      `[test-embedded-postgres] Leaving temp database directory in place after transient cleanup failures: ${dataDir} (${formatEmbeddedPostgresError(lastError)})`,
    );
    return;
  }

  if (lastError) {
    throw lastError;
  }
}

async function getEmbeddedPostgresCtor(): Promise<EmbeddedPostgresCtor> {
  const mod = await import("embedded-postgres");
  return mod.default as EmbeddedPostgresCtor;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate test port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function formatEmbeddedPostgresError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "embedded Postgres startup failed";
}

async function probeEmbeddedPostgresSupport(): Promise<EmbeddedPostgresTestSupport> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-embedded-postgres-probe-"));
  const port = await getAvailablePort();
  const EmbeddedPostgres = await getEmbeddedPostgresCtor();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });

  try {
    await instance.initialise();
    await instance.start();
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: formatEmbeddedPostgresError(error),
    };
  } finally {
    await cleanupEmbeddedPostgresDataDir(instance, dataDir, {
      warnOnlyOnTransientFailure: true,
    }).catch((cleanupError) => {
      console.warn(
        `[test-embedded-postgres] Cleanup after support probe failed for ${dataDir}: ${formatEmbeddedPostgresError(cleanupError)}`,
      );
    });
  }
}

export async function getEmbeddedPostgresTestSupport(): Promise<EmbeddedPostgresTestSupport> {
  if (!embeddedPostgresSupportPromise) {
    embeddedPostgresSupportPromise = probeEmbeddedPostgresSupport();
  }
  return await embeddedPostgresSupportPromise;
}

export async function startEmbeddedPostgresTestDatabase(
  tempDirPrefix: string,
): Promise<EmbeddedPostgresTestDatabase> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
  const port = await getAvailablePort();
  const EmbeddedPostgres = await getEmbeddedPostgresCtor();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });

  try {
    await instance.initialise();
    await instance.start();

    const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
    await ensurePostgresDatabase(adminConnectionString, "paperclip");
    const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
    await applyPendingMigrations(connectionString);

    return {
      connectionString,
      cleanup: async () => {
        await cleanupEmbeddedPostgresDataDir(instance, dataDir, {
          warnOnlyOnTransientFailure: true,
        });
      },
    };
  } catch (error) {
    let cleanupError: unknown = null;
    await cleanupEmbeddedPostgresDataDir(instance, dataDir, {
      warnOnlyOnTransientFailure: true,
    }).catch((innerError) => {
      cleanupError = innerError;
    });
    throw new Error(
      `Failed to start embedded PostgreSQL test database: ${formatEmbeddedPostgresError(error)}${
        cleanupError ? ` (cleanup also failed: ${formatEmbeddedPostgresError(cleanupError)})` : ""
      }`,
    );
  }
}
