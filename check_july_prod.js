require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT * FROM maintenance_bills WHERE billing_month = 'July 2026'");
    console.log(`July 2026 bills count: ${res.rowCount}`);
    if (res.rowCount > 0) {
      console.log('Sample:', res.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
