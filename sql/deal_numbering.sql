-- Deal numbering infrastructure
-- Adds deal_number column, sequence tracking, generation function, and auto-set trigger

ALTER TABLE deals ADD COLUMN IF NOT EXISTS deal_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_deal_number ON deals(user_id, deal_number) WHERE deal_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS deal_number_sequences (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  last_year       int not null,
  last_month      int not null,
  last_sequence   int not null default 0,
  unique(user_id)
);

CREATE OR REPLACE FUNCTION generate_deal_number(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year     int;
  v_month    int;
  v_seq      int;
  v_existing deal_number_sequences%ROWTYPE;
BEGIN
  v_year  := extract(year from now()) % 100;
  v_month := extract(month from now());

  SELECT * INTO v_existing FROM deal_number_sequences WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    v_seq := 1;
    INSERT INTO deal_number_sequences (user_id, last_year, last_month, last_sequence)
    VALUES (p_user_id, v_year, v_month, 1);
  ELSE
    IF v_existing.last_year = v_year AND v_existing.last_month = v_month THEN
      v_seq := v_existing.last_sequence + 1;
      UPDATE deal_number_sequences SET last_sequence = v_seq WHERE id = v_existing.id;
    ELSE
      v_seq := 1;
      UPDATE deal_number_sequences SET last_year = v_year, last_month = v_month, last_sequence = 1 WHERE id = v_existing.id;
    END IF;
  END IF;

  RETURN 'DL-' || lpad(v_year::text, 2, '0') || lpad(v_month::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_deal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.deal_number IS NULL THEN
    NEW.deal_number := generate_deal_number(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_set_number ON deals;
CREATE TRIGGER trg_deals_set_number
  BEFORE INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION set_deal_number();
