import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import MobileFaceRegistration from './components/MobileFaceRegistration';
import MobileFaceVerification from './components/MobileFaceVerification';
import { User, UserRole, Room, Exam, ExamAttendance } from './types';
import { LogOut } from 'lucide-react';

// Services
import { authService } from './services/authService';
import { examService } from './services/examService';
import { sessionService } from './services/sessionService';

// Initial Mock Data
const INITIAL_ROOMS: Room[] = [];

const INITIAL_EXAMS: Exam[] = [];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS);
  const [activeStudents, setActiveStudents] = useState<ExamAttendance[]>([]);
  
  // Mobile Registration Mode State
  const [mobileRegisterUserId, setMobileRegisterUserId] = useState<string | null>(null);
  // Mobile Verification Mode State
  const [mobileVerifyParams, setMobileVerifyParams] = useState<{examId: string, userId: string, ip?: string} | null>(null);

  useEffect(() => {
    // Check for Mobile Registration/Verification Mode URL parameters
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const userId = params.get('user_id');
    const examId = params.get('exam_id');
    const ip = params.get('ip');

    if (mode === 'mobile-register' && userId) {
        setMobileRegisterUserId(userId);
        return; // Skip normal auth check if in mobile register mode
    }

    if (mode === 'mobile-verify' && userId && examId) {
        setMobileVerifyParams({ examId, userId, ip: ip || undefined });
        return; // Skip normal auth check
    }

    // Check active session
    authService.getSession().then(user => {
      if (user) setUser(user);
    });

    // Listen for auth changes
    const subscription = authService.onAuthStateChange((user) => {
      setUser(user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const roomsRef = React.useRef<Room[]>(rooms);
  const examsRef = React.useRef<Exam[]>(exams);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    examsRef.current = exams;
  }, [exams]);

  useEffect(() => {
    if (user) {
      loadData();
    }
    
    let interval: NodeJS.Timeout;
    if (user?.role === UserRole.TEACHER) {
        fetchActiveStudents(); // Initial fetch
        interval = setInterval(fetchActiveStudents, 5000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [user]);

  const loadData = async () => {
      const loadedRooms = await examService.fetchRooms();
      if (loadedRooms) {
          setRooms(loadedRooms);
          const loadedExams = await examService.fetchExams(loadedRooms);
          setExams(loadedExams);
      }
  };

  const fetchActiveStudents = async () => {
      const students = await sessionService.fetchActiveStudents(roomsRef.current);
      setActiveStudents(students);
  };

  const handleKickStudent = async (attendanceId: string) => {
      try {
          await sessionService.kickStudent(attendanceId, activeStudents);
          setActiveStudents(prev => prev.filter(s => s.id !== attendanceId));
      } catch (error: any) {
          alert(error.message);
      }
  };



  const handleLogout = async () => {
    await authService.signOut();
    setUser(null);
  };

  // --- Room CRUD ---
  const handleAddRoom = async (newRoom: Room) => {
    if (!user) return;
    try {
        const createdRoom = await examService.createRoom(newRoom, user.id);
        setRooms(prev => [createdRoom, ...prev]);
        return createdRoom;
    } catch (error: any) {
        alert('Error creating room: ' + error.message);
        throw error;
    }
  };

  const handleUpdateRoom = async (updatedRoom: Room) => {
    try {
        await examService.updateRoom(updatedRoom);
        setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    } catch (error: any) {
        alert('Error updating room: ' + error.message);
        throw error;
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    // Check constraints
    const isUsed = exams.some(e => e.roomId === roomId);
    if (isUsed) {
        const usedExam = exams.find(e => e.roomId === roomId);
        alert(`ไม่สามารถลบห้องสอบนี้ได้ เนื่องจากถูกใช้งานในวิชา ${usedExam?.subjectCode} ${usedExam?.subjectName}\nกรุณาลบตารางสอบที่เกี่ยวข้องก่อน`);
        return;
    }

    if (window.confirm("คุณแน่ใจหรือไม่ที่จะลบห้องสอบนี้?")) {
        try {
            await examService.deleteRoom(roomId);
            setRooms(prev => prev.filter(r => r.id !== roomId));
        } catch (error: any) {
            alert('Error deleting room: ' + error.message);
        }
    }
  };

  const handleUpdateIp = async (roomId: string, row: number, col: number, ip: string) => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      try {
          await examService.updateIpMapping(roomId, row, col, ip, room.cols);
          
          // Update local state
          setRooms(prev => prev.map(r => {
              if (r.id === roomId) {
                  const newIpMapping = { ...r.ipMapping };
                  if (ip) {
                      newIpMapping[`${row}-${col}`] = ip;
                  } else {
                      delete newIpMapping[`${row}-${col}`];
                  }
                  return { ...r, ipMapping: newIpMapping };
              }
              return r;
          }));
      } catch (error) {
          console.error('Error updating IP:', error);
      }
  };

  // --- Exam CRUD ---
  const handleAddExam = async (newExam: Exam) => {
    if (!user) return;
    
    // Find room name from ID
    const room = rooms.find(r => r.id === newExam.roomId);
    if (!room) {
        alert("Error: Room not found");
        return;
    }

    try {
        const createdExam = await examService.createExam(newExam, room.name, user.id, user.name);
        setExams(prev => [createdExam, ...prev]);
    } catch (error: any) {
        alert('Error creating exam: ' + error.message);
    }
  };

  const handleUpdateExam = async (updatedExam: Exam) => {
    const room = rooms.find(r => r.id === updatedExam.roomId);
    if (!room) {
        alert("Error: Room not found");
        return;
    }

    try {
        await examService.updateExam(updatedExam, room.name);
        setExams(prev => prev.map(e => e.id === updatedExam.id ? updatedExam : e));
    } catch (error: any) {
        alert('Error updating exam: ' + error.message);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (window.confirm("คุณแน่ใจหรือไม่ที่จะลบตารางสอบนี้?")) {
        try {
            await examService.deleteExam(examId);
            setExams(prev => prev.filter(e => e.id !== examId));
        } catch (error: any) {
            alert('Error deleting exam: ' + error.message);
        }
    }
  };

  const handleUpdateUser = (updatedUser: User) => {
      setUser(updatedUser);
  }

  // Render Mobile Registration View if active
  if (mobileRegisterUserId) {
      return <MobileFaceRegistration targetUserId={mobileRegisterUserId} />;
  }

  // Render Mobile Verification View if active
  if (mobileVerifyParams) {
      return <MobileFaceVerification examId={mobileVerifyParams.examId} userId={mobileVerifyParams.userId} agentIp={mobileVerifyParams.ip} />;
  }

  if (!user) {
    return <AuthScreen onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
        {/* Simple Top Bar */}
        <div className="bg-white shadow-sm border-b px-6 py-3 flex justify-between items-center sticky top-0 z-40">
                <div
                        className="font-bold text-primary text-sm md:text-lg flex items-center cursor-pointer"
                        role="button"
                        title="กลับสู่หน้าหลัก"
                        onClick={() => { window.location.href = '/'; }}
                >
                                <span className="bg-primary text-white p-1 rounded mr-2 text-xs flex-shrink-0">KMUTNB</span>
                                <span className="truncate max-w-[200px] md:max-w-none" title="FACIAL RECOGNITION AND RESOURCE MONITORING SYSTEM FOR LAB EXAMS">
                                    FACIAL RECOGNITION AND RESOURCE MONITORING SYSTEM FOR LAB EXAMS
                                </span>
                        </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <img src={user.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full bg-gray-200" />
                    <div className="hidden md:block text-left leading-tight">
                        <div className="text-base font-bold text-gray-800">{user.name}</div>
                        {user.role === UserRole.STUDENT && (
                            <div className="text-xs font-semibold text-gray-700">
                                {user.email.split('@')[0].replace(/^s/i, '')}
                            </div>
                        )}
                        <div className="text-xs text-gray-600">{user.email}</div>
                        <div className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">{user.role}</div>
                    </div>
                </div>
                <button 
                    onClick={handleLogout}
                    className="text-gray-400 hover:text-red-500 border-l pl-4 transition-colors"
                    title="ออกจากระบบ"
                >
                    <LogOut className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Role Based Routing */}
        <main className="py-6">
            {user.role === UserRole.TEACHER && (
                <TeacherDashboard 
                    user={user} 
                    rooms={rooms} 
                    exams={exams} 
                    activeStudents={activeStudents}
                    onAddRoom={handleAddRoom}
                    onUpdateRoom={handleUpdateRoom}
                    onDeleteRoom={handleDeleteRoom}
                    onUpdateIp={handleUpdateIp}
                    onAddExam={handleAddExam}
                    onUpdateExam={handleUpdateExam}
                    onDeleteExam={handleDeleteExam}
                    onKickStudent={handleKickStudent}
                />
            )}
            {user.role === UserRole.STUDENT && (
                <StudentDashboard 
                    user={user}
                    exams={exams}
                    rooms={rooms}
                    onUpdateUser={handleUpdateUser}
                />
            )}
            {user.role === UserRole.GUEST && (
                <div className="text-center p-20 text-red-500 font-bold">
                    Access Denied. Invalid Role.
                </div>
            )}
        </main>
    </div>
  );
};

export default App;