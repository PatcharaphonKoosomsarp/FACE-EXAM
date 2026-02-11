-- เปลี่ยนชนิดข้อมูลของ seat_number จาก INTEGER เป็น TEXT
-- เพื่อรองรับรูปแบบ "Rows-Cols" (เช่น "3-1")
ALTER TABLE public.room_seat_ip_mappings 
ALTER COLUMN seat_number TYPE TEXT USING seat_number::text;

-- ปรับปรุงตารางประวัติให้สอดคล้องกัน (ถ้ายังไม่ได้ทำ)
ALTER TABLE public.computer_machine_registry 
ALTER COLUMN last_seat_number TYPE TEXT;
