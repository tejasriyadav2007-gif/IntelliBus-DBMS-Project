import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://intellibus:intellibus@localhost:5432/intellibus',
  max: process.env.NETLIFY ? 3 : 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

export async function expireSeatHolds(client = pool) {
  await client.query(`
    UPDATE seats
       SET status = 'available', hold_expires_at = NULL
     WHERE status = 'held' AND hold_expires_at <= NOW()
  `);
  await client.query(`
    UPDATE seat_holds SET status = 'expired'
     WHERE status = 'active' AND expires_at <= NOW()
  `);
}
