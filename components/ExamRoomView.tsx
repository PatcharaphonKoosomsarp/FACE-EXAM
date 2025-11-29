import React, { useEffect, useState } from 'react';
import { User, Exam } from '../types';
import { supabase } from '../supabaseClient';
import { CheckCircle, User as UserIcon, Armchair, ClipboardList, LogOut, ArrowLeft, Loader2 } from 'lucide-react';

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
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header Card */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
                    <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 text-white">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                            <CheckCircle className="w-8 h-8" />
                            ยืนยันตำแหน่งที่นั่ง (ยืนยันตัวตนสำเร็จ)
                        </h3>
                    </div>
                    
                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Student Info */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white flex items-center gap-2">
                                    <UserIcon className="w-5 h-5" />
                                    <h4 className="font-bold">ข้อมูลนักศึกษา</h4>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">ชื่อ-นามสกุล:</span>
                                        <span className="font-bold text-gray-800">{user.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">Email:</span>
                                        <span className="font-bold text-gray-800 text-sm">{user.email}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Seat Info */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white flex items-center gap-2">
                                    <Armchair className="w-5 h-5" />
                                    <h4 className="font-bold">ตำแหน่งที่นั่ง</h4>
                                </div>
                                <div className="p-6">
                                    <div className="bg-white rounded-lg p-4 text-center mb-4 shadow-sm border border-gray-100">
                                        <span className="block text-gray-500 text-sm font-medium mb-2">หมายเลขที่นั่ง</span>
                                        <span className="block text-5xl font-bold text-blue-600">
                                            {session?.seat_number || '-'}
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                            <span className="text-gray-500 text-sm font-medium">IP Address:</span>
                                            <span className="font-bold text-gray-800">{session?.ip_address || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                            <span className="text-gray-500 text-sm font-medium">เวลาเข้าสอบ:</span>
                                            <span className="font-bold text-gray-800">
                                                {session?.session_start_time ? new Date(session.session_start_time).toLocaleTimeString('th-TH') : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Exam Details */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5" />
                                    <h4 className="font-bold">รายละเอียดห้องสอบ</h4>
                                </div>
                                <div className="p-6 space-y-3">
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">รหัสวิชา:</span>
                                        <span className="font-bold text-gray-800">{exam.subjectCode}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">ชื่อวิชา:</span>
                                        <span className="font-bold text-gray-800 truncate max-w-[150px]" title={exam.subjectName}>{exam.subjectName}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">Section:</span>
                                        <span className="font-bold text-gray-800">{exam.section}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">วันที่สอบ:</span>
                                        <span className="font-bold text-gray-800">{exam.date}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">เวลาสอบ:</span>
                                        <span className="font-bold text-gray-800">{exam.startTime} - {exam.endTime}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-gray-500 text-sm font-medium">สร้างโดย:</span>
                                        <span className="font-bold text-gray-800">{exam.createdByName}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex justify-center gap-4 border-t pt-6">
                            <button 
                                onClick={handleExit}
                                className="flex items-center px-6 py-3 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition shadow-md"
                            >
                                <LogOut className="w-5 h-5 mr-2" />
                                ออกจากห้องสอบ
                            </button>
                            <button 
                                onClick={onExit}
                                className="flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition"
                            >
                                <ArrowLeft className="w-5 h-5 mr-2" />
                                กลับไป Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamRoomView;
