require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

async function wipeAllAugust() {
  console.log('[WIPE] Initializing pg pool...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const testMonth = 'August 2026';
    
    // 1. Delete all August 2026 bills across all societies
    const delBills = await pool.query('DELETE FROM maintenance_bills WHERE billing_month = $1', [testMonth]);
    console.log(`[WIPE] Deleted ${delBills.rowCount} bills for "${testMonth}" across all societies.`);

    // 2. Delete all ledger entries for Maintenance Collection in August 2026
    const delLedger = await pool.query(
      'DELETE FROM financial_records WHERE account_head = \'Maintenance Collection\' AND description LIKE \'%- August 2026\''
    );
    console.log(`[WIPE] Deleted ${delLedger.rowCount} ledger collection entries across all societies.`);

    // 3. Recalculate outstanding dues for all societies
    const societies = await pool.query('SELECT id FROM societies');
    for (const soc of societies.rows) {
      const societyId = soc.id;
      
      await pool.query(
        `UPDATE society SET outstanding_dues = (
          SELECT COALESCE(SUM(amount), 0) FROM maintenance_bills 
          WHERE society_id = $1 AND status = 'Unpaid'
        ) WHERE society_id = $1`,
        [societyId]
      );

      await pool.query(
        `UPDATE society SET mtd_collection = (
          SELECT COALESCE(SUM(amount), 0) FROM financial_records 
          WHERE society_id = $1 AND type = 'income' AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
        ) WHERE society_id = $1`,
        [societyId]
      );
    }
    console.log('[WIPE] Outstanding dues and collection totals reset for all societies.');

  } catch (err) {
    console.error('❌ WIPE FAILED:', err.message);
  } finally {
    await pool.end();
  }
}

wipeAllAugust();
