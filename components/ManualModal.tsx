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
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
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
        <div className="flex border-b border-gray-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'student' 
                ? 'text-primary border-b-2 border-primary bg-orange-50/30' 
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
                ? 'text-primary border-b-2 border-primary bg-orange-50/30' 
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
                ? 'text-primary border-b-2 border-primary bg-orange-50/30' 
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
            <div className="space-y-8 max-w-3xl mx-auto">
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">1</span>
                  การเตรียมความพร้อม (First Time Setup)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. เข้าสู่หน้าเว็บ Login</p>
                  <p>2. คลิกที่ไอคอน <strong>Download</strong> (มุมขวาล่าง) เพื่อดาวน์โหลดไฟล์ <span className="font-mono bg-gray-100 px-1 rounded">Agent.zip</span></p>
                  <p>3. แตกไฟล์ (Extract) และรันโปรแกรม <span className="font-mono bg-gray-100 px-1 rounded">agent_26.py</span> (หรือไฟล์ .exe)</p>
                  <div className="bg-yellow-50 p-3 rounded border border-yellow-100 text-sm text-yellow-800">
                    <strong>หมายเหตุ:</strong> ต้องเปิด Agent ทิ้งไว้ตลอดการสอบ ห้ามปิดหน้าต่าง Console
                  </div>
                  <p>4. กลับมาที่หน้าเว็บ เลือก <strong>"Student Login"</strong> และเข้าสู่ระบบด้วย Google Account</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">2</span>
                  การลงทะเบียนใบหน้า (Face Registration)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. หากเข้าใช้งานครั้งแรก ระบบจะพาไปหน้า <strong>Face Registration</strong></p>
                  <p>2. อนุญาตให้ Browser เข้าถึงกล้อง Web Camera</p>
                  <p>3. ทำตามคำแนะนำบนหน้าจอ:</p>
                  <ul className="list-disc list-inside pl-4 space-y-1">
                    <li><strong>หน้าตรง:</strong> มองกล้องตรงๆ นิ่งๆ จนกว่าแถบความคืบหน้าจะเต็ม</li>
                    <li><strong>หันซ้าย:</strong> หันหน้าไปทางซ้ายเล็กน้อย</li>
                    <li><strong>หันขวา:</strong> หันหน้าไปทางขวาเล็กน้อย</li>
                  </ul>
                  <p>4. เมื่อครบ 3 ขั้นตอน กดปุ่ม <strong>"Save Face Data"</strong></p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">3</span>
                  การเข้าสอบ (Taking Exam)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. เมื่อถึงเวลาสอบ ให้ Login เข้าสู่ระบบ</p>
                  <p>2. ระบบจะแสดงหน้า <strong>Face Verification</strong></p>
                  <p>3. มองกล้องเพื่อยืนยันตัวตน (ระบบจะเทียบกับข้อมูลที่ลงทะเบียนไว้)</p>
                  <p>4. เมื่อผ่านการยืนยัน จะเข้าสู่หน้า <strong>Student Dashboard</strong></p>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-2">
                    <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      การตรวจสอบสถานะ
                    </h4>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                      <li>สถานะ <strong>Agent Status</strong> ต้องขึ้นเป็นสีเขียว (Connected)</li>
                      <li>หากสถานะเป็นสีแดง ให้ตรวจสอบว่าเปิดโปรแกรม Agent หรือยัง</li>
                      <li>ห้ามเปิดโปรแกรมที่อาจารย์ห้ามไว้ มิฉะนั้นจะถูกแจ้งเตือนและปิดโปรแกรมทันที</li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'teacher' && (
            <div className="space-y-8 max-w-3xl mx-auto">
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">1</span>
                  การจัดการห้องสอบ (Room Setup)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. Login เข้าสู่ระบบด้วย <strong>"Teacher Login"</strong></p>
                  <p>2. ไปที่แท็บ <strong>"Room Layout"</strong></p>
                  <p>3. สร้างผังที่นั่งสอบ โดยระบุจำนวนแถวและคอลัมน์</p>
                  <p>4. กำหนด <strong>IP Address</strong> ให้กับแต่ละที่นั่ง (เพื่อระบุตำแหน่งเครื่องนักศึกษา)</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">2</span>
                  การสร้างการสอบ (Create Exam)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. ไปที่แท็บ <strong>"Exam Schedule"</strong></p>
                  <p>2. กดปุ่ม <strong>"Add Exam"</strong></p>
                  <p>3. กรอกรายละเอียด:</p>
                  <ul className="list-disc list-inside pl-4 space-y-1">
                    <li>ชื่อวิชา (Subject)</li>
                    <li>วันที่และเวลาสอบ (Date & Time)</li>
                    <li><strong>Blocked Resources:</strong> ระบุชื่อโปรแกรมหรือเว็บที่ห้ามใช้ (เช่น chrome, chatgpt)</li>
                  </ul>
                  <div className="bg-green-50 p-2 rounded border border-green-100 text-sm text-green-800 mt-2">
                    <strong>Tip:</strong> ใช้ปุ่ม "AI Suggest" เพื่อให้ AI แนะนำโปรแกรมที่ควรบล็อกตามชื่อวิชา
                  </div>
                  <p>4. กด <strong>Save</strong> เพื่อบันทึก</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">3</span>
                  การคุมสอบ (Proctoring)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. ในวันสอบ ให้เปิดหน้า <strong>Dashboard</strong></p>
                  <p>2. เลือกวิชาที่กำลังสอบจาก Dropdown</p>
                  <p>3. ระบบจะแสดงสถานะของนักศึกษาทุกคน:</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <li className="flex items-center gap-2 bg-green-50 p-2 rounded border border-green-100">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-sm"><strong>Online:</strong> ปกติ (Heartbeat OK)</span>
                    </li>
                    <li className="flex items-center gap-2 bg-red-50 p-2 rounded border border-red-100">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-sm"><strong>Offline:</strong> หลุดการเชื่อมต่อ (No Heartbeat {'>'} 30s)</span>
                    </li>
                    <li className="flex items-center gap-2 bg-orange-50 p-2 rounded border border-orange-100">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                      <span className="text-sm"><strong>Violation:</strong> พบการทุจริต (กระพริบ 1 นาที)</span>
                    </li>
                  </ul>
                  <p className="mt-2">4. หากมีการทุจริต ระบบจะแจ้งเตือนบนหน้าจอและส่ง Email แจ้งเตือนอาจารย์</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">4</span>
                  หลังการสอบ (Post-Exam)
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. กดปุ่ม <strong>"Export Report"</strong> เพื่อดาวน์โหลดรายงานสรุปผลการสอบ</p>
                  <p>2. ไฟล์ CSV จะประกอบด้วย: รายชื่อนักศึกษา, เวลาเข้า-ออก, ประวัติการทุจริต, และสถานะการยืนยันตัวตน</p>
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