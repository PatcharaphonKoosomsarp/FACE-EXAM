import React, { useState } from 'react';
import { X, GraduationCap, User, Shield, Monitor, AlertTriangle, CheckCircle } from 'lucide-react';

interface ManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManualModal: React.FC<ManualModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'agent'>('student');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">คู่มือการใช้งาน</h2>
            <p className="text-sm text-gray-500 mt-1">ระบบสแกนใบหน้าและติดตามการใช้ทรัพยากรคอมพิวเตอร์</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'student' 
                ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <User className="w-4 h-4" />
            สำหรับนักศึกษา
          </button>
          <button
            onClick={() => setActiveTab('teacher')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'teacher' 
                ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            สำหรับอาจารย์
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'agent' 
                ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Shield className="w-4 h-4" />
            คู่มือ Agent
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white">
          {activeTab === 'student' && (
            <div className="space-y-12 max-w-4xl mx-auto">
              {/* 1. การเตรียมความพร้อมของ Agent */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</span>
                  การเตรียมความพร้อมของ Agent
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/1.png" alt="Download Agent" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. Download Agent.zip</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/2.png" alt="Extract Agent" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">2. แตกไฟล์ Agent.zip</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/3.png" alt="Run Agent" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">3. รัน agent_26.py ดับเบิ้ลคลิกที่ agent_26.py หรือ ใช้คำสั่ง <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-red-500">python agent_26.py</code></p>
                  </div>
                </div>
              </section>

              {/* 2. การใช้งานเว็บแอปพลิเคชัน */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</span>
                  การใช้งานเว็บแอปพลิเคชัน
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/4.png" alt="Login" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. หน้าเข้าสู่ระบบ ให้นักศึกษาเข้าสู่ระบบด้วยบัญชีอีเมลของมหาลัย</p>
                  </div>
                </div>
              </section>

              {/* 3. การลงทะเบียนใบหน้า */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</span>
                  การลงทะเบียนใบหน้า
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/5.png" alt="Select Register" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. เลือกลงทะเบียนใบหน้า</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/6.png" alt="Select Method" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>2. เลือกวิธีการลงทะเบียนใบหน้า โดยใช้กล้องเว็บแคม บนอุปกรณ์นี้</p>
                      <p>3. เลือกวิธีการลงทะเบียนใบหน้า โดยใช้สแกน QR Code เปิดกล้องผ่านมือถือ</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/7.png" alt="Webcam Register" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">4. ใช้กล้องเว็บแคม สำหรับลงทะเบียนใบหน้าด้วยท่าทางต่างๆ ตามขั้นตอนการลงทะเบียนใบหน้า</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/8.png" alt="QR Scan" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">5. สแกน QR Code เพื่อเปิดกล้องผ่านมือถือ</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/9.png" alt="Mobile Register" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>6. อนุญาตการเข้าถึงกล้อง</p>
                      <p>7. ใช้กล้องผ่านมือถือ สำหรับลงทะเบียนใบหน้าด้วยท่าทางต่างๆ ตามขั้นตอนการลงทะเบียนใบหน้า</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 4. การเข้าสอบ */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">4</span>
                  การเข้าสอบ
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/10.png" alt="Select Exam List" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. เลือกรายการตารางสอบ</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/11.png" alt="Select Subject" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">2. เลือกวิชาสอบให้ตรงกับตารางสอบของนักศึกษา</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/12.png" alt="Verify Method" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>3. เลือกวิธีการยืนยันตัวตน โดยใช้กล้องเว็บแคม บนอุปกรณ์นี้</p>
                      <p>4. เลือกวิธีการยืนยันตัวตน โดยใช้สแกน QR Code เปิดกล้องผ่านมือถือ</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/13.png" alt="Webcam Verify" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">5. ใช้กล้องเว็บแคม สำหรับยืนยันตัวตน</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/14.png" alt="QR Verify" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">6. สแกน QR Code เพื่อเปิดกล้องผ่านมือถือ</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/15.png" alt="Mobile Verify" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>7. อนุญาตการเข้าถึงกล้อง</p>
                      <p>8. ใช้กล้องผ่านมือถือ สำหรับยืนยันตัวตน</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/16.png" alt="Success" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">9. เข้าห้องสอบสำเร็จ</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'teacher' && (
            <div className="space-y-12 max-w-4xl mx-auto">
              {/* 1. การใช้งานเว็บแอปพลิเคชัน */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</span>
                  การใช้งานเว็บแอปพลิเคชัน
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/17.png" alt="Teacher Login" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. หน้าเข้าสู่ระบบ ให้อาจารย์เข้าสู่ระบบด้วยบัญชีอีเมลของมหาลัย</p>
                  </div>
                </div>
              </section>

              {/* 2. การจัดการสอบ */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</span>
                  การจัดการสอบ
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/18.png" alt="Manage Exam" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. เลือกจัดการสอบ</p>
                  </div>
                </div>
              </section>

              {/* 3. ขั้นตอนที่ 1 : สร้างห้องสอบ */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</span>
                  ขั้นตอนที่ 1 : สร้างห้องสอบ
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/19.png" alt="Create Room" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>1. เลือกสร้างห้องสอบใหม่</p>
                      <p>2. กรอกข้อมูลชื่อห้องสอบ จำนวนแถวและ จำนวนคอลัมน์</p>
                      <p>3. บันทึกห้องใหม่</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/20.png" alt="Select Room" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>4. เลือกห้องสอบที่มีอยู่</p>
                      <p>5. กดเลือกห้องสอบ</p>
                      <p>6. ขั้นตอนถัดไป</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 4. ขั้นตอนที่ 2 : สร้างตารางสอบ */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">4</span>
                  ขั้นตอนที่ 2 : สร้างตารางสอบ
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/21.png" alt="Create Schedule" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>1. กรอกข้อมูลตารางสอบ</p>
                      <p>2. ขั้นตอนถัดไป</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 5. ขั้นตอนที่ 3 : กำหนด IP Address */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">5</span>
                  ขั้นตอนที่ 3 : กำหนด IP Address
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/22.png" alt="Set IP" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>1. เลือกที่นั่งเพื่อกำหนด IP</p>
                      <p>2. กรอก IP Address กำหนดให้กับที่นั่งนั้นๆ</p>
                      <p>3. บันทึก / อัปเดต</p>
                      <p>4. ขั้นตอนถัดไป</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 6. ขั้นตอนที่ 4: กำหนดทรัพยากร */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">6</span>
                  ขั้นตอนที่ 4: กำหนดทรัพยากร
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/23.png" alt="Set Resources" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <div className="text-gray-700 font-medium space-y-1">
                      <p>1. เลือกรายการที่แนะนำ</p>
                      <p>2. ใช้ AI แนะนำ</p>
                      <p>3. กรอกรายการที่ไม่อนุญาตให้ใช้งานได้</p>
                      <p>4. บันทึกข้อมูล</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 7. รายการตารางสอบ */}
              <section>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3 border-b pb-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">7</span>
                  รายการตารางสอบ
                </h3>
                <div className="space-y-8 pl-4 md:pl-11">
                  <div className="space-y-3">
                    <img src="/manual_picture/24.png" alt="Exam List" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">1. เลือกรายการตารางสอบ</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/25.png" alt="Select Room for Exam" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">2. เลือกห้องสอบ</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/26.png" alt="Student Seat" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">3. เลือกที่นั่งของนักศึกษา เพื่อดูข้อมูลของนักศึกษาและการใช้งานทรัพยากรคอมพิวเตอร์</p>
                  </div>
                  <div className="space-y-3">
                    <img src="/manual_picture/27.png" alt="Student Info" className="rounded-lg shadow-md border border-gray-200 max-w-full h-auto" />
                    <p className="text-gray-700 font-medium">4. ข้อมูลต่างๆในที่นั่งของนักศึกษา</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="space-y-8 max-w-3xl mx-auto">
              <div className="bg-gray-900 text-white p-6 rounded-xl mb-6">
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" />
                  Client Agent (Monitoring System)
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                  Agent เป็นโปรแกรมเบื้องหลังที่คอยตรวจสอบการทำงานของเครื่องและส่งข้อมูลไปยัง Server เพื่อป้องกันการทุจริต
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-400">
                  <div>
                    <strong className="text-gray-200 block mb-1">Capabilities:</strong>
                    <ul className="list-disc list-inside space-y-1">
                      <li>ตรวจสอบและปิดโปรแกรม Blacklist อัตโนมัติ</li>
                      <li>ส่งข้อมูล Hardware Info และ Screenshot logs</li>
                      <li>Timezone-aware Logging</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-gray-200 block mb-1">Tech Stack:</strong>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Python 3.11 + Flask (Local API Port 5001)</li>
                      <li>psutil (System Resources)</li>
                      <li>pygetwindow (Active Window)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">1</span>
                  การติดตั้งและใช้งาน (Setup)
                </h3>
                <div className="pl-10 space-y-4 text-gray-600">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">1.</div>
                    <div>
                      <p className="font-medium text-gray-900">ดาวน์โหลดไฟล์</p>
                      <p className="text-sm">ดาวน์โหลดไฟล์ <span className="font-mono bg-gray-100 px-1 rounded">Agent.zip</span> จากหน้า Login</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">2.</div>
                    <div>
                      <p className="font-medium text-gray-900">แตกไฟล์และรันโปรแกรม</p>
                      <p className="text-sm">แตกไฟล์และรัน <span className="font-mono bg-gray-100 px-1 rounded">agent_26.py</span> (หรือไฟล์ .exe)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">3.</div>
                    <div>
                      <p className="font-medium text-gray-900">เริ่มทำงาน</p>
                      <p className="text-sm">Agent จะเริ่มทำงานที่ <span className="font-mono bg-gray-100 px-1 rounded">localhost:5001</span> และเชื่อมต่อกับ Supabase อัตโนมัติ</p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">2</span>
                  การแก้ไขปัญหาเบื้องต้น
                </h3>
                <div className="pl-10 grid gap-3">
                  <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg">
                    <h4 className="font-semibold text-orange-800 text-sm mb-1 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      เปิดโปรแกรมไม่ได้ / Windows Defender แจ้งเตือน
                    </h4>
                    <p className="text-sm text-orange-700">
                      ให้กด "More info" แล้วเลือก "Run anyway" เนื่องจากโปรแกรมไม่ได้ลงทะเบียนใบรับรองความปลอดภัยกับ Microsoft
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualModal;