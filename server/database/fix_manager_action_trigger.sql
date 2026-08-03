-- Repair log_manager_action(): the shared trigger fires on BOTH transfers and
-- deliveries, but referenced transfers-only / deliveries-only columns directly on
-- the OLD/NEW record. PL/pgSQL binds every referenced field up front, so firing on
-- the "wrong" table raised: record "old" has no field "manager_approved_by".
-- Reading fields through to_jsonb() returns NULL for a missing column instead.

CREATE OR REPLACE FUNCTION thehealthshop.log_manager_action()
RETURNS TRIGGER AS $FN$
DECLARE
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'transfers'
     AND (o->>'manager_approved_by') IS NULL
     AND (n->>'manager_approved_by') IS NOT NULL THEN
    INSERT INTO thehealthshop.manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES ((n->>'manager_approved_by')::int, 'approve_transfer', 'transfer',
            (n->>'id')::int, (n->>'to_location_id')::int, 'Transfer approved by manager');
  END IF;

  IF TG_TABLE_NAME = 'deliveries'
     AND (o->>'manager_confirmed_by') IS NULL
     AND (n->>'manager_confirmed_by') IS NOT NULL THEN
    INSERT INTO thehealthshop.manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES ((n->>'manager_confirmed_by')::int, 'confirm_delivery', 'delivery',
            (n->>'id')::int, (n->>'to_location_id')::int, 'Delivery confirmed by manager');
  END IF;

  RETURN NEW;
END;
$FN$ LANGUAGE plpgsql;
