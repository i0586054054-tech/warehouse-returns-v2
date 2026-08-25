-- ===========================================
-- מערכת ניהול החזרות למחסן — Supabase Schema
-- ===========================================

-- טבלת חברות
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  agent_name TEXT,
  agent_phone TEXT,
  pickup_day INTEGER, -- 0=ראשון ... 6=שבת
  agent_visit_day INTEGER, -- 0=ראשון ... 6=שבת
  has_agent BOOLEAN DEFAULT false,
  notes TEXT,
  -- דחיות: אם לא null, המערכת תציג את החברה רק מתאריך זה ואילך
  next_visit_override DATE,
  next_pickup_override DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- טבלת ברקודים / מוצרים
CREATE TABLE barcodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  product_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- לוג החזרות
CREATE TABLE returns_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  return_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('הוחזר', 'לא נאסף', 'נדחה')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ביקורי סוכנים
CREATE TABLE agent_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  actual_status TEXT DEFAULT 'ממתין' CHECK (actual_status IN ('ממתין', 'הוחתם', 'נדחה לשבוע הבא')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_barcodes_barcode ON barcodes(barcode);
CREATE INDEX idx_barcodes_company ON barcodes(company_id);
CREATE INDEX idx_agent_visits_date ON agent_visits(scheduled_date);
CREATE INDEX idx_agent_visits_company ON agent_visits(company_id);
CREATE INDEX idx_returns_log_company ON returns_log(company_id);
CREATE INDEX idx_returns_log_date ON returns_log(return_date);

-- Auto-update updated_at on barcodes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER barcodes_updated_at
  BEFORE UPDATE ON barcodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS Policies (basic - allow all for now, tighten later)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on companies" ON companies FOR ALL USING (true);
CREATE POLICY "Allow all on barcodes" ON barcodes FOR ALL USING (true);
CREATE POLICY "Allow all on returns_log" ON returns_log FOR ALL USING (true);
CREATE POLICY "Allow all on agent_visits" ON agent_visits FOR ALL USING (true);

-- ===========================================
-- Migration script for existing databases:
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_visit_override DATE;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_pickup_override DATE;
-- ===========================================
