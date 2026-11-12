/**
 * 教学管理模块共享类型定义
 * 从 components/TeachingManagement.tsx 抽取
 */

export interface PersonalTeachingReportResponse {
    teacher: {
        id: number;
        name: string;
        group: string;
        classes: string[];
    };
    report_period: {
        start_date: string;
        end_date: string;
    };
    summary: {
        bonus_score: number;
        deduction_score: number;
        total_score: number;
        check_count: number;
        rank: number;
    };
    details: Array<{
        check_item: string;
        content: string;
        type: 'bonus' | 'deduction';
        score: number;
        time: string;
        major_category?: string;
        indicator_id?: number;
    }>;
    metrics: Record<string, number>;
}

export interface GradeTeachingReportResponse {
    grade_name: string;
    report_period: {
        start_date: string;
        end_date: string;
    };
    summary?: {
        bonus_score: number;
        deduction_score: number;
        total_score: number;
        check_count: number;
    };
    teachers: Array<{
        id: number;
        name: string;
        group: string;
        metrics: Record<string, number>;
        total_score: number;
        rank: number;
    }>;
    subject_summary: Array<{
        subject: string;
        total_score: number;
        rank: number;
        teacher_count: number;
    }>;
}

export interface SchoolTeachingReportResponse {
    school_name: string;
    report_period: {
        start_date: string;
        end_date: string;
    };
    grades: Array<{
        grade_name: string;
        metrics: Record<string, number>;
        total_score: number;
        rank: number;
    }>;
    major_categories?: string[];
}

export interface ProvincialTeachingReportResponse {
    province_name?: string;
    report_period: {
        start_date: string;
        end_date: string;
    };
    major_categories?: string[];
    schools: Array<{
        school_name: string;
        id?: number;
        metrics: Record<string, number>;
        total_score: number;
        rank: number;
    }>;
}

export interface TeacherMetric {
    id: string;
    group: string;
    name: string;
    // Metrics - 动态大项分数
    metrics: Record<string, number>;
    // Summary
    personalScore: number;
    personalRank: number;
    subjectScore: number;
    subjectRank: number;
}

export interface SchoolTeachingMetric {
    grade: string;
    metrics: Record<string, number>;
    gradeScore: number;
    gradeRank: number;
}

export interface ProvincialTeachingMetric {
    id: string;
    schoolName: string;
    metrics: Record<string, number>;
    // 保留向后兼容的字段
    design: number;
    quality: number;
    guide: number;
    exercise: number;
    process: number;
    selfStudy: number;
    marking: number;
    posting: number;
    progress: number;
    listening: number;
    tutoring: number;
    officeDisc: number;
    praise: number;
    hygiene: number;
    check: number;
    board: number;
    oral: number;
    team: number;
    schoolScore: number;
    schoolRank: number;
}

export interface ApiTeachingIndicator {
  id: number;
  major_category: string;
  name: string;
  type: 'score' | 'bonus' | 'deduction';
  default_score: number;
  is_enabled: number;
  org_id?: number;
  org_name?: string;
}

export interface TeachingDetailRecord {
  id: number;
  group: string;
  checkItem: string;
  content: string;
  type: '加分' | '减分';
  score: number;
  time: string;
  major_category?: string;
  indicator_id?: number;
}

export interface GradeTeachingDetailRecord {
  id: number;
  group: string;
  teacher: string;
  checkItem: string;
  content: string;
  type: '加分' | '减分';
  score: number;
  time: string;
  class_name?: string;
}

export interface SchoolTeachingDetailRecord {
  id: number;
  grade: string;
  group: string;
  teacher: string;
  checkItem: string;
  content: string;
  type: '加分' | '减分';
  score: number;
  time: string;
  major_category?: string;
}

export interface ProvincialTeachingDetailRecord {
  id: number;
  school: string;
  grade: string;
  group: string;
  teacher: string;
  checkItem: string;
  content: string; // 扣分项/Description
  type: '加分' | '减分';
  score: number;
  time: string;
  major_category?: string;
}

export interface PersonalDetailRecord {
  id: number;
  item: string;
  content: string;
  score: number;
  reason: string;
}

export interface FilterOptions {
    schools: Array<{ id: number; name: string }>;
    grades: Array<{ id: number; name: string }>;
    groups: string[];
    teachers: Array<{ id: number; name: string; real_name?: string; group?: string }>;
}

export interface SchoolTeachersResponse {
    total: number;
    page: number;
    page_size: number;
    teachers: Array<{
        id: string;
        name: string;
        real_name?: string;
        [key: string]: any;
    }>;
}

export interface TeacherDetail {
    id: number;
    name: string;
    gender: string;
    phone: string;
    email: string;
    school_id: number;
    school_name: string;
    grades: string;
    positions: string;
    subject: string;
    employee_no: string;
    entry_date: string | null;
    employment_type: string;
    education: string;
    title: string;
    status: number;
    user_id: number;
    teaching_classes: Array<{
        class_id: number;
        class_name: string;
        grade_name: string;
        subject: string;
        is_head_teacher: boolean;
    }>;
}

export interface TeachingIndicator {
    id: number;
    major_category: string;
    name: string;
    type: string;
    default_score: number;
    is_enabled: number;
    org_id: number | null;
    org_name: string;
}
