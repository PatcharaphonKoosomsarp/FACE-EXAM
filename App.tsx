import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import MobileFaceRegistration from './components/MobileFaceRegistration';
import MobileFaceVerification from './components/MobileFaceVerification';
import { User, UserRole, Room, Exam, ExamAttendance } from './types';
import { supabase } from './supabaseClient';
import { determineUserRole } from './utils';

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
  const [mobileVerifyParams, setMobileVerifyParams] = useState<{examId: string, userId: string} | null>(null);

  useEffect(() => {
    // Check for Mobile Registration/Verification Mode URL parameters
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const userId = params.get('user_id');
    const examId = params.get('exam_id');

    if (mode === 'mobile-register' && userId) {
        setMobileRegisterUserId(userId);
        return; // Skip normal auth check if in mobile register mode
    }

    if (mode === 'mobile-verify' && userId && examId) {
        setMobileVerifyParams({ examId, userId });
        return; // Skip normal auth check
    }

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const email = session.user.email || '';
        const role = determineUserRole(email);
        
        setUser({
          id: session.user.id,
          email,
          name: session.user.user_metadata.full_name || email.split('@')[0],
          role,
          avatarUrl: session.user.user_metadata.avatar_url,
          isFaceRegistered: false
        });
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const email = session.user.email || '';
        const role = determineUserRole(email);

        setUser({
          id: session.user.id,
          email,
          name: session.user.user_metadata.full_name || email.split('@')[0],
          role,
          avatarUrl: session.user.user_metadata.avatar_url,
          isFaceRegistered: false
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
      const loadedRooms = await fetchRooms();
      if (loadedRooms) {
          await fetchExams(loadedRooms);
      }
  };

  const fetchActiveStudents = async () => {
      const { data, error } = await supabase
          .from('exam_attendance')
          .select('*');
      
      if (error) {
          // console.error('Error fetching attendance:', error); // Suppress error if table doesn't exist yet
      } else {
          const mapped: ExamAttendance[] = data.map((a: any) => ({
              id: a.id,
              examId: a.exam_id,
              studentId: a.student_id,
              studentName: a.student_name,
              studentCode: a.student_code,
              row: a.row_number,
              col: a.col_number,
              ipAddress: a.ip_address,
              status: a.status,
              joinedAt: a.joined_at
          }));
          setActiveStudents(mapped);
      }
  };

  const handleKickStudent = async (attendanceId: string) => {
      const { error } = await supabase
          .from('exam_attendance')
          .delete()
          .eq('id', attendanceId);
      
      if (error) {
          alert('Error kicking student: ' + error.message);
      } else {
          setActiveStudents(prev => prev.filter(s => s.id !== attendanceId));
      }
  };

  const fetchRooms = async (): Promise<Room[] | null> => {
    const { data, error } = await supabase
      .from('room_seat_layouts')
      .select('*, room_seat_ip_mappings(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rooms:', error);
      return null;
    } else {
      const mappedRooms: Room[] = data.map((r: any) => {
        const ipMap: Record<string, string> = {};
        if (r.room_seat_ip_mappings && Array.isArray(r.room_seat_ip_mappings)) {
            r.room_seat_ip_mappings.forEach((mapping: any) => {
                const key = `${mapping.row_number}-${mapping.column_number}`;
                ipMap[key] = mapping.ip_address;
            });
        }
        
        return {
            id: r.id,
            name: r.room_name,
            rows: r.rows,
            cols: r.columns,
            ipMapping: ipMap
        };
      });
      setRooms(mappedRooms);
      return mappedRooms;
    }
  };

  const fetchExams = async (currentRooms: Room[]) => {
      const { data, error } = await supabase
        .from('exam_rooms')
        .select('*, room_blocked_resources(*)')
        .order('created_at', { ascending: false });

      if (error) {
          console.error('Error fetching exams:', error);
      } else {
          const mappedExams: Exam[] = data.map((e: any) => {
              const room = currentRooms.find(r => r.name === e.room_name);
              return {
                  id: e.id,
                  roomId: room ? room.id : '', // Map by name
                  subjectCode: e.course_code || '',
                  subjectName: e.course_name || '',
                  section: e.section || '',
                  date: e.exam_date || '',
                  startTime: e.start_time || '', // Time might need formatting if it comes as HH:mm:ss
                  endTime: e.end_time || '',
                  createdByName: e.created_by_name || '',
                  createdById: e.created_by,
                  blockedResources: e.room_blocked_resources ? e.room_blocked_resources.map((r: any) => ({
                      id: r.id,
                      name: r.pattern,
                      type: r.match_type
                  })) : []
              };
          });
          setExams(mappedExams);
      }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // --- Room CRUD ---
  const handleAddRoom = async (newRoom: Room) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('room_seat_layouts')
      .insert([
        {
          room_name: newRoom.name,
          rows: newRoom.rows,
          columns: newRoom.cols,
          total_seats: newRoom.rows * newRoom.cols,
          created_by: user.id
        }
      ])
      .select();

    if (error) {
      alert('Error creating room: ' + error.message);
      throw error;
    }
    
    if (data) {
        const created = data[0];
        const mapped: Room = {
            id: created.id,
            name: created.room_name,
            rows: created.rows,
            cols: created.columns,
            ipMapping: {}
        };
        setRooms(prev => [mapped, ...prev]);
        return mapped;
    }
  };

  const handleUpdateRoom = async (updatedRoom: Room) => {
    const { error } = await supabase
      .from('room_seat_layouts')
      .update({
        room_name: updatedRoom.name,
        rows: updatedRoom.rows,
        columns: updatedRoom.cols,
        total_seats: updatedRoom.rows * updatedRoom.cols
      })
      .eq('id', updatedRoom.id);

    if (error) {
        alert('Error updating room: ' + error.message);
        throw error;
    }

    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
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
        const { error } = await supabase
          .from('room_seat_layouts')
          .delete()
          .eq('id', roomId);
        
        if (error) {
            alert('Error deleting room: ' + error.message);
            return;
        }
        setRooms(prev => prev.filter(r => r.id !== roomId));
    }
  };

  const handleUpdateIp = async (roomId: string, row: number, col: number, ip: string) => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      // Calculate seat number (1-based index)
      const seatNumber = ((row - 1) * room.cols) + col;

      // Check if mapping exists
      const { data: existing } = await supabase
          .from('room_seat_ip_mappings')
          .select('id')
          .eq('layout_id', roomId)
          .eq('row_number', row)
          .eq('column_number', col)
          .maybeSingle();

      if (!ip) {
          // Delete if exists
          if (existing) {
             await supabase.from('room_seat_ip_mappings').delete().eq('id', existing.id);
          }
          
          // Update local state
          setRooms(prev => prev.map(r => {
              if (r.id === roomId) {
                  const newIpMapping = { ...r.ipMapping };
                  if (newIpMapping) delete newIpMapping[`${row}-${col}`];
                  return { ...r, ipMapping: newIpMapping };
              }
              return r;
          }));

      } else {
          // Upsert
          if (existing) {
              await supabase.from('room_seat_ip_mappings').update({ ip_address: ip }).eq('id', existing.id);
          } else {
              await supabase.from('room_seat_ip_mappings').insert({
                  layout_id: roomId,
                  row_number: row,
                  column_number: col,
                  seat_number: seatNumber,
                  ip_address: ip
              });
          }

          // Update local state
          setRooms(prev => prev.map(r => {
              if (r.id === roomId) {
                  return {
                      ...r,
                      ipMapping: {
                          ...r.ipMapping,
                          [`${row}-${col}`]: ip
                      }
                  };
              }
              return r;
          }));
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

    const { data, error } = await supabase
        .from('exam_rooms')
        .insert([
            {
                room_name: room.name,
                exam_date: newExam.date,
                // exam_time: newExam.startTime + '-' + newExam.endTime, // Optional field in DB
                course_code: newExam.subjectCode,
                course_name: newExam.subjectName,
                section: newExam.section,
                created_by: user.id,
                created_by_name: user.name,
                start_time: newExam.startTime,
                end_time: newExam.endTime,
                is_active: true
            }
        ])
        .select();

    if (error) {
        alert('Error creating exam: ' + error.message);
        throw error;
    }

    if (data) {
        const created = data[0];
        
        // Insert Blocked Resources
        if (newExam.blockedResources && newExam.blockedResources.length > 0) {
            const resourcesToInsert = newExam.blockedResources.map(r => ({
                room_id: created.id,
                pattern: r.name,
                match_type: r.type
            }));
            const { error: resError } = await supabase
                .from('room_blocked_resources')
                .insert(resourcesToInsert);
            
            if (resError) console.error("Error inserting resources", resError);
        }

        const mapped: Exam = {
            ...newExam,
            id: created.id,
            createdById: created.created_by,
            createdByName: created.created_by_name
        };
        setExams(prev => [mapped, ...prev]);
    }
  };

  const handleUpdateExam = async (updatedExam: Exam) => {
    const room = rooms.find(r => r.id === updatedExam.roomId);
    if (!room) {
        alert("Error: Room not found");
        return;
    }

    const { error } = await supabase
        .from('exam_rooms')
        .update({
            room_name: room.name,
            exam_date: updatedExam.date,
            course_code: updatedExam.subjectCode,
            course_name: updatedExam.subjectName,
            section: updatedExam.section,
            start_time: updatedExam.startTime,
            end_time: updatedExam.endTime
        })
        .eq('id', updatedExam.id);

    if (error) {
        alert('Error updating exam: ' + error.message);
        throw error;
    }

    // Sync Resources: Delete all and re-insert
    await supabase.from('room_blocked_resources').delete().eq('room_id', updatedExam.id);
    
    if (updatedExam.blockedResources && updatedExam.blockedResources.length > 0) {
        const resourcesToInsert = updatedExam.blockedResources.map(r => ({
            room_id: updatedExam.id,
            pattern: r.name,
            match_type: r.type
        }));
        await supabase.from('room_blocked_resources').insert(resourcesToInsert);
    }

    setExams(prev => prev.map(e => e.id === updatedExam.id ? updatedExam : e));
  };

  const handleDeleteExam = async (examId: string) => {
    if (window.confirm("คุณแน่ใจหรือไม่ที่จะลบตารางสอบนี้?")) {
        const { error } = await supabase
            .from('exam_rooms')
            .delete()
            .eq('id', examId);

        if (error) {
            alert('Error deleting exam: ' + error.message);
            return;
        }
        setExams(prev => prev.filter(e => e.id !== examId));
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
      return <MobileFaceVerification examId={mobileVerifyParams.examId} userId={mobileVerifyParams.userId} />;
  }

  if (!user) {
    return <AuthScreen onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
        {/* Simple Top Bar */}
        <div className="bg-white shadow-sm border-b px-6 py-3 flex justify-between items-center sticky top-0 z-40">
            <div className="font-bold text-[#E35205] text-sm md:text-lg flex items-center">
                <span className="bg-[#E35205] text-white p-1 rounded mr-2 text-xs flex-shrink-0">KMUTNB</span>
                <span className="truncate max-w-[200px] md:max-w-none" title="FACIAL RECOGNITION AND RESOURCE MONITORING SYSTEM FOR LAB EXAMS">
                  FACIAL RECOGNITION AND RESOURCE MONITORING SYSTEM FOR LAB EXAMS
                </span>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full bg-gray-200" />
                    <div className="hidden md:block text-left leading-tight">
                        <div className="text-sm font-semibold">{user.name}</div>
                        <div className="text-xs text-gray-600">{user.email}</div>
                        <div className="text-[10px] text-gray-400 font-bold tracking-wider">{user.role}</div>
                    </div>
                </div>
                <button 
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-red-500 border-l pl-4"
                >
                    ออกจากระบบ
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