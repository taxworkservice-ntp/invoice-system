-- Assign deal numbers to legacy deals created before the deal_numbering migration
-- Calls the production generate_deal_number() function which manages the sequence
DO $$
DECLARE
  v_num1 text;
  v_num2 text;
  v_user_id uuid := '64f61c31-d87a-47e0-8695-28357e8a8465';
BEGIN
  v_num1 := generate_deal_number(v_user_id);
  v_num2 := generate_deal_number(v_user_id);

  UPDATE deals SET deal_number = v_num1
    WHERE id = '90584c76-deb6-4332-80e8-f31fead034cb' AND deal_number IS NULL;

  UPDATE deals SET deal_number = v_num2
    WHERE id = 'ac7d8b2d-04fe-4d1f-a20c-fc04937b6560' AND deal_number IS NULL;
END $$;
