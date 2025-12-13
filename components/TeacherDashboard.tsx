import React, { useState, useEffect } from 'react';
import { Room, Exam, ResourceConstraint, User, ExamAttendance } from '../types';
import { 
  Plus, Calendar, Save, Trash2, Cpu, 
  ChevronRight, Check, LayoutGrid, List, 
  MapPin, Clock, ArrowLeft, MonitorX, AlertCircle, Edit, X, User as UserIcon, Activity, ShieldAlert, Ban, Network, LogOut,
  HardDrive, Wifi, Layers, Settings, FileText
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { supabase } from '../supabaseClient';
import { sessionService } from '../services/sessionService';
import emailjs from '@emailjs/browser';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- EMAIL CONFIGURATION (ต้องไปสมัครที่ emailjs.com แล้วเอาค่ามาใส่) ---
// 1. สมัครสมาชิกที่ https://www.emailjs.com/ (ฟรี)
// 2. สร้าง Email Service (เลือก Gmail) -> ได้ Service ID
// 3. สร้าง Email Template -> ได้ Template ID
// 4. ไปที่ Account > API Keys -> ได้ Public Key
const EMAILJS_SERVICE_ID = "service_uv68kc9"; // ใส่ Service ID ที่นี่
const EMAILJS_TEMPLATE_ID = "template_cdmhkzc"; // ใส่ Template ID ที่นี่
const EMAILJS_PUBLIC_KEY = "AT1MQbvCVhGeY1LdJ"; // ใส่ Public Key ที่นี่

// --- CONFIGURATION: รายการที่ไม่อนุญาตเริ่มต้น (แก้ไขรายการตรงนี้) ---
const PRESET_BLOCKED_APPS = [
    {
        category: "Generative AI & Assistants",
        items: [
            { name: "ChatGPT", type: "WEB_APP" },
            { name: "Gemini", type: "WEB_APP" },
            { name: "Claude", type: "WEB_APP" },
            { name: "Perplexity", type: "WEB_APP" },
            { name: "Copilot", type: "WEB_APP" },
            { name: "Quillbot", type: "WEB_APP" },
            { name: "Blackbox AI", type: "WEB_APP" },
        ]
    },
    {
        category: "Remote Desktop & Screen Sharing",
        items: [
            { name: "TeamViewer", type: "WINDOWS_APP" },
            { name: "AnyDesk", type: "WINDOWS_APP" },
            { name: "Chrome Remote Desktop", type: "WEB_APP" },
            { name: "Zoom", type: "WINDOWS_APP" },
            { name: "Microsoft Teams", type: "WINDOWS_APP" },
            { name: "Skype", type: "WINDOWS_APP" },
        ]
    },
    {
        category: "Communication & Social Media",
        items: [
            { name: "Discord", type: "WINDOWS_APP" },
            { name: "Line", type: "WINDOWS_APP" },
            { name: "Facebook", type: "WEB_APP" },
            { name: "Messenger", type: "WEB_APP" },
            { name: "WhatsApp", type: "WEB_APP" },
            { name: "Telegram", type: "WINDOWS_APP" },
            { name: "Twitter", type: "WEB_APP" },
            { name: "Instagram", type: "WEB_APP" },
        ]
    },
    {
        category: "Search Engines & Entertainment",
        items: [
            { name: "YouTube", type: "WEB_APP" },
            { name: "Google Search", type: "WEB_APP" },
            { name: "Pantip", type: "WEB_APP" },
            { name: "Reddit", type: "WEB_APP" },
        ]
    },
    {
        category: "Developer Tools",
        items: [
            { name: "StackOverflow", type: "WEB_APP" },
            { name: "GitHub", type: "WEB_APP" },
            { name: "GitLab", type: "WEB_APP" },
            { name: "Replit", type: "WEB_APP" },
            { name: "VS Code", type: "WINDOWS_APP" },
        ]
    },
    {
        category: "Cloud Storage",
        items: [
            { name: "Google Drive", type: "WEB_APP" },
            { name: "OneDrive", type: "WEB_APP" },
            { name: "Dropbox", type: "WEB_APP" },
            { name: "Canva", type: "WEB_APP" },
        ]
    },
    {
        category: "Utilities & Office Tools",
        items: [
            { name: "Calculator", type: "WINDOWS_APP" }, // เครื่องคิดเลข Windows
            { name: "Microsoft Excel", type: "WINDOWS_APP" }, // โปรแกรม Excel
            { name: "Microsoft Word", type: "WINDOWS_APP" }, // โปรแกรม Word (ใช้จดโพย)
            { name: "Microsoft PowerPoint", type: "WINDOWS_APP" }, // เผื่อกรณีจดใส่สไลด์
            { name: "Google Sheets", type: "WEB_APP" }, // Excel แบบออนไลน์
            { name: "Google Docs", type: "WEB_APP" }, // Word แบบออนไลน์
            { name: "Notepad", type: "WINDOWS_APP" }, // โปรแกรมจดบันทึกพื้นฐาน
            { name: "Sticky Notes", type: "WINDOWS_APP" } // กระดาษโน้ตแปะหน้าจอ
        ]
    }
] as const;

const EXAM_SLOTS = [
    { name: "รอบเช้า", time: "09:00 - 12:00", start: "09:00", end: "12:00" },
    { name: "รอบบ่าย", time: "13:00 - 16:00", start: "13:00", end: "16:00" }
];

// Trigger Vercel Deployment
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
    network_download_mb: number;
    network_upload_mb: number;
    active_window_title: string;
    all_open_windows: any;
    exe_processes: any;
    timestamp: string;
}

interface ViolationLog {
    id: string;
    timestamp: string;
    violation_type: string;
    resource_name: string;
    action_taken: string;
    details: string;
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
  
  // Email Notification State
  const dashboardMountTime = React.useRef(new Date());
  const notifiedViolationIds = React.useRef(new Set<string>());
  const notifiedThrottleMap = React.useRef(new Map<string, number>());
  const violationReceivedTimes = React.useRef(new Map<string, number>()); // Track when we first saw a violation
  const isFirstFetch = React.useRef(true); // Track first fetch to avoid flashing old violations
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

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
  const [studentViolationLogs, setStudentViolationLogs] = useState<ViolationLog[]>([]);
  const [sessionStudent, setSessionStudent] = useState<any | null>(null);
  const [realtimeSessions, setRealtimeSessions] = useState<any[]>([]);
  const [currentSeatNumber, setCurrentSeatNumber] = useState<string | null>(null);
  const [recentViolations, setRecentViolations] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [onlineSessionIds, setOnlineSessionIds] = useState<Set<string>>(new Set());

  // Effect to update current time every second (for violation alerts)
  useEffect(() => {
      const interval = setInterval(() => {
          setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
  }, []);

  // Effect to fetch all active sessions for the room when exam is selected
  useEffect(() => {
      if (!selectedExamId) return;
      const exam = exams.find(e => e.id === selectedExamId);
      if (!exam) return;

      const fetchSessions = async () => {
          const data = await sessionService.fetchSessionsByRoomId(exam.roomId);
          
          if (data) {
              setRealtimeSessions(data);

              // Check online status (Heartbeat check)
              const sessionIds = data.map(s => s.id);
              if (sessionIds.length > 0) {
                  // Check for logs in the last 30 seconds
                  // Fix: Use Local Time ISO string instead of UTC to match DB timestamp without timezone
                  const now = new Date();
                  const thirtySecondsAgoDate = new Date(now.getTime() - 30000);
                  const tzOffset = thirtySecondsAgoDate.getTimezoneOffset() * 60000;
                  const localISOTime = new Date(thirtySecondsAgoDate.getTime() - tzOffset).toISOString().slice(0, -1);
                  
                  const { data: logs } = await supabase
                      .from('resource_logs')
                      .select('session_id')
                      .in('session_id', sessionIds)
                      .gt('timestamp', localISOTime);
                  
                  if (logs) {
                      const onlineIds = new Set(logs.map(l => l.session_id));
                      setOnlineSessionIds(onlineIds);
                  }
              } else {
                  setOnlineSessionIds(new Set());
              }
          }
      };

      fetchSessions();
      const interval = setInterval(fetchSessions, 5000);
      return () => clearInterval(interval);
  }, [selectedExamId, exams]);

  const sendViolationEmail = async (violation: any, studentName: string, examTitle: string) => {
      const teacherEmail = user.email || 'teacher@example.com';
      const violationTime = new Date(violation.timestamp).toLocaleString();

      // Prepare email parameters (Must match variables in your EmailJS template)
      const templateParams = {
          to_email: teacherEmail,
          to_name: user.name || 'Teacher',
          student_name: studentName,
          exam_title: examTitle,
          violation_type: violation.violation_type,
          violation_time: violationTime,
          message: `Student ${studentName} committed a violation (${violation.violation_type}) in exam "${examTitle}".`
      };

      console.log(`[EMAIL SYSTEM] Preparing to send email to ${teacherEmail}...`);

      try {
          // Send real email
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
          console.log("✅ Email sent successfully via EmailJS!");
          
          setNotification({
            message: `📧 Email sent to ${teacherEmail}: ${studentName} violated rule`,
            type: 'success'
          });
      } catch (error) {
          console.error("❌ Failed to send email:", error);
          setNotification({
              message: `❌ Failed to send email: Check console for details`,
              type: 'error'
          });
      }

      // Auto hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
  };

  // Effect to fetch recent violations for the whole exam
  useEffect(() => {
      if (!selectedExamId) {
          setRecentViolations([]);
          return;
      }

      const fetchViolations = async () => {
          let sessionsMap: Record<string, any> = {};
          let sessionIds: string[] = [];

          if (realtimeSessions.length > 0) {
              sessionIds = realtimeSessions.map(s => s.id);
              realtimeSessions.forEach(s => sessionsMap[s.id] = s);
          } else {
              // Fallback: fetch all sessions for this exam if realtime list is empty
              const exam = exams.find(e => e.id === selectedExamId);
              if (exam) {
                  const { data: sessions } = await supabase
                      .from('exam_student_sessions')
                      .select('id, student_name, seat_number')
                      .eq('layout_id', exam.roomId)
                      .eq('is_active', true);
                  
                  if (sessions && sessions.length > 0) {
                      sessionIds = sessions.map(s => s.id);
                      sessions.forEach(s => sessionsMap[s.id] = s);
                  }
              }
          }

          if (sessionIds.length === 0) return;

          const { data } = await supabase
              .from('violation_logs')
              .select('*')
              .in('session_id', sessionIds)
              .order('timestamp', { ascending: false })
              .limit(20);
          
          if (data) {
              // Update received times for visual alerts
              const now = Date.now();
              data.forEach(v => {
                  if (!violationReceivedTimes.current.has(v.id)) {
                      const vTime = new Date(v.timestamp).getTime();
                      // If it's the first fetch, only show if it's very recent (e.g. < 1 min ago)
                      // Otherwise, if it's a new violation from polling, show it now.
                      if (isFirstFetch.current) {
                          if (Math.abs(now - vTime) < 60000) {
                              violationReceivedTimes.current.set(v.id, now);
                          } else {
                              violationReceivedTimes.current.set(v.id, 0); // Too old, don't flash
                          }
                      } else {
                          // New violation detected during polling -> Flash it now
                          violationReceivedTimes.current.set(v.id, now);
                      }
                  }
              });
              isFirstFetch.current = false;

              // Check for new violations to notify
              data.forEach(violation => {
                  const violationTime = new Date(violation.timestamp).getTime();
                  const mountTime = dashboardMountTime.current.getTime();
                  
                  if (violationTime > mountTime && !notifiedViolationIds.current.has(violation.id)) {
                      const session = sessionsMap[violation.session_id];
                      const studentName = session?.student_name || 'Unknown Student';
                      const exam = exams.find(e => e.id === selectedExamId);
                      const examTitle = exam ? `${exam.subjectCode} ${exam.subjectName}` : 'Exam';
                      
                      // Throttle Logic: Prevent spamming emails for the same violation type/resource within 1 minute
                      const throttleKey = `${violation.session_id}_${violation.violation_type}_${violation.resource_name || 'general'}`;
                      const lastTime = notifiedThrottleMap.current.get(throttleKey) || 0;
                      const now = Date.now();
                      
                      if (now - lastTime > 60000) { // 60 seconds cooldown
                          sendViolationEmail(violation, studentName, examTitle);
                          notifiedThrottleMap.current.set(throttleKey, now);
                      }
                      
                      notifiedViolationIds.current.add(violation.id);
                  }
              });

              const violationsWithStudent = data.map(log => {
                  const session = sessionsMap[log.session_id];
                  return {
                      ...log,
                      student_name: session?.student_name || 'Unknown',
                      seat_number: session?.seat_number || '?',
                      clientTimestamp: violationReceivedTimes.current.get(log.id) || 0
                  };
              });
              setRecentViolations(violationsWithStudent);
          }
      };

      fetchViolations();
  }, [selectedExamId, realtimeSessions]);

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

        console.log("[v1.1] Fetching seat mapping for:", { layout_id: room.id, row, col });

        let fetchedSeatNumber = null;
        try {
            // Fetch seat number from room_seat_ip_mappings
            const { data: seatMapping, error: seatError } = await supabase
                .from('room_seat_ip_mappings')
                .select('seat_number')
                .eq('layout_id', room.id)
                .eq('row_number', row)
                .eq('column_number', col)
                .maybeSingle();
            
            if (seatError) {
                console.error("Error fetching seat mapping:", seatError);
            }

            if (seatMapping) {
                fetchedSeatNumber = seatMapping.seat_number;
            }
        } catch (err) {
            console.error("Exception fetching seat mapping:", err);
        }
        
        if (fetchedSeatNumber) {
            setCurrentSeatNumber(fetchedSeatNumber.toString());
        } else {
            // Fallback to calculated seat number if not found in DB
            setCurrentSeatNumber(seatNumber.toString());
        }

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
            
            const data = await sessionService.fetchResourceLogs(session.id);
            
            if (data) {
                setStudentResourceData(data);
            }

            // Fetch violations
            const violations = await sessionService.fetchViolationLogs(session.id);
            
            if (violations) {
                setStudentViolationLogs(violations);
            }
        } else {
            setStudentResourceData(null);
            setStudentViolationLogs([]);
            setSessionStudent(null);
        }
    };

    if (viewingSeat !== null) {
        fetchResourceData();
        interval = setInterval(fetchResourceData, 5000); // Refresh every 5s
    } else {
        setStudentResourceData(null);
        setStudentViolationLogs([]);
        setSessionStudent(null);
        setCurrentSeatNumber(null);
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

    // Check for overlapping exams
    const hasOverlap = exams.some(exam => {
        if (exam.roomId !== selectedRoomId) return false;
        if (exam.date !== examDate) return false;
        return (startTime < exam.endTime) && (endTime > exam.startTime);
    });

    if (hasOverlap) {
        return alert("ไม่สามารถสร้างตารางสอบได้ เนื่องจากช่วงเวลาดังกล่าวมีการใช้ห้องสอบนี้แล้ว");
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
    // Helper to generate preset items with unique IDs
    const getPresets = () => {
        const allItems: any[] = [];
        PRESET_BLOCKED_APPS.forEach(cat => {
            allItems.push(...cat.items);
        });
        
        return allItems.map((app, idx) => ({
            id: Date.now().toString() + '-preset-' + idx,
            name: app.name,
            type: app.type
        })) as ResourceConstraint[];
    };

    if (!process.env.API_KEY) {
        // ถ้าไม่มี API Key ให้ใช้รายการที่ตั้งค่าไว้ในโค้ด (PRESET_BLOCKED_APPS)
        setBlockedResources(prev => [...prev, ...getPresets()]);
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
             // ถ้า AI ตอบกลับผิดพลาด ให้ใช้รายการที่ตั้งค่าไว้ในโค้ด
             suggested = getPresets();
        }
       
        setBlockedResources(prev => [...prev, ...suggested]);

    } catch (error) {
        console.error("AI Error", error);
        // ถ้าเกิดข้อผิดพลาดในการเชื่อมต่อ AI ให้ใช้รายการที่ตั้งค่าไว้ในโค้ด
        setBlockedResources(prev => [...prev, ...getPresets()]);
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

  const handleExportReport = async () => {
      if (!selectedExamId) return;
      const exam = exams.find(e => e.id === selectedExamId);
      if (!exam) return;

      try {
          // 1. Fetch all sessions for this exam
          const sessions = await sessionService.fetchAllSessionsByRoomId(exam.roomId);
          
          if (!sessions) throw new Error('Failed to fetch sessions');

          // 2. Fetch all violations for these sessions
          const sessionIds = sessions.map(s => s.id);
          let violations: any[] = [];
          if (sessionIds.length > 0) {
            violations = await sessionService.fetchViolationsBySessionIds(sessionIds);
          }

          // 3. Prepare CSV Data
          const headers = ['Student ID', 'Name', 'Seat', 'IP Address', 'Join Time', 'Status', 'Violation Count', 'Violations Details'];
          const rows = sessions.map(session => {
              const studentViolations = violations.filter(v => v.session_id === session.id);
              const violationCount = studentViolations.length;
              const violationDetails = studentViolations.map(v => `${v.violation_type} (${v.resource_name})`).join('; ');
              
              return [
                  session.student_email || '-', 
                  session.student_name || 'Unknown',
                  session.seat_number || '-',
                  session.ip_address || '-',
                  session.created_at ? new Date(session.created_at).toLocaleString() : '-',
                  session.is_active ? 'Online' : 'Offline',
                  violationCount,
                  violationDetails
              ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','); 
          });

          const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n'); 

          // 4. Download
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `Exam_Report_${exam.subjectCode}_${new Date().toISOString().slice(0,10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

      } catch (error) {
          console.error("Export error:", error);
          alert("เกิดข้อผิดพลาดในการส่งออกรายงาน");
      }
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
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 1 ? 'border-primary bg-primary text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 1 ? <Check className="w-5 h-5"/> : <span>1</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 1 ? 'text-primary' : 'text-gray-400'}`}>กำหนดห้องสอบ</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`}></div>

       {/* Step 2 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(2)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 2 ? 'border-primary bg-primary text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 2 ? <Check className="w-5 h-5"/> : <span>2</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 2 ? 'text-primary' : 'text-gray-400'}`}>กำหนดตารางสอบ</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 3 ? 'bg-primary' : 'bg-gray-200'}`}></div>

       {/* Step 3 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(3)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 3 ? 'border-primary bg-primary text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              {step > 3 ? <Check className="w-5 h-5"/> : <span>3</span>}
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 3 ? 'text-primary' : 'text-gray-400'}`}>กำหนด IP Address</span>
       </button>

       <div className={`flex-1 h-1 mx-1 rounded-full transition-colors duration-300 ${step >= 4 ? 'bg-primary' : 'bg-gray-200'}`}></div>

       {/* Step 4 */}
       <button 
          type="button"
          disabled={!editingExamId}
          onClick={() => setStep(4)}
          className={`flex flex-col items-center relative z-10 w-24 md:w-32 ${editingExamId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 font-bold transition-colors duration-300 ${step >= 4 ? 'border-primary bg-primary text-white shadow-lg shadow-orange-200' : 'border-gray-300 bg-white text-gray-400'}`}>
              <span>4</span>
          </div>
          <span className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${step >= 4 ? 'text-primary' : 'text-gray-400'}`}>กำหนดทรัพยากรที่ไม่อนุญาต</span>
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
          const isOnline = onlineSessionIds.has(sessionStudent.id);
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
              status: isOnline ? 'ONLINE' : 'OFFLINE',
              joinedAt: new Date().toISOString()
          } as ExamAttendance;
      } else if (student) {
          // If student exists in activeStudents, double check online status
          const isOnline = onlineSessionIds.has(student.id);
          student = { ...student, status: isOnline ? 'ONLINE' : 'OFFLINE' };
      }

      const isOffline = student && student.status === 'OFFLINE';

      return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                  <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="bg-white/10 p-2 rounded-lg">
                              <MonitorX className="w-6 h-6"/>
                          </div>
                          <div>
                              <h3 className="font-bold text-lg flex items-center gap-2">
                                Seat {row}-{col}
                                {currentSeatNumber && <span className="text-orange-400 bg-white/10 px-2 py-0.5 rounded text-sm">No. {currentSeatNumber}</span>}
                              </h3>
                              <p className="text-xs text-gray-400">Resource & Connection Status (v1.1)</p>
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
                                            <img src={student.studentProfileUrl} alt={student.studentName} className={`w-full h-full object-cover ${isOffline ? 'grayscale' : ''}`} />
                                        ) : (
                                            <UserIcon className="w-12 h-12 text-gray-400"/>
                                        )}
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-white shadow-sm ${isOffline ? 'bg-red-500' : student ? 'bg-green-500' : assignedIp ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
                                </div>
                                {student ? (
                                    <>
                                        <h2 className="text-xl font-bold text-gray-800">{student.studentName}</h2>
                                        <p className="text-sm text-gray-500">{student.studentCode}</p>
                                        {isOffline ? (
                                            <div className="mt-2 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center gap-1.5">
                                                <div className="w-2 h-2 bg-red-500 rounded-full"></div> OFFLINE
                                            </div>
                                        ) : (
                                            <div className="mt-2 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 flex items-center gap-1.5">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> ONLINE
                                            </div>
                                        )}
                                        <button 
                                            onClick={() => {
                                                if(window.confirm('ต้องการลบนักศึกษาออกจากที่นั่งนี้ใช่หรือไม่?')) {
                                                    onKickStudent(student.id);
                                                    setViewingSeat(null);
                                                }
                                            }}
                                            className="mt-4 w-full bg-red-100 text-red-600 py-2 rounded-lg font-bold hover:bg-red-200 transition flex items-center justify-center text-base"
                                        >
                                            <LogOut className="w-4 h-4 mr-2"/> ลบออกจากที่นั่ง
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-xl font-bold text-gray-800">Waiting for Student</h2>
                                        <p className="text-sm text-gray-500">No active session</p>
                                        <div className={`mt-2 px-3 py-1 rounded-full text-xs font-bold ${assignedIp ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {assignedIp ? 'READY TO CONNECT' : 'NO IP CONFIG'}
                                        </div>
                                    </>
                                )}
                          </div>

                          <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-sm text-gray-400 uppercase font-bold mb-1">Configuration</div>
                                    <div className="flex items-center text-base text-gray-700 font-medium mb-2">
                                        <Network className="w-4 h-4 mr-2 text-blue-500"/>
                                        IP: {assignedIp || 'Not Assigned'}
                                    </div>
                                    {student && (
                                        <div className="flex items-center text-base text-gray-700 font-medium">
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
                                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                      <h4 className="text-base font-bold text-gray-600 mb-3 flex items-center">
                                          <Layers className="w-4 h-4 mr-2 text-indigo-500"/> Active Window
                                      </h4>
                                      <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-base text-gray-800 font-medium truncate flex items-center">
                                          <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2 animate-pulse"></div>
                                          {studentResourceData.active_window_title || 'Unknown'}
                                      </div>
                                  </div>
                                      
                                  {/* All Open Windows */}
                                  {studentResourceData.all_open_windows && Array.isArray(studentResourceData.all_open_windows) && studentResourceData.all_open_windows.length > 0 && (
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <h5 className="text-base font-bold text-gray-600 mb-3 flex items-center justify-between">
                                            <span className="flex items-center"><List className="w-4 h-4 mr-2 text-gray-500"/> All Open Windows</span>
                                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{studentResourceData.all_open_windows.length}</span>
                                        </h5>
                                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                            {[...studentResourceData.all_open_windows]
                                                .sort((a: any, b: any) => {
                                                    const nameA = typeof a === 'string' ? a : a.title || '';
                                                    const nameB = typeof b === 'string' ? b : b.title || '';
                                                    return nameA.localeCompare(nameB);
                                                })
                                                .map((win: any, idx: number) => (
                                                <div key={idx} className="text-sm text-gray-600 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 truncate hover:bg-gray-100 transition">
                                                    {typeof win === 'string' ? win : win.title || JSON.stringify(win)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                  )}

                                  {/* Violation Logs */}
                                  {studentViolationLogs && studentViolationLogs.length > 0 && (
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <h5 className="text-base font-bold text-red-600 mb-3 flex items-center">
                                            <ShieldAlert className="w-5 h-5 mr-2"/> Violation Logs ({studentViolationLogs.length})
                                        </h5>
                                        <div className="max-h-80 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                            {studentViolationLogs.map((log) => (
                                                <div key={log.id} className="bg-red-50 p-3 rounded-xl border border-red-100 shadow-sm relative overflow-hidden group">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                                    <div className="flex justify-between items-start mb-2 pl-2">
                                                        <span className="font-bold text-red-700 text-base flex items-center uppercase tracking-wide">
                                                            {log.violation_type.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="text-sm text-gray-500 font-mono bg-white px-2 py-1 rounded border border-gray-200">
                                                            {new Date(log.timestamp.replace(/Z$|[+-]\d{2}:?\d{2}$/, '')).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                    <div className="text-gray-800 text-base mb-3 font-medium break-words leading-relaxed pl-2">
                                                        {log.resource_name}
                                                    </div>
                                                    <div className="flex items-center pl-2">
                                                        <span className={`px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm ${
                                                            log.action_taken.toLowerCase().includes('close') || log.action_taken.toLowerCase().includes('terminate') 
                                                            ? 'bg-red-500 text-white' 
                                                            : 'bg-orange-500 text-white'
                                                        }`}>
                                                            {log.action_taken}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                  )}

                                  {/* Resources Grid */}
                                  <div className="grid grid-cols-2 gap-4">
                                      {/* CPU */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-base font-bold text-gray-600 flex items-center"><Cpu className="w-4 h-4 mr-2 text-blue-500"/> CPU</span>
                                              <span className="text-2xl font-bold text-blue-600">{Math.round(studentResourceData.cpu_usage)}%</span>
                                          </div>
                                          <div className="w-full bg-gray-100 rounded-full h-2">
                                              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(studentResourceData.cpu_usage, 100)}%` }}></div>
                                          </div>
                                          <div className="mt-2 text-sm text-gray-500 truncate" title={studentResourceData.cpu_model}>{studentResourceData.cpu_model}</div>
                                      </div>

                                      {/* RAM */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-base font-bold text-gray-600 flex items-center"><Activity className="w-4 h-4 mr-2 text-green-500"/> RAM</span>
                                              <span className="text-2xl font-bold text-green-600">{Math.round(studentResourceData.ram_usage)}%</span>
                                          </div>
                                          <div className="w-full bg-gray-100 rounded-full h-2">
                                              <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(studentResourceData.ram_usage, 100)}%` }}></div>
                                          </div>
                                          <div className="mt-2 text-sm text-gray-500">
                                              {studentResourceData.ram_used_gb?.toFixed(1)} / {studentResourceData.ram_total_gb?.toFixed(1)} GB
                                          </div>
                                      </div>

                                      {/* Disk */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 md:col-span-1">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-base font-bold text-gray-600 flex items-center"><HardDrive className="w-4 h-4 mr-2 text-orange-500"/> Disk</span>
                                          </div>
                                          <div className="space-y-2 max-h-48 overflow-y-auto">
                                              {studentResourceData.disk_partitions_info && Array.isArray(studentResourceData.disk_partitions_info) ? (
                                                  studentResourceData.disk_partitions_info.map((disk: any, idx: number) => (
                                                      <div key={idx} className="text-sm border-b border-gray-100 pb-1 last:border-0">
                                                          <div className="flex justify-between font-medium text-gray-700">
                                                              <span>{disk.device} ({disk.mountpoint || '-'})</span>
                                                              <span>{disk.percent}%</span>
                                                          </div>
                                                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                                                              <div className={`h-1.5 rounded-full ${disk.percent > 90 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(disk.percent, 100)}%` }}></div>
                                                          </div>
                                                          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                                                              <span>Free: {disk.free_gb?.toFixed(1) || disk.free?.toFixed(1) || 0} GB</span>
                                                              <span>Total: {disk.total_gb?.toFixed(1) || disk.total?.toFixed(1) || 0} GB</span>
                                                          </div>
                                                      </div>
                                                  ))
                                              ) : (
                                                  <div className="text-sm text-gray-500">No disk info</div>
                                              )}
                                          </div>
                                      </div>

                                      {/* Network */}
                                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 md:col-span-1">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-base font-bold text-gray-600 flex items-center"><Wifi className="w-4 h-4 mr-2 text-purple-500"/> Network</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 mt-2">
                                              <div className="bg-purple-50 p-2 rounded text-center">
                                                  <div className="text-xs text-purple-400 uppercase font-bold">Download</div>
                                                  <div className="flex items-baseline justify-center gap-1 text-xl font-bold text-purple-700 whitespace-nowrap">
                                                      <span>
                                                        {(studentResourceData.network_download_mb || 0) >= 1000 
                                                            ? ((studentResourceData.network_download_mb || 0) / 1024).toFixed(2) 
                                                            : (studentResourceData.network_download_mb || 0).toFixed(2)}
                                                      </span>
                                                      <span className="text-xs">
                                                        {(studentResourceData.network_download_mb || 0) >= 1000 ? 'GB' : 'MB'}
                                                      </span>
                                                  </div>
                                              </div>
                                              <div className="bg-blue-50 p-2 rounded text-center">
                                                  <div className="text-xs text-blue-400 uppercase font-bold">Upload</div>
                                                  <div className="flex items-baseline justify-center gap-1 text-xl font-bold text-blue-700 whitespace-nowrap">
                                                      <span>
                                                        {(studentResourceData.network_upload_mb || 0) >= 1000 
                                                            ? ((studentResourceData.network_upload_mb || 0) / 1024).toFixed(2) 
                                                            : (studentResourceData.network_upload_mb || 0).toFixed(2)}
                                                      </span>
                                                      <span className="text-xs">
                                                        {(studentResourceData.network_upload_mb || 0) >= 1000 ? 'GB' : 'MB'}
                                                      </span>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  {/* Processes */}
                                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-[350px] flex flex-col">
                                      <h4 className="text-base font-bold text-gray-800 mb-3 flex justify-between items-center">
                                          <span>Top 5 Memory Usage</span>
                                          <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">Pie Chart</span>
                                      </h4>
                                      
                                      <div className="flex-1 w-full min-h-0">
                                          {Array.isArray(studentResourceData.exe_processes) && studentResourceData.exe_processes.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={studentResourceData.exe_processes
                                                            .map((proc: any) => ({
                                                                name: proc.name,
                                                                value: proc.memory_info?.rss ? parseFloat((proc.memory_info.rss / 1024 / 1024).toFixed(1)) : 0,
                                                            }))
                                                            .sort((a: any, b: any) => b.value - a.value)
                                                            .slice(0, 5)
                                                        }
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {Array.from({ length: 5 }).map((_, index) => (
                                                            <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'][index % 5]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip 
                                                        formatter={(value: number) => [`${value} MB`, 'Memory']}
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Legend verticalAlign="bottom" height={36}/>
                                                </PieChart>
                                            </ResponsiveContainer>
                                          ) : (
                                              <div className="h-full flex items-center justify-center text-gray-400 italic">
                                                  No process data available
                                              </div>
                                          )}
                                      </div>
                                  </div>
                                  
                                  <div className="text-right text-sm text-gray-400">
                                      Last updated: {new Date(studentResourceData.timestamp.replace(/Z$|[+-]\d{2}:?\d{2}$/, '')).toLocaleTimeString()}
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
          <button onClick={() => setSelectedExamId(null)} className="flex items-center text-gray-500 hover:text-primary mb-6 font-medium transition-colors">
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
                        <div className="flex flex-col items-end gap-3">
                            <div className="bg-primary text-white px-6 py-2 rounded-xl text-lg font-bold shadow-lg border-2 border-orange-400/30">
                                Section {exam.section}
                            </div>
                            <button 
                                onClick={handleExportReport}
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition border border-white/10 backdrop-blur-sm"
                            >
                                <FileText className="w-4 h-4 mr-2"/> รายงานและสรุปผล
                            </button>
                        </div>
                    </div>
                </div>
             </div>
             
             <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                            <span className="bg-orange-100 p-2 rounded-lg mr-3"><LayoutGrid className="w-5 h-5 text-primary"/></span>
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
                                className="text-primary text-sm hover:bg-orange-50 px-3 py-1.5 rounded-full flex items-center font-medium transition"
                            >
                                <Edit className="w-4 h-4 mr-1"/> เปลี่ยน/แก้ไขห้อง
                            </button>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 overflow-x-auto">
                        <div className="min-w-max mx-auto flex flex-col items-center gap-6">
                             <div className="w-full bg-gray-800 text-white text-center py-2 rounded-lg text-sm shadow-md">
                                 กระดานหน้าห้อง (Front)
                             </div>
                             <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${room.cols}, 110px)` }}>
                                {Array.from({ length: room.rows * room.cols }).map((_, i) => {
                                    const row = Math.floor(i / room.cols) + 1;
                                    const col = (i % room.cols) + 1;
                                    const seatKey = `${row}-${col}`;
                                    const assignedIp = room.ipMapping?.[seatKey];
                                    const isConfigured = !!assignedIp;
                                    const seatNum = (row - 1) * room.cols + col;

                                    // Check for active violation (within last 1 minute)
                                    const hasActiveViolation = recentViolations.some(v => {
                                        if (v.seat_number !== seatNum) return false;
                                        const triggerTime = v.clientTimestamp;
                                        if (!triggerTime) return false;
                                        return (currentTime - triggerTime) < 60000; // 1 minute from detection
                                    });
                                    
                                    let student = activeStudents.find(s => 
                                        s.examId === selectedExamId && 
                                        s.row === row && 
                                        s.col === col
                                    );

                                    // Fallback to realtime sessions if not found in activeStudents
                                    if (!student) {
                                        const session = realtimeSessions.find(s => s.seat_number === seatNum);
                                        if (session) {
                                            const isOnline = onlineSessionIds.has(session.id);
                                            student = {
                                                id: session.id,
                                                studentName: session.student_name,
                                                studentCode: session.student_email, // Fallback
                                                row: row,
                                                col: col,
                                                status: isOnline ? 'ONLINE' : 'OFFLINE',
                                                examId: selectedExamId,
                                                studentId: 'unknown',
                                                ipAddress: session.ip_address,
                                                studentProfileUrl: session.student_profile_url,
                                                joinedAt: session.created_at
                                            } as ExamAttendance;
                                        }
                                    }

                                    const isOffline = student && student.status === 'OFFLINE';

                                    return (
                                    <div 
                                        key={i} 
                                        onClick={() => setViewingSeat(i)}
                                        className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center shadow-sm transition cursor-pointer relative overflow-hidden group 
                                            ${hasActiveViolation
                                                ? 'bg-red-100 border-red-500 animate-pulse'
                                                : isOffline
                                                    ? 'bg-red-50 border-red-300'
                                                    : student 
                                                        ? 'bg-green-50 border-green-500' 
                                                        : isConfigured 
                                                            ? 'bg-white border-green-200 hover:border-green-500'
                                                            : 'bg-gray-50 border-gray-100 hover:border-gray-300'}`}
                                    >
                                        <span className="text-[10px] text-gray-400 mb-0.5 absolute top-1.5 left-2">โต๊ะ</span>
                                        <span className={`font-bold text-xl mb-1 ${hasActiveViolation ? 'text-red-700' : isOffline ? 'text-red-400' : student ? 'text-green-700' : isConfigured ? 'text-gray-800' : 'text-gray-300'}`}>
                                            {row}-{col}
                                        </span>
                                        
                                        <div className="h-14 w-full flex flex-col items-center justify-end px-1">
                                            {student ? (
                                                <>
                                                    {student.studentProfileUrl ? (
                                                        <img src={student.studentProfileUrl} alt="Profile" className={`w-6 h-6 rounded-full object-cover mb-0.5 border ${hasActiveViolation ? 'border-red-500' : isOffline ? 'border-red-300 grayscale' : 'border-green-500'}`} />
                                                    ) : (
                                                        <UserIcon className={`w-5 h-5 ${hasActiveViolation ? 'text-red-600' : isOffline ? 'text-red-400' : 'text-green-600'} mb-0.5`}/>
                                                    )}
                                                    <span className={`text-[10px] ${hasActiveViolation ? 'text-red-700' : isOffline ? 'text-red-500' : 'text-green-700'} font-bold text-center line-clamp-2 leading-tight w-full`} title={student.studentName}>
                                                        {student.studentName}
                                                        {isOffline && <span className="block text-[8px] text-red-400 font-normal">(OFFLINE)</span>}
                                                    </span>
                                                </>
                                            ) : isConfigured ? (
                                                <>
                                                    <Network className="w-5 h-5 text-green-500 mb-0.5"/>
                                                    <span className="text-[11px] text-gray-800 font-bold text-center whitespace-nowrap w-full">{assignedIp}</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-gray-300">- ว่าง -</span>
                                            )}
                                        </div>
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

                    {/* Violation Notifications */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                        <div className="flex items-center mb-4">
                            <span className="bg-orange-100 p-2 rounded-lg mr-3"><ShieldAlert className="w-5 h-5 text-primary"/></span>
                            <h3 className="text-lg font-bold text-gray-800">
                                การแจ้งเตือนการละเมิด ({recentViolations.length})
                            </h3>
                        </div>
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                            {recentViolations.length > 0 ? (
                                recentViolations.map((log, idx) => (
                                    <div key={log.id || idx} className="flex items-start p-3 bg-orange-50 rounded-xl border border-orange-100">
                                        <div className="bg-white p-2 rounded-lg border border-orange-200 mr-3 flex flex-col items-center min-w-[50px]">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Seat</span>
                                            <span className="text-lg font-bold text-primary">{log.seat_number}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <p className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight" title={log.student_name}>{log.student_name}</p>
                                                <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200 whitespace-nowrap ml-2 shrink-0">
                                                    {new Date(log.timestamp.replace(/Z$|[+-]\d{2}:?\d{2}$/, '')).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <p className="text-xs text-red-600 font-medium mt-0.5 flex items-center">
                                                <Ban className="w-3 h-3 mr-1"/> {log.resource_name}
                                            </p>
                                            <p className="text-[10px] text-gray-500 mt-1 truncate uppercase tracking-wide">{log.violation_type.replace(/_/g, ' ')}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-400 italic">
                                    ยังไม่มีการละเมิดกฎ
                                </div>
                            )}
                        </div>
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
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className={`flex items-center p-4 rounded-xl shadow-2xl border ${
            notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
            notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {notification.type === 'error' ? <AlertCircle className="w-6 h-6 mr-3 text-red-500" /> :
             notification.type === 'success' ? <Check className="w-6 h-6 mr-3 text-green-500" /> :
             <FileText className="w-6 h-6 mr-3 text-blue-500" />}
            <div>
              <h4 className="font-bold text-sm">{notification.type === 'error' ? 'Error' : notification.type === 'success' ? 'Success' : 'Notification'}</h4>
              <p className="text-sm">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="ml-4 p-1 hover:bg-black/5 rounded-full transition">
              <X className="w-4 h-4 opacity-50" />
            </button>
          </div>
        </div>
      )}

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
           className={`relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group ${viewMode === 'WIZARD' ? 'border-primary bg-white ring-4 ring-orange-50 shadow-xl scale-[1.02]' : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg'}`}
         >
            <div className={`p-4 rounded-full mb-4 transition-colors ${viewMode === 'WIZARD' ? 'bg-primary text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-primary'}`}>
                <Plus className="w-8 h-8" />
            </div>
            <h3 className={`font-bold text-xl mb-2 ${viewMode === 'WIZARD' ? 'text-gray-800' : 'text-gray-600'}`}>จัดการสอบ</h3>
            <p className="text-sm text-gray-500 max-w-xs">กำหนดห้องสอบ, กำหนดตารางสอบ, กำหนด IP Address เเละ กำหนดทรัพยากรที่ไม่อนุญาต</p>
            {viewMode === 'WIZARD' && <div className="absolute top-4 right-4 text-primary"><Check className="w-6 h-6"/></div>}
         </button>

         <button 
           onClick={() => setViewMode('LIST')}
           className={`relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group ${viewMode === 'LIST' ? 'border-primary bg-white ring-4 ring-orange-50 shadow-xl scale-[1.02]' : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-lg'}`}
         >
             <div className={`p-4 rounded-full mb-4 transition-colors ${viewMode === 'LIST' ? 'bg-primary text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-primary'}`}>
                <List className="w-8 h-8" />
            </div>
            <h3 className={`font-bold text-xl mb-2 ${viewMode === 'LIST' ? 'text-gray-800' : 'text-gray-600'}`}>รายการตารางสอบ</h3>
            <p className="text-sm text-gray-500 max-w-xs">รายการตารางสอบทั้งหมด และตรวจสอบแผนผังที่นั่ง</p>
            {viewMode === 'LIST' && <div className="absolute top-4 right-4 text-primary"><Check className="w-6 h-6"/></div>}
         </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px] relative">
      {viewMode === 'WIZARD' && (
         <div className="p-8 md:p-12">
            {renderStepIndicator()}
            
            <div className={`${step === 3 || step === 4 ? 'w-full max-w-5xl' : 'max-w-2xl'} mx-auto mt-8`}>
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
                             <div className="bg-orange-50 p-4 rounded-lg text-primary text-sm flex justify-between items-center border border-orange-100">
                                <span className="font-semibold">กำลังแก้ไขห้องสอบ: {rooms.find(r => r.id === editingRoomId)?.name}</span>
                                <button onClick={handleCancelEditRoom} className="text-gray-500 hover:text-gray-700 underline text-xs">ยกเลิก</button>
                             </div>
                          )}
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อห้องสอบ (เช่น B415)</label>
                            <input type="text" value={roomName} onChange={e => setRoomName(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary focus:ring-4 focus:ring-orange-100 outline-none transition-all" placeholder="ระบุชื่อห้อง..." autoFocus />
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
                                    className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none" 
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
                                    className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none" 
                                />
                            </div>
                          </div>
                          <div className="bg-orange-50 text-orange-800 p-4 rounded-xl text-sm flex items-center">
                             <LayoutGrid className="w-5 h-5 mr-3"/>
                             ระบบจะสร้างผังที่นั่งขนาด {rows} x {cols} = {rows*cols} ที่นั่ง
                          </div>

                          {rows > 0 && cols > 0 && (
                              <div className="mt-6 border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50">
                                  <h4 className="text-sm font-bold text-gray-500 mb-4 text-center">ตัวอย่างแผนผังที่นั่ง</h4>
                                  <div className="overflow-x-auto pb-2 custom-scrollbar">
                                      <div className="min-w-max mx-auto grid gap-2 justify-center" style={{ gridTemplateColumns: `repeat(${cols}, 50px)` }}>
                                          {Array.from({ length: rows * cols }).map((_, i) => {
                                              const row = Math.floor(i / cols) + 1;
                                              const col = (i % cols) + 1;
                                              return (
                                                  <div key={i} className="aspect-square bg-white border border-gray-300 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-400 shadow-sm">
                                                      {row}-{col}
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  </div>
                              </div>
                          )}

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
                                    className={`flex items-center border-2 rounded-xl transition-all ${selectedRoomId === room.id ? 'border-primary bg-orange-50' : 'border-gray-100 bg-white'}`}
                                  >
                                      {/* Clickable Area for Selection */}
                                      <div 
                                        className="flex-1 p-4 cursor-pointer flex items-center"
                                        onClick={() => setSelectedRoomId(room.id)}
                                      >
                                          <div className={`w-4 h-4 rounded-full border-2 mr-4 flex items-center justify-center ${selectedRoomId === room.id ? 'border-primary' : 'border-gray-300'}`}>
                                              {selectedRoomId === room.id && <div className="w-2 h-2 rounded-full bg-primary"></div>}
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
                                            className="p-2 rounded-lg hover:bg-orange-100 hover:text-primary text-gray-400 transition"
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
                       <button onClick={handleStep1Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-primary hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
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
                              <input type="text" value={subjectCode} onChange={e => setSubjectCode(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none transition-all" placeholder="เช่น 06016317" />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">ตอนเรียน (Section)</label>
                              <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none transition-all" placeholder="เช่น 1" />
                          </div>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อวิชา</label>
                          <input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none transition-all" placeholder="เช่น Advanced Web Programming" />
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สอบ</label>
                              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-primary outline-none transition-all" />
                           </div>
                           <div className="md:col-span-2">
                              <label className="block text-sm font-bold text-gray-700 mb-2">ช่วงเวลาสอบ</label>
                              <div className="grid grid-cols-2 gap-4">
                                {EXAM_SLOTS.map((slot, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setStartTime(slot.start);
                                            setEndTime(slot.end);
                                        }}
                                        className={`p-4 rounded-xl border-2 transition-all font-bold text-sm flex flex-col items-center justify-center gap-1
                                            ${startTime === slot.start && endTime === slot.end 
                                                ? 'border-primary bg-orange-50 text-primary' 
                                                : 'border-gray-200 bg-white text-gray-600 hover:border-orange-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4"/>
                                            <span>{slot.name}</span>
                                        </div>
                                        <span className="text-xs font-normal opacity-80">{slot.time}</span>
                                    </button>
                                ))}
                              </div>
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
                       <button onClick={handleStep2Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-primary hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
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
                    
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="flex-1 bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm min-w-0">
                            <h3 className="font-bold text-lg mb-4 flex items-center">
                                <MapPin className="w-5 h-5 mr-2 text-primary"/> เลือกที่นั่งเพื่อกำหนด IP
                            </h3>
                            {selectedRoomId ? (
                                (() => {
                                    const room = rooms.find(r => r.id === selectedRoomId);
                                    if (!room) return <div>ไม่พบข้อมูลห้อง</div>;
                                    return (
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <div className="min-w-max mx-auto grid gap-2" style={{ gridTemplateColumns: `repeat(${room.cols}, 100px)` }}>
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
                                                            className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all relative group
                                                                ${isSelected ? 'border-primary bg-orange-50 ring-2 ring-orange-200' : hasIp ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                                                        >
                                                            <span className="text-[10px] text-gray-400 mb-0.5 absolute top-1.5 left-2">โต๊ะ</span>
                                                            <span className={`font-bold text-xl mb-1 ${isSelected ? 'text-primary' : 'text-gray-500'}`}>{row}-{col}</span>
                                                            {hasIp && (
                                                                <div className="flex flex-col items-center mt-1">
                                                                    <Network className="w-5 h-5 text-green-600 mb-0.5" />
                                                                    <span className="text-[10px] text-green-700 font-bold">IP OK</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="text-gray-400 text-center py-10">กรุณาเลือกห้องสอบในขั้นตอนที่ 1 ก่อน</div>
                            )}
                        </div>

                        <div className="w-full lg:w-80 shrink-0">
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 h-full sticky top-4">
                                <h3 className="font-bold text-lg mb-4 text-gray-800">รายละเอียด IP</h3>
                                {selectedSeatForIp ? (
                                    <div className="space-y-4">
                                        <div className="bg-white p-4 rounded-xl border border-gray-200">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ที่นั่ง (Seat)</label>
                                            <div className="text-2xl font-bold text-primary">{selectedSeatForIp}</div>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">IP Address</label>
                                            <input 
                                                type="text" 
                                                value={ipInput} 
                                                onChange={e => setIpInput(e.target.value)} 
                                                className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-primary outline-none font-mono" 
                                                placeholder="e.g. 192.168.1.10" 
                                                autoFocus
                                            />
                                            <p className="text-xs text-gray-400 mt-2">ปล่อยว่างเพื่อลบ IP</p>
                                        </div>

                                        <button 
                                            onClick={handleSaveIp}
                                            className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition shadow-lg"
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
                       <button onClick={handleStep3Next} className={`${editingExamId ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-primary hover:bg-orange-600 shadow-orange-200'} text-white px-10 py-4 rounded-full font-bold transition flex items-center shadow-xl transform hover:-translate-y-1`}>
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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left Column: Presets */}
                        <div className="bg-gray-50 border-2 border-gray-100 p-6 rounded-2xl h-full">
                            <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center">
                                <List className="w-5 h-5 mr-2 text-primary"/> รายการแนะนำ (คลิกเพื่อเพิ่ม)
                            </h3>
                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar space-y-6">
                                {PRESET_BLOCKED_APPS.map((category, catIdx) => (
                                    <div key={catIdx}>
                                        <h4 className="text-sm font-bold text-gray-500 uppercase mb-2 border-b border-gray-200 pb-1">
                                            {category.category}
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {category.items.map((app, idx) => {
                                                const isAdded = blockedResources.some(r => r.name === app.name);
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            if (isAdded) return;
                                                            const res: ResourceConstraint = {
                                                                id: Date.now().toString() + Math.random(),
                                                                name: app.name,
                                                                type: app.type
                                                            };
                                                            setBlockedResources([...blockedResources, res]);
                                                        }}
                                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2 ${
                                                            isAdded
                                                            ? 'bg-green-100 text-green-700 border-green-200 cursor-default'
                                                            : 'bg-white text-gray-700 border-gray-200 hover:border-primary hover:text-primary hover:shadow-sm'
                                                        }`}
                                                    >
                                                        {isAdded && <Check className="w-3 h-3"/>}
                                                        {app.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: Manual Input & Current List */}
                        <div className="bg-white border-2 border-gray-100 p-6 rounded-2xl mb-6 h-full">
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
                                    className="flex-1 border-2 border-gray-200 p-3 rounded-xl focus:border-primary outline-none"
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

                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
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
               <List className="w-8 h-8 mr-3 text-primary"/> ตารางสอบทั้งหมด ({exams.length})
            </h2>
            
            {exams.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <Calendar className="w-20 h-20 mx-auto mb-6 opacity-20"/>
                    <p className="text-lg mb-2">ยังไม่มีการสร้างตารางสอบ</p>
                    <button onClick={() => { setViewMode('WIZARD'); setStep(1); }} className="mt-4 text-primary font-bold hover:underline">เริ่มสร้างการสอบใหม่</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {exams.slice().reverse().map(exam => {
                        const room = rooms.find(r => r.id === exam.roomId);
                        return (
                            <div key={exam.id} className="group bg-white border border-gray-100 rounded-2xl hover:border-primary hover:ring-4 hover:ring-orange-50 hover:shadow-xl transition-all relative overflow-hidden">
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-start p-5 pb-0">
                                        <div className="bg-orange-50 text-primary font-bold px-3 py-1 rounded-lg text-xs">Sec {exam.section}</div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleStartEditExam(exam)} className="p-2 rounded-lg hover:bg-orange-100 hover:text-primary text-gray-400 transition" title="แก้ไข"><Edit className="w-5 h-5"/></button>
                                            <button type="button" onClick={() => onDeleteExam(exam.id)} className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 text-gray-400 transition" title="ลบ"><Trash2 className="w-5 h-5"/></button>
                                        </div>
                                    </div>

                                    <div className="p-5 flex-1 flex flex-col justify-between cursor-pointer" onClick={() => setSelectedExamId(exam.id)}>
                                        <div className="mb-4">
                                            <h3 className="font-bold text-2xl text-gray-800 mb-2">{exam.subjectCode}</h3>
                                            <p className="text-base text-gray-600 line-clamp-2 font-medium">{exam.subjectName}</p>
                                        </div>

                                        <div className="space-y-3 text-sm text-gray-500 border-t border-gray-100 pt-4">
                                            <div className="flex items-center"><Calendar className="w-4 h-4 mr-3 text-gray-400"/> {exam.date}</div>
                                            <div className="flex items-center"><Clock className="w-4 h-4 mr-3 text-gray-400"/> {exam.startTime} - {exam.endTime}</div>
                                            <div className="flex items-center"><MapPin className="w-4 h-4 mr-3 text-gray-400"/> ห้อง {room?.name}</div>
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