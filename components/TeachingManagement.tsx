
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { 
  Download, Filter, Search, Calendar, ChevronDown, X, ArrowLeft, 
  ChevronLeft, ChevronRight, RefreshCw, FileText, TrendingUp, 
  TrendingDown, Users, School, GraduationCap, BarChart3, Loader2,
  Award, BookOpen, ClipboardList, Building
} from 'lucide-react';
import { api } from '../src/services/apiClient';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';
import { 
  getBeijingDate, 
  getBeijingDateOffset, 
  getBeijingWeekRange, 
  getBeijingLastWeekRange,
  getBeijingMonthRange,
  getBeijingLastMonthRange,
  formatBeijingTime, getRecentDaysRange } from '../src/utils/dateUtils';

import { hasPermission } from '../src/utils/permission';

// --- Types ---

// API Response Types
interface PersonalTeachingReportResponse {
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

interface GradeTeachingReportResponse {
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

interface SchoolTeachingReportResponse {
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

interface ProvincialTeachingReportResponse {
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

interface TeacherMetric {
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

interface SchoolTeachingMetric {
    grade: string;
    metrics: Record<string, number>;
    gradeScore: number;
    gradeRank: number;
}

interface ProvincialTeachingMetric {
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

// 教学指标接口（来自系统管理模块）
interface ApiTeachingIndicator {
  id: number;
  major_category: string;
  name: string;
  type: 'score' | 'bonus' | 'deduction';
  default_score: number;
  is_enabled: number;
  org_id?: number;
  org_name?: string;
}

interface TeachingDetailRecord {
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

interface GradeTeachingDetailRecord {
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

interface SchoolTeachingDetailRecord {
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

interface ProvincialTeachingDetailRecord {
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

interface PersonalDetailRecord {
  id: number;
  item: string;
  content: string;
  score: number;
  reason: string;
}

// 日期范围选择器组件
interface DateRangePickerProps {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 快捷选项
  const quickOptions = [
    { label: '今天', getValue: () => {
      const today = getBeijingDate();
      return { start: today, end: today };
    }},
    { label: '昨天', getValue: () => {
      const yesterday = getBeijingDateOffset(-1);
      return { start: yesterday, end: yesterday };
    }},
    { label: '本周', getValue: () => {
      return getBeijingWeekRange();
    }},
    { label: '上一周', getValue: () => {
      return getBeijingLastWeekRange();
    }},
    { label: '本月', getValue: () => {
      return getBeijingMonthRange();
    }},
    { label: '上一月', getValue: () => {
      return getBeijingLastMonthRange();
    }},
  ];

  // 生成日历天数
  const generateDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  // 获取两个月的数据
  const getTwoMonths = () => {
    const year1 = currentMonth.getFullYear();
    const month1 = currentMonth.getMonth();
    const year2 = month1 === 11 ? year1 + 1 : year1;
    const month2 = month1 === 11 ? 0 : month1 + 1;
    return [
      { year: year1, month: month1, label: `${year1}年${month1 + 1}月` },
      { year: year2, month: month2, label: `${year2}年${month2 + 1}月` }
    ];
  };

  const twoMonths = getTwoMonths();

  const handleDateClick = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!value.start || (value.start && value.end)) {
      onChange({ start: dateStr, end: '' });
    } else {
      if (dateStr < value.start) {
        onChange({ start: dateStr, end: value.start });
      } else {
        onChange({ ...value, end: dateStr });
      }
    }
  };

  const isSelected = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === value.start || dateStr === value.end;
  };

  const isInRange = (year: number, month: number, day: number) => {
    if (!value.start || !value.end) return false;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr > value.start && dateStr < value.end;
  };

  const clearDates = () => {
    onChange({ start: '', end: '' });
  };

  return (
    <div className="space-y-1.5 lg:col-span-2" ref={pickerRef}>
      <label className="text-xs font-medium text-slate-500">时间范围</label>
      <div className="relative">
        {/* 输入框 */}
        <div 
          className="flex items-center border border-slate-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Calendar className="ml-3 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            readOnly
            className="flex-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer"
            value={value.start || '开始日期'}
            placeholder="开始日期"
          />
          <span className="text-slate-400 text-sm">至</span>
          <input 
            type="text" 
            readOnly
            className="flex-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer"
            value={value.end || '结束日期'}
            placeholder="结束日期"
          />
          {(value.start || value.end) && (
            <button 
              className="mr-2 p-1 hover:bg-slate-100 rounded"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); clearDates(); }}
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        {/* 下拉面板 */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex">
            {/* 快捷选项 */}
            <div className="w-24 border-r border-slate-100 py-2">
              {quickOptions.map((opt) => (
                <button
                  key={opt.label}
                  className="w-full px-4 py-2 text-sm text-left text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  onClick={() => {
                    onChange(opt.getValue());
                    setIsOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 双月历 */}
            <div className="p-4">
              {/* 月份导航 */}
              <div className="flex items-center justify-between mb-4">
                <button 
                  className="p-1 hover:bg-slate-100 rounded"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                >
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div className="flex space-x-16">
                  {twoMonths.map((m, idx) => (
                    <span key={idx} className="text-sm font-medium text-slate-700">{m.label}</span>
                  ))}
                </div>
                <button 
                  className="p-1 hover:bg-slate-100 rounded"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                >
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* 日历网格 */}
              <div className="flex space-x-8">
                {twoMonths.map((m, idx) => (
                  <div key={idx} className="w-64">
                    {/* 星期标题 */}
                    <div className="grid grid-cols-7 mb-2">
                      {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                        <div key={day} className="text-center text-xs text-slate-400 py-1">{day}</div>
                      ))}
                    </div>
                    {/* 日期 */}
                    <div className="grid grid-cols-7 gap-1">
                      {generateDays(m.year, m.month).map((day, i) => (
                        <div key={i} className="aspect-square">
                          {day && (
                            <button
                              className={`w-full h-full text-sm rounded-full transition-colors ${
                                isSelected(m.year, m.month, day)
                                  ? 'bg-blue-500 text-white'
                                  : isInRange(m.year, m.month, day)
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                              onClick={() => handleDateClick(m.year, m.month, day)}
                            >
                              {day}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 学校多选下拉组件
interface SchoolMultiSelectProps {
  schools: { id: number; name: string; groupId: number }[];
  selectedSchools: string[];
  onChange: (selected: string[]) => void;
}

const SchoolMultiSelect: React.FC<SchoolMultiSelectProps> = ({ schools, selectedSchools, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (schoolName: string) => {
    if (selectedSchools.includes(schoolName)) {
      onChange(selectedSchools.filter(name => name !== schoolName));
    } else {
      onChange([...selectedSchools, schoolName]);
    }
  };

  const handleSelectAll = () => {
    const visibleSchoolNames = schools.map(s => s.name);
    // 检查当前可见的学校是否都被选中了
    const allVisibleSelected = visibleSchoolNames.every(name => selectedSchools.includes(name));
    
    if (allVisibleSelected) {
      // 取消选中当前可见的学校，保留其他已选（其他集团的）
      onChange(selectedSchools.filter(name => !visibleSchoolNames.includes(name)));
    } else {
      // 选中所有当前可见的学校（只选当前集团的，替换之前的选中状态）
      onChange(visibleSchoolNames);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-44 pl-3 pr-8 py-2 bg-white text-left flex items-center justify-between hover:border-blue-400"
      >
        <span className={selectedSchools.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
          {selectedSchools.length === 0
            ? '请选择学校'
            : `已选择 ${selectedSchools.length} 所学校`
          }
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform absolute right-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {/* 全选/取消全选 */}
          <div className="sticky top-0 bg-gray-50 border-b border-slate-200 px-3 py-2">
            <label className="flex items-center cursor-pointer hover:bg-gray-100 rounded px-1 py-1">
              <input
                type="checkbox"
                checked={schools.length > 0 && schools.every(s => selectedSchools.includes(s.name))}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-slate-700">
                {schools.length > 0 && schools.every(s => selectedSchools.includes(s.name)) ? '取消全选' : '全选'}
              </span>
            </label>
          </div>

          {/* 学校列表 */}
          <div className="py-1">
            {schools.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">暂无学校</div>
            ) : (
              schools.map((school) => (
                <label
                  key={school.id}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSchools.includes(school.name)}
                    onChange={() => handleToggle(school.name)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-700 truncate">{school.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Components ---

const TeachingManagement: React.FC = () => {
  // 根据权限确定默认显示的Tab
  const getDefaultTab = (): 'personal' | 'grade' | 'school' | 'provincial' => {
    if (hasPermission('teaching:personal')) return 'personal';
    if (hasPermission('teaching:grade')) return 'grade';
    if (hasPermission('teaching:school')) return 'school';
    if (hasPermission('teaching:provincial')) return 'provincial';
    return 'personal'; // 默认
  };
  
  const [activeTab, setActiveTab] = useState<'personal' | 'grade' | 'school' | 'provincial'>(getDefaultTab());

  const renderTabButton = (id: typeof activeTab, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        activeTab === id
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">教学评价管理 (Teaching Evaluation)</h1>
          <p className="text-slate-500 mt-1">教师教学质量综合评估报表。</p>
        </div>
      </div>

       {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-2">
          {hasPermission('teaching:personal') && renderTabButton('personal', '个人报表')}
          {hasPermission('teaching:grade') && renderTabButton('grade', '年级报表')}
          {hasPermission('teaching:school') && renderTabButton('school', '校级报表')}
          {hasPermission('teaching:provincial') && renderTabButton('provincial', '学区报表')}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[500px]">
        {hasPermission('teaching:personal') && activeTab === 'personal' && <TeachingPersonalReport />}
        {hasPermission('teaching:grade') && activeTab === 'grade' && <TeachingGradeReport />}
        {hasPermission('teaching:school') && activeTab === 'school' && <TeachingSchoolReport />}
        {hasPermission('teaching:provincial') && activeTab === 'provincial' && <TeachingProvincialReport />}
      </div>
    </div>
  );
};

// 筛选选项类型
interface FilterOptions {
    schools: Array<{ id: number; name: string }>;
    grades: Array<{ id: number; name: string }>;
    groups: string[];
    teachers: Array<{ id: number; name: string; real_name?: string; group?: string }>;
}

// 学校教师API响应类型
interface SchoolTeachersResponse {
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

// 教师详情类型
interface TeacherDetail {
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

const TeachingPersonalReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState<PersonalTeachingReportResponse | null>(null);
    const [detailRecords, setDetailRecords] = useState<TeachingDetailRecord[]>([]);
    const [personalMetrics, setPersonalMetrics] = useState<PersonalDetailRecord[]>([]);
    
    // 用于PDF导出的ref
    const reportRef = useRef<HTMLDivElement>(null);

    // 教学指标数据（用于联动）
    const [teachingIndicators, setTeachingIndicators] = useState<ApiTeachingIndicator[]>([]);

    // 教师详情
    const [teacherDetail, setTeacherDetail] = useState<TeacherDetail | null>(null);

    // 筛选状态 - 默认显示最近7天
    const [filters, setFilters] = useState({
        schoolId: 0,
        gradeId: 0,
        group: '',
        teacherId: 0,
        teacherName: '',
        dateRange: getBeijingWeekRange(),
        category: 'all'
    });

    // 筛选选项（教研组从API动态获取）
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        schools: [],
        grades: [],
        groups: [], // 教研组列表从API获取
        teachers: []
    });
    const { toast } = useToast();
    const { confirm } = useConfirm();

    // 加载筛选选项（学校、年级、教师）
    const loadFilterOptions = async () => {
        try {
            // 加载学校列表 - 修正API路径
            const schoolsResponse = await api.get<{schools: Array<{ id: number; name: string }>}>('/api/schools/list');
            if (schoolsResponse && schoolsResponse.schools && schoolsResponse.schools.length > 0) {
                setFilterOptions(prev => ({ ...prev, schools: schoolsResponse.schools }));
                setFilters(prev => ({ ...prev, schoolId: schoolsResponse.schools[0].id }));
                
                // 加载第一个学校的年级
                await loadGrades(schoolsResponse.schools[0].id);
            }
        } catch (error) {
            console.error('Failed to load filter options:', error);
            // API失败时清空数据，不使用静态默认值
            setFilterOptions(prev => ({ ...prev, schools: [], grades: [], groups: [], teachers: [] }));
        }
    };

    // 加载年级列表
    const loadGrades = async (schoolId: number) => {
        try {
            const gradesResponse = await api.get<Array<{ id: number; name: string }>>(`/api/schools/${schoolId}/grades`);
            if (gradesResponse && gradesResponse.length > 0) {
                setFilterOptions(prev => ({ ...prev, grades: gradesResponse }));
                setFilters(prev => ({ ...prev, gradeId: gradesResponse[0].id }));
                
                // 加载教研组列表
                await loadGroups(schoolId, gradesResponse[0].id);
            }
        } catch (error) {
            console.error('Failed to load grades:', error);
            // 使用默认数据
            const defaultGrades = [
                { id: 1, name: '初一' },
                { id: 2, name: '初二' },
                { id: 3, name: '初三' }
            ];
            setFilterOptions(prev => ({ ...prev, grades: defaultGrades }));
            setFilters(prev => ({ ...prev, gradeId: 1 }));
            await loadGroups(schoolId, 1);
        }
    };

    // 加载教研组列表 - 从学校管理模块同步
    const loadGroups = async (schoolId: number, gradeId: number) => {
        try {
            // 使用 filter-options API 获取学校下的所有学科（教研组）
            const response = await api.get<{ positions: string[]; subjects: string[] }>(`/api/schools/${schoolId}/filter-options`);
            if (response && response.subjects && response.subjects.length > 0) {
                // 使用 subjects 作为教研组列表（与学校管理模块同步）
                const groups = response.subjects;
                setFilterOptions(prev => ({ ...prev, groups }));
                setFilters(prev => ({ ...prev, group: groups[0] }));
                
                // 加载教师列表（根据学校、年级、教研组过滤）
                await loadTeachers(schoolId, gradeId, groups[0]);
            } else {
                // API返回空数据，清空教研组和教师列表
                setFilterOptions(prev => ({ ...prev, groups: [], teachers: [] }));
                setFilters(prev => ({ ...prev, group: '', teacherId: 0, teacherName: '' }));
            }
        } catch (error) {
            console.error('Failed to load groups:', error);
            // 网络错误时使用默认教研组
            const defaultGroups = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
            setFilterOptions(prev => ({ ...prev, groups: defaultGroups }));
            setFilters(prev => ({ ...prev, group: defaultGroups[0] }));
            await loadTeachers(schoolId, gradeId, defaultGroups[0]);
        }
    };

    // 加载教师列表 - 从学校管理模块同步，支持按学科（教研组）过滤
    const loadTeachers = async (schoolId: number, gradeId: number, subject?: string) => {
        try {
            // 构建API参数
            const params: Record<string, string> = {};
            if (subject) {
                params.subject = subject;
            }
            // 获取年级名称用于过滤
            const gradeName = filterOptions.grades.find(g => g.id === gradeId)?.name;
            if (gradeName) {
                params.grade = gradeName;
            }
            
            // 从API获取教师列表（与学校管理模块使用同一数据源）
            const response = await api.get<SchoolTeachersResponse>(`/api/schools/${schoolId}/teachers`, { params });
            if (response && response.teachers && response.teachers.length > 0) {
                const teachers = response.teachers.map(t => ({
                    id: parseInt(t.id) || 0,
                    name: t.real_name || t.name || '未知教师',
                    real_name: t.real_name || t.name,
                    group: t.subject || subject || '' // 使用 subject 作为教研组
                }));
                
                setFilterOptions(prev => ({ ...prev, teachers }));
                const firstTeacher = teachers[0];
                setFilters(prev => ({ 
                    ...prev, 
                    teacherId: firstTeacher.id,
                    teacherName: firstTeacher.name,
                    group: firstTeacher.group || subject || ''
                }));
            } else {
                // API返回空数据，清空教师列表
                setFilterOptions(prev => ({ ...prev, teachers: [] }));
                setFilters(prev => ({ 
                    ...prev, 
                    teacherId: 0,
                    teacherName: '',
                    group: subject || ''
                }));
            }
        } catch (error) {
            console.error('Failed to load teachers:', error);
            // 网络错误时使用默认数据
            const defaultTeachers = [
                { id: 1, name: '白少桐', real_name: '白少桐', group: subject || '语文' },
                { id: 2, name: '李思源', real_name: '李思源', group: subject || '数学' }
            ].filter(t => !subject || t.group === subject);
            
            setFilterOptions(prev => ({ 
                ...prev, 
                teachers: defaultTeachers.length > 0 ? defaultTeachers : [
                    { id: 1, name: '白少桐', real_name: '白少桐', group: subject || '语文' }
                ]
            }));
            const firstTeacher = defaultTeachers[0] || { id: 1, name: '白少桐', group: subject || '语文' };
            setFilters(prev => ({ 
                ...prev, 
                teacherId: firstTeacher.id,
                teacherName: firstTeacher.name,
                group: firstTeacher.group || subject || ''
            }));
        }
    };

    // 加载教师详情
    const loadTeacherDetail = async (teacherId: number) => {
        if (!teacherId) return;

        try {
            const response = await api.get<TeacherDetail>(`/api/schools/teachers/${teacherId}`);
            if (response) {
                setTeacherDetail(response);
                // 更新筛选器中的教师信息
                setFilters(prev => ({
                    ...prev,
                    teacherName: response.name,
                    group: response.subject || prev.group
                }));
            }
        } catch (error) {
            console.error('Failed to load teacher detail:', error);
            setTeacherDetail(null);
        }
    };

    // 加载教学指标列表（用于联动显示大项和指标名称）
    const loadTeachingIndicators = async () => {
        try {
            const response = await api.get<{indicators: ApiTeachingIndicator[]}>('/api/moral/teaching-indicators');
            if (response && response.indicators) {
                setTeachingIndicators(response.indicators);
            }
        } catch (error) {
            console.error('Failed to load teaching indicators:', error);
        }
    };

    // 根据检查项或指标ID获取对应的教学指标信息
    const getIndicatorInfo = (record: TeachingDetailRecord) => {
        // 优先通过 indicator_id 匹配
        if (record.indicator_id) {
            const indicator = teachingIndicators.find(ind => ind.id === record.indicator_id);
            if (indicator) {
                return {
                    majorCategory: indicator.major_category,
                    indicatorName: indicator.name
                };
            }
        }

        // 其次通过 checkItem 匹配（兼容旧数据）
        const indicator = teachingIndicators.find(ind => ind.name === record.checkItem);
        if (indicator) {
            return {
                majorCategory: indicator.major_category,
                indicatorName: indicator.name
            };
        }

        // 如果都没有找到，返回原始数据
        return {
            majorCategory: record.major_category || record.checkItem,
            indicatorName: record.content || record.checkItem
        };
    };

    // 加载个人报表数据
    const fetchData = async () => {
        if (!filters.teacherId) return;
        
        try {
            setLoading(true);
            const response = await api.get<PersonalTeachingReportResponse>('/api/teaching/reports/personal', {
                params: {
                    teacher_id: filters.teacherId,
                    start_date: filters.dateRange.start,
                    end_date: filters.dateRange.end
                }
            });

            if (response) {
                setReportData(response);

                // 更新详情记录（包含大项和指标ID）
                // 从后端获取教师教研组信息
                const teacherGroup = response.teacher?.group || filters.group || '未知教研组';
                
                const details = response.details?.map((record: any, idx: number) => ({
                    id: record.id || idx + 1,
                    group: teacherGroup,
                    checkItem: record.check_item,
                    content: record.content,
                    type: record.type,  // 后端已转换为"加分"/"减分"
                    score: record.score,  // 后端已返回绝对值
                    time: record.time,
                    major_category: record.major_category,
                    indicator_id: record.indicator_id
                })) || [];

                // 使用API返回的记录数据
                setDetailRecords(details);

                // 更新metrics - 将API返回的metrics映射到个人指标数据
                if (response.metrics) {
                    const indicatorNameMap: Record<string, string> = {
                        'design': '教学设计',
                        'quality': '教研质量',
                        'guide': '导纲制作',
                        'exercise': '习题组编',
                        'process': '授课过程',
                        'selfStudy': '学科自习',
                        'marking': '习题批阅',
                        'posting': '成绩贴评',
                        'progress': '教学进度',
                        'listening': '听课评课',
                        'tutoring': '辅导督促',
                        'officeDisc': '办公纪律',
                        'praise': '赞美激励',
                        'hygiene': '卫生摆摆',
                        'check': '查课管理',
                        'board': '板书设计',
                        'oral': '英语口语',
                        'team': '小组建设'
                    };
                    
                    // 从API数据构建个人指标数据
                    const updatedMetrics = Object.entries(indicatorNameMap).map(([key, itemName], index) => {
                        const score = response.metrics[key] || 0;
                        return { 
                            id: index + 1, 
                            item: itemName, 
                            content: '', 
                            score: score, 
                            reason: score !== 0 ? (score > 0 ? '加分' : '减分') : '-' 
                        };
                    });
                    setPersonalMetrics(updatedMetrics);
                }
            }
        } catch (error) {
            console.error('Failed to load personal report:', error);
            // 清空数据
            setReportData({
                teacher: { 
                    name: filters.teacherName, 
                    group: filters.group, 
                    classes: [] 
                },
                summary: { bonus_score: 0, deduction_score: 0, total_score: 0, check_count: 0, rank: 0 }
            });
            setDetailRecords([]);
            setPersonalMetrics([]);
        } finally {
            setLoading(false);
        }
    };

    // 初始加载筛选选项和教学指标
    useEffect(() => {
        loadFilterOptions();
        loadTeachingIndicators();
    }, []);

    // 当教师ID变化时加载教师详情和报表数据
    useEffect(() => {
        if (filters.teacherId > 0) {
            loadTeacherDetail(filters.teacherId);
            fetchData();
        }
    }, [filters.teacherId, filters.dateRange.start, filters.dateRange.end]);

    // 处理导出Excel
    const handleExport = () => {
        if (detailRecords.length === 0) return;
        
        const wb = XLSX.utils.book_new();
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        const teacherName = filters.teacherName || '教师';
        
        // 构建表格数据 - 标题行、日期行、表头、数据行
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`${teacherName} 个人教学量化明细`]);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['教研组', '大项', '检查内容', '类型', '分数', '日期', '时间']);
        
        // 数据行
        detailRecords.forEach((r: TeachingDetailRecord) => {
            const dateTimeStr = r.time || '';
            const datePart = dateTimeStr.split(' ')[0] || '';
            const timePart = dateTimeStr.split(' ')[1] || dateTimeStr;
            const indicatorInfo = getIndicatorInfo(r);
            tableData.push([r.group, indicatorInfo.majorCategory, indicatorInfo.indicatorName, r.type, r.score, datePart, timePart]);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 7;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 10 }, // 教研组
            { wch: 10 }, // 大项
            { wch: 20 }, // 检查内容
            { wch: 8 },  // 类型
            { wch: 8 },  // 分数
            { wch: 12 }, // 日期
            { wch: 10 }  // 时间
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            ...detailRecords.map(() => ({ hpt: 20 }))
        ];
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },  // 主标题行
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }   // 日期信息行
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const leftAlign = { horizontal: 'left' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化明细');
        const fileName = `个人教学量化明细_${teacherName}_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // 导出PDF功能
    const handleExportPDF = async () => {
        if (!reportRef.current) {
            toast.warning('报表内容未加载，请稍后重试');
            return;
        }
        if (detailRecords.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            
            const imgWidth = pdfWidth - 2 * margin;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const imgData = canvas.toDataURL('image/png');
            
            // 分页逻辑
            let heightLeft = imgHeight;
            let position = margin;
            
            // 第一页
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
            
            // 后续页
            while (heightLeft > 0) {
                pdf.addPage();
                position = heightLeft - imgHeight + margin;
                pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            
            const fileName = `个人教学量化明细_${filters.teacherName}_${filters.dateRange.start}_${filters.dateRange.end}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('PDF导出失败:', error);
            toast.error('PDF导出失败，请重试');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-slate-500 flex items-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    加载中...
                </div>
            </div>
        );
    }

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1">
                        <button 
                            onClick={() => setView('summary')}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            返回概览
                        </button>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 text-center flex-1 whitespace-nowrap">
                        {filters.teacherName} 个人教学量化详情
                    </h2>
                    <div className="flex-1 flex justify-end space-x-2">
                        <button 
                            onClick={handleExportPDF}
                            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            导出PDF
                        </button>
                        <button 
                            onClick={handleExport}
                            className="inline-flex items-center px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            导出Excel
                        </button>
                    </div>
                </div>

                {/* PDF导出内容区域 - 包含统计卡片和表格 */}
                <div ref={reportRef} className="space-y-6 bg-white p-6 rounded-xl">
                    {/* 标题区域 */}
                    <div className="text-center border-b border-slate-200 pb-4">
                        <h1 className="text-2xl font-bold text-slate-900">{filters.teacherName} 个人教学量化明细</h1>
                        <p className="text-sm text-slate-500 mt-2">日期范围: {filters.dateRange.start} 至 {filters.dateRange.end}</p>
                    </div>

                    {/* 统计卡片 */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-5 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-blue-600 font-medium">总记录数</p>
                                    <p className="text-2xl font-bold text-blue-700 mt-1">{detailRecords.length}</p>
                                </div>
                                <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                                    <ClipboardList className="w-6 h-6 text-blue-600" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-5 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-green-600 font-medium">加分记录</p>
                                    <p className="text-2xl font-bold text-green-700 mt-1">
                                        {detailRecords.filter((r: TeachingDetailRecord) => r.type === '加分').length}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-green-600" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 p-5 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-red-600 font-medium">扣分记录</p>
                                    <p className="text-2xl font-bold text-red-700 mt-1">
                                        {detailRecords.filter((r: TeachingDetailRecord) => r.type === '减分').length}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-red-200 rounded-full flex items-center justify-center">
                                    <TrendingDown className="w-6 h-6 text-red-600" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-5 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-purple-600 font-medium">涉及检查项</p>
                                    <p className="text-2xl font-bold text-purple-700 mt-1">
                                        {new Set(detailRecords.map((r: TeachingDetailRecord) => r.checkItem)).size}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                                    <BookOpen className="w-6 h-6 text-purple-600" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detail Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800">详细记录列表</h3>
                                <p className="text-xs text-slate-500 mt-0.5">所有教学量化记录明细</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">教研组</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">大项</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">检查内容</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">类型</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">分数</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">时间</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {detailRecords.map((record: TeachingDetailRecord) => {
                                        const indicatorInfo = getIndicatorInfo(record);
                                        return (
                                            <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-900">{record.group}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                        {indicatorInfo.majorCategory}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={indicatorInfo.indicatorName}>
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                        {indicatorInfo.indicatorName}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        record.type === '加分' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {record.type === '加分' ? '加分项' : '扣分项'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center font-semibold">
                                                    <span className={record.type === '加分' ? 'text-green-600' : 'text-red-600'}>
                                                        {record.type === '加分' ? '+' : ''}{record.score}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">{record.time}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                                共 <span className="font-medium">{detailRecords.length}</span> 条记录
                            </div>
                            <div className="flex items-center space-x-2">
                                <select className="border-slate-300 rounded-lg text-sm py-1.5 focus:ring-blue-500 focus:border-blue-500">
                                    <option>10条/页</option>
                                    <option>20条/页</option>
                                    <option>50条/页</option>
                                </select>
                                <button className="px-3 py-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">&lt;</button>
                                <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium">1</button>
                                <button className="px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">&gt;</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header/Filter - 优化后的筛选区 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center">
                            <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
                            教师个人量化考核报表
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">基于教学量化检查明细生成 · 实时数据更新</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={fetchData}
                            disabled={loading}
                            className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            刷新
                        </button>
                        <button 
                            onClick={() => setView('detail')}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            查看明细
                        </button>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-start gap-4 pt-4 border-t border-slate-100">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">学校</label>
                        <div className="relative">
                            <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select 
                                className="min-w-[140px] w-auto pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                value={filters.schoolId}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const schoolId = parseInt(e.target.value);
                                    setFilters(prev => ({...prev, schoolId}));
                                    // 联动：加载该学校的年级、教研组和教师
                                    loadGrades(schoolId);
                                }}
                            >
                                {filterOptions.schools.map((school) => (
                                    <option key={school.id} value={school.id}>{school.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">年级</label>
                        <div className="relative">
                            <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select 
                                className="min-w-[100px] w-auto pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                value={filters.gradeId}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const gradeId = parseInt(e.target.value);
                                    setFilters(prev => ({...prev, gradeId}));
                                    // 联动：加载该年级的教研组和教师
                                    loadGroups(filters.schoolId, gradeId);
                                }}
                            >
                                {filterOptions.grades.map((grade) => (
                                    <option key={grade.id} value={grade.id}>{grade.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">教研组</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select 
                                className="min-w-[120px] w-auto pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                value={filters.group}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const group = e.target.value;
                                    setFilters(prev => ({...prev, group}));
                                    // 联动：根据教研组过滤教师列表
                                    if (group) {
                                        loadTeachers(filters.schoolId, filters.gradeId, group);
                                    }
                                }}
                                disabled={filterOptions.groups.length === 0}
                            >
                                {filterOptions.groups.length === 0 ? (
                                    <option value="">暂无教研组</option>
                                ) : (
                                    filterOptions.groups.map((group: string) => (
                                        <option key={group} value={group}>{group}</option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">教师</label>
                        <div className="relative">
                            <Award className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select 
                                className="min-w-[100px] w-auto pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                value={filters.teacherId || ''}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const teacherId = parseInt(e.target.value) || 0;
                                    const teacher = filterOptions.teachers.find(t => t.id === teacherId);
                                    setFilters(prev => ({
                                        ...prev, 
                                        teacherId,
                                        teacherName: teacher?.name || ''
                                    }));
                                    // 加载教师详情
                                    loadTeacherDetail(teacherId);
                                }}
                                disabled={filterOptions.teachers.length === 0}
                            >
                                {filterOptions.teachers.length === 0 ? (
                                    <option value="">暂无教师</option>
                                ) : (
                                    filterOptions.teachers.map((teacher) => (
                                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>
                    {/* 时间范围选择器 */}
                    <DateRangePicker 
                        value={filters.dateRange}
                        onChange={(dateRange: { start: string; end: string }) => setFilters({...filters, dateRange})}
                    />
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <Filter className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-600">项目筛选:</span>
                            <select 
                                className="text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                value={filters.category}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, category: e.target.value})}
                            >
                                <option value="all">全部项目</option>
                                <option value="design">教学设计</option>
                                <option value="quality">教研质量</option>
                                <option value="guide">导纲制作</option>
                                <option value="exercise">习题组编</option>
                                <option value="process">授课过程</option>
                                <option value="selfStudy">学科自习</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={() => {
                                const defaultSchool = filterOptions.schools[0]?.id || 1;
                                const defaultGrade = filterOptions.grades[0]?.id || 1;
                                const defaultTeacher = filterOptions.teachers[0];
                                setFilters({
                                    schoolId: defaultSchool,
                                    gradeId: defaultGrade,
                                    group: defaultTeacher?.group || '语文',
                                    teacherId: defaultTeacher?.id || 1,
                                    teacherName: defaultTeacher?.name || '白少桐',
                                    dateRange: getBeijingWeekRange(),
                                    category: 'all'
                                });
                            }}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            重置
                        </button>
                        <button 
                            onClick={fetchData}
                            disabled={loading}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                            查询
                        </button>
                        <button 
                            onClick={handleExportPDF}
                            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            导出PDF
                        </button>
                        <button 
                            onClick={handleExport}
                            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            导出Excel
                        </button>
                    </div>
                </div>
            </div>

            {/* PDF导出内容区域 */}
            <div ref={reportRef} className="space-y-6 bg-white p-6 rounded-xl">
                {/* 标题区域 */}
                <div className="text-center border-b border-slate-200 pb-4">
                    <h1 className="text-2xl font-bold text-slate-900">{filters.teacherName} 个人教学量化报表</h1>
                    <p className="text-sm text-slate-500 mt-2">日期范围: {filters.dateRange.start} 至 {filters.dateRange.end}</p>
                </div>

                {/* Info Banner - 教师信息卡片 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center space-x-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                        {filters.teacherName.charAt(0)}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{filters.teacherName}</h1>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {/* 教研组（学科） */}
                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                                {teacherDetail?.subject || filters.group || '暂无学科'}
                            </span>
                            {/* 任教年级 */}
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm">
                                {teacherDetail?.grades || filterOptions.grades.find(g => g.id === filters.gradeId)?.name || '暂无年级'}
                            </span>
                            {/* 任教班级 - 从学校管理模块同步 */}
                            {teacherDetail?.teaching_classes && teacherDetail.teaching_classes.length > 0 ? (
                                teacherDetail.teaching_classes.map((cls, idx: number) => (
                                    <span key={idx} className="px-3 py-1 rounded-full bg-green-50 text-green-600 text-sm border border-green-200">
                                        {cls.grade_name}-{cls.class_name}
                                    </span>
                                ))
                            ) : reportData?.teacher?.classes ? (
                                reportData.teacher.classes.map((cls: string, idx: number) => (
                                    <span key={idx} className="px-3 py-1 rounded-full bg-green-50 text-green-600 text-sm border border-green-200">{cls}</span>
                                ))
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-500 mb-1">报告周期</div>
                    <div className="flex items-center space-x-2 text-sm text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{filters.dateRange.start} 至 {filters.dateRange.end}</span>
                    </div>
                    <div className="mt-3">
                        <span className="text-xs text-slate-400">总得分</span>
                        <div className="text-4xl font-bold text-green-500">{reportData?.summary?.total_score || 0}</div>
                        <span className="text-xs text-slate-400">基础分0分</span>
                    </div>
                </div>
            </div>

            {/* Summary Cards - 渐变统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-5 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600 font-medium">加分项</p>
                            <p className="text-3xl font-bold text-green-700 mt-1">+{reportData?.summary?.bonus_score || 0}</p>
                        </div>
                        <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 p-5 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600 font-medium">扣分项</p>
                            <p className="text-3xl font-bold text-red-700 mt-1">{reportData?.summary?.deduction_score || 0}</p>
                        </div>
                        <div className="w-12 h-12 bg-red-200 rounded-full flex items-center justify-center">
                            <TrendingDown className="w-6 h-6 text-red-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-5 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-blue-600 font-medium">检查项目</p>
                            <p className="text-3xl font-bold text-blue-700 mt-1">{reportData?.summary?.check_count || 0}</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                            <ClipboardList className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-5 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-purple-600 font-medium">排名</p>
                            <p className="text-3xl font-bold text-purple-700 mt-1">{reportData?.summary?.rank || 1}</p>
                        </div>
                        <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                            <Award className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Table - 调用biz_teaching_record数据表内容 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-slate-800">详细评分列表</h3>
                        <p className="text-xs text-slate-500 mt-0.5">各项检查项目的得分详情</p>
                    </div>
                    <button
                        onClick={() => setView('detail')}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors"
                    >
                        查看全部
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">序号</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">检查项目</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">检查内容</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">得分情况</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">备注</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {detailRecords.length > 0 ? detailRecords.map((record, index) => {
                                const indicatorInfo = getIndicatorInfo(record);
                                return (
                                    <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-500 text-center">{index + 1}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-slate-800 text-center">
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                {indicatorInfo.majorCategory}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                {indicatorInfo.indicatorName}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`font-bold text-lg ${record.type === '减分' ? 'text-red-500' : 'text-green-500'}`}>
                                                {record.type === '减分' ? '-' : '+'}{record.score}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400 text-center">
                                            {record.time}
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        暂无检查记录数据
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </div>
        </div>
    );
};

// 教学指标类型
interface TeachingIndicator {
    id: number;
    major_category: string;
    name: string;
    type: string;
    default_score: number;
    is_enabled: number;
    org_id: number | null;
    org_name: string;
}

const TeachingGradeReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [loadingSchools, setLoadingSchools] = useState(false);
    
    // 用于PDF导出的ref
    const reportRef = useRef<HTMLDivElement>(null);
    
    // 筛选状态
    const [schools, setSchools] = useState<Array<{id: number; name: string}>>([]);
    const [grades, setGrades] = useState<Array<{id: number; name: string}>>([]);
    const [selectedSchool, setSelectedSchool] = useState<number>(0);
    const [selectedGrade, setSelectedGrade] = useState<number>(0);
    const [dateRange, setDateRange] = useState<{start: string; end: string}>({ start: '', end: '' });
    const { toast } = useToast();
    const { confirm } = useConfirm();

    // 教学指标状态
    const [teachingIndicators, setTeachingIndicators] = useState<TeachingIndicator[]>([]);
    const [loadingIndicators, setLoadingIndicators] = useState(false);
    
    // 大项列表（使用后端返回的排序顺序）
    const [majorCategories, setMajorCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    
    const [reportData, setReportData] = useState<GradeTeachingReportResponse | null>(null);
    const [gradeTeachers, setGradeTeachers] = useState<TeacherMetric[]>([]);
    const [detailRecords, setDetailRecords] = useState<GradeTeachingDetailRecord[]>([]);
    const [detailPagination, setDetailPagination] = useState({ page: 1, pageSize: 20, total: 0 });
    const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null);
    
    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);
    
    // 初始化日期（本周）
    useEffect(() => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
    }, []);

    // 加载学校列表
    useEffect(() => {
        let isMounted = true;
        
        const loadSchools = async () => {
            console.log('Loading schools...');
            setLoadingSchools(true);
            try {
                const response = await api.get<{schools: Array<{id: number; name: string}>}>('/api/schools/list', {
                    params: { page_size: 100 }
                });
                console.log('Schools response:', response);
                if (isMounted && response && response.schools) {
                    setSchools(response.schools);
                    if (response.schools.length > 0) {
                        console.log('Setting selectedSchool to:', response.schools[0].id);
                        setSelectedSchool(response.schools[0].id);
                    }
                }
            } catch (error) {
                console.error('Failed to load schools:', error);
            } finally {
                if (isMounted) {
                    console.log('Finished loading schools, setting loadingSchools to false');
                    setLoadingSchools(false);
                }
            }
        };
        
        loadSchools();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载年级列表（当学校变化时）
    useEffect(() => {
        if (!selectedSchool) return;
        
        const loadGrades = async () => {
            try {
                const response = await api.get<Array<{id: number; name: string}>>(`/api/schools/${selectedSchool}/grades`);
                if (response && response.length > 0) {
                    setGrades(response);
                    // 学校切换时，重置年级为新学校的第一个年级
                    setSelectedGrade(response[0].id);
                } else {
                    console.log('No grades found for school:', selectedSchool);
                    setGrades([]);
                    setSelectedGrade(0);
                }
            } catch (error) {
                console.error('Failed to load grades:', error);
            }
        };
        loadGrades();
    }, [selectedSchool]);

    // 加载教学指标
    useEffect(() => {
        let isMounted = true;
        
        const loadTeachingIndicators = async () => {
            setLoadingIndicators(true);
            try {
                const response = await api.get<{indicators: TeachingIndicator[]}>('/api/moral/teaching-indicators/all');
                if (isMounted && response && response.indicators) {
                    setTeachingIndicators(response.indicators);
                }
            } catch (error) {
                console.error('Failed to load teaching indicators:', error);
            } finally {
                if (isMounted) {
                    setLoadingIndicators(false);
                }
            }
        };
        
        loadTeachingIndicators();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载所有大项（不管是否有检查记录都显示）
    useEffect(() => {
        let isMounted = true;
        
        const loadMajorCategories = async () => {
            setLoadingCategories(true);
            try {
                const response = await api.get<string[]>('/api/teaching/major-categories');
                if (isMounted && response) {
                    setMajorCategories(response);
                }
            } catch (error) {
                console.error('Failed to load major categories:', error);
            } finally {
                if (isMounted) {
                    setLoadingCategories(false);
                }
            }
        };
        
        loadMajorCategories();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载评价内容
    useEffect(() => {
        if (!selectedGrade || !dateRange.start || !dateRange.end) return;
        
        const loadEvaluation = async () => {
            try {
                const response = await api.get<{evaluation: string}>('/api/teaching/reports/grade/evaluation', {
                    params: {
                        grade_id: selectedGrade,
                        start_date: dateRange.start,
                        end_date: dateRange.end
                    }
                });
                if (response) {
                    setEvaluation(response.evaluation || '');
                }
            } catch (error) {
                console.error('Failed to load evaluation:', error);
            }
        };
        loadEvaluation();
    }, [selectedGrade, dateRange.start, dateRange.end]);

    // 加载年级报表数据
    useEffect(() => {
        if (!selectedGrade || !dateRange.start || !dateRange.end) {
            // 如果条件不满足但loading为true，设置loading为false
            if (loading) {
                setLoading(false);
            }
            return;
        }
        
        const loadGradeReport = async () => {
            try {
                setLoading(true);
                console.log('Loading grade report for:', { selectedGrade, dateRange });
                const response = await api.get<any>('/api/teaching/reports/grade', {
                    params: {
                        grade_id: selectedGrade,
                        start_date: dateRange.start,
                        end_date: dateRange.end
                    }
                });
                console.log('Grade report response:', response);

                if (response) {
                    setReportData(response);
                    const teachersData = response.teachers || [];
                    // 保存动态大项列表
                    const categories = response.major_categories || [];
                    
                    if (teachersData.length > 0) {
                        // 转换教师数据格式（使用动态metrics）
                        const teachers = teachersData.map((teacher: any) => ({
                            id: teacher.id?.toString() || '0',
                            group: teacher.group || '',
                            name: teacher.name || '',
                            metrics: teacher.metrics || {},
                            personalScore: teacher.total_score || 0,
                            personalRank: teacher.rank || 1,
                            subjectScore: teacher.subject_total_score || 0,
                            subjectRank: teacher.subject_rank || 1
                        }));
                        setGradeTeachers(teachers);
                        // 使用后端返回的大项列表（保持排序顺序）
                        if (categories.length > 0) {
                            setMajorCategories(categories);
                        }
                    } else {
                        // API返回空数据，清空教师列表
                        setGradeTeachers([]);
                    }
                } else {
                    // API无响应，清空数据
                    setReportData(null);
                    setGradeTeachers([]);
                }
            } catch (error) {
                console.error('Failed to load grade report:', error);
                // 请求失败时清空数据，不使用mock数据
                setReportData(null);
                setGradeTeachers([]);
            } finally {
                setLoading(false);
            }
        };

        loadGradeReport();
    }, [selectedGrade, dateRange.start, dateRange.end]);

    // 加载详情数据
    const loadDetailData = async (page: number = 1) => {
        if (!selectedGrade) return;
        
        try {
            const response = await api.get<{
                details: any[];
                pagination: { page: number; page_size: number; total: number }
            }>('/api/teaching/reports/grade/details', {
                params: {
                    grade_id: selectedGrade,
                    teacher_id: selectedTeacher || undefined,
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    page,
                    page_size: detailPagination.pageSize
                }
            });

            if (response) {
                setDetailRecords(response.details || []);
                setDetailPagination({
                    page: response.pagination.page,
                    pageSize: response.pagination.page_size,
                    total: response.pagination.total
                });
            }
        } catch (error) {
            console.error('Failed to load detail data:', error);
        }
    };

    // 切换到详情视图时加载数据
    useEffect(() => {
        if (view === 'detail') {
            loadDetailData(1);
        }
    }, [view, selectedGrade, selectedTeacher, dateRange.start, dateRange.end]);

    // 导出Excel - 汇总视图
    const handleExportSummary = () => {
        if (gradeTeachers.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        const gradeName = reportData?.grade_name || grades.find(g => g.id === selectedGrade)?.name || '年级';
        const schoolName = schools.find(s => s.id === selectedSchool)?.name || '学校';
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`${schoolName}${gradeName}教学量化表`]);
        
        // 日期行
        tableData.push([`年级: ${gradeName}    日期: ${startDate} 至 ${endDate}`]);
        
        // 表头行 - 教研组、姓名、各指标大项、个人得分、个人排名、学科得分、学科排名
        const headerRow = ['教研组', '姓名', ...majorCategories, '个人得分', '个人排名', '学科得分', '学科排名'];
        tableData.push(headerRow);
        
        // 数据行 - 按学科分组
        const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
        subjects.forEach(subject => {
            const teachers = gradeTeachers.filter(t => t.group === subject);
            teachers.forEach((teacher, idx) => {
                const row: any[] = [];
                if (idx === 0) {
                    row.push(subject); // 教研组
                } else {
                    row.push(''); // 教研组单元格合并时留空
                }
                row.push(teacher.name); // 姓名
                
                // 各大项得分
                majorCategories.forEach(category => {
                    row.push(teacher.metrics?.[category] ?? 0);
                });
                
                row.push(teacher.personalScore); // 个人得分
                row.push(teacher.personalRank); // 个人排名
                
                if (idx === 0) {
                    row.push(teacher.subjectScore); // 学科得分
                    row.push(teacher.subjectRank); // 学科排名
                } else {
                    row.push(''); // 学科得分合并时留空
                    row.push(''); // 学科排名合并时留空
                }
                
                tableData.push(row);
            });
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = headerRow.length;
        
        // 设置列宽
        const colWidths = [
            { wch: 10 }, // 教研组
            { wch: 10 }, // 姓名
            ...majorCategories.map(() => ({ wch: 10 })), // 各大项
            { wch: 10 }, // 个人得分
            { wch: 10 }, // 个人排名
            { wch: 10 }, // 学科得分
            { wch: 10 }  // 学科排名
        ];
        ws['!cols'] = colWidths;
        
        // 合并单元格
        const merges: any[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // 标题行
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }  // 日期行
        ];
        
        // 教研组、学科得分、学科排名的合并单元格
        subjects.forEach(subject => {
            const teachers = gradeTeachers.filter(t => t.group === subject);
            if (teachers.length > 1) {
                const startRow = tableData.findIndex((row, idx) => idx > 2 && row[0] === subject);
                if (startRow > 0) {
                    // 教研组合并
                    merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow + teachers.length - 1, c: 0 } });
                    // 学科得分合并
                    merges.push({ s: { r: startRow, c: totalCols - 2 }, e: { r: startRow + teachers.length - 1, c: totalCols - 2 } });
                    // 学科排名合并
                    merges.push({ s: { r: startRow, c: totalCols - 1 }, e: { r: startRow + teachers.length - 1, c: totalCols - 1 } });
                }
            }
        });
        ws['!merges'] = merges;
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化汇总');
        const fileName = `${schoolName}_${gradeName}_教学量化汇总_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 详情视图
    const handleExportDetail = () => {
        if (detailRecords.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        const gradeName = reportData?.grade_name || '年级';
        const schoolName = schools.find(s => s.id === selectedSchool)?.name || '学校';
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`${schoolName} ${gradeName} 教学量化详情`]);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['班级', '教研组', '老师', '大项', '检查内容', '类型', '分数', '日期', '时间']);
        
        // 数据行
        detailRecords.forEach((r: any) => {
            const dateTimeStr = r.time || '';
            const datePart = dateTimeStr.split(' ')[0] || '';
            const timePart = dateTimeStr.split(' ')[1] || dateTimeStr;
            tableData.push([
                r.class_name || '-', 
                r.group, 
                r.teacher, 
                r.major_category || r.checkItem, 
                r.content, 
                r.type, 
                r.score,
                datePart,
                timePart
            ]);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 9;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 10 }, // 班级
            { wch: 10 }, // 教研组
            { wch: 10 }, // 老师
            { wch: 10 }, // 大项
            { wch: 20 }, // 检查内容
            { wch: 8 },  // 类型
            { wch: 8 },  // 分数
            { wch: 12 }, // 日期
            { wch: 10 }  // 时间
        ];
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化详情');
        const fileName = `${schoolName}_${gradeName}_教学量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 根据视图选择导出方法
    const handleExport = () => {
        if (view === 'summary') {
            handleExportSummary();
        } else {
            handleExportDetail();
        }
    };

    // 导出PDF功能
    const handleExportPDF = async () => {
        if (!reportRef.current || detailRecords.length === 0) return;
        
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            
            const imgWidth = pdfWidth - 2 * margin;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const imgData = canvas.toDataURL('image/png');
            
            let heightLeft = imgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - 2 * margin);
            
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= (pdfHeight - 2 * margin);
            }
            
            const gradeName = reportData?.grade_name || '年级';
            const fileName = `${gradeName}_教学量化_${dateRange.start}_${dateRange.end}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('PDF导出失败:', error);
            toast.error('PDF导出失败，请重试');
        }
    };

    // 保存评价
    const handleSaveEvaluation = async () => {
        if (!selectedGrade || !dateRange.start || !dateRange.end) return;
        
        try {
            setSavingEvaluation(true);
            await api.post('/api/teaching/reports/grade/evaluation', null, {
                params: {
                    grade_id: selectedGrade,
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    evaluation
                }
            });
            toast.success('评价保存成功');
        } catch (error) {
            console.error('Failed to save evaluation:', error);
            toast.error('评价保存失败');
        } finally {
            setSavingEvaluation(false);
        }
    };

    // 查询按钮
    const handleQuery = () => {
        // 数据会在useEffect中自动重新加载
    };

    // 重置按钮
    const handleReset = () => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
        if (schools.length > 0) {
            setSelectedSchool(schools[0].id);
        }
    };

    if (loading || loadingSchools) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-slate-500">加载中...</div>
            </div>
        );
    }

    if (view === 'detail') {
        return (
             <div className="space-y-6">
                <div className="flex items-center justify-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                    <h2 className="text-2xl font-bold text-slate-900 text-center whitespace-nowrap">{reportData?.grade_name || '年级'} 教学量化详情</h2>
                    <div className="absolute right-6 flex space-x-3">
                         <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <ArrowLeft className="w-4 h-4 mr-1" />
                             返回
                         </button>
                         <button onClick={handleExportPDF} className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 flex items-center">
                             <FileText className="w-4 h-4 mr-1" />
                             导出PDF
                         </button>
                         <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center">
                             <Download className="w-4 h-4 mr-1" />
                             导出Excel
                         </button>
                    </div>
                </div>

                <div ref={reportRef} className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">班级</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">教研组</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">老师</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">大项</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider w-1/3">检查内容</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">加分/减分</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">分数</th>
                                <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">时间</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {detailRecords.length > 0 ? detailRecords.map((record: any) => (
                                <tr key={record.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm text-center text-slate-900">{record.class_name || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-900">{record.group}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-900">{record.teacher}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-900">{record.major_category || record.checkItem}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-600">{record.content}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-600">{record.type}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-900">{record.score}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-500">{record.time}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">暂无数据</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                       <span>共 {detailPagination.total} 条</span>
                       <select 
                            className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            value={detailPagination.pageSize}
                            onChange={(e) => {
                                setDetailPagination({...detailPagination, pageSize: Number(e.target.value)});
                            }}
                       >
                           <option value={10}>10条/页</option>
                           <option value={20}>20条/页</option>
                           <option value={50}>50条/页</option>
                       </select>
                       <button 
                            className={`px-2 py-1 ${detailPagination.page <= 1 ? 'text-slate-300' : 'text-slate-400 hover:text-blue-600'}`}
                            disabled={detailPagination.page <= 1}
                            onClick={() => loadDetailData(detailPagination.page - 1)}
                       >&lt;</button>
                       {Array.from({length: Math.min(5, Math.ceil(detailPagination.total / detailPagination.pageSize))}, (_, i) => {
                           const page = i + 1;
                           return (
                               <button 
                                    key={page}
                                    className={`px-2 py-1 ${detailPagination.page === page ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-blue-600'}`}
                                    onClick={() => loadDetailData(page)}
                               >{page}</button>
                           );
                       })}
                       <button 
                            className={`px-2 py-1 ${detailPagination.page >= Math.ceil(detailPagination.total / detailPagination.pageSize) ? 'text-slate-300' : 'text-slate-400 hover:text-blue-600'}`}
                            disabled={detailPagination.page >= Math.ceil(detailPagination.total / detailPagination.pageSize)}
                            onClick={() => loadDetailData(detailPagination.page + 1)}
                       >&gt;</button>
                       <span>前往</span>
                       <input 
                            type="text" 
                            defaultValue={detailPagination.page} 
                            className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const page = parseInt((e.target as HTMLInputElement).value);
                                    if (page >= 1 && page <= Math.ceil(detailPagination.total / detailPagination.pageSize)) {
                                        loadDetailData(page);
                                    }
                                }
                            }}
                       />
                       <span>页</span>
                    </div>
                </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                 <h2 className="text-xl font-bold text-center text-slate-800">
                     {schools.find(s => s.id === selectedSchool)?.name || ''}{grades.find(g => g.id === selectedGrade)?.name || reportData?.grade_name || '年级'} 教学量化表
                 </h2>
                 
                 <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-end gap-4">
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">学校</label>
                              <div className="relative">
                                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <select 
                                    className="min-w-[180px] max-w-[280px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={selectedSchool}
                                    onChange={(e) => setSelectedSchool(Number(e.target.value))}
                                  >
                                      {schools.map(school => (
                                          <option key={school.id} value={school.id}>{school.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">年级</label>
                              <div className="relative">
                                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <select 
                                    className="min-w-[120px] max-w-[160px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={selectedGrade}
                                    onChange={(e) => setSelectedGrade(Number(e.target.value))}
                                  >
                                      {grades.map(grade => (
                                          <option key={grade.id} value={grade.id}>{grade.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          <DateRangePicker value={dateRange} onChange={setDateRange} />
                      </div>
                      <div className="flex space-x-2">
                          <button onClick={handleQuery} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">查询</button>
                          <button onClick={handleReset} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">重置</button>
                          <button onClick={handleExport} className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">导出Excel</button>
                          <button 
                             onClick={() => setView('detail')}
                             className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                          >
                             详情页
                          </button>
                      </div>
                 </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                 <div className="min-w-[1500px] p-4">
                    <div className="text-center font-bold text-slate-800 mb-2">
                        {schools.find(s => s.id === selectedSchool)?.name || ''}{grades.find(g => g.id === selectedGrade)?.name || reportData?.grade_name || '年级'} 教学量化表
                    </div>
                    <div className="text-right text-xs text-slate-500 mb-2">
                        年级: {grades.find(g => g.id === selectedGrade)?.name || reportData?.grade_name || '年级'} &nbsp;&nbsp; 
                        日期: {dateRange.start} 至 {dateRange.end}
                    </div>
                    
                    <table className="w-full border-collapse border border-slate-300 text-xs">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-100 text-slate-600">教研组</th>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-100 text-slate-600">姓名</th>
                                {loadingCategories ? (
                                    <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600" colSpan={20}>加载中...</th>
                                ) : majorCategories.length > 0 ? (
                                    majorCategories.map((category, index) => (
                                        <th key={index} className="border border-slate-300 px-1 py-2 font-medium text-slate-600">
                                            {category}
                                        </th>
                                    ))
                                ) : (
                                    <>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学设计</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教研质量</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">导纲制作</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题组编</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">授课过程</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">学科自习</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题批阅</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">成绩贴评</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学进度</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">听课评课</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">辅导督促</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">办公纪律</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">赞美激励</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">卫生摆摆</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">查课管理</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">板书设计</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">英语口语</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">小组建设</th>
                                    </>
                                )}
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-50 text-slate-800">个人得分</th>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-50 text-slate-800">个人排名</th>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-50 text-slate-800">学科得分</th>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-50 text-slate-800">学科排名</th>
                            </tr>
                        </thead>
                        <tbody>
                             {['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'].map(subject => {
                                 const teachers = gradeTeachers.filter(t => t.group === subject);
                                 return teachers.map((teacher, idx) => (
                                     <tr key={teacher.id} className="text-center hover:bg-slate-50">
                                         {idx === 0 && (
                                             <td rowSpan={teachers.length} className="border border-slate-300 px-2 py-2 bg-white font-medium text-slate-700">
                                                 {teacher.group}
                                             </td>
                                         )}
                                        <td className="border border-slate-300 px-2 py-2 text-slate-800">{teacher.name}</td>
                                        {majorCategories.length > 0 ? (
                                            majorCategories.map((category, index) => (
                                                <td key={index} className="border border-slate-300 px-1 py-2 text-slate-600">
                                                    {teacher.metrics?.[category] ?? 0}
                                                </td>
                                            ))
                                        ) : (
                                            <td className="border border-slate-300 px-1 py-2 text-slate-600" colSpan={5}>暂无指标数据</td>
                                        )}
                                         <td className="border border-slate-300 px-2 py-2 text-slate-800">{teacher.personalScore}</td>
                                         <td className="border border-slate-300 px-2 py-2 text-slate-800">{teacher.personalRank}</td>
                                         {idx === 0 && (
                                              <td rowSpan={teachers.length} className="border border-slate-300 px-2 py-2 bg-white text-slate-600">
                                                  {teacher.subjectScore}
                                              </td>
                                         )}
                                          {idx === 0 && (
                                              <td rowSpan={teachers.length} className="border border-slate-300 px-2 py-2 bg-white text-slate-600">
                                                  {teacher.subjectRank}
                                              </td>
                                         )}
                                     </tr>
                                 ));
                             })}
                        </tbody>
                    </table>
                 </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-800 border-l-4 border-blue-500 pl-3">分析评价</h3>
                
                <div className="relative">
                    <textarea 
                       className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none placeholder-slate-400 bg-white"
                       placeholder="请输入分析评价内容..."
                       value={evaluation}
                       onChange={(e) => setEvaluation(e.target.value)}
                       maxLength={2000}
                    ></textarea>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                </div>

                {hasPermission('teaching:edit') && (
                    <div>
                        <button 
                            onClick={handleSaveEvaluation}
                            disabled={savingEvaluation}
                            className="px-6 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {savingEvaluation ? '保存中...' : '保存评价'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const TeachingSchoolReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [loadingSchools, setLoadingSchools] = useState(false);
    
    // 用于PDF导出的ref
    const reportRef = useRef<HTMLDivElement>(null);
    
    // 筛选状态
    const [schools, setSchools] = useState<Array<{id: number; name: string}>>([]);
    const [selectedSchool, setSelectedSchool] = useState<number>(0);
    const [dateRange, setDateRange] = useState<{start: string; end: string}>({ start: '', end: '' });
    
    // 教学指标大项列表
    const [majorCategories, setMajorCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const { toast } = useToast();
    const { confirm } = useConfirm();

    const [reportData, setReportData] = useState<SchoolTeachingReportResponse | null>(null);
    const [schoolGrades, setSchoolGrades] = useState<SchoolTeachingMetric[]>([]);  // 初始为空，等待API返回
    const [detailRecords, setDetailRecords] = useState<SchoolTeachingDetailRecord[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPagination, setDetailPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1
    });
    
    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);
    
    // 初始化日期（本周）
    useEffect(() => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
    }, []);

    // 加载学校列表
    useEffect(() => {
        let isMounted = true;
        
        const loadSchools = async () => {
            setLoadingSchools(true);
            try {
                const response = await api.get<{schools: Array<{id: number; name: string}>}>('/api/schools/list', {
                    params: { page_size: 100 }
                });
                if (isMounted && response && response.schools) {
                    setSchools(response.schools);
                    if (response.schools.length > 0) {
                        setSelectedSchool(response.schools[0].id);
                    }
                }
            } catch (error) {
                console.error('Failed to load schools:', error);
            } finally {
                if (isMounted) {
                    setLoadingSchools(false);
                }
            }
        };
        
        loadSchools();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载教学指标大项列表
    useEffect(() => {
        let isMounted = true;
        
        const loadMajorCategories = async () => {
            setLoadingCategories(true);
            try {
                const response = await api.get<string[]>('/api/teaching/major-categories');
                if (isMounted && response) {
                    setMajorCategories(response);
                }
            } catch (error) {
                console.error('Failed to load major categories:', error);
                // 使用默认大项作为后备
                setMajorCategories(['教学设计', '教研质量', '导纲制作', '习题组编', '授课过程', '学科自习', 
                    '习题批阅', '成绩贴评', '教学进度', '听课评课', '辅导督促', '办公纪律', '赞美激励', 
                    '卫生摆摆', '查课管理', '板书设计', '英语口语', '小组建设']);
            } finally {
                if (isMounted) {
                    setLoadingCategories(false);
                }
            }
        };
        
        loadMajorCategories();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载校级报表数据
    useEffect(() => {
        // 确保 selectedSchool 是有效的正整数，且日期已初始化
        if (!selectedSchool || selectedSchool <= 0 || !dateRange.start || !dateRange.end) {
            if (loading) setLoading(false);
            return;
        }
        
        const loadSchoolReport = async () => {
            try {
                setLoading(true);
                console.log('=== [校级报表] Loading with params:', {
                    school_id: selectedSchool,
                    start_date: dateRange.start,
                    end_date: dateRange.end
                });
                const response = await api.get<SchoolTeachingReportResponse>('/api/teaching/reports/school', {
                    params: {
                        school_id: selectedSchool,
                        start_date: dateRange.start,
                        end_date: dateRange.end
                    }
                });

                console.log('=== [校级报表] Response:', response);
                console.log('=== [校级报表] grades count:', response?.grades?.length || 0);

                if (response && response.grades) {
                    setReportData(response);
                    
                    // 使用后端返回的大项列表
                    const categories = response.major_categories || [];
                    if (categories.length > 0) {
                        setMajorCategories(categories);
                    }

                    // 转换年级数据格式（使用动态metrics）
                    const grades = response.grades.map((grade: any) => ({
                        grade: grade.grade_name,
                        metrics: grade.metrics || {},
                        // 保留向后兼容的字段
                        design: grade.metrics?.design || 0,
                        quality: grade.metrics?.quality || 0,
                        guide: grade.metrics?.guide || 0,
                        exercise: grade.metrics?.exercise || 0,
                        process: grade.metrics?.process || 0,
                        selfStudy: grade.metrics?.selfStudy || 0,
                        marking: grade.metrics?.marking || 0,
                        posting: grade.metrics?.posting || 0,
                        progress: grade.metrics?.progress || 0,
                        listening: grade.metrics?.listening || 0,
                        tutoring: grade.metrics?.tutoring || 0,
                        officeDisc: grade.metrics?.officeDisc || 0,
                        praise: grade.metrics?.praise || 0,
                        hygiene: grade.metrics?.hygiene || 0,
                        check: grade.metrics?.check || 0,
                        board: grade.metrics?.board || 0,
                        oral: grade.metrics?.oral || 0,
                        team: grade.metrics?.team || 0,
                        gradeScore: grade.total_score || 0,
                        gradeRank: grade.rank || 1
                    }));

                    // 始终更新年级数据，即使为空数组
                    setSchoolGrades(grades.length > 0 ? grades : []);
                } else {
                    // 如果没有数据，清空年级列表
                    setSchoolGrades([]);
                }
            } catch (error) {
                console.error('Failed to load school report:', error);
                // 错误时也清空数据，而不是使用默认数据
                setSchoolGrades([]);
            } finally {
                setLoading(false);
            }
        };

        loadSchoolReport();
    }, [selectedSchool, dateRange.start, dateRange.end]);
    
    // 加载评价内容
    useEffect(() => {
        if (!selectedSchool || !dateRange.start || !dateRange.end) return;
        
        const loadEvaluation = async () => {
            try {
                const response = await api.get<{evaluation: string}>('/api/teaching/reports/school/evaluation', {
                    params: {
                        school_id: selectedSchool,
                        start_date: dateRange.start,
                        end_date: dateRange.end
                    }
                });
                if (response) {
                    setEvaluation(response.evaluation || '');
                }
            } catch (error) {
                console.error('Failed to load evaluation:', error);
            }
        };
        loadEvaluation();
    }, [selectedSchool, dateRange.start, dateRange.end]);
    
    // 保存评价
    const handleSaveEvaluation = async () => {
        if (!selectedSchool || !dateRange.start || !dateRange.end) return;
        
        try {
            setSavingEvaluation(true);
            await api.post('/api/teaching/reports/school/evaluation', null, {
                params: {
                    school_id: selectedSchool,
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    evaluation
                }
            });
            toast.success('评价保存成功');
        } catch (error) {
            console.error('Failed to save evaluation:', error);
            toast.error('评价保存失败');
        } finally {
            setSavingEvaluation(false);
        }
    };

    // 加载详情数据
    const loadDetailData = async (page: number = 1) => {
        if (!selectedSchool || !dateRange.start || !dateRange.end) return;
        
        try {
            setDetailLoading(true);
            const response = await api.get<{
                details: SchoolTeachingDetailRecord[],
                pagination: {
                    page: number,
                    page_size: number,
                    total: number,
                    total_pages: number
                }
            }>('/api/teaching/reports/school/details', {
                params: {
                    school_id: selectedSchool,
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    page,
                    page_size: detailPagination.pageSize
                }
            });
            
            if (response) {
                setDetailRecords(response.details || []);
                setDetailPagination({
                    page: response.pagination?.page || 1,
                    pageSize: response.pagination?.page_size || 20,
                    total: response.pagination?.total || 0,
                    totalPages: response.pagination?.total_pages || 1
                });
            }
        } catch (error) {
            console.error('Failed to load detail data:', error);
            setDetailRecords([]);
        } finally {
            setDetailLoading(false);
        }
    };

    // 当切换到详情页时加载数据
    useEffect(() => {
        if (view === 'detail') {
            loadDetailData(1);
        }
    }, [view, selectedSchool, dateRange.start, dateRange.end]);

    // 查询按钮
    const handleQuery = () => {
        // 数据会在useEffect中自动重新加载
    };

    // 重置按钮
    const handleReset = () => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
        if (schools.length > 0) {
            setSelectedSchool(schools[0].id);
        }
    };

    // 导出Excel - 汇总视图
    const handleExportSummary = () => {
        if (schoolGrades.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        const schoolName = schools.find(s => s.id === selectedSchool)?.name || '学校';
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`${schoolName}教学量化表`]);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头行 - 年级、各指标大项、年级得分、年级排名
        const headerRow = ['年级', ...majorCategories, '年级得分', '年级排名'];
        tableData.push(headerRow);
        
        // 数据行
        schoolGrades.forEach((row) => {
            const dataRow: any[] = [row.grade];
            majorCategories.forEach((category) => {
                dataRow.push(row.metrics?.[category] ?? 0);
            });
            dataRow.push(row.gradeScore);
            dataRow.push(row.gradeRank);
            tableData.push(dataRow);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = headerRow.length;
        
        // 设置列宽
        const colWidths = [
            { wch: 10 }, // 年级
            ...majorCategories.map(() => ({ wch: 10 })), // 各大项
            { wch: 10 }, // 年级得分
            { wch: 10 }  // 年级排名
        ];
        ws['!cols'] = colWidths;
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // 标题行
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }  // 日期行
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化汇总');
        const fileName = `${schoolName}_校级教学量化汇总_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 详情视图
    const handleExportDetail = () => {
        if (detailRecords.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        const schoolName = schools.find(s => s.id === selectedSchool)?.name || '学校';
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`${schoolName} 教学量化详情`]);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['年级', '教研组', '老师', '大项', '检查内容', '类型', '分数', '日期', '时间']);
        
        // 数据行
        detailRecords.forEach((r) => {
            const dateTimeStr = r.time || '';
            const datePart = dateTimeStr.split(' ')[0] || '';
            const timePart = dateTimeStr.split(' ')[1] || dateTimeStr;
            tableData.push([
                r.grade, 
                r.group, 
                r.teacher, 
                r.major_category || r.checkItem, 
                r.content, 
                r.type, 
                r.score,
                datePart,
                timePart
            ]);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 9;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 8 },  // 年级
            { wch: 10 }, // 教研组
            { wch: 10 }, // 老师
            { wch: 10 }, // 大项
            { wch: 20 }, // 检查内容
            { wch: 8 },  // 类型
            { wch: 8 },  // 分数
            { wch: 12 }, // 日期
            { wch: 10 }  // 时间
        ];
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化详情');
        const fileName = `${schoolName}_校级教学量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 根据视图选择导出方法
    const handleExport = () => {
        if (view === 'summary') {
            handleExportSummary();
        } else {
            handleExportDetail();
        }
    };

    // 导出PDF功能
    const handleExportPDF = async () => {
        if (!reportRef.current || detailRecords.length === 0) return;
        
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            
            const imgWidth = pdfWidth - 2 * margin;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const imgData = canvas.toDataURL('image/png');
            
            let heightLeft = imgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - 2 * margin);
            
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= (pdfHeight - 2 * margin);
            }
            
            const schoolName = schools.find(s => s.id === selectedSchool)?.name || '学校';
            const fileName = `${schoolName}_校级教学量化_${dateRange.start}_${dateRange.end}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('PDF导出失败:', error);
            toast.error('PDF导出失败，请重试');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-slate-500">加载中...</div>
            </div>
        );
    }

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                    <h2 className="text-2xl font-bold text-slate-900 text-center whitespace-nowrap">
                        {schools.find(s => s.id === selectedSchool)?.name || '学校'} 教学量化详情
                    </h2>
                    <div className="absolute right-6 flex space-x-3">
                         <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <ArrowLeft className="w-4 h-4 mr-1" />
                             返回
                         </button>
                         <button onClick={handleExportPDF} className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 flex items-center">
                             <FileText className="w-4 h-4 mr-1" />
                             导出PDF
                         </button>
                         <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center">
                             <Download className="w-4 h-4 mr-1" />
                             导出Excel
                         </button>
                    </div>
                </div>

                <div ref={reportRef} className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">年级</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">教研组</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">老师</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">大项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider w-1/3">检查内容</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">加分/减分</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">分数</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">时间</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {detailLoading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-8 text-center text-slate-500">加载中...</td>
                                    </tr>
                                ) : detailRecords.length > 0 ? (
                                    detailRecords.map((record) => (
                                        <tr key={record.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.grade}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.group}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.teacher}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.major_category || record.checkItem}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600">{record.content}</td>
                                        <td className="px-6 py-4 text-sm text-center text-slate-600">{record.type}</td>
                                        <td className="px-6 py-4 text-sm text-center text-slate-900">{record.score}</td>
                                        <td className="px-6 py-4 text-sm text-center text-slate-500">{record.time}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">暂无数据</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                       <span>共 {detailPagination.total} 条</span>
                       <select 
                           className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                           value={detailPagination.pageSize}
                           onChange={(e) => {
                               setDetailPagination(prev => ({...prev, pageSize: parseInt(e.target.value)}));
                               loadDetailData(1);
                           }}
                       >
                           <option value={10}>10条/页</option>
                           <option value={20}>20条/页</option>
                           <option value={50}>50条/页</option>
                       </select>
                       <button 
                           className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
                           disabled={detailPagination.page <= 1}
                           onClick={() => loadDetailData(detailPagination.page - 1)}
                       >&lt;</button>
                       <span className="px-2 py-1 text-blue-600 font-bold">{detailPagination.page}</span>
                       <button 
                           className="px-2 py-1 text-slate-600 hover:text-blue-600 disabled:opacity-50"
                           disabled={detailPagination.page >= detailPagination.totalPages}
                           onClick={() => loadDetailData(detailPagination.page + 1)}
                       >&gt;</button>
                       <span>前往</span>
                       <input 
                           type="number" 
                           min={1}
                           max={detailPagination.totalPages}
                           value={detailPagination.page}
                           onChange={(e) => {
                               const page = parseInt(e.target.value);
                               if (page >= 1 && page <= detailPagination.totalPages) {
                                   loadDetailData(page);
                               }
                           }}
                           className="w-12 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                       />
                       <span>页</span>
                    </div>
                </div>
                </div>
            </div>
        )
    }

  return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                 <h2 className="text-xl font-bold text-center text-slate-800">
                     {schools.find(s => s.id === selectedSchool)?.name || '学校'} 教学量化表
                 </h2>
                 
                 <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-end gap-4">
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">学校</label>
                              <div className="relative">
                                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <select 
                                    className="min-w-[180px] max-w-[280px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={selectedSchool}
                                    onChange={(e) => setSelectedSchool(Number(e.target.value))}
                                  >
                                      {schools.map(school => (
                                          <option key={school.id} value={school.id}>{school.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          <DateRangePicker value={dateRange} onChange={setDateRange} />
                      </div>
                      <div className="flex space-x-2">
                          <button onClick={handleQuery} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">查询</button>
                          <button onClick={handleReset} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">重置</button>
                          <button onClick={handleExport} className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">导出Excel</button>
                          <button 
                             onClick={() => setView('detail')}
                             className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                          >
                             详情页
                          </button>
                      </div>
                 </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                 <div className="min-w-[1500px] p-4">
                    <div className="text-center font-bold text-slate-800 mb-2">
                        {schools.find(s => s.id === selectedSchool)?.name || '学校'} 教学量化表
                    </div>
                    <div className="text-right text-xs text-slate-500 mb-2">
                        日期: {dateRange.start} 至 {dateRange.end}
                    </div>
                    
                    <table className="w-full border-collapse border border-slate-300 text-xs">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-100 text-slate-600">年级</th>
                                {loadingCategories ? (
                                    <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600" colSpan={20}>加载中...</th>
                                ) : majorCategories.length > 0 ? (
                                    majorCategories.map((category, index) => (
                                        <th key={index} className="border border-slate-300 px-1 py-2 font-medium text-slate-600">
                                            {category}
                                        </th>
                                    ))
                                ) : (
                                    <>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学设计</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教研质量</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">导纲制作</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题组编</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">授课过程</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">学科自习</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题批阅</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">成绩贴评</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学进度</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">听课评课</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">辅导督促</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">办公纪律</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">赞美激励</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">卫生摆摆</th>
                                        <th className="border border-slate-300 px-2 py-3 font-medium">查课管理</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">板书设计</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">英语口语</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">小组建设</th>
                                    </>
                                )}
                                <th className="border border-slate-200 px-3 py-3 font-medium bg-slate-50">年级得分</th>
                                <th className="border border-slate-200 px-3 py-3 font-medium bg-slate-50">年级排名</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={majorCategories.length > 0 ? majorCategories.length + 3 : 21} className="px-6 py-8 text-center text-slate-500">
                                        加载中...
                                    </td>
                                </tr>
                            ) : schoolGrades.length > 0 ? (
                                schoolGrades.map((row) => (
                                <tr key={row.grade} className="hover:bg-slate-50 text-slate-600 text-center">
                                    <td className="border border-slate-200 px-3 py-3 font-medium text-slate-800">{row.grade}</td>
                                    {majorCategories.length > 0 ? (
                                        // 按大项分类动态渲染
                                        majorCategories.map((category, index) => (
                                            <td key={index} className="border border-slate-300 px-1 py-2 text-slate-600">
                                                {row.metrics?.[category] ?? 0}
                                            </td>
                                        ))
                                    ) : (
                                        <>
                                            <td className="border border-slate-200 px-2 py-3">{row.design}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.quality}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.guide}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.exercise}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.process}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.selfStudy}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.marking}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.posting}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.progress}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.listening}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.tutoring}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.officeDisc}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.praise}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.hygiene}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.check}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.board}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.oral}</td>
                                            <td className="border border-slate-200 px-2 py-3">{row.team}</td>
                                        </>
                                    )}
                                    <td className="border border-slate-200 px-3 py-3 font-bold text-slate-800">{row.gradeScore}</td>
                                    <td className="border border-slate-200 px-3 py-3 font-bold text-blue-600">{row.gradeRank}</td>
                                </tr>
                            ))
                            ) : (
                                <tr>
                                    <td colSpan={majorCategories.length > 0 ? majorCategories.length + 3 : 21} className="px-6 py-8 text-center text-slate-500">
                                        暂无数据，请检查学校是否配置了年级
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
             </div>

             {/* Analysis Section */}
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                 <h3 className="text-lg font-bold text-slate-800 border-l-4 border-blue-500 pl-3">分析评价</h3>
                 
                 <div className="relative">
                     <textarea 
                        className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none placeholder-slate-400 bg-white"
                        placeholder="请输入分析评价内容..."
                        value={evaluation}
                        onChange={(e) => setEvaluation(e.target.value)}
                        maxLength={2000}
                     ></textarea>
                     <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                 </div>

                 {hasPermission('teaching:edit') && (
                     <div>
                         <button 
                            onClick={handleSaveEvaluation}
                            disabled={savingEvaluation}
                            className="px-6 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             {savingEvaluation ? '保存中...' : '保存评价'}
                         </button>
                     </div>
                 )}
             </div>
        </div>
    )
}

const TeachingProvincialReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<{start: string; end: string}>({ start: '', end: '' });
    
    // 用于PDF导出的ref
    const reportRef = useRef<HTMLDivElement>(null);
    
    // 集团和学校筛选（参考德育模块学区报表设计）
    const [groups, setGroups] = useState<Array<{id: number; name: string}>>([]);
    const [schools, setSchools] = useState<Array<{id: number; name: string; groupId: number}>>([]);
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
    
    // 教学指标大项列表
    const [majorCategories, setMajorCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const { toast } = useToast();
    const { confirm } = useConfirm();

    const [reportData, setReportData] = useState<ProvincialTeachingReportResponse | null>(null);
    const [provinceSchools, setProvinceSchools] = useState<ProvincialTeachingMetric[]>([]);
    const [detailRecords, setDetailRecords] = useState<ProvincialTeachingDetailRecord[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPagination, setDetailPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1
    });
    
    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);

    // 初始化日期（本周）
    useEffect(() => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
    }, []);

    // 加载集团和学校列表（从组织树）
    useEffect(() => {
        let isMounted = true;
        
        const loadFilterOptions = async () => {
            try {
                const response = await api.get('/api/org/tree');
                if (response && Array.isArray(response) && isMounted) {
                    // 提取集团列表
                    const groupsList = response.map((g: any) => ({
                        id: g.id,
                        name: g.name
                    }));
                    
                    // 提取学校列表（包含所属集团ID）
                    const schoolsList: Array<{id: number; name: string; groupId: number}> = [];
                    response.forEach((group: any) => {
                        if (group.children) {
                            group.children.forEach((child: any) => {
                                if (child.type === 'school') {
                                    schoolsList.push({
                                        id: child.id,
                                        name: child.name,
                                        groupId: group.id
                                    });
                                }
                            });
                        }
                    });
                    
                    setGroups(groupsList);
                    setSchools(schoolsList);
                    
                    // 默认全选所有学校
                    if (schoolsList.length > 0 && selectedSchools.length === 0) {
                        setSelectedSchools(schoolsList.map((s) => s.name));
                    }
                }
            } catch (error) {
                console.error('Failed to load filter options:', error);
            }
        };
        
        loadFilterOptions();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 获取当前选中学校的ID列表
    const getSelectedSchoolIds = () => {
        return selectedSchools
            .map((schoolName: string) => {
                const school = schools.find((s) => s.name === schoolName);
                return school?.id;
            })
            .filter((id): id is number => id !== undefined);
    };

    // 获取当前选中集团的ID
    const getSelectedGroupId = () => {
        const selectedGroupObj = groups.find((g) => g.name === selectedGroup);
        return selectedGroupObj?.id;
    };

    // 获取显示文本
    const getSchoolDisplayText = () => {
        if (selectedSchools.length === 0) return '全部校区';
        if (selectedSchools.length === schools.length) return '全部校区';
        if (selectedSchools.length <= 3) {
            return selectedSchools.join('、');
        }
        return `已选 ${selectedSchools.length} 个校区`;
    };

    // 加载教学指标大项列表
    useEffect(() => {
        let isMounted = true;
        
        const loadMajorCategories = async () => {
            setLoadingCategories(true);
            try {
                const response = await api.get<string[]>('/api/teaching/major-categories');
                if (isMounted && response) {
                    setMajorCategories(response);
                }
            } catch (error) {
                console.error('Failed to load major categories:', error);
                setMajorCategories(['教学设计', '教研质量', '导纲制作', '习题组编', '授课过程', '学科自习', 
                    '习题批阅', '成绩贴评', '教学进度', '听课评课', '辅导督促', '办公纪律', '赞美激励', 
                    '卫生摆摆', '查课管理', '板书设计', '英语口语', '小组建设']);
            } finally {
                if (isMounted) {
                    setLoadingCategories(false);
                }
            }
        };
        
        loadMajorCategories();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // 加载学区报表数据
    const loadReportData = async () => {
        if (!dateRange.start || !dateRange.end) return;
        
        try {
            setLoading(true);
            const schoolIds = getSelectedSchoolIds();
            const groupId = getSelectedGroupId();
            
            const params: any = {
                start_date: dateRange.start,
                end_date: dateRange.end
            };
            // 如果有选择学校，传递学校ID列表
            if (schoolIds.length > 0 && schoolIds.length < schools.length) {
                params.school_ids = schoolIds.join(',');
            }
            // 如果有选择集团，传递集团ID
            if (groupId) {
                params.group_id = groupId;
            }
            
            const response = await api.get<ProvincialTeachingReportResponse>('/api/teaching/reports/provincial', {
                params
            });

            if (response && response.schools) {
                setReportData(response);
                
                // 使用后端返回的大项列表
                const categories = response.major_categories || [];
                if (categories.length > 0) {
                    setMajorCategories(categories);
                }

                // 转换学校数据格式（使用动态metrics）
                const schoolsData = response.schools.map((school: any) => ({
                    id: school.id?.toString() || '1',
                    schoolName: school.school_name,
                    metrics: school.metrics || {},
                    // 保留向后兼容的字段
                    design: school.metrics?.design || 0,
                    quality: school.metrics?.quality || 0,
                    guide: school.metrics?.guide || 0,
                    exercise: school.metrics?.exercise || 0,
                    process: school.metrics?.process || 0,
                    selfStudy: school.metrics?.selfStudy || 0,
                    marking: school.metrics?.marking || 0,
                    posting: school.metrics?.posting || 0,
                    progress: school.metrics?.progress || 0,
                    listening: school.metrics?.listening || 0,
                    tutoring: school.metrics?.tutoring || 0,
                    officeDisc: school.metrics?.officeDisc || 0,
                    praise: school.metrics?.praise || 0,
                    hygiene: school.metrics?.hygiene || 0,
                    check: school.metrics?.check || 0,
                    board: school.metrics?.board || 0,
                    oral: school.metrics?.oral || 0,
                    team: school.metrics?.team || 0,
                    schoolScore: school.total_score || 0,
                    schoolRank: school.rank || 1
                }));

                setProvinceSchools(schoolsData.length > 0 ? schoolsData : []);
            } else {
                setProvinceSchools([]);
            }
        } catch (error) {
            console.error('Failed to load provincial report:', error);
            setProvinceSchools([]);
        } finally {
            setLoading(false);
        }
    };

    // 初始加载（日期设置后自动加载）
    useEffect(() => {
        if (dateRange.start && dateRange.end) {
            loadReportData();
        }
    }, [dateRange.start, dateRange.end]);

    // 筛选条件变化时自动加载（集团、学校变化）
    useEffect(() => {
        if (dateRange.start && dateRange.end) {
            loadReportData();
        }
    }, [selectedGroup, selectedSchools]);

    // 加载评价内容
    useEffect(() => {
        if (!dateRange.start || !dateRange.end) return;
        
        const loadEvaluation = async () => {
            try {
                const response = await api.get<{evaluation: string}>('/api/teaching/reports/provincial/evaluation', {
                    params: {
                        start_date: dateRange.start,
                        end_date: dateRange.end
                    }
                });
                if (response) {
                    setEvaluation(response.evaluation || '');
                }
            } catch (error) {
                console.error('Failed to load evaluation:', error);
            }
        };
        loadEvaluation();
    }, [dateRange.start, dateRange.end]);

    // 保存评价
    const handleSaveEvaluation = async () => {
        if (!dateRange.start || !dateRange.end) return;
        
        try {
            setSavingEvaluation(true);
            await api.post('/api/teaching/reports/provincial/evaluation', null, {
                params: {
                    start_date: dateRange.start,
                    end_date: dateRange.end,
                    evaluation
                }
            });
            toast.success('评价保存成功');
        } catch (error) {
            console.error('Failed to save evaluation:', error);
            toast.error('评价保存失败');
        } finally {
            setSavingEvaluation(false);
        }
    };

    // 加载详情数据
    const loadDetailData = async (page: number = 1) => {
        if (!dateRange.start || !dateRange.end) return;
        
        try {
            setDetailLoading(true);
            const schoolIds = getSelectedSchoolIds();
            const groupId = getSelectedGroupId();
            
            const params: any = {
                start_date: dateRange.start,
                end_date: dateRange.end,
                page,
                page_size: detailPagination.pageSize
            };
            if (schoolIds.length > 0 && schoolIds.length < schools.length) {
                params.school_ids = schoolIds.join(',');
            }
            if (groupId) {
                params.group_id = groupId;
            }
            const response = await api.get<{
                details: ProvincialTeachingDetailRecord[],
                pagination: {
                    page: number,
                    page_size: number,
                    total: number,
                    total_pages: number
                }
            }>('/api/teaching/reports/provincial/details', {
                params
            });
            
            if (response) {
                setDetailRecords(response.details || []);
                setDetailPagination({
                    page: response.pagination?.page || 1,
                    pageSize: response.pagination?.page_size || 20,
                    total: response.pagination?.total || 0,
                    totalPages: response.pagination?.total_pages || 1
                });
            }
        } catch (error) {
            console.error('Failed to load detail data:', error);
            setDetailRecords([]);
        } finally {
            setDetailLoading(false);
        }
    };

    // 当切换到详情页时加载数据
    useEffect(() => {
        if (view === 'detail') {
            loadDetailData(1);
        }
    }, [view, dateRange.start, dateRange.end, selectedSchools]);

    // 查询按钮
    const handleQuery = () => {
        loadReportData();
        if (view === 'detail') {
            loadDetailData(1);
        }
    };

    // 重置按钮
    const handleReset = () => {
        const { start, end } = getBeijingWeekRange();
        setDateRange({ start, end });
        setSelectedGroup('');
        setSelectedSchools(schools.length > 0 ? [schools[0].name] : []);
    };

    // 导出Excel - 汇总视图
    const handleExportSummary = () => {
        if (provinceSchools.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push(['校区教学量化表']);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头行 - 学校、各指标大项、学校得分、学校排名
        const headerRow = ['学校', ...majorCategories, '学校得分', '学校排名'];
        tableData.push(headerRow);
        
        // 数据行
        provinceSchools.forEach((row) => {
            const dataRow: any[] = [row.schoolName];
            majorCategories.forEach((category) => {
                dataRow.push(row.metrics?.[category] ?? 0);
            });
            dataRow.push(row.schoolScore);
            dataRow.push(row.schoolRank);
            tableData.push(dataRow);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = headerRow.length;
        
        // 设置列宽
        const colWidths = [
            { wch: 15 }, // 学校
            ...majorCategories.map(() => ({ wch: 10 })), // 各大项
            { wch: 10 }, // 学校得分
            { wch: 10 }  // 学校排名
        ];
        ws['!cols'] = colWidths;
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // 标题行
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }  // 日期行
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化汇总');
        const fileName = `校区教学量化汇总_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 详情视图
    const handleExportDetail = () => {
        if (detailRecords.length === 0) {
            toast.info('暂无数据可导出');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        
        // 构建表格数据
        const tableData: any[][] = [];
        
        // 标题行
        tableData.push([`校区教学量化详情`]);
        
        // 日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['学校', '年级', '教研组', '老师', '大项', '检查内容', '类型', '分数', '日期', '时间']);
        
        // 数据行
        detailRecords.forEach((r) => {
            const dateTimeStr = r.time || '';
            const datePart = dateTimeStr.split(' ')[0] || '';
            const timePart = dateTimeStr.split(' ')[1] || dateTimeStr;
            tableData.push([
                r.school, 
                r.grade, 
                r.group, 
                r.teacher, 
                r.major_category || '', 
                r.checkItem, 
                r.type, 
                r.score,
                datePart,
                timePart
            ]);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 10;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 15 }, // 学校
            { wch: 8 },  // 年级
            { wch: 10 }, // 教研组
            { wch: 10 }, // 老师
            { wch: 10 }, // 大项
            { wch: 20 }, // 检查内容
            { wch: 8 },  // 类型
            { wch: 8 },  // 分数
            { wch: 12 }, // 日期
            { wch: 10 }  // 时间
        ];
        
        // 合并单元格
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }
        ];
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 };
        const normalFont = { sz: 10 };
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { v: '' };
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '教学量化详情');
        const fileName = `校区教学量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // 导出Excel - 根据视图选择导出方法
    const handleExport = () => {
        if (view === 'summary') {
            handleExportSummary();
        } else {
            handleExportDetail();
        }
    };

    // 导出PDF功能
    const handleExportPDF = async () => {
        if (!reportRef.current || detailRecords.length === 0) return;
        
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            
            const imgWidth = pdfWidth - 2 * margin;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const imgData = canvas.toDataURL('image/png');
            
            let heightLeft = imgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - 2 * margin);
            
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= (pdfHeight - 2 * margin);
            }
            
            const fileName = `校区教学量化_${dateRange.start}_${dateRange.end}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('PDF导出失败:', error);
            toast.error('PDF导出失败，请重试');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-slate-500">加载中...</div>
            </div>
        );
    }

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                    <h2 className="text-2xl font-bold text-slate-900 text-center whitespace-nowrap">校区教学量化详情</h2>
                    <div className="absolute right-6 flex space-x-3">
                         <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <ArrowLeft className="w-4 h-4 mr-1" />
                             返回
                         </button>
                         <button onClick={handleExportPDF} className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 flex items-center">
                             <FileText className="w-4 h-4 mr-1" />
                             导出PDF
                         </button>
                         <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center">
                             <Download className="w-4 h-4 mr-1" />
                             导出Excel
                         </button>
                    </div>
                </div>

                <div ref={reportRef} className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">学校</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">年级</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">教研组</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">老师</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">大项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider w-1/3">检查内容</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">加分/减分</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">分数</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">时间</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {detailLoading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-8 text-center text-slate-500">加载中...</td>
                                    </tr>
                                ) : detailRecords.length > 0 ? (
                                    detailRecords.map((record) => (
                                        <tr key={record.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.school}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.grade}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.group}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.teacher}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.major_category || ''}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600">{record.checkItem}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600">{record.type}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.score}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-500">{record.time}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-8 text-center text-slate-500">暂无数据</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                       <span>共 {detailPagination.total} 条</span>
                       <select 
                           className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                           value={detailPagination.pageSize}
                           onChange={(e) => {
                               setDetailPagination(prev => ({...prev, pageSize: parseInt(e.target.value)}));
                               loadDetailData(1);
                           }}
                       >
                           <option value={10}>10条/页</option>
                           <option value={20}>20条/页</option>
                           <option value={50}>50条/页</option>
                       </select>
                       <button 
                           className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
                           disabled={detailPagination.page <= 1}
                           onClick={() => loadDetailData(detailPagination.page - 1)}
                       >&lt;</button>
                       <span className="px-2 py-1 text-blue-600 font-bold">{detailPagination.page}</span>
                       <button 
                           className="px-2 py-1 text-slate-600 hover:text-blue-600 disabled:opacity-50"
                           disabled={detailPagination.page >= detailPagination.totalPages}
                           onClick={() => loadDetailData(detailPagination.page + 1)}
                       >&gt;</button>
                       <span>前往</span>
                       <input 
                           type="text" 
                           defaultValue={detailPagination.page} 
                           className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') {
                                   const page = parseInt((e.target as HTMLInputElement).value);
                                   if (page >= 1 && page <= detailPagination.totalPages) {
                                       loadDetailData(page);
                                   }
                               }
                           }}
                       />
                       <span>页</span>
                    </div>
                </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header/Filter - 参考德育管理模块学区报表优化 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                 <h2 className="text-xl font-bold text-center text-slate-800">
                     {selectedSchools[0] || '学区'} 教学量化表
                 </h2>
                 
                 <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex flex-wrap items-start gap-4">
                          {/* 集团选择 */}
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">集团</label>
                              <div className="relative">
                                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <select
                                      className="w-36 pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                      value={selectedGroup}
                                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                          const newGroup = e.target.value;
                                          if (newGroup === '') {
                                              // 集团选择"全部"时，默认全选所有学校
                                              setSelectedGroup('');
                                              setSelectedSchools(schools.map((s) => s.name));
                                              return;
                                          }
                                          const selectedGroupId = groups.find((g) => g.name === newGroup)?.id;
                                          if (selectedGroupId) {
                                              // 选择集团后，默认全选本集团的全部学校
                                              const groupSchools = schools.filter((s) => s.groupId === selectedGroupId);
                                              setSelectedGroup(newGroup);
                                              setSelectedSchools(groupSchools.map((s) => s.name));
                                          } else {
                                              setSelectedGroup(newGroup);
                                              setSelectedSchools([]);
                                          }
                                      }}
                                  >
                                      <option value="">全部</option>
                                      {groups.map((group) => (
                                          <option key={group.id} value={group.name}>{group.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          {/* 学校多选 */}
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">学校</label>
                              <div className="relative">
                                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
                                  <div className="w-44">
                                      <SchoolMultiSelect
                                          schools={schools.filter((s) => {
                                              if (!selectedGroup) return true;
                                              const selectedGroupId = groups.find((g) => g.name === selectedGroup)?.id;
                                              return s.groupId === selectedGroupId;
                                          })}
                                          selectedSchools={selectedSchools}
                                          onChange={(selected) => {
                                              if (selected.length === 0) {
                                                  setSelectedSchools([]);
                                                  return;
                                              }
                                              const visibleSchools = schools.filter((s) => {
                                                  if (!selectedGroup) return true;
                                                  const selectedGroupId = groups.find((g) => g.name === selectedGroup)?.id;
                                                  return s.groupId === selectedGroupId;
                                              });
                                              const isSelectAllVisible = selected.length === visibleSchools.length &&
                                                                       visibleSchools.length > 0 &&
                                                                       selectedSchools.length < visibleSchools.length;
                                              if (isSelectAllVisible && selectedGroup) {
                                                  setSelectedSchools(selected);
                                                  setSelectedGroup('');
                                                  return;
                                              }
                                              const selectedGroupObj = groups.find((g) => g.name === selectedGroup);
                                              if (selectedGroupObj && selected.length > 0) {
                                                  const groupSchools = schools.filter((s) => s.groupId === selectedGroupObj.id);
                                                  const allInGroup = selected.every((name: string) => groupSchools.some((s) => s.name === name));
                                                  if (!allInGroup) {
                                                      setSelectedSchools(selected);
                                                      setSelectedGroup('');
                                                  } else {
                                                      setSelectedSchools(selected);
                                                  }
                                              } else {
                                                  setSelectedSchools(selected);
                                              }
                                          }}
                                      />
                                  </div>
                              </div>
                          </div>
                          <DateRangePicker value={dateRange} onChange={setDateRange} />
                      </div>
                      <div className="flex space-x-2">
                          <button 
                              onClick={handleQuery}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                              查询
                          </button>
                          <button 
                              onClick={handleReset}
                              className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50"
                          >
                              重置
                          </button>
                          <button 
                              onClick={handleExport}
                              className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                          >
                              导出Excel
                          </button>
                          <button 
                             onClick={() => setView('detail')}
                             className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                          >
                             详情页
                          </button>
                      </div>
                 </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                 <div className="min-w-[1500px] p-4">
                    <div className="text-center font-bold text-slate-800 mb-2">校区教学量化表</div>
                    <div className="text-right text-xs text-slate-500 mb-2">
                        日期: {dateRange.start} 至 {dateRange.end}
                    </div>
                    
                    <table className="w-full border-collapse border border-slate-300 text-xs">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="border border-slate-300 px-2 py-2 font-medium bg-slate-100 text-slate-600">学校</th>
                                {loadingCategories ? (
                                    <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600" colSpan={20}>加载中...</th>
                                ) : majorCategories.length > 0 ? (
                                    majorCategories.map((category, index) => (
                                        <th key={index} className="border border-slate-300 px-1 py-2 font-medium text-slate-600">
                                            {category}
                                        </th>
                                    ))
                                ) : (
                                    <>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学设计</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教研质量</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">导纲制作</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题组编</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">授课过程</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">学科自习</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">习题批阅</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">成绩贴评</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">教学进度</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">听课评课</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">辅导督促</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">办公纪律</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">赞美激励</th>
                                        <th className="border border-slate-300 px-1 py-2 font-medium text-slate-600">卫生摆摆</th>
                                        <th className="border border-slate-300 px-2 py-3 font-medium">查课管理</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">板书设计</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">英语口语</th>
                                        <th className="border border-slate-200 px-2 py-3 font-medium">小组建设</th>
                                    </>
                                )}
                                <th className="border border-slate-200 px-3 py-3 font-medium bg-slate-50">学校得分</th>
                                <th className="border border-slate-200 px-3 py-3 font-medium bg-slate-50">学校排名</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {provinceSchools.length > 0 ? (
                                provinceSchools.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50 text-slate-600 text-center">
                                        <td className="border border-slate-200 px-3 py-3 text-left font-medium text-slate-800">{row.schoolName}</td>
                                        {majorCategories.length > 0 ? (
                                            majorCategories.map((category, index) => (
                                                <td key={index} className="border border-slate-200 px-2 py-3">
                                                    {row.metrics?.[category] ?? 0}
                                                </td>
                                            ))
                                        ) : (
                                            <>
                                                <td className="border border-slate-200 px-2 py-3">{row.design}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.quality}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.guide}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.exercise}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.process}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.selfStudy}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.marking}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.posting}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.progress}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.listening}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.tutoring}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.officeDisc}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.praise}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.hygiene}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.check}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.board}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.oral}</td>
                                                <td className="border border-slate-200 px-2 py-3">{row.team}</td>
                                            </>
                                        )}
                                        <td className="border border-slate-200 px-3 py-3 font-bold text-slate-800">{row.schoolScore}</td>
                                        <td className="border border-slate-200 px-3 py-3 font-bold text-blue-600">{row.schoolRank}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={majorCategories.length + 3} className="px-6 py-8 text-center text-slate-500">
                                        暂无数据
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-800 border-l-4 border-blue-500 pl-3">分析评价</h3>
                
                <div className="relative">
                    <textarea 
                       className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none placeholder-slate-400 bg-white"
                       placeholder="请输入分析评价内容..."
                       value={evaluation}
                       onChange={(e) => setEvaluation(e.target.value)}
                       maxLength={2000}
                    ></textarea>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                </div>

                <div>
                    <button 
                        onClick={handleSaveEvaluation}
                        disabled={savingEvaluation}
                        className="px-6 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {savingEvaluation ? '保存中...' : '保存评价'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TeachingManagement;
