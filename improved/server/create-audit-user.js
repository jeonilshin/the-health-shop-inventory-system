require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: '-c search_path=improved',
});

(async () => {
  const existing = await pool.query("SELECT id, username FROM users WHERE username = 'audit' LIMIT 1");
  if (existing.rows.length > 0) {
    console.log('Audit user already exists:', existing.rows[0]);
    await pool.end(); return;
  }
  const hash = await bcrypt.hash('audit2025!', 10);
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ('audit', $1, 'Audit Account', 'audit', true)
     RETURNING id, username, role`,
    [hash]
  );
  console.log('Created audit user:', res.rows[0]);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
