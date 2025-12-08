# FACE-EXAM: Facial Recognition and Resource Monitoring System for Lab Exams

ระบบสแกนใบหน้าและติดตามการใช้ทรัพยากรคอมพิวเตอร์สำหรับการสอบในห้องปฏิบัติการ (Facial Recognition and Resource Monitoring System for Lab Exams)

## 📌 ภาพรวมโปรเจ็ค (Project Overview)

FACE-EXAM เป็นระบบที่ออกแบบมาเพื่อช่วยอาจารย์ผู้คุมสอบในการบริหารจัดการและตรวจสอบความเรียบร้อยของการสอบในห้องปฏิบัติการคอมพิวเตอร์ โดยระบบมีความสามารถหลักในการยืนยันตัวตนนักศึกษาด้วยใบหน้า (Face Recognition) และติดตามการใช้งานทรัพยากรเครื่องคอมพิวเตอร์ (Resource Monitoring) เพื่อป้องกันการทุจริต เช่น การเปิดโปรแกรมหรือเว็บไซต์ที่ไม่ได้รับอนุญาต

## 🚀 ฟีเจอร์หลัก (Key Features)

### 👨‍🏫 สำหรับอาจารย์ (Teacher)
- **Dashboard**: หน้าจอควบคุมหลักสำหรับดูสถานะการสอบแบบ Real-time พร้อม UI ที่จัดเรียงข้อมูลให้อ่านง่าย (Sorting & Formatting)
- **Room Management**: สร้างและจัดการผังที่นั่งสอบ (Layout) และกำหนด IP Address ให้กับแต่ละที่นั่ง
- **Exam Management**: สร้างตารางสอบ กำหนดวิชา วันเวลา และ **รายการทรัพยากรที่ไม่อนุญาต (Blocked Resources)**
- **AI Suggestions**: ใช้ AI (Google Gemini) ช่วยแนะนำโปรแกรมหรือเว็บไซต์ที่ควรบล็อกตามชื่อวิชาสอบ
- **Real-time Monitoring**: 
  - ดูสถานะของนักศึกษาแต่ละคน (Online/Offline) ด้วยระบบ **Heartbeat Detection**
  - ตรวจสอบ Active Window, CPU/RAM Usage และ Network Traffic (MB/GB)
- **Violation Alerts**: 
  - แจ้งเตือนทันทีเมื่อมีการทุจริต (เช่น เปิดโปรแกรมต้องห้าม)
  - **Visual Indicators**: ที่นั่งจะเปลี่ยนเป็นสีแดงกระพริบ (Pulsing Red) เป็นเวลา 1 นาที
  - **Email Notification**: ส่งอีเมลแจ้งเตือนอาจารย์อัตโนมัติ
- **Report Export**: ส่งออกรายงานผลการสอบและประวัติการใช้งานเป็นไฟล์ CSV

### 👨‍🎓 สำหรับนักศึกษา (Student)
- **Face Registration**: ลงทะเบียนใบหน้าก่อนเข้าใช้งานระบบ (รองรับทั้ง PC และ Mobile)
- **Face Verification**: ยืนยันตัวตนด้วยใบหน้าก่อนเข้าห้องสอบ
- **Exam Interface**: หน้าจอแสดงสถานะการเชื่อมต่อและข้อกำหนดการสอบ
- **Client Agent**: โปรแกรมเบื้องหลังที่คอยตรวจสอบการทำงานของเครื่องและส่งข้อมูลไปยัง Server

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

### Frontend
- **Framework**: [React](https://react.dev/) (v19) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Face Recognition**: [face-api.js](https://github.com/justadudewhohacks/face-api.js/) (Client-side processing)

### Backend & Database
- **Platform**: [Supabase](https://supabase.com/)
- **Database**: PostgreSQL
- **Authentication**: Supabase Auth (Google OAuth)
- **Storage**: Supabase Storage (สำหรับเก็บรูปภาพใบหน้า)
- **Realtime**: Supabase Realtime (สำหรับการอัปเดตสถานะแบบสดๆ)

### Client Agent (Monitoring System)
- **Language**: Python 3.11
- **Libraries**:
  - `Flask`: สร้าง Local API Server (Port 5001) ให้ Frontend เรียกใช้
  - `psutil`: ดึงข้อมูล System Resources (CPU, RAM, Disk, Network, Processes)
  - `pygetwindow`: ตรวจสอบ Active Window และรายชื่อหน้าต่างที่เปิดอยู่
  - `supabase`: เชื่อมต่อและส่ง Log ไปยัง Database โดยตรง
- **Capabilities**:
  - ตรวจสอบและปิดโปรแกรม/หน้าต่างที่อยู่ใน Blacklist อัตโนมัติ
  - ส่งข้อมูล Hardware Info และ Screenshot logs (Text-based)
  - **Timezone-aware Logging**: ส่งข้อมูลเวลาที่ถูกต้องตาม Timezone ของเครื่องผู้ใช้

### External Services
- **AI**: Google Gemini API (สำหรับแนะนำ Blocked Resources)
- **Email**: EmailJS (สำหรับส่งแจ้งเตือนการทุจริต)

## 🧠 เทคนิคและอัลกอริทึมที่ใช้ (Techniques & Algorithms)

### 1. Face Recognition Pipeline
ระบบใช้ **face-api.js** ในการประมวลผลใบหน้าบนฝั่ง Client (Browser) เพื่อลดภาระ Server และเพิ่มความเร็ว
- **Face Detection**: ใช้โมเดล **SSD Mobilenet V1** ซึ่งมีความแม่นยำสูงและทำงานได้เร็วบน Web Browser
- **Face Landmarks**: ใช้โมเดล **68 Point Face Landmarks** เพื่อระบุตำแหน่งตา จมูก ปาก และโครงหน้า
- **Face Matching**: คำนวณค่า **Euclidean Distance** ระหว่าง Face Descriptor ของผู้ใช้กับฐานข้อมูล หากค่าความต่างต่ำกว่า Threshold (0.6) จะถือว่าเป็นบุคคลเดียวกัน

### 2. Resource Monitoring & Blocking Logic
Agent ฝั่ง Client ใช้เทคนิคการตรวจสอบหลายระดับ:
- **Active Window Polling**: ตรวจสอบชื่อหน้าต่างที่กำลังใช้งานทุกๆ 3 วินาที
- **Smart Pattern Matching**: อัลกอริทึมการตรวจสอบชื่อโปรแกรม/เว็บรองรับ 3 รูปแบบ:
  - *Exact Match*: ตรงกันทุกตัวอักษร
  - *Contains*: มีคำนี้อยู่ในชื่อ (เช่น "Facebook")
  - *Smart Domain*: แยกชื่อโดเมนจาก URL (เช่น "www.youtube.com" -> ตรวจจับ "youtube")
- **Process Termination**: เมื่อตรวจพบ Process ที่อยู่ใน Blacklist ระบบจะใช้ `psutil` สั่ง Kill Process นั้นทันที

### 3. Offline Detection (Heartbeat Mechanism)
ระบบตรวจสอบสถานะการเชื่อมต่อของนักศึกษาผ่าน Log การใช้งาน:
- **Heartbeat**: Agent จะส่งข้อมูล Resource Log ทุกๆ 3-5 วินาที
- **Detection**: Dashboard จะตรวจสอบว่ามี Log เข้ามาในช่วง 30 วินาทีล่าสุดหรือไม่
- **Status Update**: หากไม่มี Log เข้ามาเกิน 30 วินาที ระบบจะเปลี่ยนสถานะเป็น **OFFLINE** (สีแดงจาง + รูปขาวดำ) ทันที เพื่อให้อาจารย์ทราบว่าเครื่องนักศึกษามีปัญหาหรือปิดโปรแกรม Agent

### 4. Client-Browser Bridge Architecture
เนื่องจาก Web Browser มีระบบ Sandbox ทำให้ไม่สามารถเข้าถึงข้อมูล System (CPU, RAM, Processes) ได้โดยตรง
- **Solution**: สร้าง **Local API Server** ด้วย Python (Flask) รันที่ `localhost:5001`
- **Workflow**: React Frontend ยิง Request ไปที่ `localhost:5001/api/resource-usage` -> Python Agent ดึงข้อมูลจาก OS -> ส่ง JSON กลับมาให้ Frontend แสดงผล

### 5. Notification Throttling & Visual Alerts
เพื่อป้องกันการรบกวนอาจารย์และให้ข้อมูลที่ชัดเจน:
- **Visual Alert**: เมื่อพบการทุจริต ที่นั่งจะแสดงสีแดงกระพริบเป็นเวลา 1 นาที (Client-side Timer)
- **Email Throttling**: ระบบจะส่งอีเมลแจ้งเตือนเพียง 1 ครั้ง ต่อ 1 ประเภทการละเมิด ต่อ 1 นาที (Cooldown 60s)

## 📂 รายละเอียดไฟล์และหน้าที่การทำงาน (File Descriptions)

### 🏗️ Core Application Files
- **`App.tsx`**: เป็น Main Component ที่จัดการ Routing ของทั้งแอพพลิเคชัน ตรวจสอบสถานะการ Login (Session) และเลือกแสดงผลระหว่าง `AuthScreen`, `TeacherDashboard` หรือ `StudentDashboard` ตาม Role ของผู้ใช้
- **`index.tsx`**: จุดเริ่มต้นของ React Application (Entry Point) ทำหน้าที่ Mount App เข้ากับ DOM และโหลด Global Styles
- **`supabaseClient.ts`**: ไฟล์ตั้งค่าการเชื่อมต่อกับ Supabase Database โดยใช้ `createClient` พร้อมกำหนด URL และ Anon Key จาก Environment Variables
- **`types.ts`**: รวบรวม TypeScript Interfaces และ Types ทั้งหมดที่ใช้ในโปรเจ็ค เช่น `Student`, `ExamSchedule`, `SystemLog` เพื่อให้ Type Safety ทั่วทั้งแอพ
- **`utils.ts`**: ฟังก์ชันอเนกประสงค์ เช่น การจัดรูปแบบวันที่/เวลา, การคำนวณค่าต่างๆ ที่ใช้ซ้ำในหลายจุด

### 🧩 Components (ส่วนติดต่อผู้ใช้)
- **`components/AuthScreen.tsx`**: หน้าจอ Login รองรับการเข้าสู่ระบบด้วย Google OAuth, การเลือก Role (Teacher/Student), และมีปุ่มดาวน์โหลด **Agent.zip** สำหรับนักศึกษา
- **`components/TeacherDashboard.tsx`**: หัวใจหลักของฝั่งอาจารย์ ประกอบด้วย:
  - *Monitoring View*: ดูสถานะเครื่องนักศึกษาแบบ Real-time (Online/Offline/Violation)
  - *Exam Management*: สร้าง/แก้ไขตารางสอบและกำหนด Blocked List
  - *Email Notification*: Logic การส่งอีเมลแจ้งเตือนเมื่อพบการทุจริต
- **`components/StudentDashboard.tsx`**: หน้าจอหลักของนักศึกษา แสดงข้อมูลการสอบปัจจุบัน สถานะการเชื่อมต่อกับ Agent และสถานะการยืนยันตัวตน
- **`components/FaceRegistration.tsx`**: คอมโพเนนต์สำหรับลงทะเบียนใบหน้า ถ่ายภาพ 3 มุม (หน้าตรง, หันซ้าย, หันขวา) และสร้าง Face Descriptor เก็บลงฐานข้อมูล
- **`components/FaceVerification.tsx`**: ระบบยืนยันตัวตนก่อนเข้าสอบ เปรียบเทียบใบหน้าจากกล้องกับข้อมูลในฐานข้อมูลแบบ Real-time
- **`components/ExamRoomView.tsx`**: แสดงผังที่นั่งสอบแบบ Grid (Visual Layout) โดยดึงข้อมูลจาก `seat_layouts` และแสดงสถานะ (ว่าง/ไม่ว่าง/ทุจริต/Offline) ด้วยสีต่างๆ
- **`components/QRCodeModal.tsx`**: (Optional) สำหรับแสดง QR Code เพื่อให้ Mobile Device สแกน (ในกรณีที่รองรับ Mobile Verification)

### 🔌 Services (การเชื่อมต่อข้อมูล)
- **`services/agentService.ts`**: ทำหน้าที่เป็น Bridge สื่อสารกับ Python Agent ที่รันอยู่บนเครื่อง (`localhost:5001`)
  - `checkAgentStatus()`: ตรวจสอบว่า Agent รันอยู่หรือไม่
  - `getResourceUsage()`: ดึงข้อมูล CPU, RAM, Active Window
  - `getProcessList()`: ดึงรายชื่อ Process ทั้งหมด

### 🤖 Client Agent (Python Side)
- **`Agent/agent_26.py`**: สคริปต์ Python ที่ทำงานเบื้องหลังบนเครื่องนักศึกษา
  - **Flask Server**: เปิด Port 5001 เพื่อรับ Request จาก React Frontend
  - **Resource Monitor**: ใช้ `psutil` อ่านค่า CPU/RAM และ `pygetwindow` อ่านชื่อหน้าต่าง
  - **Enforcer**: ตรวจสอบ Blacklist และสั่ง `process.kill()` เมื่อพบโปรแกรมต้องห้าม
  - **Logger**: บันทึกเหตุการณ์และส่งข้อมูลตรงไปยัง Supabase พร้อม Timezone ที่ถูกต้อง

### 📦 Public Assets
- **`public/models/`**: โฟลเดอร์เก็บไฟล์โมเดล AI (.json, .bin) ของ **face-api.js** (SSD Mobilenet, Face Landmark, Face Recognition) ที่ต้องโหลดผ่าน URL
- **`public/face-api.min.js`**: ไลบรารีหลักสำหรับ Face Recognition
- **`public/Agent.zip`**: ไฟล์ Zip รวม Source Code ของ Agent เพื่อให้นักศึกษาดาวน์โหลดไปติดตั้ง

## 📖 คู่มือการใช้งาน (User Guide)

### 👨‍🎓 สำหรับนักศึกษา (Student Guide)

**ขั้นตอนที่ 1: การเตรียมความพร้อม (First Time Setup)**
1. เข้าสู่หน้าเว็บ Login
2. คลิกที่ไอคอน **Download** (มุมขวาล่าง) เพื่อดาวน์โหลดไฟล์ `Agent.zip`
3. แตกไฟล์ (Extract) และรันโปรแกรม `agent_26.py` (หรือไฟล์ .exe)
   - *หมายเหตุ: ต้องเปิด Agent ทิ้งไว้ตลอดการสอบ ห้ามปิดหน้าต่าง Console*
4. กลับมาที่หน้าเว็บ เลือก **"Student Login"** และเข้าสู่ระบบด้วย Google Account

**ขั้นตอนที่ 2: การลงทะเบียนใบหน้า (Face Registration)**
1. หากเข้าใช้งานครั้งแรก ระบบจะพาไปหน้า **Face Registration**
2. อนุญาตให้ Browser เข้าถึงกล้อง Web Camera
3. ทำตามคำแนะนำบนหน้าจอ:
   - **หน้าตรง**: มองกล้องตรงๆ นิ่งๆ จนกว่าแถบความคืบหน้าจะเต็ม
   - **หันซ้าย**: หันหน้าไปทางซ้ายเล็กน้อย
   - **หันขวา**: หันหน้าไปทางขวาเล็กน้อย
4. เมื่อครบ 3 ขั้นตอน กดปุ่ม **"Save Face Data"**

**ขั้นตอนที่ 3: การเข้าสอบ (Taking Exam)**
1. เมื่อถึงเวลาสอบ ให้ Login เข้าสู่ระบบ
2. ระบบจะแสดงหน้า **Face Verification**
3. มองกล้องเพื่อยืนยันตัวตน (ระบบจะเทียบกับข้อมูลที่ลงทะเบียนไว้)
4. เมื่อผ่านการยืนยัน จะเข้าสู่หน้า **Student Dashboard**
   - สถานะ **Agent Status** ต้องขึ้นเป็นสีเขียว (Connected)
   - หากสถานะเป็นสีแดง ให้ตรวจสอบว่าเปิดโปรแกรม Agent หรือยัง
5. เริ่มทำข้อสอบตามปกติ (ห้ามเปิดโปรแกรมที่อาจารย์ห้ามไว้ มิฉะนั้นจะถูกแจ้งเตือนและปิดโปรแกรมทันที)

---

### 👨‍🏫 สำหรับอาจารย์ (Teacher Guide)

**ขั้นตอนที่ 1: การจัดการห้องสอบ (Room Setup)**
1. Login เข้าสู่ระบบด้วย **"Teacher Login"**
2. ไปที่แท็บ **"Room Layout"**
3. สร้างผังที่นั่งสอบ โดยระบุจำนวนแถวและคอลัมน์
4. กำหนด **IP Address** ให้กับแต่ละที่นั่ง (เพื่อระบุตำแหน่งเครื่องนักศึกษา)

**ขั้นตอนที่ 2: การสร้างการสอบ (Create Exam)**
1. ไปที่แท็บ **"Exam Schedule"**
2. กดปุ่ม **"Add Exam"**
3. กรอกรายละเอียด:
   - ชื่อวิชา (Subject)
   - วันที่และเวลาสอบ (Date & Time)
   - **Blocked Resources**: ระบุชื่อโปรแกรมหรือเว็บที่ห้ามใช้ (เช่น `chrome`, `chatgpt`, `calculator`)
   - *Tip: ใช้ปุ่ม "AI Suggest" เพื่อให้ AI แนะนำโปรแกรมที่ควรบล็อกตามชื่อวิชา*
4. กด **Save** เพื่อบันทึก

**ขั้นตอนที่ 3: การคุมสอบ (Proctoring)**
1. ในวันสอบ ให้เปิดหน้า **Dashboard**
2. เลือกวิชาที่กำลังสอบจาก Dropdown
3. ระบบจะแสดงสถานะของนักศึกษาทุกคนในรูปแบบ Grid หรือ List:
   - 🟢 **Online**: นักศึกษาเข้าสู่ระบบและ Agent ทำงานปกติ (Heartbeat OK)
   - 🔴 **Offline**: นักศึกษาหลุดการเชื่อมต่อ (No Heartbeat > 30s)
   - ⚠️ **Violation**: พบการทุจริต (กรอบสีแดงกระพริบ 1 นาที)
4. หากมีการทุจริต (เช่น เปิดโปรแกรมต้องห้าม):
   - ระบบจะแจ้งเตือนบนหน้าจอทันที
   - ระบบจะส่ง **Email** แจ้งเตือนอาจารย์พร้อมรายละเอียด (ชื่อ นศ., โปรแกรมที่เปิด, เวลาที่เกิดเหตุ)
   - Agent บนเครื่องนักศึกษาจะพยายามปิดโปรแกรมนั้นทันที

**ขั้นตอนที่ 4: หลังการสอบ (Post-Exam)**
1. กดปุ่ม **"Export Report"** เพื่อดาวน์โหลดรายงานสรุปผลการสอบ
2. ไฟล์ CSV จะประกอบด้วย: รายชื่อนักศึกษา, เวลาเข้า-ออก, ประวัติการทุจริต, และสถานะการยืนยันตัวตน

## ⚙️ การติดตั้งและใช้งาน (Installation & Setup)

### 1. Frontend Setup
```bash
# ติดตั้ง Dependencies
npm install

# รันโปรแกรมในโหมด Development
npm run dev
```

### 2. Client Agent Setup (สำหรับเครื่องนักศึกษา)
1. ดาวน์โหลดไฟล์ `Agent.zip` จากหน้า Login
2. แตกไฟล์และรัน `agent_26.py` (หรือไฟล์ .exe ที่ build แล้ว)
3. Agent จะเริ่มทำงานที่ `localhost:5001` และเชื่อมต่อกับ Supabase อัตโนมัติ

### 3. Environment Variables (.env)
โปรเจ็คนี้ต้องการค่า Config ดังนี้:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_API_KEY=your_gemini_api_key
```

## 🔒 มาตรการความปลอดภัย (Security Measures)
- **Role-based Access Control (RBAC)**: แยกสิทธิ์การเข้าถึงระหว่าง Teacher และ Student
- **IP Binding**: ผูกบัญชีนักศึกษากับ IP Address ของเครื่องที่นั่งสอบ
- **Process Termination**: Agent มีสิทธิ์สั่งปิด Process ที่ละเมิดกฎทันที
- **Anti-Spoofing**: ระบบ Face Verification ช่วยป้องกันการสวมสิทธิ์เข้าสอบ

---
**Developed by:** Patcharaphon Koosomsarp
**Institution:** King Mongkut's University of Technology North Bangkok (KMUTNB)
