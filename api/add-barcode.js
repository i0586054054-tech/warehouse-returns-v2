import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  // CORS headers for ChatGPT Actions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  // Authenticate via ChatGPT API token
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Token required. Generate one in Settings.' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('chatgpt_api_token', token)
    .single();

  if (!profile) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = profile.id;

  if (req.method === 'GET') {
    // Return all open barcodes for this user
    const { data } = await supabase
      .from('barcodes')
      .select('barcode, quantity, product_name, companies(name)')
      .eq('user_id', userId)
      .order('barcode');
    return res.status(200).json({ barcodes: data || [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barcode, quantity, company_name, product_name } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    // Find company by name (within user's companies)
    let companyId = null;
    if (company_name) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', `%${company_name}%`)
        .limit(1);

      if (companies && companies.length > 0) {
        companyId = companies[0].id;
      } else {
        // Create new company for this user
        const { data: newCompany } = await supabase
          .from('companies')
          .insert({ name: company_name, has_agent: false, user_id: userId })
          .select('id')
          .single();
        if (newCompany) companyId = newCompany.id;
      }
    }

    // Check if barcode exists for this user
    const { data: existing } = await supabase
      .from('barcodes')
      .select('id, quantity, companies(name)')
      .eq('barcode', barcode.trim())
      .eq('user_id', userId)
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
        user_id: userId,
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

    // Contribute to shared catalog
    if (company_name) {
      await supabase.from('barcode_catalog').upsert(
        {
          barcode: barcode.trim(),
          company_name,
          product_name: product_name?.trim() || null,
          contributed_by: userId,
        },
        { onConflict: 'barcode' }
      ).catch(() => {});
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
