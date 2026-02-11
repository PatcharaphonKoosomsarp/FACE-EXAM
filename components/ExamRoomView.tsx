import React, { useEffect, useState } from 'react';
import { User, Exam } from '../types';
import { supabase } from '../supabaseClient';
import { examService } from '../services/examService';
import { sessionService } from '../services/sessionService';
import { 
    LogOut, ArrowLeft, Loader2, MapPin, Clock, Calendar, 
    LayoutGrid, MonitorX, Ban, User as UserIcon, ShieldCheck 
} from 'lucide-react';

interface ExamRoomViewProps {
    user: User;
    exam: Exam;
    onExit: () => void;
}

const ExamRoomView: React.FC<ExamRoomViewProps> = ({ user, exam, onExit }) => {
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [roomName, setRoomName] = useState<string>('');
    const [roomInfo, setRoomInfo] = useState<any>(null);

    useEffect(() => {
        const fetchRoomData = async () => {
            try {
                // Fetch basic room info
                const name = await examService.fetchRoomName(exam.roomId);
                setRoomName(name);
                
                // Fetch full room details for calculating seat index
                const { data: roomData } = await supabase
                    .from('room_seat_layouts')
                    .select('rows, columns')
                    .eq('id', exam.roomId)
                    .single();
                
                if (roomData) setRoomInfo(roomData);
            } catch(e) { console.error(e); }
        };
        fetchRoomData();
    }, [exam.roomId]);

    // Helper to calculate seat index (No. X) from Row-Col string
    const getSeatIndex = (seatStr: string) => {
        if (!seatStr || !roomInfo) return seatStr;
        if (typeof seatStr === 'string' && seatStr.includes('-')) {
            const [r, c] = seatStr.split('-').map(Number);
            if (!isNaN(r) && !isNaN(c)) {
                // Formula: (Row-1) * Cols + Col
                return `No. ${(r - 1) * roomInfo.columns + c}`;
            }
        }
        return seatStr; // Fallback
    };

    useEffect(() => {
        const fetchSession = async () => {
            try {
                // 1. Fetch current IP
                let clientIp = '0.0.0.0';
                try {
                    const ipRes = await fetch('https://api.ipify.org?format=json').then(r => r.json());
                    clientIp = ipRes.ip;
                } catch (e) { console.warn("Cannot resolve public IP, utilizing internal logic"); }

                // 2. Resolve Seat from DB Mapping (using Agent's logic: IP -> Seat)
                // Note: In real production with Agent, Agent updates DB with local IP.
                // Here frontend tries to find "My Seat" by checking if any seat mapping has "My IP" 
                // BUT: Client IP (browser) and Agent IP (python) might differ if NAT/Proxy used.
                // BEST PRACTICE: Trust DB session if exists. If not, wait for Agent to Check-in.
                
                // Let's rely on what Session Service returns first
                const activeSession = await sessionService.fetchActiveSession(user.email);
                
                if (activeSession && activeSession.layout_id === exam.roomId) {
                     setSession(activeSession);
                } else {
                     // If no session, maybe Agent just registered the seat?
                     // We need a mechanism to "Claim" the seat if Agent is active.
                     // For now, let's auto-refresh every few seconds to see if session appears
                     // OR: We implement "Auto-Checkin" here if we knew the seat.
                }

            } catch (err) {
                console.error("Error fetching session:", err);
            } finally {
                setLoading(false);
            }
        };

        const interval = setInterval(fetchSession, 5000); // Polling for session updates
        fetchSession(); // Initial call

        return () => clearInterval(interval);
    }, [exam.roomId, user.email]);

    const handleExit = async () => {
        if (!confirm('คุณแน่ใจหรือไม่ที่ต้องการออกจากห้องสอบ?\n\nการออกจากห้องจะลบข้อมูลการเข้าสอบของคุณออกจากระบบ')) {
            return;
        }

        try {
            if (session) {
                await sessionService.exitSession(session.id, user.id);
                console.log("QR auth record deleted successfully");
            }
            onExit();
        } catch (err: any) {
            console.error("Error exiting exam:", err);
            alert(`เกิดข้อผิดพลาดในการออกจากห้องสอบ: ${err.message || 'Unknown error'}`);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-6xl w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                
                {/* Header - Dark Theme */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <div className="text-orange-400 font-bold tracking-wider text-sm uppercase">Exam Details</div>
                                </div>
                                <h1 className="text-3xl font-bold">{exam.subjectCode} - {exam.subjectName}</h1>
                                <div className="flex flex-wrap items-center gap-4 mt-3 text-gray-300">
                                    <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm"><Calendar className="w-4 h-4 mr-2"/> {exam.date}</div>
                                    <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm"><Clock className="w-4 h-4 mr-2"/> {exam.startTime} - {exam.endTime}</div>
                                    <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm">
                                        <MapPin className="w-4 h-4 mr-2"/> ห้อง {roomName || 'กำลังโหลด...'}
                                    </div>
                                </div>
                            </div>
                            <div className="bg-primary text-white px-6 py-2 rounded-xl text-lg font-bold shadow-lg border-2 border-orange-400/30">
                                Section {exam.section}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Student & Seat */}
                    <div className="lg:col-span-2">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center">
                                <span className="bg-orange-100 p-2 rounded-lg mr-3"><LayoutGrid className="w-5 h-5 text-primary"/></span>
                                ข้อมูลที่นั่งสอบ
                            </h3>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="flex flex-col items-center text-center min-w-[200px]">
                                    <div className="w-32 h-32 bg-white rounded-full shadow-md p-1 mb-4">
                                        <img 
                                            src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}&background=E35205&color=fff`} 
                                            alt="Profile" 
                                            className="w-full h-full rounded-full object-cover"
                                        />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-800">{user.name}</h2>
                                    <p className="text-gray-500">{user.email}</p>
                                </div>
                                
                                <div className="flex-1 w-full">
                                    <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 flex flex-col items-center justify-center relative overflow-hidden h-full">
                                        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
                                        <span className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">หมายเลขที่นั่งของคุณ</span>
                                        <div className={`font-bold text-primary mb-4 transition-all leading-none ${
                                            String(session?.seat_number || '').length > 2 ? 'text-6xl' : 
                                            String(session?.seat_number || '').length > 1 ? 'text-7xl' : 'text-8xl'
                                        }`}>
                                            {getSeatIndex(session?.seat_number) || '-'}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 py-2 px-4 rounded-lg">
                                            <div className={`w-2 h-2 rounded-full ${session?.ip_address ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            IP: {session?.ip_address || 'Unknown'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-4 border-t border-gray-200 pt-6">
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

                    {/* Right Column: Unauthorized Resources */}
                    <div className="space-y-6">
                        <div className="bg-red-50 rounded-2xl p-6 border border-red-100 h-full">
                            <div className="flex items-center mb-4">
                                <span className="bg-red-100 p-2 rounded-lg mr-3"><MonitorX className="w-5 h-5 text-red-600"/></span>
                                <h3 className="text-lg font-bold text-gray-800">ทรัพยากรที่ไม่อนุญาต</h3>
                            </div>
                            
                            {(exam.blockedResources && exam.blockedResources.length > 0) ? (
                                <ul className="space-y-3">
                                    {exam.blockedResources.map(r => (
                                        <li key={r.id} className="flex items-center bg-white text-gray-800 p-3 rounded-xl border border-red-100 shadow-sm">
                                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mr-3 shrink-0">
                                                <Ban className="w-4 h-4 text-red-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{r.name}</p>
                                                <p className="text-xs text-gray-500 uppercase">{r.type}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center py-12 text-gray-400 italic bg-white/50 rounded-xl border border-red-100/50">
                                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-20 text-green-500"/>
                                    ไม่มีการจำกัดทรัพยากร
                                </div>
                            )}
                            
                            <div className="mt-6 text-xs text-red-400 text-center">
                                *การเปิดใช้งานโปรแกรมเหล่านี้อาจส่งผลให้ถูกตัดสิทธิ์การสอบ
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamRoomView;
