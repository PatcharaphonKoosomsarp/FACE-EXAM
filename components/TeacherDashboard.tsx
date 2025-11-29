import React, { useState, useEffect } from 'react';
import { Room, Exam, ResourceConstraint, User, ExamAttendance } from '../types';
import { 
  Plus, Calendar, Save, Trash2, Cpu, 
  ChevronRight, Check, LayoutGrid, List, 
  MapPin, Clock, ArrowLeft, MonitorX, AlertCircle, Edit, X, User as UserIcon, Activity, ShieldAlert, Ban, Network, LogOut,
  HardDrive, Wifi, Layers
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { supabase } from '../supabaseClient';

interface ResourceLog {
    cpu_usage: number;
    cpu_frequency: number;
    cpu_model: string;
    ram_usage: number;
    ram_total_gb: number;
    ram_available_gb: number;
    ram_used_gb: number;
    disk_read_kb: number;
    disk_write_kb: number;
    disk_type: string;
    disk_partitions_info: any;
    gpu_usage: number;
    gpu_model: string;
    network_speed_kbps: number;
    network_type: string;
    active_window_title: string;
    exe_processes: any;
    timestamp: string;
}

interface TeacherDashboardProps {
  user: User;
  rooms: Room[];
  exams: Exam[];
  activeStudents: ExamAttendance[];
  onAddRoom: (room: Room) => Promise<Room | void>;
  onUpdateRoom: (room: Room) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onUpdateIp: (roomId: string, row: number, col: number, ip: string) => Promise<void>;
  onAddExam: (exam: Exam) => Promise<void>;
  onUpdateExam: (exam: Exam) => Promise<void>;
  onDeleteExam: (examId: string) => Promise<void>;
  onKickStudent: (attendanceId: string) => Promise<void>;
}

type ViewMode = 'WIZARD' | 'LIST';
type WizardStep = 1 | 2 | 3 | 4;

// Mock Data for Student Monitoring
interface StudentMonitorData {
    name: string;
    studentId: string;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
    currentApp: string;
    logs: { time: string; message: string; type: 'INFO' | 'VIOLATION' | 'SYSTEM' }[];
}

const getMockStudentData = (seatIndex: number): StudentMonitorData | null => {
    if (seatIndex % 5 === 0) return null;

    const statuses: ('NORMAL' | 'WARNING' | 'CRITICAL')[] = ['NORMAL', 'NORMAL', 'NORMAL', 'WARNING', 'NORMAL'];
    const apps = ['Visual Studio Code', 'Chrome (Exam Portal)', 'Calculator', 'Desktop'];
    
    return {
        name: `นักศึกษา ${seatIndex + 1}`,
        studentId: `560${10000 + seatIndex}`,
        status: statuses[seatIndex % statuses.length],
        currentApp: apps[seatIndex % apps.length],
        logs: [
            { time: '09:00', message: 'เข้าสู่ห้องสอบ', type: 'SYSTEM' },
            { time: '09:05', message: 'ยืนยันตัวตนสำเร็จ', type: 'INFO' },
            { time: '09:10', message: 'เปิดโปรแกรม Visual Studio Code', type: 'INFO' },
            ...(seatIndex % 4 === 0 ? [{ time: '09:45', message: 'พยายามเปิด Facebook (ถูกบล็อก)', type: 'VIOLATION' as const }] : []),
            { time: 'Now', message: `กำลังใช้งาน ${apps[seatIndex % apps.length]}`, type: 'INFO' }
        ]
    };
};

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ 
    user, rooms, exams, activeStudents,
    onAddRoom, onUpdateRoom, onDeleteRoom, 
    onAddExam, onUpdateExam, onDeleteExam, onUpdateIp, onKickStudent
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('WIZARD');
  
  // Wizard State
  const [step, setStep] = useState<WizardStep>(1);
  
  // Editing State
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  // Step 1 Data (Room)
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(true); 
  const [roomName, setRoomName] = useState('');
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(0);

  // Step 2 Data (Schedule)
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [section, setSection] = useState('');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [createdByName, setCreatedByName] = useState(user.name);

  // Step 3 Data (IP Address)
  const [selectedSeatForIp, setSelectedSeatForIp] = useState<string | null>(null);
  const [ipInput, setIpInput] = useState('');

  // Step 4 Data (Resources)
  const [blockedResources, setBlockedResources] = useState<ResourceConstraint[]>([]);
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceType, setNewResourceType] = useState<'WEB_APP' | 'WINDOWS_APP' | 'BROWSER'>('WEB_APP');
  const [isSuggesting, setIsSuggesting] = useState(false);

  // List View State
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [viewingSeat, setViewingSeat] = useState<number | null>(null); 

  // Monitoring Data State
  const [studentResourceData, setStudentResourceData] = useState<ResourceLog | null>(null);
  const [sessionStudent, setSessionStudent] = useState<any | null>(null);
  const [realtimeSessions, setRealtimeSessions] = useState<any[]>([]);

  // Effect to fetch all active sessions for the room when exam is selected
  useEffect(() => {
      if (!selectedExamId) return;
      const exam = exams.find(e => e.id === selectedExamId);
      if (!exam) return;

      const fetchSessions = async () => {
          const { data } = await supabase
              .from('exam_student_sessions')
              .select('*')
              .eq('layout_id', exam.roomId)
              .eq('is_active', true);
          
          if (data) {
              setRealtimeSessions(data);
          }
      };

      fetchSessions();
      const interval = setInterval(fetchSessions, 5000);
      return () => clearInterval(interval);
  }, [selectedExamId, exams]);

  // Effect to fetch monitoring data
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchResourceData = async () => {
        if (viewingSeat === null || !selectedExamId) return;
        
        const exam = exams.find(e => e.id === selectedExamId);
        const room = rooms.find(r => r.id === exam?.roomId);
        if (!room) return;

        const row = Math.floor(viewingSeat / room.cols) + 1;
        const col = (viewingSeat % room.cols) + 1;
        const seatNumber = (row - 1) * room.cols + col;

        // Try to find active student session first
        // We query exam_student_sessions directly to ensure we get the correct session ID for logs
        const { data: sessions } = await supabase
            .from('exam_student_sessions')
            .select('id, student_name, student_email, ip_address, student_profile_url')
            .eq('layout_id', room.id)
            .eq('seat_number', seatNumber)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (sessions && sessions.length > 0) {
            const session = sessions[0];
            setSessionStudent(session);
            
            const { data } = await supabase
                .from('resource_logs')
                .select('*')
                .eq('session_id', session.id)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();
            
            if (data) {
                setStudentResourceData(data);
            }
        } else {
            setStudentResourceData(null);
            setSessionStudent(null);
        }
    };

    if (viewingSeat !== null) {
        fetchResourceData();
        interval = setInterval(fetchResourceData, 5000); // Refresh every 5s
    } else {
        setStudentResourceData(null);
        setSessionStudent(null);
    }

    return () => {
        if (interval) clearInterval(interval);
    };
  }, [viewingSeat, selectedExamId, exams, rooms]);

  // Effect to clean up selection if item is deleted
  useEffect(() => {
      if (selectedRoomId && !rooms.find(r => r.id === selectedRoomId)) {
          setSelectedRoomId('');
          setIsCreatingRoom(true); 
      }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
      if (selectedExamId && !exams.find(e => e.id === selectedExamId)) {
          setSelectedExamId(null);
      }
  }, [exams, selectedExamId]);

  // --- Actions ---

  const handleStartEditRoom = (room: Room) => {
      setEditingRoomId(room.id);
      setRoomName(room.name);
      setRows(room.rows);
      setCols(room.cols);
      setIsCreatingRoom(true); 
  };

  const handleCancelEditRoom = () => {
      setEditingRoomId(null);
      setRoomName('');
      setRows(0);
      setCols(0);
      setIsCreatingRoom(false); 
  };

  const handleStartEditExam = (exam: Exam, targetStep: WizardStep = 1) => {
      setEditingExamId(exam.id);
      
      setSelectedRoomId(exam.roomId);
      setSubjectCode(exam.subjectCode);
      setSubjectName(exam.subjectName);
      setSection(exam.section);
      setExamDate(exam.date);
      setStartTime(exam.startTime);
      setEndTime(exam.endTime);
      setCreatedByName(exam.createdByName);
      setBlockedResources(exam.blockedResources);

      setIsCreatingRoom(false);
      setViewMode('WIZARD');
      setStep(targetStep); 
  };

  // --- Wizard Logic ---

  const saveRoomInternal = async (): Promise<string | null> => {
      if (!roomName) {
          alert("กรุณาระบุชื่อห้องสอบ");
          return null;
      }
      
      if (editingRoomId) {
          const existingRoom = rooms.find(r => r.id === editingRoomId);
          const updatedRoom: Room = { 
              id: editingRoomId, 
              name: roomName, 
              rows, 
              cols,
              ipMapping: existingRoom?.ipMapping 
          };
          await onUpdateRoom(updatedRoom);
          setEditingRoomId(null);
          setIsCreatingRoom(false);
          return editingRoomId;
      } else {
          const newId = Date.now().toString();
          const newRoom: Room = { id: newId, name: roomName, rows, cols };
          const createdRoom = await onAddRoom(newRoom);
          setIsCreatingRoom(false);
          return createdRoom ? createdRoom.id : null;
      }
  };

  const handleSaveRoomButton = async () => {
      const id = await saveRoomInternal();
      if (id) {
          setSelectedRoomId(id);
          alert(editingRoomId ? "อัปเดตข้อมูลห้องสอบเรียบร้อย" : "สร้างห้องสอบใหม่เรียบร้อย");
      }
  };

  const handleStep1Next = async () => {
    if (editingExamId) { handleFinishWizard(); return; }

    if (isCreatingRoom) {
       const id = await saveRoomInternal();
       if (!id) return;
       setSelectedRoomId(id);
    } else {
      if (!selectedRoomId) return alert("กรุณาเลือกห้องสอบ");
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    if (editingExamId) { handleFinishWizard(); return; }

    if (!subjectCode || !subjectName || !examDate || !startTime || !endTime) {
      return alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    }
    setStep(3);
  };

  const handleStep3Next = () => {
    if (editingExamId) { handleFinishWizard(); return; }
    setStep(4);
  }

  // --- Step 3 IP Logic ---
  const handleSeatClickForIp = (row: number, col: number) => {
      const seatKey = `${row}-${col}`;
      const currentRoom = rooms.find(r => r.id === selectedRoomId);
      
      setSelectedSeatForIp(seatKey);
      setIpInput(currentRoom?.ipMapping?.[seatKey] || '');
  };

  const handleSaveIp = async () => {
      if (!selectedRoomId || !selectedSeatForIp) return;
      
      const [rowStr, colStr] = selectedSeatForIp.split('-');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);

      try {
        await onUpdateIp(selectedRoomId, row, col, ipInput);
      } catch (error) {
        console.error("Failed to update IP", error);
        alert("บันทึก IP ไม่สำเร็จ");
      }
      
      setSelectedSeatForIp(null); // Close modal/popover
  };

  const handleSuggestResources = async () => {
    if (!process.env.API_KEY) {
        const fallback = [
            { id: Date.now().toString() + "-1", name: "ChatGPT", type: "WEB_APP" },
            { id: Date.now().toString() + "-2", name: "Discord", type: "WINDOWS_APP" }
        ] as ResourceConstraint[];
        setBlockedResources([...blockedResources, ...fallback]);
        return;
    }
    
    setIsSuggesting(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Suggest 3 strictly forbidden software or websites for a "${subjectName}" exam. 
        Format as JSON array of objects with keys: name, type (WEB_APP, WINDOWS_APP, or BROWSER). No markdown.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const text = response.text;
        
        let suggested: ResourceConstraint[] = [];
        try {
            const match = text.match(/\[.*\]/s);
            if (match) {
                const json = JSON.parse(match[0]);
                suggested = json.map((item: any, idx: number) => ({
                    id: Date.now().toString() + idx,
                    name: item.name,
                    type: item.type
                }));
            } else {
                 throw new Error("No JSON found");
            }
        } catch (e) {
             suggested = [
                 { id: Date.now().toString() + '1', name: 'StackOverflow', type: 'WEB_APP' },
                 { id: Date.now().toString() + '2', name: 'Facebook Messenger', type: 'WEB_APP' },
                 { id: Date.now().toString() + '3', name: 'Line', type: 'WINDOWS_APP' },
            ];
        }
       
        setBlockedResources([...blockedResources, ...suggested]);

    } catch (error) {
        console.error("AI Error", error);
    } finally {
        setIsSuggesting(false);
    }
  };

  const handleFinishWizard = async () => {
    let finalRoomId = selectedRoomId;

    if (step === 1 && isCreatingRoom) {
        const id = await saveRoomInternal();
        if (!id) return;
        finalRoomId = id;
    } else {
        if (!finalRoomId) return alert("กรุณาเลือกห้องสอบ (ขั้นตอนที่ 1)");
    }
    
    if (!subjectCode || !subjectName) return alert("กรุณากรอกข้อมูลวิชา (ขั้นตอนที่ 2)");

    const examData: Exam = {
      id: editingExamId || '', // ID will be assigned by DB if empty, but for local optimistic update we might need something. 
                               // Actually App.tsx will handle the DB insertion and ID assignment.
                               // But we need to pass an ID for the type.
      roomId: finalRoomId,
      subjectCode,
      subjectName,
      section,
      date: examDate,
      startTime,
      endTime,
      createdByName: createdByName || user.name,
      createdById: user.id,
      blockedResources
    };

    try {
        if (editingExamId) {
            await onUpdateExam(examData);
            alert('อัปเดตข้อมูลการสอบสำเร็จ!');
        } else {
            await onAddExam(examData);
            alert('บันทึกข้อมูลการสอบสำเร็จ!');
        }
        resetWizard();
        setViewMode('LIST'); 
    } catch (error) {
        console.error(error);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const resetWizard = () => {
    setStep(1);
    setIsCreatingRoom(true);
    setEditingExamId(null);
    setEditingRoomId(null);
    setRoomName('');
    setRows(0);
    setCols(0);
    setSelectedRoomId('');
    setSubjectCode('');
    setSubjectName('');
    setSection('');
    setExamDate('');
    setStartTime('');
    setEndTime('');
    setCreatedByName(user.name);
    setBlockedResources([]);
  };

  const handleAddResource = () => {
    if (!newResourceName) return;
    const res: ResourceConstraint = {
      id: Date.now().toString(),
      name: newResourceName,
      type: newResourceType
    };
    setBlockedResources([...blockedResources, res]);
    setNewResourceName('');
  };

  // --- Render Helpers ---

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-10 w-full px-2 md:px-4">
       {/* Step 1 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(1)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 1 ? 'border-[#E35205] bg-[#E35205] text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 1 ? <Check className="w-5 h-5"/> : <span>1</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 1 ? 'text-[#E35205]' : 'text-gray-400'}`}>กำหนดห้องสอบ</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-[#E35205]' : 'bg-gray-200'}`}></div>

       {/* Step 2 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(2)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 2 ? 'border-[#E35205] bg-[#E35205] text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 2 ? <Check className="w-5 h-5"/> : <span>2</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 2 ? 'text-[#E35205]' : 'text-gray-400'}`}>กำหนดตารางสอบ</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 3 ? 'bg-[#E35205]' : 'bg-gray-200'}`}></div>

       {/* Step 3 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(3)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 3 ? 'border-[#E35205] bg-[#E35205] text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 3 ? <Check className="w-5 h-5"/> : <span>3</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 3 ? 'text-[#E35205]' : 'text-gray-400'}`}>กำหนด IP Address</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 4 ? 'bg-[#E35205]' : 'bg-gray-200'}`}></div>

       {/* Step 4 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(4)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 4 ? 'border-[#E35205] bg-[#E35205] text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              <span>4</span>
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 4 ? 'text-[#E35205]' : 'text-gray-400'}`}>กำหนดทรัพยากรที่ไม่อนุญาต</span>
       </button>
    </div>
  );

  const renderMonitoringModal = () => {
      if (viewingSeat === null || !selectedExamId) return null;
      const exam = exams.find(e => e.id === selectedExamId);
      const room = rooms.find(r => r.id === exam?.roomId);
      if (!room) return null;

      const row = Math.floor(viewingSeat / room.cols) + 1;
      const col = (viewingSeat % room.cols) + 1;
      const seatKey = `${row}-${col}`;
      const assignedIp = room.ipMapping?.[seatKey];

      // Find active student
      let student = activeStudents.find(s => 
          s.examId === selectedExamId && 
          s.row === row && 
          s.col === col
      );

      // Fallback to session data if prop student is missing but we found a session
      if (!student && sessionStudent) {
          student = {
              id: sessionStudent.id,
              studentName: sessionStudent.student_name,
              studentCode: sessionStudent.student_email, // Use email as code fallback
              ipAddress: sessionStudent.ip_address,
              studentProfileUrl: sessionStudent.student_profile_url,
              examId: selectedExamId,
              studentId: 'unknown',
              row: row,
              col: col,
              status: 'ONLINE',
              joinedAt: new Date().toISOString()
          } as ExamAttendance;
      }

      return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="bg-white/10 p-2 rounded-lg">
                              <MonitorX className="w-6 h-6"/>
                          </div>
                          <div>
                              <h3 className="font-bold text-lg">Seat {row}-{col}</h3>
                              <p className="text-xs text-gray-400">Resource & Connection Status</p>
                          </div>
                      </div>
                      <button onClick={() => setViewingSeat(null)} className="hover:bg-white/10 p-2 rounded-full transition">
                          <X className="w-6 h-6"/>
                      </button>
                  </div>

                  <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                      <div className="w-full md:w-1/3 bg-gray-50 p-6 border-r border-gray-200 overflow-y-auto">
                          <div className="flex flex-col items-center text-center mb-8">
                                <div className="relative mb-4">
                                    <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                                        {student && student.studentProfileUrl ? (
                                            <img src={student.studentProfileUrl} alt={student.studentName} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon className="w-12 h-12 text-gray-400"/>
                                        )}
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-7 h-7 rounded-full border-4 border-white shadow-sm ${student ? 'bg-green-500' : assignedIp ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
                                </div>
                                {student ? (
                                    <>
                                        <h2 className="text-xl font-bold text-gray-800">{student.studentName}</h2>
                                        <p className="text-gray-500">{student.studentCode}</p>
                                        <div className="mt-3 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 flex items-center gap-1">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> ONLINE
                                        </div>
                                        <button 
                                            onClick={() => {
                                                if(window.confirm('ต้องการลบนักศึกษาออกจากที่นั่งนี้ใช่หรือไม่?')) {
                                                    onKickStudent(student.id);
                                                    setViewingSeat(null);
                                                }
                                            }}
                                            className="mt-4 w-full bg-red-100 text-red-600 py-2 rounded-lg font-bold hover:bg-red-200 transition flex items-center justify-center text-sm"
                                        >
                                            <LogOut className="w-4 h-4 mr-2"/> ลบออกจากที่นั่ง
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-xl font-bold text-gray-800">Waiting for Student</h2>
                                        <p className="text-gray-500">No active session</p>
                                        <div className={`mt-3 px-3 py-1 rounded-full text-xs font-bold ${assignedIp ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {assignedIp ? 'READY TO CONNECT' : 'NO IP CONFIG'}
                                        </div>
                                    </>
                                )}
                          </div>

                          <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-xs text-gray-400 uppercase font-bold mb-1">Configuration</div>
                                    <div className="flex items-center text-gray-700 font-medium mb-2">
                                        <Network className="w-4 h-4 mr-2 text-blue-500"/>
                                        IP: {assignedIp || 'Not Assigned'}
                                    </div>
                                    {student && (
                                        <div className="flex items-center text-gray-700 font-medium">
                                            <MonitorX className="w-4 h-4 mr-2 text-green-500"/>
                                            Client IP: {student.ipAddress}
                                        </div>
                                    )}
                                </div>
                          </div>
                      </div>

                      <div className="w-full md:w-2/3 bg-white p-6 overflow-y-auto">
                          {studentResourceData ? (
                              <div className="space-y-6">
                                  {/* Active Window */}
                                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                      <h4 className="text-sm font-bold text-indigo-800 mb-2 flex items-center">
                                          <Layers className="w-4 h-4 mr-2"/> Active Window
                                      </h4>
                                      <div className="bg-white p-3 rounded-lg border border-indigo-100 text-gray-800 font-medium truncate">
                                          {studentResourceData.active_window_title || 'Unknown'}
                                      </div>
                                  </div>

                                  {/* Resources Grid */}
                                  <div className="grid grid-cols-2 gap-4">
                                      {/* CPU */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-sm font-bold text-gray-600 flex items-center"><Cpu className="w-4 h-4 mr-2 text-blue-500"/> CPU</span>
                                              <span className="text-xl font-bold text-blue-600">{Math.round(studentResourceData.cpu_usage)}%</span>
                                          </div>
                                          <div className="w-full bg-gray-100 rounded-full h-2">
                                              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(studentResourceData.cpu_usage, 100)}%` }}></div>
                                          </div>
                                          <div className="mt-2 text-xs text-gray-500 truncate">{studentResourceData.cpu_model}</div>
                                      </div>

                                      {/* RAM */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-sm font-bold text-gray-600 flex items-center"><Activity className="w-4 h-4 mr-2 text-green-500"/> RAM</span>
                                              <span className="text-xl font-bold text-green-600">{Math.round(studentResourceData.ram_usage)}%</span>
                                          </div>
                                          <div className="w-full bg-gray-100 rounded-full h-2">
                                              <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(studentResourceData.ram_usage, 100)}%` }}></div>
                                          </div>
                                          <div className="mt-2 text-xs text-gray-500">
                                              {studentResourceData.ram_used_gb?.toFixed(1)} / {studentResourceData.ram_total_gb?.toFixed(1)} GB
                                          </div>
                                      </div>

                                      {/* Disk */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-sm font-bold text-gray-600 flex items-center"><HardDrive className="w-4 h-4 mr-2 text-orange-500"/> Disk</span>
                                              <span className="text-xs font-bold text-orange-600">{studentResourceData.disk_type}</span>
                                          </div>
                                          <div className="text-xs text-gray-500 space-y-1">
                                              <div>Read: {studentResourceData.disk_read_kb} KB/s</div>
                                              <div>Write: {studentResourceData.disk_write_kb} KB/s</div>
                                          </div>
                                      </div>

                                      {/* Network */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-sm font-bold text-gray-600 flex items-center"><Wifi className="w-4 h-4 mr-2 text-purple-500"/> Network</span>
                                              <span className="text-xs font-bold text-purple-600">{studentResourceData.network_type}</span>
                                          </div>
                                          <div className="text-xl font-bold text-gray-800">{studentResourceData.network_speed_kbps} <span className="text-xs font-normal text-gray-500">Kbps</span></div>
                                      </div>
                                  </div>

                                  {/* Processes */}
                                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                      <h4 className="text-sm font-bold text-gray-800 mb-3">Running Processes (Top 5)</h4>
                                      <div className="space-y-2">
                                          {Array.isArray(studentResourceData.exe_processes) && studentResourceData.exe_processes.slice(0, 5).map((proc: any, idx: number) => (
                                              <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded">
                                                  <span className="font-medium text-gray-700">{proc.name}</span>
                                                  <span className="text-gray-500">PID: {proc.pid}</span>
                                              </div>
                                          ))}
                                          {(!studentResourceData.exe_processes || studentResourceData.exe_processes.length === 0) && (
                                              <div className="text-xs text-gray-400 italic">No process data available</div>
                                          )}
                                      </div>
                                  </div>
                                  
                                  <div className="text-right text-xs text-gray-400">
                                      Last updated: {new Date(studentResourceData.timestamp).toLocaleTimeString()}
                                  </div>
                              </div>
                          ) : (
                              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                  {student ? (
                                      <>
                                          <Activity className="w-16 h-16 mb-4 animate-pulse text-blue-200"/>
                                          <p>Waiting for monitoring data...</p>
                                      </>
                                  ) : (
                                      <>
                                          <MonitorX className="w-16 h-16 mb-4 opacity-20"/>
                                          <p>No active session to monitor</p>
                                      </>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  // --- Main Render ---

  // DETAIL VIEW IN LIST MODE
  if (viewMode === 'LIST' && selectedExamId) {
     const exam = exams.find(e => e.id === selectedExamId);
     const room = rooms.find(r => r.id === exam?.roomId);

     if (!exam || !room) return <div className="p-8 text-center text-red-500">Error: ข้อมูลไม่ถูกต้อง</div>;

     return (
       <div className="container mx-auto p-4 max-w-6xl animate-in fade-in duration-300">
          <button onClick={() => setSelectedExamId(null)} className="flex items-center text-gray-500 hover:text-[#E35205] mb-6 font-medium transition-colors">
             <ArrowLeft className="w-5 h-5 mr-1"/> กลับสู่รายการตารางสอบ
          </button>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
             {/* Exam Details Header */}
             <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="text-orange-400 font-bold tracking-wider text-sm uppercase">Exam Details</div>
                                <button 
                                    onClick={() => handleStartEditExam(exam, 2)}
                                    className="text-white/50 hover:text-white hover:bg-white/10 p-1 rounded transition"
                                    title="แก้ไขข้อมูลทั่วไป"
                                >
                                    <Edit className="w-4 h-4"/>
                                </button>
                            </div>
                            <h1 className="text-3xl font-bold">{exam.subjectCode} - {exam.subjectName}</h1>
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-gray-300">
                                <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm"><Calendar className="w-4 h-4 mr-2"/> {exam.date}</div>
                                <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm"><Clock className="w-4 h-4 mr-2"/> {exam.startTime} - {exam.endTime}</div>
                                <div className="flex items-center bg-white/10 px-3 py-1 rounded-full text-sm">
                                    <MapPin className="w-4 h-4 mr-2"/> ห้อง {room.name}
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#E35205] text-white px-6 py-2 rounded-xl text-lg font-bold shadow-lg border-2 border-orange-400/30">
                            Section {exam.section}
                        </div>
                    </div>
                </div>
             </div>
             
             <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                            <span className="bg-orange-100 p-2 rounded-lg mr-3"><LayoutGrid className="w-5 h-5 text-[#E35205]"/></span>
                            แผนผังห้องสอบ ({room.rows} x {room.cols})
                        </h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleStartEditExam(exam, 3)}
                                className="text-indigo-600 text-sm hover:bg-indigo-50 px-3 py-1.5 rounded-full flex items-center font-medium transition border border-indigo-100"
                            >
                                <Network className="w-4 h-4 mr-1"/> จัดการ IPs
                            </button>
                            <button 
                                onClick={() => handleStartEditExam(exam, 1)}
                                className="text-[#E35205] text-sm hover:bg-orange-50 px-3 py-1.5 rounded-full flex items-center font-medium transition"
                            >
                                <Edit className="w-4 h-4 mr-1"/> เปลี่ยน/แก้ไขห้อง
                            </button>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 overflow-auto">
                        <div className="flex flex-col items-center">
                             <div className="w-full max-w-2xl bg-gray-800 text-white text-center py-2 rounded-lg mb-8 text-sm shadow-md">
                                 กระดานหน้าห้อง (Front)
                             </div>
                             <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(90px, 1fr))` }}>
                                {Array.from({ length: room.rows * room.cols }).map((_, i) => {
                                    const row = Math.floor(i / room.cols) + 1;
                                    const col = (i % room.cols) + 1;
                                    const seatKey = `${row}-${col}`;
                                    const assignedIp = room.ipMapping?.[seatKey];
                                    const isConfigured = !!assignedIp;
                                    
                                    let student = activeStudents.find(s => 
                                        s.examId === selectedExamId && 
                                        s.row === row && 
                                        s.col === col
                                    );

                                    // Fallback to realtime sessions if not found in activeStudents
                                    if (!student) {
                                        const seatNum = (row - 1) * room.cols + col;
                                        const session = realtimeSessions.find(s => s.seat_number === seatNum);
                                        if (session) {
                                            student = {
                                                id: session.id,
                                                studentName: session.student_name,
                                                studentCode: session.student_email, // Fallback
                                                row: row,
                                                col: col,
                                                status: 'ONLINE',
                                                examId: selectedExamId,
                                                studentId: 'unknown',
                                                ipAddress: session.ip_address,
                                                studentProfileUrl: session.student_profile_url,
                                                joinedAt: session.created_at
                                            } as ExamAttendance;
                                        }
                                    }

                                    return (
                                    <div 
                                        key={i} 
                                        onClick={() => setViewingSeat(i)}
                                        className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center shadow-sm transition cursor-pointer relative overflow-hidden group 
                                            ${student 
                                                ? 'bg-green-50 border-green-500 ring-2 ring-green-200' 
                                                : isConfigured 
                                                    ? 'bg-white border-green-200 hover:border-green-500'
                                                    : 'bg-gray-50 border-gray-100 hover:border-gray-300'}`}
                                    >
                                        <span className="text-[10px] text-gray-400 mb-1 absolute top-1 left-1">โต๊ะ</span>
                                        <span className={`font-bold text-lg ${student ? 'text-green-700' : isConfigured ? 'text-gray-800' : 'text-gray-300'}`}>
                                            {row}-{col}
                                        </span>
                                        
                                        {student ? (
                                            <div className="mt-1 flex flex-col items-center w-full px-1">
                                                {student.studentProfileUrl ? (
                                                    <img src={student.studentProfileUrl} alt="Profile" className="w-6 h-6 rounded-full object-cover mb-1 border border-green-500" />
                                                ) : (
                                                    <UserIcon className="w-4 h-4 text-green-600 mb-1"/>
                                                )}
                                                <span className="text-[10px] text-green-700 font-bold text-center truncate w-full">{student.studentName}</span>
                                            </div>
                                        ) : isConfigured && (
                                            <div className="mt-1 flex flex-col items-center w-full px-1">
                                                <Network className="w-4 h-4 text-green-500 mb-1"/>
                                                <span className="text-[10px] text-gray-600 font-medium text-center break-all leading-tight">{assignedIp}</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition"></div>
                                    </div>
                                )})}
                            </div>
                        </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center">
                                <span className="bg-red-100 p-2 rounded-lg mr-3"><MonitorX className="w-5 h-5 text-red-600"/></span>
                                <h3 className="text-lg font-bold text-gray-800 whitespace-nowrap">
                                    ทรัพยากรที่ไม่อนุญาต
                                </h3>
                            </div>
                            <button 
                                onClick={() => handleStartEditExam(exam, 4)}
                                className="text-red-600 text-sm hover:bg-red-100 px-3 py-1.5 rounded-full flex items-center font-medium transition"
                            >
                                <Edit className="w-4 h-4 mr-1"/> แก้ไข
                            </button>
                        </div>
                        {exam.blockedResources.length > 0 ? (
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
                            <div className="text-center py-6 text-gray-400 italic">
                                ไม่มีการจำกัดทรัพยากร
                            </div>
                        )}
                    </div>
                 </div>
             </div>
             
             {/* Render Modal */}
             {renderMonitoringModal()}
          </div>
       </div>
     );
  }

  // DASHBOARD LANDING
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <header className="mb-8 mt-4">
         <h1 className="text-3xl font-bold text-gray-800 mb-2">จัดการการสอบ (อาจารย์)</h1>
         <p className="text-gray-500">เลือกเมนูที่ต้องการทำรายการ</p>
      </header>
      
      {/* Menu Navigation Tabs/Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
         <button 
           onClick={() => { 
               resetWizard(); // Reset when clicking main menu to start fresh
               setViewMode('WIZARD'); 
               setStep(1); 
           }}
           className={`relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group ${viewMode === 'WIZARD' ? 'border-[#E35205] bg-white ring-4 ring-orange-50 shadow-xl scale-[1.02]' : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg'}`}
         >
            <div className={`p-4 rounded-full mb-4 transition-colors ${viewMode === 'WIZARD' ? 'bg-[#E35205] text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#E35205]'}`}>
                <Plus className="w-8 h-8" />
            </div>
            <h3 className={`font-bold text-xl mb-2 ${viewMode === 'WIZARD' ? 'text-gray-800' : 'text-gray-600'}`}>จัดการสอบ</h3>
            <p className="text-sm text-gray-500 max-w-xs">กำหนดห้องสอบ, กำหนดตารางสอบ, กำหนด IP Address เเละ กำหนดทรัพยากรที่ไม่อนุญาต</p>
            {viewMode === 'WIZARD' && <div className="absolute top-4 right-4 text-[#E35205]"><Check className="w-6 h-6"/></div>}
         </button>

         <button 
           onClick={() => setViewMode('LIST')}
           className={`relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group ${viewMode === 'LIST' ? 'border-[#E35205] bg-white ring-4 ring-orange-50 shadow-xl scale-[1.02]' : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg'}`}
         >
             <div className={`p-4 rounded-full mb-4 transition-colors ${viewMode === 'LIST' ? 'bg-[#E35205] text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#E35205]'}`}>
                <List className="w-8 h-8" />
            </div>
            <h3 className={`font-bold text-xl mb-2 ${viewMode === 'LIST' ? 'text-gray-800' : 'text-gray-600'}`}>รายการตารางสอบ</h3>
            <p className="text-sm text-gray-500 max-w-xs">รายการตารางสอบทั้งหมด และตรวจสอบแผนผังที่นั่ง</p>
            {viewMode === 'LIST' && <div className="absolute top-4 right-4 text-[#E35205]"><Check className="w-6 h-6"/></div>}
         </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px] relative">
      {viewMode === 'WIZARD' && (
         <div className="p-8 md:p-12">
            {renderStepIndicator()}
            
            <div className="max-w-2xl mx-auto mt-8">
               {/* Step 1: Room */}
               {step === 1 && (
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold mb-8 text-gray-800 text-center">
                        {editingExamId ? 'แก้ไขการสอบ: เลือกห้องสอบ' : 'ขั้นตอนที่ 1: สร้างห้องสอบ'}
                    </h2>
                    
                    <div className="flex p-1 bg-gray-100 rounded-xl mb-8">
                        <button 
                          onClick={() => { setIsCreatingRoom(true); setEditingRoomId(null); setRoomName(''); }}
                          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all shadow-sm ${isCreatingRoom ? 'bg-white text-gray-800 shadow' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                          {editingRoomId ? 'แก้ไขข้อมูลห้องสอบ' : '+ สร้างห้องสอบใหม่'}
                        </button>
                        <button 
                          onClick={() => { setIsCreatingRoom(false); setEditingRoomId(null); }}
                          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all shadow-sm ${!isCreatingRoom ? 'bg-white text-gray-800 shadow' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                          เลือกจากห้องที่มีอยู่
                        </button>
                    </div>

                    {isCreatingRoom ? (
                      <div className="space-y-6">
                          {editingRoomId && (
                             <div className="bg-orange-50 p-4 rounded-lg text-[#E35205] text-sm flex justify-between items-center border border-orange-100">
                                <span className="font-semibold">กำลังแก้ไขห้องสอบ: {rooms.find(r => r.id === editingRoomId)?.name}</span>
                                <button onClick={handleCancelEditRoom} className="text-gray-500 hover:text-gray-700 underline text-xs">ยกเลิก</button>
                             </div>
                          )}
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อห้องสอบ (เช่น B415)</label>
                            <input type="text" value={roomName} onChange={e => setRoomName(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] focus:ring-4 focus:ring-orange-100 outline-none transition-all" placeholder="ระบุชื่อห้อง..." autoFocus />
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">จำนวนแถว</label>
                                <input 
                                    type="text" 
                                    inputMode="numeric"
                                    value={rows} 
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setRows(Number(val));
                                    }} 
                                    className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">จำนวนคอลัมน์</label>
                                <input 
                                    type="text" 
                                    inputMode="numeric"
                                    value={cols} 
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setCols(Number(val));
                                    }} 
                                    className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none" 
                                />
                            </div>
                          </div>
                          <div className="bg-orange-50 text-orange-800 p-4 rounded-xl text-sm flex items-center">
                             <LayoutGrid className="w-5 h-5 mr-3"/>
                             ระบบจะสร้างผังที่นั่งขนาด {rows} x {cols} = {rows*cols} ที่นั่ง
                          </div>

                          <div className="flex justify-end pt-4">
                             <button 
                                onClick={handleSaveRoomButton} 
                                className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-black transition text-sm flex items-center"
                             >
                                <Save className="w-4 h-4 mr-2"/>
                                {editingRoomId ? 'บันทึกการแก้ไขห้อง' : 'บันทึกห้องใหม่'}
                             </button>
                          </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                          <label className="block text-sm font-bold text-gray-700 mb-2">รายการห้องสอบในระบบ</label>
                          {rooms.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-2">
                                {rooms.map(room => (
                                  <div 
                                    key={room.id}
                                    className={`flex items-center border-2 rounded-xl transition-all ${selectedRoomId === room.id ? 'border-[#E35205] bg-orange-50' : 'border-gray-100 bg-white'}`}
                                  >
                                      {/* Clickable Area for Selection */}
                                      <div 
                                        className="flex-1 p-4 cursor-pointer flex items-center"
                                        onClick={() => setSelectedRoomId(room.id)}
                                      >
                                          <div className={`w-4 h-4 rounded-full border-2 mr-4 flex items-center justify-center ${selectedRoomId === room.id ? 'border-[#E35205]' : 'border-gray-300'}`}>
                                              {selectedRoomId === room.id && <div className="w-2 h-2 rounded-full bg-[#E35205]"></div>}
                                          </div>
                                          <div>
                                             <span className="font-bold text-gray-700 block">{room.name}</span>
                                             <span className="text-xs text-gray-500">{room.rows} x {room.cols} ที่นั่ง</span>
                                          </div>
                                      </div>
                                      
                                      {/* Separate Action Buttons */}
                                      <div className="p-2 border-l border-gray-200/50 flex gap-1 bg-gray-50/50 h-full rounded-r-xl">
                                          <button 
                                            type="button"
                                            onClick={() => handleStartEditRoom(room)} 
                                            className="p-2 rounded-lg hover:bg-orange-100 hover:text-[#E35205] text-gray-400 transition"
                                            title="แก้ไขห้องสอบ"
                                          >
                                              <Edit className="w-4 h-4" />
                                          </button>
                                          <button 
                                            type="button"
                                            onClick={() => onDeleteRoom(room.id)} 
                                            className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 text-gray-400 transition"
                                            title="ลบห้องสอบ"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                              ไม่พบห้องสอบ กรุณาสร้างห้องใหม่
                            </div>
                          )}
                      </div>
                    )}

                    <div className="mt-10 flex justify-end">
                       <button onClick={handleStep1Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-[#E35205] hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
                          {editingExamId ? (
                              <>
                                <Save className="w-5 h-5 mr-2" /> บันทึกการแก้ไข
                              </>
                          ) : (
                              <>
                                ขั้นตอนถัดไป <ChevronRight className="w-5 h-5 ml-2"/>
                              </>
                          )}
                       </button>
                    </div>
                 </div>
               )}

               {/* Step 2: Schedule */}
               {step === 2 && (
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold mb-8 text-gray-800 text-center">ขั้นตอนที่ 2: {editingExamId ? 'แก้ไขตารางสอบ' : 'สร้างตารางสอบ'}</h2>
                    
                    <div className="bg-gray-50/50 p-8 rounded-3xl border border-gray-100 space-y-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">รหัสวิชา</label>
                              <input type="text" value={subjectCode} onChange={e => setSubjectCode(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" placeholder="เช่น 06016317" />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">ตอนเรียน (Section)</label>
                              <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" placeholder="เช่น 1" />
                          </div>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อวิชา</label>
                          <input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" placeholder="เช่น Advanced Web Programming" />
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สอบ</label>
                              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" />
                           </div>
                           <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">เวลาเริ่ม</label>
                              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" />
                           </div>
                           <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">เวลาสิ้นสุด</label>
                              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#E35205] outline-none transition-all" />
                           </div>
                       </div>

                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">สร้างโดย</label>
                          <input type="text" value={createdByName} onChange={e => setCreatedByName(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl bg-gray-100 text-gray-500" readOnly={false} />
                       </div>
                    </div>

                    <div className="mt-10 flex justify-between items-center">
                       <button onClick={() => setStep(1)} className="text-gray-500 font-bold px-8 py-4 hover:bg-gray-50 rounded-full transition">
                          ย้อนกลับ
                       </button>
                       <button onClick={handleStep2Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-[#E35205] hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
                          {editingExamId ? (
                              <>
                                <Save className="w-5 h-5 mr-2" /> บันทึกการแก้ไข
                              </>
                          ) : (
                              <>
                                ขั้นตอนถัดไป <ChevronRight className="w-5 h-5 ml-2"/>
                              </>
                          )}
                       </button>
                    </div>
                 </div>
               )}

               {/* Step 3: IP Address */}
               {step === 3 && (
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold mb-8 text-gray-800 text-center">ขั้นตอนที่ 3: กำหนด IP Address</h2>
                    
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-1 bg-white p-6 rounded-2xl border-2 border-gray-100 shadow-sm">
                            <h3 className="font-bold text-lg mb-4 flex items-center">
                                <MapPin className="w-5 h-5 mr-2 text-[#E35205]"/> เลือกที่นั่งเพื่อกำหนด IP
                            </h3>
                            {selectedRoomId ? (
                                (() => {
                                    const room = rooms.find(r => r.id === selectedRoomId);
                                    if (!room) return <div>ไม่พบข้อมูลห้อง</div>;
                                    return (
                                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(50px, 1fr))` }}>
                                            {Array.from({ length: room.rows * room.cols }).map((_, i) => {
                                                const row = Math.floor(i / room.cols) + 1;
                                                const col = (i % room.cols) + 1;
                                                const seatKey = `${row}-${col}`;
                                                const hasIp = !!room.ipMapping?.[seatKey];
                                                const isSelected = selectedSeatForIp === seatKey;

                                                return (
                                                    <div 
                                                        key={i} 
                                                        onClick={() => handleSeatClickForIp(row, col)}
                                                        className={`aspect-square border-2 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all relative group
                                                            ${isSelected ? 'border-[#E35205] bg-orange-50 ring-2 ring-orange-200' : hasIp ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                                                    >
                                                        <span className="text-xs font-bold text-gray-500">{row}-{col}</span>
                                                        {hasIp && <Network className="w-4 h-4 text-green-600 mt-1" />}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="text-gray-400 text-center py-10">กรุณาเลือกห้องสอบในขั้นตอนที่ 1 ก่อน</div>
                            )}
                        </div>

                        <div className="w-full md:w-80">
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 h-full sticky top-4">
                                <h3 className="font-bold text-lg mb-4 text-gray-800">รายละเอียด IP</h3>
                                {selectedSeatForIp ? (
                                    <div className="space-y-4">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ที่นั่ง (Seat)</label>
                                            <div className="text-2xl font-bold text-[#E35205]">{selectedSeatForIp}</div>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">IP Address</label>
                                            <input 
                                                type="text" 
                                                value={ipInput} 
                                                onChange={e => setIpInput(e.target.value)} 
                                                className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-[#E35205] outline-none font-mono" 
                                                placeholder="e.g. 192.168.1.10" 
                                                autoFocus
                                            />
                                            <p className="text-xs text-gray-400 mt-2">ปล่อยว่างเพื่อลบ IP</p>
                                        </div>

                                        <button 
                                            onClick={handleSaveIp}
                                            className="w-full bg-[#E35205] text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition shadow-lg"
                                        >
                                            บันทึก / อัปเดต
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-400 py-10">
                                        <MapPin className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                                        <p>คลิกที่ที่นั่งทางซ้าย<br/>เพื่อกำหนด IP Address</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex justify-between items-center">
                       <button onClick={() => setStep(2)} className="text-gray-500 font-bold px-8 py-4 hover:bg-gray-50 rounded-full transition">
                          ย้อนกลับ
                       </button>
                       <button onClick={handleStep3Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-[#E35205] hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
                          {editingExamId ? (
                              <>
                                <Save className="w-5 h-5 mr-2" /> บันทึกการแก้ไข
                              </>
                          ) : (
                              <>
                                ขั้นตอนถัดไป <ChevronRight className="w-5 h-5 ml-2"/>
                              </>
                          )}
                       </button>
                    </div>
                 </div>
               )}

               {/* Step 4: Resources */}
               {step === 4 && (
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold mb-8 text-gray-800 text-center">ขั้นตอนที่ 4: กำหนดทรัพยากร</h2>
                    
                    {/* Summary Card */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-2xl mb-8 flex items-start shadow-sm">
                        <div className="mr-4 mt-1 bg-white p-2 rounded-lg shadow-sm"><Calendar className="w-6 h-6 text-blue-600"/></div>
                        <div>
                            <p className="font-bold text-lg text-blue-900">{subjectCode} {subjectName}</p>
                            <div className="flex gap-4 mt-1 text-sm text-blue-700">
                                <span className="flex items-center"><Clock className="w-4 h-4 mr-1"/> {examDate} ({startTime}-{endTime})</span>
                                <span className="flex items-center"><MapPin className="w-4 h-4 mr-1"/> {isCreatingRoom ? roomName : rooms.find(r => r.id === selectedRoomId)?.name}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border-2 border-gray-100 p-6 rounded-2xl mb-6">
                        <div className="flex justify-between items-center mb-6">
                            <label className="font-bold text-gray-800 text-lg">รายการที่ไม่อนุญาตให้ใช้งาน</label>
                            <button 
                                type="button"
                                onClick={handleSuggestResources}
                                disabled={isSuggesting}
                                className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700 flex items-center shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5"
                            >
                                <Cpu className="w-4 h-4 mr-2" />
                                {isSuggesting ? 'AI กำลังประมวลผล...' : 'ใช้ AI แนะนำ'}
                            </button>
                        </div>

                        <div className="flex gap-3 mb-6">
                            <input 
                                type="text" 
                                placeholder="ชื่อโปรแกรม/เว็บ (เช่น Facebook)" 
                                value={newResourceName}
                                onChange={e => setNewResourceName(e.target.value)}
                                className="flex-1 border-2 border-gray-200 p-3 rounded-xl focus:border-[#E35205] outline-none"
                            />
                            <select 
                                value={newResourceType}
                                onChange={e => setNewResourceType(e.target.value as any)}
                                className="border-2 border-gray-200 p-3 rounded-xl bg-white outline-none"
                            >
                                <option value="WEB_APP">Web App</option>
                                <option value="WINDOWS_APP">Windows App</option>
                                <option value="BROWSER">Web Browser</option>
                            </select>
                            <button type="button" onClick={handleAddResource} className="bg-gray-900 text-white p-3 rounded-xl hover:bg-black transition shadow-lg">
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {blockedResources.map(r => (
                                <div key={r.id} className="flex justify-between items-center bg-red-50 px-5 py-4 rounded-xl text-red-800 border border-red-100 group hover:border-red-200 transition">
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 rounded-full bg-red-500 mr-4"></div>
                                        <span className="font-bold mr-3">{r.name}</span>
                                        <span className="text-xs bg-white/60 px-2 py-1 rounded text-red-600 font-medium">{r.type}</span>
                                    </div>
                                    <button type="button" onClick={() => setBlockedResources(blockedResources.filter(x => x.id !== r.id))}>
                                        <Trash2 className="w-5 h-5 text-red-400 hover:text-red-700 transition" />
                                    </button>
                                </div>
                            ))}
                            {blockedResources.length === 0 && (
                                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                    ยังไม่มีรายการที่ไม่อนุญาต
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-10 flex justify-between">
                       <button onClick={() => setStep(3)} className="text-gray-500 font-bold px-8 py-4 hover:bg-gray-50 rounded-full transition">
                          ย้อนกลับ
                       </button>
                       <button onClick={handleFinishWizard} className="bg-green-600 text-white px-10 py-4 rounded-full font-bold hover:bg-green-700 transition flex items-center shadow-xl shadow-green-200 transform hover:-translate-y-1">
                          <Save className="w-5 h-5 mr-2"/> {editingExamId ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
                       </button>
                    </div>
                 </div>
               )}
            </div>
         </div>
      )}

      {viewMode === 'LIST' && (
         <div className="p-8 md:p-12 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold mb-8 text-gray-800 flex items-center">
               <List className="w-8 h-8 mr-3 text-[#E35205]"/> ตารางสอบทั้งหมด ({exams.length})
            </h2>
            
            {exams.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <Calendar className="w-20 h-20 mx-auto mb-6 opacity-20"/>
                    <p className="text-lg mb-2">ยังไม่มีการสร้างตารางสอบ</p>
                    <button onClick={() => { setViewMode('WIZARD'); setStep(1); }} className="mt-4 text-[#E35205] font-bold hover:underline">เริ่มสร้างการสอบใหม่</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {exams.slice().reverse().map(exam => {
                        const room = rooms.find(r => r.id === exam.roomId);
                        return (
                            <div key={exam.id} className="group bg-white border border-gray-100 rounded-lg hover:border-[#E35205] hover:ring-4 hover:ring-orange-50 hover:shadow-md transition-all relative overflow-hidden">
                                <div className="aspect-square flex flex-col overflow-hidden">
                                    <div className="flex justify-between items-center px-3 pt-3">
                                        <div className="bg-orange-50 text-[#E35205] font-bold px-2 py-0.5 rounded-lg text-[11px]">Sec {exam.section}</div>
                                        <div className="flex gap-1">
                                            <button type="button" onClick={() => handleStartEditExam(exam)} className="p-1 rounded hover:bg-orange-100 hover:text-[#E35205] text-gray-400 transition" title="แก้ไข"><Edit className="w-4 h-4"/></button>
                                            <button type="button" onClick={() => onDeleteExam(exam.id)} className="p-1 rounded hover:bg-red-100 hover:text-red-500 text-gray-400 transition" title="ลบ"><Trash2 className="w-4 h-4"/></button>
                                        </div>
                                    </div>

                                    <div className="p-3 flex-1 flex flex-col justify-between cursor-pointer" onClick={() => setSelectedExamId(exam.id)}>
                                        <div>
                                            <h3 className="font-bold text-sm text-gray-800 mb-1">{exam.subjectCode}</h3>
                                            <p className="text-[11px] text-gray-600 line-clamp-2 mb-2 font-medium">{exam.subjectName}</p>
                                        </div>

                                        <div className="space-y-2 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
                                            <div className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-2 text-gray-400"/> {exam.date}</div>
                                            <div className="flex items-center"><Clock className="w-3.5 h-3.5 mr-2 text-gray-400"/> {exam.startTime} - {exam.endTime}</div>
                                            <div className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-2 text-gray-400"/> ห้อง {room?.name}</div>
                                        </div>
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
    </div>
  );
};

export default TeacherDashboard;