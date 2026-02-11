-- =============================================
-- PART 1: Schema Evolution for Auto-Discovery
-- =============================================

-- 1.1 ปรับปรุงตาราง room_seat_ip_mappings
-- ปลดล็อค constraint ที่บังคับว่า IP ต้องห้ามว่าง (เพื่อให้ Unbind ที่นั่งได้)
ALTER TABLE public.room_seat_ip_mappings DROP CONSTRAINT IF EXISTS valid_ip_address;
ALTER TABLE public.room_seat_ip_mappings ALTER COLUMN ip_address DROP NOT NULL;

-- เปลี่ยนระบบ MAC Address จาก Text เป็น JSON Array เพื่อรองรับหลาย Interface (LAN/WiFi)
ALTER TABLE public.room_seat_ip_mappings DROP COLUMN IF EXISTS mac_address;
ALTER TABLE public.room_seat_ip_mappings ADD COLUMN IF NOT EXISTS current_macs JSONB DEFAULT '[]'::jsonb;

-- เพิ่ม Constraint ห้ามที่นั่งซ้ำใน Layout เดียวกัน (ถ้ายังไม่มี)
ALTER TABLE public.room_seat_ip_mappings DROP CONSTRAINT IF EXISTS unique_layout_seat;
ALTER TABLE public.room_seat_ip_mappings ADD CONSTRAINT unique_layout_seat UNIQUE (layout_id, seat_number);


-- 1.2 สร้างตารางประวัติเครื่อง (Computer History Registry)
CREATE TABLE IF NOT EXISTS public.computer_machine_registry (
    mac_address TEXT PRIMARY KEY,
    last_room_name TEXT,
    last_seat_number TEXT,
    last_ip INET,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- PART 2: Database Triggers (Auto-History)
-- =============================================

CREATE OR REPLACE FUNCTION update_machine_registry_func()
RETURNS TRIGGER AS $$
DECLARE
    mac TEXT;
    r_name TEXT;
BEGIN
    -- Skip ถ้าไม่มีข้อมูล MAC
    IF NEW.current_macs IS NULL OR jsonb_array_length(NEW.current_macs) = 0 THEN
        RETURN NEW;
    END IF;

    -- หาชื่อห้องจาก layout_id
    SELECT room_name INTO r_name FROM public.room_seat_layouts WHERE id = NEW.layout_id;

    -- Update ประวัติสำหรับทุก MAC ที่เจอใน Array
    FOR mac IN SELECT value->>0 FROM jsonb_array_elements_text(NEW.current_macs)
    LOOP
        INSERT INTO public.computer_machine_registry (mac_address, last_room_name, last_seat_number, last_ip, last_seen_at)
        VALUES (mac, r_name, NEW.seat_number, NEW.ip_address, NOW())
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

-- ผูก Trigger
DROP TRIGGER IF EXISTS on_seat_mapping_change ON public.room_seat_ip_mappings;
CREATE TRIGGER on_seat_mapping_change
AFTER INSERT OR UPDATE ON public.room_seat_ip_mappings
FOR EACH ROW
EXECUTE FUNCTION update_machine_registry_func();


-- =============================================
-- PART 3: Server-Side Logic (RPC Functions)
-- =============================================

-- 3.1 Function: Handle Smart Registration (Logic หัวสมอง)
CREATE OR REPLACE FUNCTION handle_smart_registration(p_macs TEXT[], p_current_ip INET)
RETURNS JSONB AS $$
DECLARE
    v_mapping_id UUID;
    v_layout_id UUID;
    v_seat_num TEXT;
    v_room_name TEXT;
    v_mac TEXT;
    v_found BOOLEAN := FALSE;
BEGIN
    -- Step 1: Check Active Binding (เครื่องนี้นั่งอยู่ที่ไหนตอนนี้?)
    SELECT id INTO v_mapping_id
    FROM public.room_seat_ip_mappings
    WHERE EXISTS (
        SELECT 1 
        FROM jsonb_array_elements_text(current_macs) as m
        WHERE m.value = ANY(p_macs)
    )
    LIMIT 1;

    -- ถ้าเจอ -> อัพเดท IP ล่าสุดเผื่อมีการเปลี่ยน
    IF v_mapping_id IS NOT NULL THEN
        UPDATE public.room_seat_ip_mappings
        SET ip_address = p_current_ip,
            updated_at = NOW()
        WHERE id = v_mapping_id;
        
        SELECT s.seat_number, l.room_name 
        INTO v_seat_num, v_room_name
        FROM public.room_seat_ip_mappings s
        JOIN public.room_seat_layouts l ON s.layout_id = l.id
        WHERE s.id = v_mapping_id;

        RETURN jsonb_build_object(
            'status', 'SUCCESS', 
            'message', 'Resuming session at ' || v_room_name || ' Seat ' || v_seat_num,
            'room_name', v_room_name,
            'seat_number', v_seat_num
        );
    END IF;

    -- Step 2: Auto-Recovery (ค้นดูในประวัติเก่า)
    FOREACH v_mac IN ARRAY p_macs
    LOOP
        SELECT last_room_name, last_seat_number INTO v_room_name, v_seat_num
        FROM public.computer_machine_registry
        WHERE mac_address = v_mac
        LIMIT 1;
        
        IF v_room_name IS NOT NULL THEN
            v_found := TRUE;
            EXIT; 
        END IF;
    END LOOP;

    IF v_found THEN
        -- เจอประวัติ -> เช็คว่าห้องนั้นยังมีอยู่จริงไหม
        SELECT id INTO v_layout_id FROM public.room_seat_layouts WHERE room_name = v_room_name LIMIT 1;
        
        IF v_layout_id IS NOT NULL THEN
            -- ทำการจองที่นั่งเดิมให้อัตโนมัติ (Upsert)
            INSERT INTO public.room_seat_ip_mappings (layout_id, seat_number, row_number, column_number, ip_address, current_macs)
            VALUES (
                v_layout_id, 
                v_seat_num, 
                CAST(SPLIT_PART(v_seat_num, '-', 1) AS INTEGER),
                CAST(SPLIT_PART(v_seat_num, '-', 2) AS INTEGER),
                p_current_ip,
                to_jsonb(p_macs)
            )
            ON CONFLICT (layout_id, seat_number) 
            DO UPDATE SET 
                ip_address = EXCLUDED.ip_address,
                current_macs = EXCLUDED.current_macs,
                updated_at = NOW();

            RETURN jsonb_build_object(
                'status', 'RECOVERED', 
                'message', 'Auto-recovered session at ' || v_room_name,
                'room_name', v_room_name,
                'seat_number', v_seat_num
            );
        END IF;
    END IF;

    -- Step 3: Not Found -> ส่งกลับไปให้ Client เปิด GUI ลงทะเบียน
    RETURN jsonb_build_object('status', 'NOT_FOUND', 'message', 'No active session or history found.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3.2 Function: Unbind Seat (สำหรับ Admin Reset)
CREATE OR REPLACE FUNCTION unbind_seat(p_layout_id UUID, p_seat_number TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.room_seat_ip_mappings
    SET ip_address = NULL,      -- ล้าง IP
        current_macs = '[]'::jsonb, -- ล้าง MAC Identity
        updated_at = NOW()
    WHERE layout_id = p_layout_id AND seat_number = p_seat_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
