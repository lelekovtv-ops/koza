import pg from "pg"

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message)
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now()
  const result = await pool.query<T>(text, params)
  const ms = Date.now() - start
  if (ms > 500) {
    console.warn(`[db] Slow query (${ms}ms): ${text.slice(0, 80)}`)
  }
  return result
}

export async function getClient() {
  return pool.connect()
}

export { pool }
