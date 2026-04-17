-- YouPiter BI — Initial Schema
-- Rollback: DROP TABLE audit_log, sync_log, stg_bitrix_leads, ai_keys, daily_park_stats,
--            workshop_events, hire_leads, cash_movements, shifts, drivers, cars, parks, tenant_settings CASCADE;

-- Tenant settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Parks (taxi park locations)
CREATE TABLE IF NOT EXISTS parks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cars
CREATE TABLE IF NOT EXISTS cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT UNIQUE NOT NULL,
  model TEXT,
  year INT,
  park_id UUID REFERENCES parks(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','repair','idle','sold')),
  taxicrm_id TEXT,
  acquired_at DATE,
  sold_at DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  park_id UUID REFERENCES parks(id),
  car_id UUID REFERENCES cars(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','trial','blocked','fired')),
  hire_date DATE,
  fire_date DATE,
  taxicrm_id TEXT,
  bitrix_lead_id TEXT,
  debt_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id),
  car_id UUID REFERENCES cars(id),
  park_id UUID REFERENCES parks(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  revenue_gross NUMERIC(12,2),
  commission_amount NUMERIC(12,2),
  park_fee NUMERIC(12,2),
  driver_net NUMERIC(12,2),
  source TEXT DEFAULT 'taxicrm' CHECK (source IN ('taxicrm','manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cash movements
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id UUID REFERENCES parks(id),
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer','debt_payment')),
  category TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  occurred_at TIMESTAMPTZ NOT NULL,
  counterparty TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('1c','sheets','manual')),
  source_doc_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Hire leads (from Bitrix24)
CREATE TABLE IF NOT EXISTS hire_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bitrix_id TEXT UNIQUE,
  assigned_to TEXT,
  status TEXT,
  source_id TEXT,
  park_id UUID REFERENCES parks(id),
  created_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  first_shift_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- Workshop events (СТО)
CREATE TABLE IF NOT EXISTS workshop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID REFERENCES cars(id),
  type TEXT NOT NULL CHECK (type IN ('scheduled_to','repair','inspection','tire_change','other')),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cost NUMERIC(12,2),
  parts_cost NUMERIC(12,2),
  contractor TEXT,
  mileage_at_event INT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Daily park stats (materialized-style, updated by cron)
CREATE TABLE IF NOT EXISTS daily_park_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  park_id UUID REFERENCES parks(id),
  cars_active INT DEFAULT 0,
  drivers_active INT DEFAULT 0,
  revenue_gross NUMERIC(12,2) DEFAULT 0,
  park_income NUMERIC(12,2) DEFAULT 0,
  shifts_count INT DEFAULT 0,
  avg_shift_revenue NUMERIC(12,2) DEFAULT 0,
  new_drivers INT DEFAULT 0,
  first_shifts INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, park_id)
);

-- AI keys (encrypted storage)
CREATE TABLE IF NOT EXISTS ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT,
  key_masked TEXT,
  key_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staging tables for raw data
CREATE TABLE IF NOT EXISTS stg_bitrix_leads (
  id BIGSERIAL PRIMARY KEY,
  bitrix_id TEXT UNIQUE NOT NULL,
  raw_data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error','partial')),
  records_count INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial parks
-- NOTE: Park names are data, not code — white-label safe
INSERT INTO parks (name, code, address) VALUES
  ('Ладожская', 'LAD', 'СПб, Ладожская'),
  ('Старая Деревня', 'STD', 'СПб, Старая Деревня'),
  ('Парнас', 'PAR', 'СПб, Парнас'),
  ('Девяткино', 'DEV', 'СПб, Девяткино'),
  ('Автово', 'AUT', 'СПб, Автово'),
  ('Лесная', 'LES', 'СПб, Лесная')
ON CONFLICT (code) DO NOTHING;
