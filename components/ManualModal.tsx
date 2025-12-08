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
                  การเข้าสู่ระบบและลงทะเบียน
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. เข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัย (<span className="font-mono text-xs bg-gray-100 px-1 rounded">@email.kmutnb.ac.th</span>)</p>
                  <p>2. หากเป็นการใช้งานครั้งแรก ระบบจะให้ทำการ <strong>"ลงทะเบียนใบหน้า"</strong></p>
                  <p>3. ถ่ายรูปหน้าตรงตามคำแนะนำ (ห้ามสวมหมวก, แว่นตาดำ, หรือมีสิ่งปิดบังใบหน้า)</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">2</span>
                  การเริ่มทำข้อสอบ
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>1. เมื่อถึงเวลาสอบ ให้กดปุ่ม <strong>"ยืนยันตัวตนเพื่อเข้าสอบ"</strong></p>
                  <p>2. ระบบจะทำการสแกนใบหน้าเพื่อยืนยันว่าเป็นตัวจริง</p>
                  <p>3. เมื่อยืนยันสำเร็จ จะเข้าสู่หน้า Dashboard ของนักศึกษา</p>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-2">
                    <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                      <Monitor className="w-4 h-4" />
                      ข้อควรระวัง
                    </h4>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                      <li>ต้องเปิดโปรแกรม Agent ไว้ตลอดเวลาการสอบ</li>
                      <li>ห้ามปิดกล้อง หรือนำสิ่งของมาบังใบหน้า</li>
                      <li>ห้ามมีบุคคลอื่นเข้ามาในกล้อง</li>
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
                  การตรวจสอบสถานะนักศึกษา
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>อาจารย์สามารถดูสถานะของนักศึกษาทุกคนได้ในหน้า Dashboard แบบ Real-time:</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <li className="flex items-center gap-2 bg-green-50 p-2 rounded border border-green-100">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-sm">ปกติ (Online)</span>
                    </li>
                    <li className="flex items-center gap-2 bg-red-50 p-2 rounded border border-red-100">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-sm">ขาดการเชื่อมต่อ (Offline)</span>
                    </li>
                    <li className="flex items-center gap-2 bg-orange-50 p-2 rounded border border-orange-100">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                      <span className="text-sm">พบความผิดปกติ (Violation)</span>
                    </li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">2</span>
                  การจัดการการทุจริต
                </h3>
                <div className="pl-10 space-y-3 text-gray-600">
                  <p>เมื่อระบบตรวจพบความผิดปกติ (เช่น ไม่พบใบหน้า, มีคนอื่นในกล้อง, หรือเปิดโปรแกรมต้องห้าม):</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>การ์ดของนักศึกษาจะเปลี่ยนเป็นสีแดงและกระพริบเตือน</li>
                    <li>ระบบจะบันทึก Log การกระทำผิดไว้</li>
                    <li>อาจารย์สามารถกดดูรายละเอียด หรือกด <strong>"Kick"</strong> เพื่อตัดสิทธิ์การสอบได้</li>
                  </ul>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="space-y-8 max-w-3xl mx-auto">
              <div className="bg-gray-900 text-white p-6 rounded-xl mb-6">
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" />
                  Agent คืออะไร?
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Agent เป็นโปรแกรมขนาดเล็กที่นักศึกษาต้องติดตั้งลงในเครื่องคอมพิวเตอร์ เพื่อทำหน้าที่ส่งข้อมูลสถานะเครื่อง (เช่น โปรแกรมที่เปิดอยู่, การเชื่อมต่อเครือข่าย) มายังระบบตรวจสอบ เพื่อป้องกันการทุจริต
                </p>
              </div>

              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-primary flex items-center justify-center text-sm">1</span>
                  การติดตั้งและใช้งาน
                </h3>
                <div className="pl-10 space-y-4 text-gray-600">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">1.</div>
                    <div>
                      <p className="font-medium text-gray-900">ดาวน์โหลดไฟล์</p>
                      <p className="text-sm">กดปุ่มดาวน์โหลดที่หน้า Login จะได้ไฟล์ <span className="font-mono bg-gray-100 px-1 rounded">Agent.zip</span></p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">2.</div>
                    <div>
                      <p className="font-medium text-gray-900">แตกไฟล์ (Extract)</p>
                      <p className="text-sm">คลิกขวาที่ไฟล์ zip แล้วเลือก Extract All...</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">3.</div>
                    <div>
                      <p className="font-medium text-gray-900">รันโปรแกรม</p>
                      <p className="text-sm">ดับเบิ้ลคลิกไฟล์ <span className="font-mono bg-gray-100 px-1 rounded">agent_26.py</span> หรือไฟล์ Executable ที่เตรียมไว้</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-[20px] text-center font-bold text-gray-400">4.</div>
                    <div>
                      <p className="font-medium text-gray-900">ระบุรหัสนักศึกษา</p>
                      <p className="text-sm">เมื่อโปรแกรมเปิดขึ้นมา ให้กรอกรหัสนักศึกษาเพื่อเริ่มการส่งข้อมูล</p>
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