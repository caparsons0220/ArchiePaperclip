import postgres from "postgres";

export type PostgresClientOptions = NonNullable<Parameters<typeof postgres>[1]>;

function parseConnectionString(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isSupabasePoolerUrl(url: string): boolean {
  const parsed = parseConnectionString(url);
  if (!parsed) return false;

  return parsed.hostname.toLowerCase().endsWith(".pooler.supabase.com") && parsed.port === "6543";
}

export function buildPostgresClientOptions(
  url: string,
  options: PostgresClientOptions = {},
): PostgresClientOptions {
  if (!isSupabasePoolerUrl(url)) return options;
  return { ...options, prepare: false };
}

export function createPostgresClient(
  url: string,
  options: PostgresClientOptions = {},
) {
  return postgres(url, buildPostgresClientOptions(url, options));
}
