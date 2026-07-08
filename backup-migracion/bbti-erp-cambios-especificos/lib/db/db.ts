import { Pool } from "pg";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const result = await db.query(text, params);
  return result.rows as T[];
}
