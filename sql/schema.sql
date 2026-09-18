-- EMORA production MVP persistence.
-- Current application code uses one atomic JSONB state row so business logic stays identical
-- between local JSON and PostgreSQL. This is durable and transaction-safe for the first launch.
CREATE TABLE IF NOT EXISTS emora_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO emora_state(id,payload)
VALUES(1,'{"users":[],"projects":[],"media":[],"events":[],"responses":[]}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- Phase-2 scale target: normalize projects/events/payments when traffic requires it.
