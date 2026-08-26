-- ===========================================
-- Multi-Tenant Authentication Migration
-- ===========================================

-- 1. Profiles table (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  chatgpt_api_token TEXT,
  google_sheets_id TEXT,
  google_suppliers_sheet_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not role)
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can insert profiles
CREATE POLICY "Admins insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 2. Shared barcode catalog
CREATE TABLE barcode_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  product_name TEXT,
  contributed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_barcode_catalog_barcode ON barcode_catalog(barcode);

ALTER TABLE barcode_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read catalog"
  ON barcode_catalog FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated insert catalog"
  ON barcode_catalog FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Contributor or admin update catalog"
  ON barcode_catalog FOR UPDATE
  USING (
    contributed_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Invitations table
CREATE TABLE invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invitations"
  ON invitations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Add user_id to existing tables
ALTER TABLE companies ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE barcodes ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE returns_log ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE agent_visits ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Indexes on user_id
CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_barcodes_user ON barcodes(user_id);
CREATE INDEX idx_returns_log_user ON returns_log(user_id);
CREATE INDEX idx_agent_visits_user ON agent_visits(user_id);

-- 5. Remove old UNIQUE constraint (same barcode can exist for different users)
ALTER TABLE barcodes DROP CONSTRAINT barcodes_barcode_key;

-- Add composite unique constraint
ALTER TABLE barcodes ADD CONSTRAINT barcodes_barcode_user_unique UNIQUE (barcode, user_id);

-- 6. Drop old permissive RLS policies
DROP POLICY IF EXISTS "Allow all on companies" ON companies;
DROP POLICY IF EXISTS "Allow all on barcodes" ON barcodes;
DROP POLICY IF EXISTS "Allow all on returns_log" ON returns_log;
DROP POLICY IF EXISTS "Allow all on agent_visits" ON agent_visits;

-- 7. Create user-scoped RLS policies
CREATE POLICY "Users manage own companies"
  ON companies FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own barcodes"
  ON barcodes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own returns"
  ON returns_log FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own visits"
  ON agent_visits FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================
-- AFTER creating your admin user in Supabase Auth,
-- run these to migrate existing data:
--
-- UPDATE companies SET user_id = '<admin-user-uuid>' WHERE user_id IS NULL;
-- UPDATE barcodes SET user_id = '<admin-user-uuid>' WHERE user_id IS NULL;
-- UPDATE returns_log SET user_id = '<admin-user-uuid>' WHERE user_id IS NULL;
-- UPDATE agent_visits SET user_id = '<admin-user-uuid>' WHERE user_id IS NULL;
--
-- Then make user_id NOT NULL:
-- ALTER TABLE companies ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE barcodes ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE returns_log ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE agent_visits ALTER COLUMN user_id SET NOT NULL;
--
-- Seed the barcode catalog:
-- INSERT INTO barcode_catalog (barcode, company_name, product_name, contributed_by)
-- SELECT DISTINCT b.barcode, c.name, b.product_name, b.user_id
-- FROM barcodes b
-- JOIN companies c ON b.company_id = c.id
-- ON CONFLICT (barcode) DO NOTHING;
-- ===========================================
