-- ── 007_ingest_extended.sql ──────────────────────────────────────────────────
-- Extended ingest tables: trips, balances, transactions, payouts, penalties,
-- rentals, shift details, hire funnel, aggregator cabinets, references

-- Поездки (taxicrm /trip/list)
CREATE TABLE IF NOT EXISTS trips (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT,
  driver_id     TEXT,
  car_plate     TEXT,
  park_code     TEXT,
  trip_date     DATE NOT NULL,
  aggregator    TEXT,
  cabinet_id    TEXT,
  trips_count   INTEGER DEFAULT 1,
  revenue       NUMERIC(12,2),
  source        TEXT NOT NULL DEFAULT 'taxicrm',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS trips_date_idx       ON trips (trip_date);
CREATE INDEX IF NOT EXISTS trips_driver_idx     ON trips (driver_id);
CREATE INDEX IF NOT EXISTS trips_park_idx       ON trips (park_code);

-- Балансы водителей (taxicrm /user/balance/get)
CREATE TABLE IF NOT EXISTS driver_balances (
  id            BIGSERIAL PRIMARY KEY,
  driver_id     TEXT NOT NULL,
  balance_date  DATE NOT NULL,
  aggregator    TEXT,
  cabinet_id    TEXT,
  balance       NUMERIC(12,2),
  source        TEXT NOT NULL DEFAULT 'taxicrm',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, balance_date, aggregator, source)
);
CREATE INDEX IF NOT EXISTS driver_balances_driver_idx ON driver_balances (driver_id);
CREATE INDEX IF NOT EXISTS driver_balances_date_idx   ON driver_balances (balance_date);

-- Транзакции водителей (taxicrm /user/transaction/list)
CREATE TABLE IF NOT EXISTS driver_transactions (
  id               BIGSERIAL PRIMARY KEY,
  external_id      TEXT,
  driver_id        TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  direction        SMALLINT,           -- 1=приход, 2=расход
  amount           NUMERIC(12,2),
  transaction_type TEXT,
  description      TEXT,
  account          TEXT,
  cabinet_id       TEXT,
  source           TEXT NOT NULL DEFAULT 'taxicrm',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS driver_tx_driver_idx ON driver_transactions (driver_id);
CREATE INDEX IF NOT EXISTS driver_tx_date_idx   ON driver_transactions (transaction_date);

-- Транзакции авто (taxicrm /car/transaction/list)
CREATE TABLE IF NOT EXISTS car_transactions (
  id               BIGSERIAL PRIMARY KEY,
  external_id      TEXT,
  car_id           TEXT,
  car_plate        TEXT,
  transaction_date DATE NOT NULL,
  direction        SMALLINT,           -- 1=приход, 2=расход
  amount           NUMERIC(12,2),
  transaction_type TEXT,
  description      TEXT,
  source           TEXT NOT NULL DEFAULT 'taxicrm',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS car_tx_car_idx  ON car_transactions (car_id);
CREATE INDEX IF NOT EXISTS car_tx_date_idx ON car_transactions (transaction_date);

-- Выплаты водителям (taxicrm /user/payout/list)
CREATE TABLE IF NOT EXISTS driver_payouts (
  id           BIGSERIAL PRIMARY KEY,
  external_id  TEXT,
  driver_id    TEXT NOT NULL,
  payout_date  DATE NOT NULL,
  amount       NUMERIC(12,2),
  method       TEXT,
  status       TEXT,
  source       TEXT NOT NULL DEFAULT 'taxicrm',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS payouts_driver_idx ON driver_payouts (driver_id);
CREATE INDEX IF NOT EXISTS payouts_date_idx   ON driver_payouts (payout_date);

-- Штрафы (taxicrm /penalty/list + /penalty/get)
CREATE TABLE IF NOT EXISTS penalties (
  id              BIGSERIAL PRIMARY KEY,
  external_id     TEXT,
  car_id          TEXT,
  car_plate       TEXT,
  penalty_date    TIMESTAMPTZ,
  penalty_source  TEXT,               -- ГИБДД, внутренний и т.д.
  uin             TEXT,
  ruling          TEXT,
  amount          NUMERIC(10,2),
  amount_discount NUMERIC(10,2),
  description     TEXT,
  status          TEXT,
  discount_till   DATE,
  source          TEXT NOT NULL DEFAULT 'taxicrm',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS penalties_car_idx  ON penalties (car_plate);
CREATE INDEX IF NOT EXISTS penalties_date_idx ON penalties (penalty_date);

-- Договоры аренды авто (taxicrm /cars/rents/list)
CREATE TABLE IF NOT EXISTS car_rentals (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT,
  car_id        TEXT,
  driver_id     TEXT,
  date_start    DATE,
  date_end      DATE,
  expected_end  DATE,
  amount        NUMERIC(10,2),
  period        TEXT,                 -- час/день/неделя
  rent_type     TEXT,                 -- usual/agency
  payment_type  TEXT,                 -- pre/post
  deposit       NUMERIC(10,2),
  status        SMALLINT,             -- 0=closed,1=active,2=paused
  source        TEXT NOT NULL DEFAULT 'taxicrm',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
CREATE INDEX IF NOT EXISTS rentals_car_idx    ON car_rentals (car_id);
CREATE INDEX IF NOT EXISTS rentals_driver_idx ON car_rentals (driver_id);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON car_rentals (status);

-- Детали смен — наличные (taxicrm /shifts/stat/get)
CREATE TABLE IF NOT EXISTS shift_details (
  id                BIGSERIAL PRIMARY KEY,
  external_shift_id TEXT,
  driver_id         TEXT,
  shift_date        DATE,
  cash_handed       NUMERIC(10,2),
  cash_not_handed   NUMERIC(10,2),
  source            TEXT NOT NULL DEFAULT 'taxicrm',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_shift_id, source)
);
CREATE INDEX IF NOT EXISTS shift_details_driver_idx ON shift_details (driver_id);
CREATE INDEX IF NOT EXISTS shift_details_date_idx   ON shift_details (shift_date);

-- Воронка найма CRM (taxicrm /crm/funnels/list)
CREATE TABLE IF NOT EXISTS hire_funnel_stats (
  id          BIGSERIAL PRIMARY KEY,
  funnel_id   TEXT,
  funnel_name TEXT,
  stage_name  TEXT,
  deals_count INTEGER DEFAULT 0,
  stat_date   DATE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'taxicrm',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, stage_name, stat_date, source)
);
CREATE INDEX IF NOT EXISTS hire_funnel_date_idx ON hire_funnel_stats (stat_date);

-- Кабинеты агрегаторов (taxicrm /cabinets/list)
CREATE TABLE IF NOT EXISTS aggregator_cabinets (
  id           BIGSERIAL PRIMARY KEY,
  external_id  TEXT NOT NULL,
  aggregator   TEXT NOT NULL,          -- yandex, uber, gett и т.д.
  name         TEXT,
  status       SMALLINT,               -- 0=неактивен,1=активен,5=обновляется,6=заблокирован
  last_success TIMESTAMPTZ,
  source       TEXT NOT NULL DEFAULT 'taxicrm',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);

-- Настройки выплат водителей (taxicrm /user/payout/settings/get)
CREATE TABLE IF NOT EXISTS payout_settings (
  id           BIGSERIAL PRIMARY KEY,
  driver_id    TEXT NOT NULL,
  method       TEXT,
  period       TEXT,
  period_value INTEGER,
  source       TEXT NOT NULL DEFAULT 'taxicrm',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, source)
);

-- Справочник типов транзакций (taxicrm /user/transaction/types/list)
CREATE TABLE IF NOT EXISTS transaction_types (
  id          BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  entity_type TEXT,                   -- user/car
  source      TEXT NOT NULL DEFAULT 'taxicrm',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, source)
);
