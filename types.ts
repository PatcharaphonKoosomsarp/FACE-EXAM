export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  GUEST = 'GUEST'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  isFaceRegistered?: boolean;
}

export interface Room {
  id: string;
  name: string;
  rows: number;
  cols: number;
  ipMapping?: Record<string, string>; // Key: "row-col", Value: IP Address
}

export interface ResourceConstraint {
  id: string;
  name: string;
  type: 'WEB_APP' | 'WINDOWS_APP' | 'BROWSER';
}

export interface Exam {
  id: string;
  roomId: string;
  subjectCode: string;
  subjectName: string;
  section: string;
  date: string;
  startTime: string;
  endTime: string;
  createdByName: string; // Changed from createdBy to be explicit
  createdById: string;   // Added for DB linkage
  blockedResources: ResourceConstraint[];
}

export interface ExamAttendance {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  row: number;
  col: number;
  ipAddress: string;
  status: 'ONLINE' | 'OFFLINE' | 'KICKED';
  joinedAt: string;
}

export interface FaceRegistrationStep {
  id: string;
  instruction: string;
  description: string;
  isCompleted: boolean;
}