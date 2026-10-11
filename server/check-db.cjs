
require('dotenv').config();

const { pool } = require('./server/db.js');

async function main() {
  try {
    const result = await pool.query('SELECT COUNT(*) AS n FROM cities');
    console.log('Cities in Neon:', result.rows[0].n);
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
