import { supabase } from '../supabaseClient';
import { ExamAttendance, Room, User } from '../types';

export const sessionService = {
  async registerSession(
      roomId: string,
      user: User,
      seatNumber: number,
      ip: string,
      descriptorStr: string
  ): Promise<void> {
      const profileUrl = user.avatarUrl 
            ? `${user.avatarUrl}#${user.id}`
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random#${user.id}`;

      // Check existing
      const { data: existingSession } = await supabase
          .from('exam_student_sessions')
          .select('id')
          .eq('layout_id', roomId)
          .eq('student_email', user.email)
          .eq('is_active', true);

      if (existingSession && existingSession.length > 0) {
            // Update existing session
            await supabase
                .from('exam_student_sessions')
                .update({
                    student_name: user.name,
                    seat_number: seatNumber,
                    ip_address: ip,
                    face_descriptor: descriptorStr, 
                    student_profile_url: profileUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingSession[0].id);
      } else {
            // Insert Session Record
            await supabase.from('exam_student_sessions').insert({
                layout_id: roomId,
                student_email: user.email,
                student_name: user.name,
                seat_number: seatNumber,
                ip_address: ip,
                face_descriptor: descriptorStr,
                student_profile_url: profileUrl,
                is_active: true,
                session_start_time: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
      }
  },

  async fetchActiveStudents(rooms: Room[]): Promise<ExamAttendance[]> {
      const { data, error } = await supabase
          .from('exam_student_sessions')
          .select('*')
          .eq('is_active', true);
      
      if (error) {
          return [];
      } else {
          return data.map((s: any) => {
              // Try to find room to calculate row/col
              const room = rooms.find(r => r.id === s.layout_id);
              let row = 0;
              let col = 0;
              
              if (room && s.seat_number) {
                  row = Math.ceil(s.seat_number / room.cols);
                  col = s.seat_number % room.cols;
                  if (col === 0) col = room.cols;
              }

              return {
                  id: s.id,
                  examId: '', // We don't have exam_id in sessions. TeacherDashboard will use its own fallback.
                  studentId: s.student_email, // Use email as ID
                  studentName: s.student_name,
                  studentCode: s.student_email,
                  studentProfileUrl: s.student_profile_url,
                  studentUuid: s.student_id,
                  row: row,
                  col: col,
                  ipAddress: s.ip_address,
                  status: 'ONLINE',
                  joinedAt: s.created_at || new Date().toISOString()
              };
          });
      }
  },

  async kickStudent(attendanceId: string, activeStudents: ExamAttendance[]): Promise<void> {
      // Find the student to get UUID if available
      const student = activeStudents.find(s => s.id === attendanceId);
      if (!student) return;

      console.log("Kicking student:", student);

      // 1. Delete from exam_student_sessions
      const { error } = await supabase
          .from('exam_student_sessions')
          .delete()
          .eq('id', attendanceId);
      
      if (error) {
          throw new Error('Error kicking student: ' + error.message);
      } else {
          // 2. Delete from qr_authentication
          let userIdToDelete = student.studentUuid;

          // Strategy A: Extract from Profile URL Hash (Primary method)
          if (!userIdToDelete && student.studentProfileUrl) {
              const parts = student.studentProfileUrl.split('#');
              if (parts.length > 1) {
                  userIdToDelete = parts[1];
                  console.log("Found UserID from URL Hash:", userIdToDelete);
              }
          }

          // Strategy B: Find by IP (Fallback if Hash missing)
          if (!userIdToDelete && student.ipAddress) {
               // Try to find a recent authentication from this IP
               const { data: ipMatch } = await supabase
                  .from('qr_authentication')
                  .select('user_id')
                  .eq('ip', student.ipAddress)
                  .order('authenticated_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
               if (ipMatch) {
                   userIdToDelete = ipMatch.user_id;
                   console.log("Found UserID from IP match:", userIdToDelete);
               }
          }

          if (userIdToDelete) {
              // Try RPC first (Bypass RLS)
              const { error: rpcError } = await supabase.rpc('delete_student_qr_auth', {
                  target_user_id: userIdToDelete
              });

              if (rpcError) {
                  console.warn("RPC delete failed (function might not exist), trying direct delete...", rpcError);
                  
                  // Fallback to direct delete
                  const { error: qrError, count } = await supabase
                      .from('qr_authentication')
                      .delete({ count: 'exact' })
                      .eq('user_id', userIdToDelete);
                  
                  if (qrError) {
                      console.error("Error deleting QR auth:", qrError);
                  } else {
                      console.log(`Direct delete result: ${count} rows deleted.`);
                  }
              } else {
                  console.log("Successfully deleted QR auth via RPC for user:", userIdToDelete);
              }
          } else {
              console.warn("Could not find UserID to delete QR record. Student removed from session only.");
          }
      }
  },

  async fetchSessionsByRoomId(roomId: string): Promise<any[]> {
      const { data, error } = await supabase
          .from('exam_student_sessions')
          .select('*')
          .eq('layout_id', roomId)
          .eq('is_active', true);
      
      if (error) return [];
      return data;
  },

  async fetchAllSessionsByRoomId(roomId: string): Promise<any[]> {
      const { data, error } = await supabase
          .from('exam_student_sessions')
          .select('*')
          .eq('layout_id', roomId);
      
      if (error) return [];
      return data;
  },

  async fetchResourceLogs(sessionId: string): Promise<any | null> {
      const { data } = await supabase
          .from('resource_logs')
          .select('*')
          .eq('session_id', sessionId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
      return data;
  },

  async fetchViolationLogs(sessionId: string): Promise<any[]> {
      const { data } = await supabase
          .from('violation_logs')
          .select('*')
          .eq('session_id', sessionId)
          .order('timestamp', { ascending: false });
      return data || [];
  },

  async fetchViolationsBySessionIds(sessionIds: string[]): Promise<any[]> {
      const { data } = await supabase
          .from('violation_logs')
          .select('*')
          .in('session_id', sessionIds);
      return data || [];
  },

  async fetchActiveSession(email: string): Promise<any | null> {
      const { data } = await supabase
          .from('exam_student_sessions')
          .select('*') // Fetch all fields as ExamRoomView needs id
          .eq('student_email', email)
          .eq('is_active', true)
          .maybeSingle();
      return data;
  },

  async exitSession(sessionId: string, userId: string): Promise<void> {
      // 1. Delete Exam Session
      const { error: sessionError } = await supabase
          .from('exam_student_sessions')
          .delete()
          .eq('id', sessionId);

      if (sessionError) throw sessionError;

      // 2. Delete QR Authentication Record (Clean up)
      const { error: qrError } = await supabase
          .from('qr_authentication')
          .delete()
          .eq('user_id', userId);
      
      if (qrError) {
          console.error("Error deleting QR auth record:", qrError);
          throw qrError;
      }
  }
};
