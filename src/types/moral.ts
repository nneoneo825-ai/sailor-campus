/**
 * 德育管理模块共享类型定义
 * 从 components/MoralEducation.tsx 抽取，供后续拆分的子组件复用
 */

export interface ClassDetailRecord {
  id: number;
  student: string;
  majorCategory: string;
  minorCategory: string;
  reason: string;
  content: string;
  type: '加分' | '减分';
  score: number;
  time: string;
}

export interface GradeDetailRecord {
  id: number;
  class: string;
  majorCategory: string;
  minorCategory: string;
  reason: string;
  content: string;
  student: string;
  type: '加分' | '减分';
  score: number;
  time: string;
}

export interface SchoolDetailListRecord {
    id: number;
    grade: string;
    class: string;
    majorCategory: string;
    minorCategory: string;
    reason: string;
    content: string;
    student: string;
    type: '加分' | '减分';
    score: number;
    time: string;
}

export interface DormReportData {
  grade: string;
  class: string;
  headTeacher: string;
  mContent: number;
  fContent: number;
  content: number;
  mNap: number;
  fNap: number;
  nap: number;
  totalDed: number;
  student_count: number;
  perCapita: number;
  rank: number;
  score: number;
  gradePerCapita: number;
  gradeRank: number;
}

export interface DormDetailRecord {
  id: number;
  grade: string;
  class: string;
  headTeacher: string;
  student: string;
  dormNo: string;
  majorCategory: string;
  minorCategory: string;
  reason: string;
  type: '加分' | '减分';
  score: number;
  time: string;
}

export interface ClassReportData {
  classInfo: {
    id: number;
    name: string;
    headTeacher: string;
    studentCount: number;
  };
  summary: {
    totalScore: number;
    bonusScore: number;
    deductionScore: number;
    checkItems: number;
    rank: number;
    trend: number;
  };
  fiveEducation: {
    category: string;
    score: number;
    fullMark: number;
  }[];
  details: {
    id: number;
    item: string;
    content: string;
    score: number;
    reason: string;
    majorCategory: string;
    minorCategory: string;
    source?: string;
    description?: string;
  }[];
  records: {
    id: number;
    student: string;
    majorCategory: string;
    minorCategory: string;
    reason: string;
    content: string;
    type: '加分' | '减分';
    score: number;
    time: string;
    source?: string;
    description?: string;
  }[];
  trend: {
    date: string;
    score: number;
  }[];
}

export interface FilterOptions {
  schools: { id: number; name: string }[];
  grades: { id: number; name: string }[];
  classes: { id: number; name: string }[];
}

export interface IndicatorSubCategory {
  name: string;
  fieldKey: string;
}

export interface IndicatorCategory {
  name: string;
  subCategories: IndicatorSubCategory[];
}

export interface DynamicClassData {
  class: string;
  headTeacher: string;
  totalDed: number;
  perCapita: number;
  rank: number;
  [key: string]: string | number; // 动态字段
}

export interface GradeReportData {
  gradeName: string;
  classes: DynamicClassData[];
  records: {
    id: number;
    class: string;
    majorCategory: string;
    minorCategory: string;
    reason: string;
    content: string;
    student: string;
    type: '加分' | '减分';
    score: number;
    time: string;
    source?: string;
    description?: string;
  }[];
  reportPeriod: {
    startDate: string;
    endDate: string;
  };
  indicatorStructure?: IndicatorCategory[]; // 动态指标结构
}

export interface DynamicGradeData {
  grade: string;
  totalDed: number;
  perCapita: number;
  rank: number;
  studentCount: number;
  [key: string]: string | number; // 动态字段
}

export interface SchoolReportData {
  schoolName: string;
  grades: DynamicGradeData[];
  records: {
    id: number;
    grade: string;
    class: string;
    majorCategory: string;
    minorCategory: string;
    reason: string;
    content: string;
    student: string;
    type: '加分' | '减分';
    score: number;
    time: string;
    source?: string;
    description?: string;
  }[];
  reportPeriod: {
    startDate: string;
    endDate: string;
  };
  indicatorStructure?: IndicatorCategory[]; // 动态指标结构
}
