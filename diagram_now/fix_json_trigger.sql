-- Fix Trigger Function `update_machine_registry_func`
-- The issue is in `SELECT value->>0` because `value` comes from `jsonb_array_elements_text` which returns TEXT, not JSONB.
-- Text cannot be accessed with `->>`.

CREATE OR REPLACE FUNCTION update_machine_registry_func()
RETURNS TRIGGER AS $$
DECLARE
    mac TEXT;
    r_name TEXT;
BEGIN
    -- Skip if current_macs is NULL or empty
    IF NEW.current_macs IS NULL OR jsonb_array_length(NEW.current_macs) = 0 THEN
        RETURN NEW;
    END IF;

    -- Get room name
    SELECT room_name INTO r_name FROM public.room_seat_layouts WHERE id = NEW.layout_id;

    -- Iterate over MACs
    -- CHANGE: use `jsonb_array_elements_text` directly as the value
    FOR mac IN SELECT value FROM jsonb_array_elements_text(NEW.current_macs)
    LOOP
        INSERT INTO public.computer_machine_registry (mac_address, last_room_name, last_seat_number, last_ip, last_seen_at)
        VALUES (mac, r_name, NEW.seat_number::text, NEW.ip_address, NOW())
        ON CONFLICT (mac_address) 
        DO UPDATE SET 
            last_room_name = EXCLUDED.last_room_name,
            last_seat_number = EXCLUDED.last_seat_number,
            last_ip = EXCLUDED.last_ip,
            last_seen_at = EXCLUDED.last_seen_at;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
