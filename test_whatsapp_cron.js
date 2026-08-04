require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const META_TOKEN = 'EAASB9dWq9DcBSEc1oC9qFUnNkqVPPL3KcIHFxXGYU6PXPn2YUEvdRkQQSiymWPzn5lZAEHYlIrCzVGgpWk2HYZC9A4rE8UdT3r48t3xXQ2JXyTUPfEgq0kR6vdPRUMYgEZBXqEicy2HDZABZCXUqYZCNwcd3F1pV3lFYOMAgHUpFPXSnoW1dvxgOdVoCGMcG6UbCwddita9w8yRPgsEImmiub1n5x5npyfDcfcVbBxlWXDGDRc4UXYo6Yk7vDPh4m4CMFRWexTfkJhLIyKIkcZCEFwr';
const PHONE_ID = '1157546194119435';

async function testWhatsApp() {
  try {
    const query = `
      SELECT b.id, b.flat_no, b.amount, b.due_date, p.name, p.phone
      FROM maintenance_bills b
      JOIN societies s ON b.society_id = s.id
      JOIN user_profiles p ON p.society_id = s.id AND (LOWER(p.name) = LOWER(b.member_name) OR p.phone IS NOT NULL)
      WHERE b.status = 'Unpaid' 
        AND b.due_date <= CURRENT_DATE - INTERVAL '15 days'
        AND b.whatsapp_reminder_sent = false
        AND p.phone IS NOT NULL
      LIMIT 1
    `;
    const overdueBills = await pool.query(query);
    console.log(`Found ${overdueBills.rows.length} overdue bills.`);

    for (const bill of overdueBills.rows) {
      console.log(`Attempting to send to ${bill.phone}`);
      // Remove any + or spaces, just numbers
      const toPhone = bill.phone.replace(/[^0-9]/g, '');
      
      const payload = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "template",
        template: {
          name: "hello_world", // The default pre-approved template in all new Meta apps
          language: { code: "en_US" }
        }
      };

      const response = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${META_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(data, null, 2));

      if (response.ok) {
        console.log(`Successfully sent reminder to ${bill.phone} for bill ${bill.id}`);
        // await pool.query('UPDATE maintenance_bills SET whatsapp_reminder_sent = true WHERE id = $1', [bill.id]);
      } else {
        console.error(`Meta API Error for ${bill.phone}:`, data);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
testWhatsApp();
