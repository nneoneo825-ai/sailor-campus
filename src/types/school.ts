/**
 * 学校管理模块共享类型定义
 * 从 components/SchoolManagement.tsx 抽取
 */

export interface School {
  id: string;
  name: string;
  type: string;
  province: string;
  city: string;
  district: string;
  address: string;
  principal: string;
  contact: string;
  studentCount: number;
  teacherCount: number;
  stages: string;
  gradeCount: number;
  classCount: number;
}

export interface SeatingGroup {
    id: number;
    name: string;
    students: string[];
    // type property removed as all groups are now single column
}

export interface ClassInfo {
  id: string;
  name: string;
  grade: string;
  stage: string;
  school: string;
  headTeacher: string;
  teachers: {
    chinese?: string;
    math?: string;
    english?: string;
    physics?: string;
    chemistry?: string;
    biology?: string;
    geography?: string;
    politics?: string;
    history?: string;
    morality?: string;
    it?: string;
    pe?: string;
    music?: string;
    [key: string]: string | undefined;
  };
  seatingGroups?: SeatingGroup[];
  seatingRowCount?: number;  // 座位表行数
  allStudents?: string[];
}

export interface TeachingClass {
  class_id: number;
  class_name: string;
  grade_name: string;
  subject: string;
  is_head_teacher: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  gender: '男' | '女';
  school: string;
  grades: string; // Can be multiple lines or comma separated
  positions: string; // e.g. "班主任, 任课教师"
  subject: string;
  phone: string;
  teaching_classes?: TeachingClass[]; // 任课班级列表
}
