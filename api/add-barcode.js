import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

export default async function handler(req, res) {
  // CORS headers for ChatGPT Actions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Return all open barcodes (for ChatGPT to read)
    const supabase = getSupabase();
    const { data } = await supabase
      .from('barcodes')
      .select('barcode, quantity, companies(name)')
      .order('barcode');
    return res.status(200).json({ barcodes: data || [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const { barcode, quantity, company_name, product_name } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    // Find company by name
    let companyId = null;
    if (company_name) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .ilike('name', `%${company_name}%`)
        .limit(1);

      if (companies && companies.length > 0) {
        companyId = companies[0].id;
      } else {
        // Create new company if not found
        const { data: newCompany } = await supabase
          .from('companies')
          .insert({ name: company_name, has_agent: false })
          .select('id')
          .single();
        if (newCompany) companyId = newCompany.id;
      }
    }

    // Check if barcode exists
    const { data: existing } = await supabase
      .from('barcodes')
      .select('id, quantity, companies(name)')
      .eq('barcode', barcode.trim())
      .maybeSingle();

    let result;
    if (existing) {
      // Update quantity
      const newQty = quantity || existing.quantity;
      const updateData = { quantity: newQty };
      if (companyId) updateData.company_id = companyId;
      if (product_name) updateData.product_name = product_name.trim();

      await supabase.from('barcodes').update(updateData).eq('id', existing.id);
      result = {
        action: 'updated',
        barcode,
        quantity: newQty,
        company: company_name || existing.companies?.name || 'לא ידועה',
      };
    } else {
      // Insert new barcode
      const insertData = {
        barcode: barcode.trim(),
        quantity: quantity || 1,
        company_id: companyId,
      };
      if (product_name) insertData.product_name = product_name.trim();
      const { error } = await supabase.from('barcodes').insert(insertData);

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      result = {
        action: 'created',
        barcode,
        quantity: quantity || 1,
        company: company_name || 'לא צוינה',
      };
    }

    // Trigger Google Sheets sync in background
    try {
      const baseUrl = `https://${req.headers.host}`;
      fetch(`${baseUrl}/api/sync-sheets`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      // ignore
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('Add barcode error:', err);
    return res.status(500).json({ error: err.message });
  }
}
