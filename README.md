# FACE-EXAM
### Facial Recognition and Resource Monitoring System for Lab Exams

โปรเจกต์นี้เป็นระบบคุมสอบในห้องปฏิบัติการ โดยรวม 2 ส่วนหลัก:
- Web App (React + TypeScript + Vite) สำหรับอาจารย์และนักศึกษา
- Local Agent (Python) สำหรับอ่านสถานะเครื่องและส่งข้อมูลทรัพยากร

---

## ฟีเจอร์ที่มีในโค้ดปัจจุบัน

### สำหรับนักศึกษา
- ลงทะเบียนใบหน้าแบบหลายท่า ผ่านเว็บแคมหรือผ่าน QR ไปทำบนมือถือ
- ยืนยันตัวตนก่อนเข้าสอบด้วย Face Verification
- รองรับโหมดยืนยันบนมือถือผ่าน URL พารามิเตอร์ `mode=mobile-verify`

### สำหรับอาจารย์
- จัดการห้องสอบและผังที่นั่ง
- จัดการรายการสอบและ resource ที่บล็อก
- ดูสถานะนักศึกษาแบบ active session และสั่ง kick ได้

### สำหรับระบบ/ความปลอดภัย
- ตรวจสอบ IP ก่อนยืนยันเข้าห้องสอบ
- ใช้ QR handshake table (`qr_authentication`) สำหรับ flow มือถือ
- มี fallback logic รองรับ schema เก่า/ใหม่ ใน mobile auth

---

## Tech Stack (ตาม package ปัจจุบัน)

- Frontend: React 19, TypeScript, Vite 6
- UI/Chart: lucide-react, recharts
- Face/Camera: face-api.js, MediaPipe FaceMesh (`@mediapipe/face_mesh`, `@mediapipe/camera_utils`)
- Auth/DB: Supabase (`@supabase/supabase-js`)
- OAuth: `@react-oauth/google`
- External/Utility: axios, qrcode.react, EmailJS, Google GenAI
- Agent: Python 3.11 (แนะนำโดยโค้ด Agent)

---

## โครงสร้างโปรเจกต์

```
FACE-EXAM/
├── App.tsx
├── index.tsx
├── supabaseClient.ts
├── components/
│   ├── AuthScreen.tsx
│   ├── StudentDashboard.tsx
│   ├── TeacherDashboard.tsx
│   ├── FaceRegistration.tsx
│   ├── FaceVerification.tsx
│   ├── MobileFaceRegistration.tsx
│   ├── MobileFaceVerification.tsx
│   └── ...
├── services/
│   ├── authService.ts
│   ├── examService.ts
│   ├── sessionService.ts
│   ├── storageService.ts
│   └── agentService.ts
├── Agent/
│   └── agent_26.py
├── public/
│   ├── face-api.min.js
│   └── models/   # model files for face-api.js
└── diagram_now/
    └── supabase.text
```

---

## การติดตั้ง

### 1) Frontend

1. ติดตั้ง dependency

```bash
npm install
```

2. สร้างไฟล์ `.env` (หรือ `.env.local`) ที่ root โปรเจกต์ แล้วกำหนดอย่างน้อย:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_CLIENT_ID=...
```

3. รัน dev server

```bash
npm run dev
```

4. สำหรับ production build

```bash
npm run build
npm run preview
```

### 2) Database (Supabase)

1. สร้างโปรเจกต์ Supabase
2. รัน SQL ในไฟล์ `diagram_now/supabase.text`
3. ตรวจให้มีตาราง/ฟังก์ชันที่แอปใช้งาน เช่น
   - `exam_rooms`
   - `room_seat_layouts`
   - `room_seat_ip_mappings`
   - `user_photos`
   - `qr_authentication`
   - `exam_student_sessions`

> หมายเหตุ: README นี้อ้างอิงเฉพาะไฟล์ที่มีอยู่จริงใน workspace ปัจจุบัน

### 3) Agent (Python)

รัน Agent จากไฟล์ `Agent/agent_26.py`

```bash
python Agent/agent_26.py
```

โค้ด Agent มีระบบตรวจ dependency และติดตั้งให้อัตโนมัติเมื่อขาดแพ็กเกจ โดยแนะนำ Python 3.11

---

## URL Modes ที่ระบบรองรับ

- Mobile register:
  - `/?mode=mobile-register&user_id=<user-id>`
- Mobile verify:
  - `/?mode=mobile-verify&exam_id=<exam-id>&user_id=<user-id>&ip=<agent-ip>`

Router หลักอยู่ที่ `App.tsx`

---

## หมายเหตุสำคัญ

- โมเดล face-api ต้องมีใน `public/models` ให้ครบก่อนใช้งาน
- การตรวจ IP และการ map ที่นั่งขึ้นกับข้อมูลในตาราง `room_seat_ip_mappings`
- บาง flow ของ mobile auth รองรับ fallback กรณี schema ยังไม่มี `exam_id`

---

Developed for KMUTNB lab exam monitoring use cases.
