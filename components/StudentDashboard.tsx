import React, { useState } from 'react';
import { User, Exam, Room } from '../types';
import { Camera, Calendar, Clock, MapPin, AlertTriangle, Monitor, List, Check, ArrowLeft } from 'lucide-react';
import FaceRegistration from './FaceRegistration';
import FaceVerification from './FaceVerification';
import VerificationMethodSelector from './VerificationMethodSelector';
import QRCodeModal from './QRCodeModal';

interface StudentDashboardProps {
  user: User;
  exams: Exam[];
  rooms: Room[];
  onUpdateUser: (updatedUser: User) => void;
}

type ViewMode = 'MENU' | 'FACE_REG' | 'EXAM_LIST';

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, exams, rooms, onUpdateUser }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(user.isFaceRegistered ? 'EXAM_LIST' : 'MENU');
  const [verifyingExam, setVerifyingExam] = useState<Exam | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [isReregistering, setIsReregistering] = useState(false);
  
  // New states for verification method selection
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [selectedExamForVerification, setSelectedExamForVerification] = useState<Exam | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);

  const handleFaceRegComplete = () => {
    onUpdateUser({ ...user, isFaceRegistered: true });
    setIsReregistering(false);
    alert('ลงทะเบียนใบหน้าสำเร็จ!');
    setViewMode('EXAM_LIST');
  };

  const handleEnterExam = (exam: Exam) => {
      setSelectedExamForVerification(exam);
      setShowMethodSelector(true);
  };

  const handleSelectWebcam = () => {
      if (selectedExamForVerification) {
          setVerifyingExam(selectedExamForVerification);
          setShowMethodSelector(false);
      }
  };

  const handleSelectQRCode = () => {
      setShowMethodSelector(false);
      setShowQRModal(true);
  };

  const handleVerified = () => {
      if (verifyingExam) {
          setActiveExam(verifyingExam);
          setVerifyingExam(null);
      }
  };

  if (activeExam) {
      return (
          <div className="min-h-screen bg-gray-900 text-white flex flex-col">
              <header className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                  <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <h1 className="font-bold text-lg">กำลังสอบ: {activeExam.subjectName} ({activeExam.subjectCode})</h1>
                  </div>
                  <button onClick={() => setActiveExam(null)} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded">ออกจากการสอบ</button>
              </header>
              <div className="flex-1 p-8 flex items-center justify-center">
                  <div className="text-center max-w-2xl">
                      <Monitor className="w-24 h-24 text-gray-700 mx-auto mb-6" />
                      <h2 className="text-3xl font-bold mb-4">เข้าสู่โหมดห้องสอบปลอดภัย</h2>
                      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-left mb-6">
                          <h3 className="text-orange-500 font-bold mb-3 flex items-center"><AlertTriangle className="w-5 h-5 mr-2"/> กฎการใช้ทรัพยากร</h3>
                          <ul className="space-y-2 text-sm text-gray-300">
                              {activeExam.blockedResources.length > 0 ? activeExam.blockedResources.map(r => (
                                  <li key={r.id} className="flex items-center">
                                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                      ห้ามใช้: <span className="text-white font-medium ml-1">{r.name}</span> <span className="text-xs text-gray-500 ml-2">({r.type})</span>
                                  </li>
                              )) : <li>ไม่มีการจำกัดทรัพยากรพิเศษ</li>}
                          </ul>
                          <p className="mt-4 text-xs text-gray-500">*ระบบกำลังติดตามการใช้งาน หากพบการละเมิดจะแจ้งเตือนผู้คุมสอบทันที</p>
                      </div>
                      <div className="text-green-400 text-sm">สถานะ: ใบหน้าอยู่ในกล้อง | ทรัพยากรปกติ</div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl">
            <header className="mb-8 flex justify-center items-center border-b pb-4">
                <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-800">แผงควบคุมนักศึกษา</h1>
                        <p className="text-gray-500">สวัสดี, {user.name}</p>
                </div>
            </header>

      {/* Menu Navigation */}
      {viewMode === 'MENU' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <button 
            onClick={() => setViewMode('FACE_REG')}
            className="relative p-6 rounded-2xl border-2 border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg transition-all duration-300 flex flex-col items-center justify-center text-center group"
            >
                <div className="p-4 rounded-full mb-4 bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#E35205] transition-colors">
                    <Camera className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-xl mb-2 text-gray-600 group-hover:text-gray-800">ลงทะเบียนใบหน้า</h3>
                <p className="text-sm text-gray-500 max-w-xs">บันทึกข้อมูลใบหน้าเพื่อใช้ยืนยันตัวตนก่อนเข้าห้องสอบ</p>
                {user.isFaceRegistered && <div className="absolute top-4 right-4 text-green-500"><Check className="w-6 h-6"/></div>}
            </button>

            <button 
            onClick={() => setViewMode('EXAM_LIST')}
            className="relative p-6 rounded-2xl border-2 border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg transition-all duration-300 flex flex-col items-center justify-center text-center group"
            >
                <div className="p-4 rounded-full mb-4 bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#E35205] transition-colors">
                    <List className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-xl mb-2 text-gray-600 group-hover:text-gray-800">รายการตารางสอบ</h3>
                <p className="text-sm text-gray-500 max-w-xs">ดูตารางสอบและเข้าสู่ห้องสอบ</p>
            </button>
        </div>
      )}

      {/* Face Registration View */}
      {viewMode === 'FACE_REG' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={() => { setViewMode('MENU'); setIsReregistering(false); }} className="flex items-center text-gray-500 hover:text-[#E35205] mb-6 font-medium transition-colors">
                <ArrowLeft className="w-5 h-5 mr-1"/> กลับสู่เมนูหลัก
              </button>
              
              {user.isFaceRegistered && !isReregistering ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Check className="w-10 h-10 text-green-600" />
                      </div>
                      <h2 className="text-xl font-bold text-gray-800 mb-2">คุณลงทะเบียนใบหน้าเรียบร้อยแล้ว</h2>
                      <p className="text-gray-600 mb-6">สามารถเข้าสอบได้ตามตาราง</p>
                      <div className="flex gap-3 justify-center">
                        <button 
                            onClick={() => setViewMode('EXAM_LIST')}
                            className="bg-[#E35205] text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-700 transition shadow-md"
                        >
                            ไปที่ตารางสอบ
                        </button>
                        <button 
                            onClick={() => setIsReregistering(true)}
                            className="bg-white text-gray-700 border border-gray-300 px-6 py-2 rounded-lg font-bold hover:bg-gray-50 transition"
                        >
                            ลงทะเบียนใหม่
                        </button>
                      </div>
                  </div>
              ) : (
                  <FaceRegistration 
                    onComplete={handleFaceRegComplete} 
                    onCancel={() => { setViewMode('MENU'); setIsReregistering(false); }} 
                  />
              )}
          </div>
      )}

      {/* Exam List View */}
      {viewMode === 'EXAM_LIST' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-6">
                  <button onClick={() => setViewMode('MENU')} className="flex items-center text-gray-500 hover:text-[#E35205] font-medium transition-colors">
                    <ArrowLeft className="w-5 h-5 mr-1"/> เมนูหลัก
                  </button>
                  {user.isFaceRegistered && (
                      <button onClick={() => { setViewMode('FACE_REG'); setIsReregistering(true); }} className="text-sm text-blue-600 hover:underline flex items-center bg-blue-50 px-3 py-1.5 rounded-lg">
                          <Camera className="w-4 h-4 mr-1.5"/> อัปเดตข้อมูลใบหน้า
                      </button>
                  )}
              </div>

              {!user.isFaceRegistered ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-8 text-center">
                      <Camera className="w-16 h-16 text-[#E35205] mx-auto mb-4" />
                      <h2 className="text-xl font-bold text-gray-800 mb-2">กรุณาลงทะเบียนใบหน้าก่อน</h2>
                      <p className="text-gray-600 mb-6 max-w-md mx-auto">คุณต้องลงทะเบียนใบหน้าให้สำเร็จก่อนจึงจะสามารถเข้าดูรายการสอบและเข้าห้องสอบได้</p>
                      <button 
                        onClick={() => setViewMode('FACE_REG')}
                        className="bg-[#E35205] text-white px-8 py-3 rounded-lg font-bold hover:bg-orange-700 transition shadow-lg"
                      >
                          ไปที่หน้าลงทะเบียนใบหน้า
                      </button>
                  </div>
              ) : (
                  <div>
                      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center"><Calendar className="w-5 h-5 mr-2"/> ตารางสอบของคุณ</h2>
                      {exams.length === 0 ? (
                          <p className="text-gray-500 bg-gray-50 p-8 rounded-lg text-center">ยังไม่มีตารางสอบในขณะนี้</p>
                      ) : (
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              {exams.map(exam => {
                                  const room = rooms.find(r => r.id === exam.roomId);
                                  return (
                                      <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition">
                                          <div className="bg-gray-50 p-4 border-b">
                                              <h3 className="font-bold text-lg text-gray-800">{exam.subjectCode}</h3>
                                              <p className="text-gray-600 truncate">{exam.subjectName}</p>
                                          </div>
                                          <div className="p-4 space-y-3 text-sm">
                                              <div className="flex items-center text-gray-600">
                                                  <MapPin className="w-4 h-4 mr-2" />
                                                  ห้อง {room?.name || 'Unknown'}
                                              </div>
                                              <div className="flex items-center text-gray-600">
                                                  <Calendar className="w-4 h-4 mr-2" />
                                                  {exam.date}
                                              </div>
                                              <div className="flex items-center text-gray-600">
                                                  <Clock className="w-4 h-4 mr-2" />
                                                  {exam.startTime} - {exam.endTime}
                                              </div>
                                              <div className="pt-2">
                                                  <button 
                                                    onClick={() => handleEnterExam(exam)}
                                                    className="w-full bg-[#E35205] text-white py-2 rounded font-medium hover:bg-orange-700 transition"
                                                  >
                                                      เข้าห้องสอบ
                                                  </button>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

      {verifyingExam && (
          <FaceVerification 
            user={user}
            exam={verifyingExam}
            onVerified={handleVerified}
            onCancel={() => setVerifyingExam(null)}
          />
      )}

      {showMethodSelector && (
          <VerificationMethodSelector 
            onSelectWebcam={handleSelectWebcam}
            onSelectQRCode={handleSelectQRCode}
            onCancel={() => {
                setShowMethodSelector(false);
                setSelectedExamForVerification(null);
            }}
          />
      )}

      {showQRModal && selectedExamForVerification && (
          <QRCodeModal 
            isOpen={showQRModal}
            onClose={() => setShowQRModal(false)}
            url={`${window.location.origin}?action=exam&roomId=${selectedExamForVerification.roomId}`}
          />
      )}
    </div>
  );
};

export default StudentDashboard;