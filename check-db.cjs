require('dotenv').config();
const { pool } = require('./server/db.js');

pool.query('SELECT COUNT(*) AS n FROM cities')
  .then(r => console.log('Cities in Neon:', r.rows[0].n))
  .catch(e => console.error('Database error:', e.message))
  .finally(() => pool.end());
