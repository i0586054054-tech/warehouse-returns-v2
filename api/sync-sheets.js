import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// Supabase client for server-side
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

// Google Sheets auth
function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    // --- Sync barcodes ---
    const { data: barcodes, error: bErr } = await supabase
      .from('barcodes')
      .select('barcode, quantity, companies(name)')
      .order('barcode');

    if (bErr) throw bErr;

    const barcodeRows = [
      ['ברקוד', 'כמות', 'חברה'], // header
      ...(barcodes || []).map((b) => [
        b.barcode,
        b.quantity,
        b.companies?.name || '',
      ]),
    ];

    // Clear and write barcodes sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'ברקודים!A:C',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'ברקודים!A1',
      valueInputOption: 'RAW',
      requestBody: { values: barcodeRows },
    });

    // --- Sync companies ---
    const { data: companies, error: cErr } = await supabase
      .from('companies')
      .select('name, agent_name, has_agent, pickup_day, agent_visit_day, barcodes(count)')
      .order('name');

    if (cErr) throw cErr;

    const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    const companyRows = [
      ['חברה', 'סוכן', 'יש סוכן', 'יום הגעה', 'יום איסוף', 'ברקודים פתוחים'],
      ...(companies || []).map((c) => [
        c.name,
        c.agent_name || '',
        c.has_agent ? 'כן' : 'לא',
        c.agent_visit_day != null ? `יום ${DAYS[c.agent_visit_day]}` : '',
        c.pickup_day != null ? `יום ${DAYS[c.pickup_day]}` : '',
        c.barcodes?.[0]?.count || 0,
      ]),
    ];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'חברות!A:F',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'חברות!A1',
      valueInputOption: 'RAW',
      requestBody: { values: companyRows },
    });

    return res.status(200).json({
      success: true,
      synced: {
        barcodes: barcodeRows.length - 1,
        companies: companyRows.length - 1,
      },
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({
      error: 'Sync failed',
      message: err.message,
    });
  }
}
