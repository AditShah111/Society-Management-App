require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);');
    await pool.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN DEFAULT false;');

    const soc = await pool.query('SELECT id FROM societies LIMIT 1');
    if (soc.rows.length === 0) return console.log('No societies found.');
    const societyId = soc.rows[0].id;
    
    await pool.query(`
      INSERT INTO users (email, salt, password_hash)
      VALUES ('adit.test.whatsapp@gmail.com', 'salt', 'hash')
      ON CONFLICT (email) DO NOTHING
    `);

    await pool.query(`DELETE FROM user_profiles WHERE email = 'adit.test.whatsapp@gmail.com'`);
    await pool.query(`
      INSERT INTO user_profiles (email, society_id, name, phone, role)
      VALUES ('adit.test.whatsapp@gmail.com', $1, 'Adit Shah', '919920044243', 'resident')
    `, [societyId]);

    await pool.query(`
      INSERT INTO maintenance_bills (flat_no, member_name, amount, status, society_id, due_date)
      VALUES ('W-101', 'Adit Shah', 2500, 'Unpaid', $1, CURRENT_DATE - INTERVAL '16 days')
    `, [societyId]);

    console.log('Inserted test data for 9920044243');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
