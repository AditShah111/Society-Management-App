require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  try {
    const res = await pool.query("SELECT * FROM maintenance_bills WHERE billing_month = 'August 2026'");
    console.log(`August 2026 bills count: ${res.rowCount}`);
    if (res.rowCount > 0) {
      console.log('Sample bill:', res.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
