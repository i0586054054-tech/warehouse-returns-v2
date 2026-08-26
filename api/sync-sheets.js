import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();

    // Identify user from JWT (frontend calls) or fall back to global sync
    let userId = null;
    let barcodesSheetId = process.env.GOOGLE_SHEETS_ID;
    let suppliersSheetId = process.env.GOOGLE_SUPPLIERS_SHEET_ID;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        // Check if user has personal sheet IDs
        const { data: profile } = await supabase
          .from('profiles')
          .select('google_sheets_id, google_suppliers_sheet_id')
          .eq('id', userId)
          .single();
        if (profile?.google_sheets_id) barcodesSheetId = profile.google_sheets_id;
        if (profile?.google_suppliers_sheet_id) suppliersSheetId = profile.google_suppliers_sheet_id;
      }
    }

    if (!barcodesSheetId) {
      return res.status(200).json({ success: true, skipped: 'No sheet ID configured' });
    }

    const sheets = getSheets();

    // Build query — scope to user if authenticated
    let barcodesQuery = supabase
      .from('barcodes')
      .select('barcode, quantity, companies(name)')
      .order('barcode');
    if (userId) barcodesQuery = barcodesQuery.eq('user_id', userId);

    const { data: barcodes, error: bErr } = await barcodesQuery;
    if (bErr) throw bErr;

    const barcodeRows = [
      ['ברקוד', 'כמות', 'חברה'],
      ...(barcodes || []).map((b) => [
        b.barcode,
        b.quantity,
        b.companies?.name || '',
      ]),
    ];

    await sheets.spreadsheets.values.clear({
      spreadsheetId: barcodesSheetId,
      range: 'ברקודים!A:C',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: barcodesSheetId,
      range: 'ברקודים!A1',
      valueInputOption: 'RAW',
      requestBody: { values: barcodeRows },
    });

    // --- Sync companies ---
    let companiesQuery = supabase
      .from('companies')
      .select('name, agent_name, has_agent, pickup_day, agent_visit_day, notes, barcodes(count)')
      .order('name');
    if (userId) companiesQuery = companiesQuery.eq('user_id', userId);

    const { data: companies, error: cErr } = await companiesQuery;
    if (cErr) throw cErr;

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
      spreadsheetId: barcodesSheetId,
      range: 'חברות!A:F',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: barcodesSheetId,
      range: 'חברות!A1',
      valueInputOption: 'RAW',
      requestBody: { values: companyRows },
    });

    // --- Sync to suppliers tracking sheet ---
    if (suppliersSheetId) {
      const hasAgentLabel = (c) => {
        if (c.has_agent) return 'כן';
        if (c.notes && c.notes.includes('בווטסאפ')) return 'בווטסאפ';
        return 'לא';
      };

      const supplierRows = [
        ['שם החברה', 'צריך סוכן או לא', 'יום של סוכן', 'יום של משלוח', 'האם יש חזרות או לא', 'הערות'],
        ...(companies || []).map((c) => [
          c.name,
          hasAgentLabel(c),
          c.agent_visit_day != null ? DAYS[c.agent_visit_day] : '',
          c.pickup_day != null ? DAYS[c.pickup_day] : '',
          (c.barcodes?.[0]?.count || 0) > 0 ? 'כן' : '',
          c.notes || '',
        ]),
      ];

      try {
        const spreadsheet = await sheets.spreadsheets.get({
          spreadsheetId: suppliersSheetId,
        });
        const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';

        await sheets.spreadsheets.values.clear({
          spreadsheetId: suppliersSheetId,
          range: `${sheetName}!A:F`,
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId: suppliersSheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: supplierRows },
        });
      } catch (suppErr) {
        console.error('Suppliers sheet sync error:', suppErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      synced: {
        barcodes: barcodeRows.length - 1,
        companies: companyRows.length - 1,
      },
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: 'Sync failed', message: err.message });
  }
}
