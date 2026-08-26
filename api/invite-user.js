import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify caller is authenticated admin
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admins only' });
  }

  // Invite user
  const { email, display_name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: display_name || email },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Record invitation
  await supabaseAdmin.from('invitations').insert({
    email,
    invited_by: user.id,
    status: 'pending',
  });

  return res.status(200).json({ success: true, user_id: data.user.id });
}
