import type { Sql } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { hashIdempotency } from "./crypto-utils";

export async function readIdempotent<T>(
  sql: Sql,
  key: string,
  userId: string,
  endpoint: string,
  body: unknown,
): Promise<T | null> {
  const requestHash = hashIdempotency(endpoint, body);
  const rows = await sql<{
    user_id: string;
    endpoint: string;
    request_hash: string;
    response: unknown;
  }>`
    select user_id, endpoint, request_hash, response
    from idempotency_keys
    where key = ${key}
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.user_id !== userId || row.endpoint !== endpoint) {
    throw new Error("Idempotency key already used.");
  }
  if (row.request_hash !== requestHash) {
    throw new Error("Idempotency key reused with a different request.");
  }
  return parseJson<T>(row.response, null as T);
}

export async function writeIdempotent(
  sql: Sql,
  key: string,
  userId: string,
  endpoint: string,
  body: unknown,
  response: unknown,
) {
  const requestHash = hashIdempotency(endpoint, body);
  try {
    await sql`
      insert into idempotency_keys (key, user_id, endpoint, request_hash, response)
      values (
        ${key},
        ${userId},
        ${endpoint},
        ${requestHash},
        ${JSON.stringify(response)}::jsonb
      )
    `;
  } catch {
    /* duplicate key — first writer won */
  }
}
