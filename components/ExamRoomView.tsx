import React, { useEffect, useState } from 'react';
import { User, Exam } from '../types';
import { supabase } from '../supabaseClient';
import { CheckCircle, User as UserIcon, Armchair, ClipboardList, LogOut, ArrowLeft, Loader2, MapPin, Clock, Calendar, ShieldCheck } from 'lucide-react';

interface ExamRoomViewProps {
    user: User;
    exam: Exam;
    onExit: () => void;
}

const ExamRoomView: React.FC<ExamRoomViewProps> = ({ user, exam, onExit }) => {
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const { data, error } = await supabase
                    .from('exam_student_sessions')
                    .select('*')
                    .eq('layout_id', exam.roomId)
                    .eq('student_email', user.email)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                setSession(data);
            } catch (err) {
                console.error("Error fetching session:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSession();
    }, [exam.roomId, user.email]);

    const handleExit = async () => {
        if (!confirm('คุณแน่ใจหรือไม่ที่ต้องการออกจากห้องสอบ?\n\nการออกจากห้องจะบันทึกเวลาออกและปิดสถานะการเข้าสอบของคุณ')) {
            return;
        }

        try {
            if (session) {
                const { error } = await supabase
                    .from('exam_student_sessions')
                    .update({
                        is_active: false,
                        session_end_time: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', session.id);

                if (error) throw error;
            }
            onExit();
        } catch (err) {
            console.error("Error exiting exam:", err);
            alert("เกิดข้อผิดพลาดในการออกจากห้องสอบ");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 text-[#E35205] animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-4xl w-full">
                
                {/* Success Banner */}
                <div className="bg-green-500 rounded-t-2xl p-6 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-full">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">ยืนยันตัวตนสำเร็จ</h1>
                            <p className="text-green-100 text-sm">คุณได้รับอนุญาตให้เข้าสอบแล้ว</p>
                        </div>
                    </div>
                    <div className="hidden md:block text-right relative z-10">
                        <div className="text-3xl font-bold opacity-90">{new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="text-sm text-green-100">{new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>
                </div>

                {/* Main Ticket Card */}
                <div className="bg-white rounded-b-2xl shadow-xl border-x border-b border-gray-100 overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                        
                        {/* Left Column: Student & Seat */}
                        <div className="w-full md:w-1/3 bg-gray-50 p-8 border-r border-gray-100 flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-white rounded-full shadow-md p-1 mb-4">
                                <img 
                                    src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}&background=E35205&color=fff`} 
                                    alt="Profile" 
                                    className="w-full h-full rounded-full object-cover"
                                />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800 mb-1">{user.name}</h2>
                            <p className="text-sm text-gray-500 mb-6">{user.email}</p>

                            <div className="w-full bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">หมายเลขที่นั่ง</span>
                                <div className="text-6xl font-bold text-[#E35205] my-2">
                                    {session?.seat_number || '-'}
                                </div>
                                <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50 py-1 px-2 rounded-lg">
                                    <div className={`w-2 h-2 rounded-full ${session?.ip_address ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    {session?.ip_address || 'No IP'}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Exam Details */}
                        <div className="w-full md:w-2/3 p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <span className="bg-orange-100 text-[#E35205] px-3 py-1 rounded-full text-xs font-bold mb-2 inline-block">
                                        Section {exam.section}
                                    </span>
                                    <h2 className="text-2xl font-bold text-gray-800">{exam.subjectCode}</h2>
                                    <h3 className="text-lg text-gray-600">{exam.subjectName}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div className="flex items-start gap-3">
                                    <div className="bg-gray-100 p-2 rounded-lg text-gray-500">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase">วันที่สอบ</p>
                                        <p className="font-medium text-gray-800">{exam.date}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="bg-gray-100 p-2 rounded-lg text-gray-500">
                                        <Clock className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase">เวลาสอบ</p>
                                        <p className="font-medium text-gray-800">{exam.startTime} - {exam.endTime}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="bg-gray-100 p-2 rounded-lg text-gray-500">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase">ห้องสอบ</p>
                                        <p className="font-medium text-gray-800">Room ID: {exam.roomId.substring(0, 8)}...</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="bg-gray-100 p-2 rounded-lg text-gray-500">
                                        <UserIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase">ผู้คุมสอบ</p>
                                        <p className="font-medium text-gray-800">{exam.createdByName}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-6 flex gap-4">
                                <button 
                                    onClick={onExit}
                                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition flex items-center justify-center"
                                >
                                    <ArrowLeft className="w-5 h-5 mr-2" />
                                    กลับหน้าหลัก
                                </button>
                                <button 
                                    onClick={handleExit}
                                    className="flex-1 bg-red-50 text-red-600 border border-red-100 py-3 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center"
                                >
                                    <LogOut className="w-5 h-5 mr-2" />
                                    ออกจากห้องสอบ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <p className="text-center text-gray-400 text-xs mt-6">
                    *กรุณาแสดงหน้านี้ต่อผู้คุมสอบหากได้รับการร้องขอ
                </p>
            </div>
        </div>
    );
};

export default ExamRoomView;
