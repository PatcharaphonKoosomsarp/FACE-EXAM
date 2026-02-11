import { supabase } from '../supabaseClient';
import { Room, Exam } from '../types';

export const examService = {
  async fetchRooms(): Promise<Room[] | null> {
    const { data, error } = await supabase
      .from('room_seat_layouts')
      .select('*, room_seat_ip_mappings(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rooms:', error);
      return null;
    } else {
      return data.map((r: any) => {
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
    }
  },

  async fetchExams(currentRooms: Room[]): Promise<Exam[]> {
    const { data, error } = await supabase
      .from('exam_rooms')
      .select('*, room_blocked_resources(*)')
      .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching exams:', error);
        return [];
    } else {
        return data.map((e: any) => {
            const room = currentRooms.find(r => r.name === e.room_name);
            return {
                id: e.id,
                roomId: room ? room.id : '', // Map by name
                subjectCode: e.course_code || '',
                subjectName: e.course_name || '',
                section: e.section || '',
                date: e.exam_date || '',
                startTime: e.start_time || '',
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
    }
  },

  async createRoom(newRoom: Room, userId: string): Promise<Room> {
    const { data, error } = await supabase
      .from('room_seat_layouts')
      .insert([
        {
          room_name: newRoom.name,
          rows: newRoom.rows,
          columns: newRoom.cols,
          total_seats: newRoom.rows * newRoom.cols,
          created_by: userId
        }
      ])
      .select();

    if (error) throw error;
    
    const created = data[0];
    return {
        id: created.id,
        name: created.room_name,
        rows: created.rows,
        cols: created.columns,
        ipMapping: {}
    };
  },

  async updateRoom(updatedRoom: Room): Promise<void> {
    const { error } = await supabase
      .from('room_seat_layouts')
      .update({
        room_name: updatedRoom.name,
        rows: updatedRoom.rows,
        columns: updatedRoom.cols,
        total_seats: updatedRoom.rows * updatedRoom.cols
      })
      .eq('id', updatedRoom.id);

    if (error) throw error;
  },

  async deleteRoom(roomId: string): Promise<void> {
    const { error } = await supabase
      .from('room_seat_layouts')
      .delete()
      .eq('id', roomId);
    
    if (error) throw error;
  },

  async updateIpMapping(roomId: string, row: number, col: number, ip: string, roomCols: number): Promise<void> {
      // Changed to use Row-Col format to match Agent's behavior (e.g. "1-1")
      const seatNumber = `${row}-${col}`;

      // Check if mapping exists
      const { data: existing } = await supabase
          .from('room_seat_ip_mappings')
          .select('id')
          .eq('layout_id', roomId)
          .eq('row_number', row)
          .eq('column_number', col)
          .maybeSingle();

      if (existing) {
          if (ip) {
              await supabase
                  .from('room_seat_ip_mappings')
                  .update({ ip_address: ip, seat_number: seatNumber })
                  .eq('id', existing.id);
          } else {
              await supabase
                  .from('room_seat_ip_mappings')
                  .delete()
                  .eq('id', existing.id);
          }
      } else if (ip) {
          await supabase
              .from('room_seat_ip_mappings')
              .insert({
                  layout_id: roomId,
                  row_number: row,
                  column_number: col,
                  seat_number: seatNumber,
                  ip_address: ip
              });
      }
  },

  async createExam(newExam: Exam, roomName: string, userId: string, userName: string): Promise<Exam> {
      const { data, error } = await supabase
        .from('exam_rooms')
        .insert([
          {
            course_code: newExam.subjectCode,
            course_name: newExam.subjectName,
            section: newExam.section,
            exam_date: newExam.date,
            start_time: newExam.startTime,
            end_time: newExam.endTime,
            room_name: roomName,
            created_by: userId,
            created_by_name: userName,
            is_active: true
          }
        ])
        .select();

      if (error) throw error;
      
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

      return {
          ...newExam,
          id: created.id,
          createdById: created.created_by,
          createdByName: created.created_by_name
      };
  },

  async deleteExam(examId: string): Promise<void> {
      const { error } = await supabase
        .from('exam_rooms')
        .delete()
        .eq('id', examId);
      
      if (error) throw error;
  },

  async updateExam(updatedExam: Exam, roomName: string): Promise<void> {
    const { error } = await supabase
        .from('exam_rooms')
        .update({
            room_name: roomName,
            exam_date: updatedExam.date,
            course_code: updatedExam.subjectCode,
            course_name: updatedExam.subjectName,
            section: updatedExam.section,
            start_time: updatedExam.startTime,
            end_time: updatedExam.endTime
        })
        .eq('id', updatedExam.id);

    if (error) throw error;

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
  },

  async toggleExamStatus(examId: string, isActive: boolean): Promise<void> {
      const { error } = await supabase
        .from('exam_rooms')
        .update({ is_active: isActive })
        .eq('id', examId);
      
      if (error) throw error;
  },

  async fetchRoomName(roomId: string): Promise<string> {
      const { data } = await supabase
          .from('room_seat_layouts')
          .select('room_name')
          .eq('id', roomId)
          .single();
      return data ? data.room_name : '';
  }
};
