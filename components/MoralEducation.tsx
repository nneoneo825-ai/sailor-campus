
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart, 
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  Search, 
  ArrowLeft, 
  Download, 
  Calendar, 
  X,
  Filter,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Award,
  Users,
  FileText,
  Loader2,
  School,
  GraduationCap,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building
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
  formatBeijingTime 
} from '../src/utils/dateUtils';

// --- 权限检查辅助函数 ---
const getUserPermissions = (): string[] => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      return userData.permissions || [];
    }
  } catch (e) {
    console.error('Failed to get user permissions:', e);
  }
  return [];
};

const getUserRole = (): string => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      return userData.role_name || '';
    }
  } catch (e) {
    console.error('Failed to get user role:', e);
  }
  return '';
};

const hasPermission = (permission: string): boolean => {
  const role = getUserRole();
  if (role === '系统管理员') return true;
  const permissions = getUserPermissions();
  return permissions.includes(permission);
};

interface ClassDetailRecord {
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

interface GradeDetailRecord {
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

interface SchoolDetailListRecord {
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

// 宿舍报表数据类型
interface DormReportData {
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

interface DormDetailRecord {
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

// --- Components ---

const MoralEducation: React.FC = () => {
  // 根据权限确定默认显示的Tab
  const getDefaultTab = (): 'class' | 'grade' | 'school' | 'dorm' | 'district' => {
    if (hasPermission('moral:class')) return 'class';
    if (hasPermission('moral:grade')) return 'grade';
    if (hasPermission('moral:school')) return 'school';
    if (hasPermission('moral:dorm')) return 'dorm';
    if (hasPermission('moral:district')) return 'district';
    return 'class'; // 默认
  };
  
  const [activeTab, setActiveTab] = useState<'class' | 'grade' | 'school' | 'dorm' | 'district'>(getDefaultTab());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <h1 className="text-2xl font-bold text-slate-900">德育量化管理 (Moral Education)</h1>
          <p className="text-slate-500 mt-1">多维度德育评价报表与分析。</p>
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-md">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-2">
          {hasPermission('moral:class') && renderTabButton('class', '班级报表')}
          {hasPermission('moral:grade') && renderTabButton('grade', '年级报表')}
          {hasPermission('moral:school') && renderTabButton('school', '校级报表')}
          {hasPermission('moral:dorm') && renderTabButton('dorm', '宿舍报表')}
          {hasPermission('moral:district') && renderTabButton('district', '学区报表')}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {hasPermission('moral:class') && activeTab === 'class' && <ClassReport />}
        {hasPermission('moral:grade') && activeTab === 'grade' && <GradeReport />}
        {hasPermission('moral:school') && activeTab === 'school' && <SchoolReport />}
        {hasPermission('moral:dorm') && activeTab === 'dorm' && <DormReport />}
        {hasPermission('moral:district') && activeTab === 'district' && <DistrictReport />}
      </div>
    </div>
  );
};

// ... existing code for ClassReport, GradeReport, SchoolReport, DormReport ...
// 班级报表数据接口
interface ClassReportData {
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

// 筛选选项接口
interface FilterOptions {
  schools: { id: number; name: string }[];
  grades: { id: number; name: string }[];
  classes: { id: number; name: string }[];
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

// 1. Class Report Component - 使用 API 数据

// 获取上一周日期范围（上周一到上周日）
const getLastWeekRange = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0是周日，1是周一
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // 本周一
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  
  // 上周一
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  
  // 上周日
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    start: formatDate(lastMonday),
    end: formatDate(lastSunday)
  };
};

// 从组织树中提取学校列表
const extractSchools = (orgTree: any[]): { id: number; name: string }[] => {
  const schools: { id: number; name: string }[] = [];
  
  orgTree.forEach((group: any) => {
    if (group.children) {
      group.children.forEach((school: any) => {
        if (school.type === 'school') {
          schools.push({ id: school.id, name: school.name });
        }
      });
    }
  });
  
  return schools;
};

// 获取最近N天的日期范围
const getRecentDaysRange = (days: number) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1); // 包含今天

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    start: formatDate(start),
    end: formatDate(end)
  };
};

const ClassReport: React.FC = () => {
  const [view, setView] = useState<'summary' | 'detail'>('summary');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClassReportData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // 用于PDF导出的ref
  const reportRef = useRef<HTMLDivElement>(null);
  
  // 筛选状态 - 默认显示本周
  const [filters, setFilters] = useState({
    school: '',
    grade: '',
    class: '',
    dateRange: getBeijingWeekRange(),
    category: 'all'
  });
  
  // 使用 ref 存储最新的 filters，确保 fetchData 能访问到最新值
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // 筛选选项
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    classes: []
  });
  
  // 保存完整的组织树数据，用于联动筛选
  const [orgTreeData, setOrgTreeData] = useState<any[]>([]);
  
  // 德育指标列表
  interface MoralIndicator {
    id: number;
    category: string;
    sub_category: string;
    name: string;
    type: 'bonus' | 'deduction';
    default_score: number;
    is_enabled: number;
    org_id?: number;
    org_name?: string;
  }
  const [moralIndicators, setMoralIndicators] = useState<MoralIndicator[]>([]);
  
  // 加载德育指标
  const loadMoralIndicators = useCallback(async () => {
    try {
      const response = await api.get<{indicators: MoralIndicator[], total: number}>('/api/moral/indicators');
      setMoralIndicators(response.indicators);
    } catch (error) {
      console.error('加载德育指标失败:', error);
      // 使用默认数据
      setMoralIndicators([
        { id: 1, category: '德育常规', sub_category: '考勤纪律', name: '上课迟到', type: 'deduction', default_score: 2, is_enabled: 1 },
        { id: 2, category: '德育常规', sub_category: '考勤纪律', name: '无故旷课', type: 'deduction', default_score: 5, is_enabled: 1 },
        { id: 3, category: '德育常规', sub_category: '仪容仪表', name: '未穿校服', type: 'deduction', default_score: 2, is_enabled: 1 },
        { id: 4, category: '卫生管理', sub_category: '教室卫生', name: '地面有垃圾', type: 'deduction', default_score: 1, is_enabled: 1 },
        { id: 5, category: '荣誉表彰', sub_category: '品德风尚', name: '拾金不昧', type: 'bonus', default_score: 5, is_enabled: 1 },
        { id: 6, category: '荣誉表彰', sub_category: '竞赛获奖', name: '校级比赛一等奖', type: 'bonus', default_score: 10, is_enabled: 1 },
        { id: 7, category: '宿舍管理', sub_category: '内务整理', name: '被褥叠放不整齐', type: 'deduction', default_score: 3, is_enabled: 1 },
      ]);
    }
  }, []);
  
  // 根据大项和小项查找对应的指标名称
  const getIndicatorName = useCallback((majorCategory: string, minorCategory: string, reason: string): string => {
    // 首先尝试根据大项和小项匹配
    const indicator = moralIndicators.find(
      (ind: MoralIndicator) => ind.category === majorCategory && ind.sub_category === minorCategory && ind.is_enabled === 1
    );
    if (indicator) {
      return indicator.name;
    }
    // 如果没有匹配到，返回原因的前20个字符作为指标名称
    return reason.length > 20 ? reason.substring(0, 20) + '...' : reason;
  }, [moralIndicators]);
  
  // 根据指标获取分数
  const getIndicatorScore = useCallback((majorCategory: string, minorCategory: string, defaultScore: number): number => {
    const indicator = moralIndicators.find(
      (ind: MoralIndicator) => ind.category === majorCategory && ind.sub_category === minorCategory && ind.is_enabled === 1
    );
    return indicator ? indicator.default_score : defaultScore;
  }, [moralIndicators]);

  // 加载筛选选项
  const loadFilterOptions = useCallback(async () => {
    try {
      // 获取组织树
      const orgTree = await api.get<any[]>('/api/org/tree');
      setOrgTreeData(orgTree);
      
      // 提取学校列表
      const schoolsMap = new Map<number, string>();
      
      orgTree.forEach((group: any) => {
        if (group.children) {
          group.children.forEach((school: any) => {
            if (school.type === 'school') {
              schoolsMap.set(school.id, school.name);
            }
          });
        }
      });
      
      const schools = Array.from(schoolsMap.entries()).map(([id, name]) => ({ id, name }));
      setFilterOptions((prev: FilterOptions) => ({ ...prev, schools }));
      
      // 设置默认学校
      if (schools.length > 0 && !filters.school) {
        const defaultSchool = schools[0].name;
        setFilters((prev: { school: string; grade: string; class: string; dateRange: { start: string; end: string }; category: string }) => ({ ...prev, school: defaultSchool }));
        // 根据默认学校加载年级和班级
        updateGradeAndClassOptions(orgTree, defaultSchool, '');
      }
    } catch (error) {
      console.error('加载筛选选项失败:', error);
      // API失败时清空数据，不使用静态默认值
      setFilterOptions({ schools: [], grades: [], classes: [] });
      setOrgTreeData([]);
    }
  }, []);
  
  // 根据学校和年级更新班级选项
  const updateGradeAndClassOptions = useCallback((orgTree: any[], schoolName: string, gradeName: string) => {
    const grades: { id: number; name: string }[] = [];
    const classes: { id: number; name: string }[] = [];
    
    orgTree.forEach((group: any) => {
      if (group.children) {
        group.children.forEach((school: any) => {
          if (school.type === 'school' && school.name === schoolName) {
            if (school.children) {
              school.children.forEach((grade: any) => {
                if (grade.type === 'grade') {
                  grades.push({ id: grade.id, name: grade.name });
                  
                  // 如果指定了年级，只加载该年级的班级
                  if (gradeName && grade.name === gradeName && grade.children) {
                    grade.children.forEach((cls: any) => {
                      if (cls.type === 'class') {
                        classes.push({ id: cls.id, name: cls.name });
                      }
                    });
                  }
                  // 如果没有指定年级，加载所有班级
                  else if (!gradeName && grade.children) {
                    grade.children.forEach((cls: any) => {
                      if (cls.type === 'class') {
                        classes.push({ id: cls.id, name: cls.name });
                      }
                    });
                  }
                }
              });
            }
          }
        });
      }
    });
    
    setFilterOptions((prev: FilterOptions) => ({ ...prev, grades, classes }));
    return { grades, classes };
  }, []);

  useEffect(() => {
    loadFilterOptions();
    loadMoralIndicators();
  }, [loadFilterOptions, loadMoralIndicators]);
  
  // 学校变化时，更新年级和班级选项
  useEffect(() => {
    if (orgTreeData.length > 0 && filters.school) {
      const { grades, classes } = updateGradeAndClassOptions(orgTreeData, filters.school, '');
      // 重置年级和班级的选择
      if (grades.length > 0) {
        setFilters((prev: { school: string; grade: string; class: string; dateRange: { start: string; end: string }; category: string }) => ({ 
          ...prev, 
          grade: grades[0].name,
          class: classes.length > 0 ? classes[0].name : ''
        }));
      }
    }
  }, [filters.school, orgTreeData]);
  
  // 年级变化时，更新班级选项
  useEffect(() => {
    if (orgTreeData.length > 0 && filters.school && filters.grade) {
      const { classes } = updateGradeAndClassOptions(orgTreeData, filters.school, filters.grade);
      // 重置班级的选择
      if (classes.length > 0) {
        setFilters((prev: { school: string; grade: string; class: string; dateRange: { start: string; end: string }; category: string }) => ({ ...prev, class: classes[0].name }));
      }
    }
  }, [filters.grade, filters.school, orgTreeData]);

  // 从API加载数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setDataError(null);
    try {
      // 使用 ref 获取最新的 filters
      const currentFilters = filtersRef.current;

      // 根据学校、年级、班级名称查找班级ID
      let classId: number | null = null;
      orgTreeData.forEach((group: any) => {
        if (group.children) {
          group.children.forEach((school: any) => {
            if (school.type === 'school' && school.name === currentFilters.school) {
              if (school.children) {
                school.children.forEach((grade: any) => {
                  if (grade.type === 'grade' && grade.name === currentFilters.grade) {
                    if (grade.children) {
                      grade.children.forEach((cls: any) => {
                        if (cls.type === 'class' && cls.name === currentFilters.class) {
                          classId = cls.id;
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        }
      });

      // 检查是否找到了有效的班级ID
      if (!classId) {
        console.error('无法找到班级ID:', {
          school: currentFilters.school,
          grade: currentFilters.grade,
          class: currentFilters.class,
          availableClasses: filterOptions.classes
        });
        setDataError(`无法找到班级: ${currentFilters.school} ${currentFilters.grade} ${currentFilters.class}，请检查班级是否存在`);
        setLoading(false);
        return;
      }

      console.log('开始加载数据:', {
        classId,
        currentFilters,
        availableClasses: filterOptions.classes.map((c: FilterOptions['classes'][0]) => c.name)
      });
      
      console.log('API请求参数:', {
        class_id: classId,
        start_date: currentFilters.dateRange.start,
        end_date: currentFilters.dateRange.end,
        category: currentFilters.category === 'all' ? undefined : currentFilters.category
      });

      // 从组织树中获取班级信息（班主任等）
      let classInfoFromTree = {
        studentCount: 0,
        headTeacher: '未分配'
      };
      
      orgTreeData.forEach((group: any) => {
        if (group.children) {
          group.children.forEach((school: any) => {
            if (school.type === 'school' && school.name === currentFilters.school) {
              if (school.children) {
                school.children.forEach((grade: any) => {
                  if (grade.type === 'grade' && grade.name === currentFilters.grade) {
                    if (grade.children) {
                      grade.children.forEach((cls: any) => {
                        if (cls.type === 'class' && cls.name === currentFilters.class) {
                          classInfoFromTree.headTeacher = cls.headTeacher || cls.head_teacher || '未分配';
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        }
      });

      // 获取班级学生列表以计算学生数（分批获取所有学生）
      try {
        let allStudentsData: any[] = [];
        let currentPage = 1;
        const apiPageSize = 100;  // API每次请求的最大条数
        let hasMore = true;
        
        while (hasMore) {
          const studentsResponse: any = await api.get(`/api/org/${classId}/students`, {
            params: {
              page: currentPage,
              page_size: apiPageSize
            }
          });
          
          const students = studentsResponse?.students || [];
          allStudentsData = [...allStudentsData, ...students];
          
          // 检查是否还有更多数据
          if (students.length < apiPageSize) {
            hasMore = false;
          } else {
            currentPage++;
          }
        }
        
        classInfoFromTree.studentCount = allStudentsData.length;
        console.log(`班级学生数: ${allStudentsData.length} (共获取${currentPage}页)`);
      } catch (err) {
        console.log('获取班级学生列表失败:', err);
        // 如果失败，尝试从组织树获取
        orgTreeData.forEach((group: any) => {
          if (group.children) {
            group.children.forEach((school: any) => {
              if (school.type === 'school' && school.name === currentFilters.school) {
                if (school.children) {
                  school.children.forEach((grade: any) => {
                    if (grade.type === 'grade' && grade.name === currentFilters.grade) {
                      if (grade.children) {
                        grade.children.forEach((cls: any) => {
                          if (cls.type === 'class' && cls.name === currentFilters.class) {
                            classInfoFromTree.studentCount = cls.studentCount || cls.student_count || 0;
                          }
                        });
                      }
                    }
                  });
                }
              }
            });
          }
        });
      }

      // 调用真实API
      const response = await api.get<ClassReportData>('/api/moral/class-report', {
        params: {
          class_id: classId,
          start_date: currentFilters.dateRange.start,
          end_date: currentFilters.dateRange.end,
          category: currentFilters.category === 'all' ? undefined : currentFilters.category
        }
      });
      console.log('API返回数据:', response);
      console.log('details数据:', response.details, '数量:', response.details?.length || 0);
      console.log('records数据:', response.records, '数量:', response.records?.length || 0);
      
      // 合并组织树中的班级信息（学生数、班主任）
      const mergedData = {
        ...response,
        classInfo: {
          ...response.classInfo,
          studentCount: classInfoFromTree.studentCount,
          headTeacher: classInfoFromTree.headTeacher
        }
      };
      setData(mergedData);
    } catch (error: any) {
      // 在 catch 块中再次获取最新的 filters
      const currentFilters = filtersRef.current;

      console.error('加载数据失败:', error);

      // 获取详细的错误信息
      let errorMessage = '数据加载失败，请检查网络连接或后端服务';
      if (error.response) {
        // 服务器返回了错误响应
        errorMessage = `数据加载失败: ${error.response.status} - ${error.response.data?.detail || error.response.statusText || '服务器错误'}`;
        console.error('服务器错误详情:', error.response.data);
      } else if (error.request) {
        // 请求发出但没有收到响应
        errorMessage = '数据加载失败: 无法连接到服务器，请检查网络连接';
        console.error('网络错误:', error.request);
      } else {
        // 其他错误
        errorMessage = `数据加载失败: ${error.message || '未知错误'}`;
      }

      // 显示错误信息
      setDataError(errorMessage);
      // 不再使用mock数据作为fallback，仅显示错误
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filterOptions]); // 移除 filters 依赖，避免每次筛选器变更都自动加载

  // 组件加载时自动加载数据
  useEffect(() => {
    // 确保所有必要的筛选器都已初始化后再加载数据
    if (filterOptions.classes.length > 0 && !data && filters.class && filters.school && filters.grade) {
      console.log('[ClassReport] 自动加载数据，筛选器状态:', {
        school: filters.school,
        grade: filters.grade,
        class: filters.class
      });
      fetchData();
    }
  }, [filterOptions.classes, data, fetchData, filters.class, filters.school, filters.grade]);

  // 如果没有数据，显示加载中
  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>正在加载数据...</span>
        </div>
      </div>
    );
  }

  // 如果有错误，显示错误提示
  if (dataError) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center space-x-3">
        <div className="flex-1">
          <div className="font-medium">数据加载失败</div>
          <div className="text-sm mt-1">{dataError}</div>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  // 导出报表 - XLSX格式，带美观样式
  const handleExport = () => {
    if (!data) return;
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    const schoolName = filters.school || '学校';
    const gradeName = filters.grade || '年级';
    const className = filters.class || '班级';
    const startDate = filters.dateRange.start;
    const endDate = filters.dateRange.end;
    
    // 准备表格数据
    const tableData: any[] = [];
    
    // 添加主标题行
    tableData.push([`${schoolName} ${gradeName} ${className} 五育量化明细表`]);
    
    // 添加日期信息行（班级报表不显示部门信息）
    tableData.push([`日期: ${startDate} 至 ${endDate}`, '', '', '', '', '', '', '']);

    // 表头
    tableData.push(['学生', '大项', '小项', '检查内容', '类型', '分数', '日期', '时间']);
    
    // 数据行
    data.records.forEach((r: ClassReportData['records'][0]) => {
      let studentName: string;
      if (r.student && !r.student.startsWith('学生None')) {
        studentName = r.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
      } else {
        // 根据记录来源判断显示内容
        const hasDormInfo = r.description && /\d+层\d+房间/.test(r.description);
        const isDormCategory = r.minorCategory === '午休晚休' || r.minorCategory === '寝室内务';
        const isDormCheck = r.source === 'overall' && (hasDormInfo || isDormCategory);
        studentName = isDormCheck ? '宿舍整体' : '班级整体';
      }
      // 从时间字段中提取日期和时间
      const dateTimeStr = r.time || '';
      const datePart = dateTimeStr.split(' ')[0] || '';
      const timePart = dateTimeStr.split(' ')[1] || dateTimeStr;
      tableData.push([studentName, r.majorCategory, r.minorCategory, r.content, r.type, r.score, datePart, timePart]);
    });
    
    // 创建工作表
    const ws = XLSX.utils.aoa_to_sheet(tableData);
    const totalCols = 8;
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 }, // 学生
      { wch: 10 }, // 大项
      { wch: 10 }, // 小项
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
      ...data.records.map(() => ({ hpt: 20 }))
    ];
    
    // 合并单元格
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },  // 主标题行
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }  // 日期信息行（整行合并）
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
    
    XLSX.utils.book_append_sheet(wb, ws, '五育量化明细');
    const fileName = `${schoolName}_${gradeName}_${className}_德育明细_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // 导出PDF功能
  const handleExportPDF = async () => {
    if (!reportRef.current || !data) return;
    
    try {
      // 使用html2canvas将报表内容转换为canvas
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      // 创建PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      
      // 计算图片尺寸
      const imgWidth = pdfWidth - 2 * margin;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // 将canvas转换为图片数据
      const imgData = canvas.toDataURL('image/png');
      
      // 如果内容超过一页，需要分页
      let heightLeft = imgHeight;
      let position = 0;
      
      // 添加第一页
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 2 * margin);
      
      // 如果需要添加更多页面
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 2 * margin);
      }
      
      // 保存PDF
      const fileName = `${filters.school}_${filters.grade}_${filters.class}_班级报表_${filters.dateRange.start}_${filters.dateRange.end}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF导出失败:', error);
      toast.error('PDF导出失败，请重试');
    }
  };

  // 雷达图颜色定义
  // const radarColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

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
            {filters.school} {filters.grade} {filters.class} 五育量化详情
          </h2>
          <div className="flex-1 flex justify-end">
            <button 
              onClick={handleExport}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              导出明细
            </button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-5 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">总记录数</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{data?.records.length || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-5 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">加分记录</p>
                <p className="text-2xl font-bold text-green-700 mt-1">
                  {data?.records.filter((r: ClassReportData['records'][0]) => r.type === '加分').length || 0}
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
                  {data?.records.filter((r: ClassReportData['records'][0]) => r.type === '减分').length || 0}
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
                <p className="text-sm text-purple-600 font-medium">涉及学生</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">
                  {data ? new Set(data.records.map((r: ClassReportData['records'][0]) => r.student)).size : 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Detail Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">详细记录列表</h3>
              <p className="text-xs text-slate-500 mt-0.5">所有德育量化记录明细</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500">筛选:</span>
              <select className="text-xs border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                <option>全部类型</option>
                <option>加分</option>
                <option>减分</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">学生</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">大项</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">小项</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/3">检查内容</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">类型</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">分数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">时间</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {(data?.records || []).map((record: ClassReportData['records'][0]) => {
                  const indicatorScore = getIndicatorScore(record.majorCategory, record.minorCategory, record.score);
                  // 提取纯姓名（去掉 "学生 temp_XX_X-X " 前缀）
                  let studentName: string;
                  if (record.student && !record.student.startsWith('学生None')) {
                    studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
                  } else {
                    // 根据记录来源判断显示内容
                    // source='overall' 且满足以下条件之一表示宿舍整体检查：
                    // 1. description 包含宿舍信息(层、房间)
                    // 2. minorCategory 是宿舍相关分类
                    const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                    const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                    const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                    studentName = isDormCheck ? '宿舍整体' : '班级整体';
                  }
                  return (
                    <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{studentName}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.majorCategory === '德育' ? 'bg-blue-100 text-blue-700' :
                          record.majorCategory === '智育' ? 'bg-green-100 text-green-700' :
                          record.majorCategory === '体育' ? 'bg-orange-100 text-orange-700' :
                          record.majorCategory === '美育' ? 'bg-purple-100 text-purple-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {record.majorCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{record.minorCategory}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="text-slate-700">{record.content}</div>
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
                          {record.type === '加分' ? '+' : ''}{indicatorScore}
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
              共 <span className="font-medium">{data?.records.length || 0}</span> 条记录
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
              班级量化考核报表
            </h2>
            <p className="text-sm text-slate-500 mt-1">基于五育量化检查明细生成 · 实时数据更新</p>
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
                value={filters.school}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, school: e.target.value})}
              >
                {filterOptions.schools.map((school: FilterOptions['schools'][0]) => (
                  <option key={school.id} value={school.name}>{school.name}</option>
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
                value={filters.grade}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, grade: e.target.value})}
              >
                {filterOptions.grades.map((grade: FilterOptions['grades'][0]) => (
                  <option key={grade.id} value={grade.name}>{grade.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">班级</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="min-w-[100px] w-auto pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                value={filters.class}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, class: e.target.value})}
              >
                {filterOptions.classes.map((cls: FilterOptions['classes'][0]) => (
                  <option key={cls.id} value={cls.name}>{cls.name}</option>
                ))}
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
                <option value="moral">德育</option>
                <option value="intellect">智育</option>
                <option value="physical">体育</option>
                <option value="artistic">美育</option>
                <option value="labor">劳育</option>
              </select>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setFilters((prev: typeof filters) => ({
                ...prev,
                grade: '',
                class: '',
                dateRange: getBeijingWeekRange(),
                category: 'all'
              }))}
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

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>正在加载数据...</span>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {!loading && dataError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center justify-center space-x-3">
          <div>
            <div className="font-medium">数据加载失败</div>
            <div className="text-sm mt-1">{dataError}</div>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !dataError && data && (
        <div ref={reportRef} className="space-y-6">
          {/* 班级信息卡片 */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <span className="text-3xl font-bold">{filters.grade}</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{data.classInfo.name}</h1>
                  <div className="flex items-center space-x-4 mt-2 text-blue-100">
                    <span className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      班主任: {data.classInfo.headTeacher}
                    </span>
                    <span className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      学生数: {data.classInfo.studentCount}人
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-blue-100 text-sm mb-1">报告周期</div>
                <div className="flex items-center justify-end space-x-2 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                  <Calendar className="w-4 h-4" />
                  <span>{filters.dateRange.start} 至 {filters.dateRange.end}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 优化后的统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">总得分</p>
                  <p className={`text-3xl font-bold mt-2 ${data.summary.totalScore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.summary.totalScore > 0 ? '+' : ''}{data.summary.totalScore}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">基础分 100分</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  data.summary.totalScore >= 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <Award className={`w-6 h-6 ${data.summary.totalScore >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>
            </div>

            {(() => {
              const bonusCount = data.records.filter((r: ClassReportData['records'][0]) => r.type === '加分').length;
              const deductionCount = data.records.filter((r: ClassReportData['records'][0]) => r.type === '减分').length;
              const totalCount = bonusCount + deductionCount;
              const bonusWidth = totalCount > 0 ? (bonusCount / totalCount) * 100 : 0;
              const deductionWidth = totalCount > 0 ? (deductionCount / totalCount) * 100 : 0;
              return (
                <>
                  <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">加分项</p>
                        <p className="text-3xl font-bold text-green-600 mt-2">+{data.summary.bonusScore}</p>
                        <p className="text-xs text-slate-400 mt-1">共{bonusCount}条记录</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                    <div className="mt-4 w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${bonusWidth}%` }}></div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">扣分项</p>
                        <p className="text-3xl font-bold text-red-600 mt-2">{data.summary.deductionScore}</p>
                        <p className="text-xs text-slate-400 mt-1">共{deductionCount}条记录</p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <TrendingDown className="w-6 h-6 text-red-600" />
                      </div>
                    </div>
                    <div className="mt-4 w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${deductionWidth}%` }}></div>
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">班级排名</p>
                  <p className="text-3xl font-bold text-purple-600 mt-2">第{data.summary.rank}名</p>
                  <p className="text-xs text-slate-400 mt-1">全年级共6个班级</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Award className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 五育雷达图 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">五育能力雷达图</h3>
                  <p className="text-xs text-slate-500 mt-0.5">各维度得分分布情况</p>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={data.fiveEducation}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Radar
                      name="得分"
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 得分趋势图 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">得分趋势分析</h3>
                  <p className="text-xs text-slate-500 mt-0.5">本月每日得分变化趋势</p>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 详细评分表格 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">详细评分列表</h3>
                <p className="text-xs text-slate-500 mt-0.5">各项检查项目的得分详情</p>
              </div>
              <button 
                onClick={() => setView('detail')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                查看全部 →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">序号</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">大项</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">小项</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">检查内容</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">得分情况</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">学生</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {data.details && data.details.length > 0 ? (
                    data.details.map((row: ClassReportData['details'][0], idx: number) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-500">{idx + 1}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800">{row.majorCategory}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800">{row.minorCategory}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {row.content}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <span className={`font-bold text-lg ${row.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {row.score > 0 ? '+' : ''}{row.score}
                            </span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-20">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${row.score >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(Math.abs(row.score) * 5, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                          {(() => {
                            // 处理学生显示逻辑
                            if (row.reason && !row.reason.startsWith('学生None')) {
                              return row.reason;
                            } else {
                              // 根据记录来源判断显示内容
                              const hasDormInfo = row.description && /\d+层\d+房间/.test(row.description);
                              const isDormCategory = row.minorCategory === '午休晚休' || row.minorCategory === '寝室内务';
                              const isDormCheck = row.source === 'overall' && (hasDormInfo || isDormCategory);
                              return isDormCheck ? '宿舍整体' : '班级整体';
                            }
                          })()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <FileText className="w-12 h-12 text-slate-300" />
                          <p>暂无检查记录</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 2. Grade Report Component - 使用 API 数据

// 指标子项接口
interface IndicatorSubCategory {
  name: string;
  fieldKey: string;
}

// 指标大类接口
interface IndicatorCategory {
  name: string;
  subCategories: IndicatorSubCategory[];
}

// 动态指标班级数据
interface DynamicClassData {
  class: string;
  headTeacher: string;
  totalDed: number;
  perCapita: number;
  rank: number;
  [key: string]: string | number; // 动态字段
}

interface GradeReportData {
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

// 动态指标年级数据
interface DynamicGradeData {
  grade: string;
  totalDed: number;
  perCapita: number;
  rank: number;
  studentCount: number;
  [key: string]: string | number; // 动态字段
}

interface SchoolReportData {
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

const GradeReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<GradeReportData | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    
    // 筛选状态
    const [filters, setFilters] = useState({
        school: '',
        grade: '',
        dateRange: getBeijingWeekRange(),
        category: 'all'
    });
    
    // 使用 ref 存储最新的 filters
    const filtersRef = useRef(filters);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);
    
    // 筛选选项
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        schools: [],
        grades: [],
        classes: []
    });
    
    // 组织树数据
    const [orgTreeData, setOrgTreeData] = useState<any[]>([]);
    
    // 根据学校名称获取学校ID
    const getSchoolIdByName = useCallback((schoolName: string) => {
        const school = filterOptions.schools.find((s: FilterOptions['schools'][0]) => s.name === schoolName);
        return school?.id;
    }, [filterOptions.schools]);
    
    // 根据学校和年级名称获取年级ID
    const getGradeIdByName = useCallback((schoolName: string, gradeName: string) => {
        console.log('[getGradeIdByName] 查找年级ID:', { schoolName, gradeName, orgTreeDataLength: orgTreeData.length });
        for (const group of orgTreeData) {
            if (group.children) {
                for (const school of group.children) {
                    if (school.type === 'school' && school.name === schoolName && school.children) {
                        console.log('[getGradeIdByName] 找到学校:', school.name, '年级列表:', school.children.filter((g: any) => g.type === 'grade').map((g: any) => ({ id: g.id, name: g.name })));
                        for (const grade of school.children) {
                            if (grade.type === 'grade' && grade.name === gradeName) {
                                console.log('[getGradeIdByName] 找到年级:', grade.name, 'ID:', grade.id, '类型:', typeof grade.id);
                                return grade.id;
                            }
                        }
                    }
                }
            }
        }
        console.log('[getGradeIdByName] 未找到年级ID');
        return null;
    }, [orgTreeData]);
    
    // 加载筛选选项 - 只在组件挂载时执行一次
    const loadFilterOptions = useCallback(async () => {
        try {
            const orgTree = await api.get<any[]>('/api/org/tree');
            setOrgTreeData(orgTree);
            
            const schoolsMap = new Map<number, string>();
            
            orgTree.forEach((group: any) => {
                if (group.children) {
                    group.children.forEach((school: any) => {
                        if (school.type === 'school') {
                            schoolsMap.set(school.id, school.name);
                        }
                    });
                }
            });
            
            const schools = Array.from(schoolsMap.entries()).map(([id, name]) => ({ id, name }));
            
            setFilterOptions((prev: FilterOptions) => ({ ...prev, schools }));
            
            // 设置默认学校，并根据默认学校加载年级
            if (schools.length > 0) {
                const defaultSchool = schools[0].name;
                setFilters((prev: typeof filters) => ({ ...prev, school: defaultSchool }));
                
                // 从组织树中获取该学校的年级（只选择有班级的年级）
                const grades: { id: number; name: string }[] = [];
                orgTree.forEach((group: any) => {
                    if (group.children) {
                        group.children.forEach((school: any) => {
                            if (school.type === 'school' && school.name === defaultSchool && school.children) {
                                school.children.forEach((grade: any) => {
                                    if (grade.type === 'grade' && grade.children && grade.children.length > 0) {
                                        // 只添加有班级的年级
                                        grades.push({ id: grade.id, name: grade.name });
                                    }
                                });
                            }
                        });
                    }
                });
                
                setFilterOptions((prev: FilterOptions) => ({ ...prev, grades }));
                
                if (grades.length > 0) {
                    setFilters((prev: typeof filters) => ({ ...prev, grade: grades[0].name }));
                }
            }
        } catch (error) {
            console.error('加载筛选选项失败:', error);
            setFilterOptions({
                schools: [],
                grades: [],
                classes: []
            });
        }
    }, []); // 空依赖数组，只在组件挂载时执行一次
    
    useEffect(() => {
        loadFilterOptions();
    }, [loadFilterOptions]);
    
    // 学校变化时，更新年级选项 - 使用 ref 避免循环
    const orgTreeDataRef = useRef(orgTreeData);
    useEffect(() => {
        orgTreeDataRef.current = orgTreeData;
    }, [orgTreeData]);
    
    useEffect(() => {
        if (orgTreeData.length > 0 && filters.school) {
            // 直接在这里计算年级，只选择有班级的年级
            const grades: { id: number; name: string }[] = [];
            orgTreeData.forEach((group: any) => {
                if (group.children) {
                    group.children.forEach((school: any) => {
                        if (school.type === 'school' && school.name === filters.school && school.children) {
                            school.children.forEach((grade: any) => {
                                // 只添加有班级的年级
                                if (grade.type === 'grade' && grade.children && grade.children.length > 0) {
                                    grades.push({ id: grade.id, name: grade.name });
                                }
                            });
                        }
                    });
                }
            });
            
            setFilterOptions((prev: FilterOptions) => ({ ...prev, grades }));
            
            // 如果当前年级不在新学校的年级列表中，重置为第一个年级
            const currentGradeExists = grades.some((g) => g.name === filters.grade);
            if (grades.length > 0 && !currentGradeExists) {
                setFilters((prev) => ({ ...prev, grade: grades[0].name }));
            }
        }
    }, [filters.school, orgTreeData]);
    
    // 从API加载数据
    const fetchData = useCallback(async () => {
        setLoading(true);
        setDataError(null);
        try {
            const currentFilters = filtersRef.current;
            
            // 通过学校和年级名称获取正确的年级ID
            const gradeId = getGradeIdByName(currentFilters.school, currentFilters.grade);
            
            if (!gradeId) {
                setDataError(`无法找到年级: ${currentFilters.school} ${currentFilters.grade}，请检查年级是否存在`);
                setLoading(false);
                return;
            }
            
            console.log('年级报表API请求参数:', {
                school: currentFilters.school,
                grade: currentFilters.grade,
                grade_id: gradeId
            });
            
            const response = await api.get<GradeReportData>('/api/moral/grade-report', {
                params: {
                    grade_id: gradeId,
                    start_date: currentFilters.dateRange.start,
                    end_date: currentFilters.dateRange.end,
                    category: currentFilters.category === 'all' ? undefined : currentFilters.category
                }
            });
            setData(response);
        } catch (error) {
            console.error('加载数据失败:', error);
            setDataError('数据加载失败，请检查网络连接或后端服务');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [getGradeIdByName]);
    
    // 组件加载时自动加载数据 - 筛选条件变化时自动查询
    // 使用 ref 避免无限循环
    const fetchDataRef = useRef(fetchData);
    useEffect(() => {
        fetchDataRef.current = fetchData;
    }, [fetchData]);
    
    useEffect(() => {
        // 确保学校和年级都已选择后才加载
        if (filterOptions.grades.length > 0 && filters.school && filters.grade) {
            fetchDataRef.current();
        }
    }, [filters.school, filters.grade, filters.dateRange, filterOptions.grades.length]);

    // 如果有错误，显示错误提示
    if (dataError) {
        return (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center space-x-3">
                <div className="flex-1">
                    <div className="font-medium">数据加载失败</div>
                    <div className="text-sm mt-1">{dataError}</div>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
                >
                    重试
                </button>
            </div>
        );
    }
    
    // 导出报表 - XLSX格式，带美观样式
    const handleExport = () => {
        if (!data || !data.classes[0]) return;
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        const schoolName = filters.school || '学校';
        const gradeName = filters.grade || '年级';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        // 准备表格数据
        const tableData: any[] = [];
        
        // 使用动态指标结构
        const indicatorStructure = data.indicatorStructure || [];
        const totalIndicatorCols = indicatorStructure.reduce((sum, cat) => sum + cat.subCategories.length, 0);
        const totalCols = 2 + totalIndicatorCols + 3; // 班级+班主任 + 五育 + 统计
        
        // 添加主标题行
        tableData.push([`${schoolName} ${gradeName} 年级五育量化表`]);
        
        // 添加部门和日期信息行
        const gradeDeptDateRow = [`部门: ${schoolName} ${gradeName}`, '', '', `日期: ${startDate} 至 ${endDate}`];
        while (gradeDeptDateRow.length < totalCols) gradeDeptDateRow.push('');
        tableData.push(gradeDeptDateRow);

        // 构建双行表头
        const headerRow1: string[] = ['班级', '班主任'];
        const headerRow2: string[] = ['', ''];
        
        // 从 indicatorStructure 动态构建表头
        indicatorStructure.forEach((cat) => {
            headerRow1.push(cat.name);
            for (let i = 1; i < cat.subCategories.length; i++) {
                headerRow1.push('');
            }
            cat.subCategories.forEach(sub => {
                headerRow2.push(sub.name);
            });
        });
        
        // 添加统计列
        headerRow1.push('综合扣分', '人均扣分', '年级排名');
        headerRow2.push('', '', '');
        
        tableData.push(headerRow1);
        tableData.push(headerRow2);
        
        // 添加数据行
        data.classes.forEach((cls: GradeReportData['classes'][0]) => {
            const rowData: any[] = [cls.class, cls.headTeacher];
            
            indicatorStructure.forEach((cat) => {
                cat.subCategories.forEach(sub => {
                    rowData.push((cls as any)[sub.fieldKey] || 0);
                });
            });
            
            rowData.push(cls.totalDed, cls.perCapita, cls.rank);
            tableData.push(rowData);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        
        // 设置列宽
        const colWidths = [{ wch: 10 }, { wch: 10 }];
        indicatorStructure.forEach((cat) => {
            cat.subCategories.forEach(() => colWidths.push({ wch: 8 }));
        });
        colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 10 });
        ws['!cols'] = colWidths;
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            { hpt: 25 },
            ...data.classes.map(() => ({ hpt: 20 }))
        ];
        
        // 合并单元格
        const merges: XLSX.Range[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
            { s: { r: 1, c: 3 }, e: { r: 1, c: totalCols - 1 } }
        ];
        
        // 合并五育大项表头 (headerRow1 在第2行，索引为2)
        let colIdx = 2;
        indicatorStructure.forEach((cat) => {
            if (cat.subCategories.length > 1) {
                merges.push({ s: { r: 2, c: colIdx }, e: { r: 2, c: colIdx + cat.subCategories.length - 1 } });
            }
            colIdx += cat.subCategories.length;
        });
        
        // 合并统计列表头
        merges.push({ s: { r: 2, c: colIdx }, e: { r: 3, c: colIdx } });
        merges.push({ s: { r: 2, c: colIdx + 1 }, e: { r: 3, c: colIdx + 1 } });
        merges.push({ s: { r: 2, c: colIdx + 2 }, e: { r: 3, c: colIdx + 2 } });
        
        ws['!merges'] = merges;
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const subHeaderFill = { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' as const };
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
                } else if (R === 3) {
                    cell.s.font = { bold: true, sz: 9, color: { rgb: '000000' } };
                    cell.s.fill = subHeaderFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, '年级五育量化表');
        const fileName = `${schoolName}_${gradeName}_年级报表_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // 导出详情报表
    const handleExportDetail = () => {
        if (!data || !data.records || data.records.length === 0) return;
        
        const wb = XLSX.utils.book_new();
        
        const schoolName = filters.school || '学校';
        const gradeName = filters.grade || '年级';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${schoolName} ${gradeName} 五育量化详情`]);
        
        // 添加日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['班级', '大项', '小项', '检查内容', '学生', '加分/减分', '分数', '时间']);
        
        // 数据行
        data.records.forEach((record: GradeReportData['records'][0]) => {
            let studentName: string;
            if (record.student && !record.student.startsWith('学生None')) {
                studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
            } else {
                // 根据记录来源判断显示内容
                const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                studentName = isDormCheck ? '宿舍整体' : '班级整体';
            }
            tableData.push([
                record.class,
                record.majorCategory,
                record.minorCategory,
                record.content,
                studentName,
                record.type,
                record.score,
                record.time
            ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 8;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 10 }, // 班级
            { wch: 10 }, // 大项
            { wch: 12 }, // 小项
            { wch: 30 }, // 检查内容
            { wch: 10 }, // 学生
            { wch: 10 }, // 加分/减分
            { wch: 8 },  // 分数
            { wch: 20 }  // 时间
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            ...data.records.map(() => ({ hpt: 20 }))
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
        
        XLSX.utils.book_append_sheet(wb, ws, '五育量化详情');
        const fileName = `${schoolName}_${gradeName}_五育量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1"></div>
                    <h2 className="text-2xl font-bold text-slate-900 text-center flex-1 whitespace-nowrap">
                        {filters.grade || '初一'} 年级五育量化详情
                    </h2>
                    <div className="flex-1 flex justify-end space-x-3">
                         <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <ArrowLeft className="w-4 h-4 mr-1" />
                             返回
                         </button>
                         <button 
                            onClick={handleExportDetail}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <Download className="w-4 h-4 mr-1" />
                             导出
                         </button>
                    </div>
                </div>

                {/* Detail Table */}
                {loading ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                        <div className="flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <span className="ml-3 text-slate-600">正在加载数据...</span>
                        </div>
                    </div>
                ) : data && data.records && data.records.length > 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">班级</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">大项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">小项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 w-1/4">检查内容</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">学生</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">加分/减分</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">分数</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">时间</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {data.records.map((record: GradeReportData['records'][0]) => {
                                    let studentName: string;
                                    if (record.student && !record.student.startsWith('学生None')) {
                                        studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
                                    } else {
                                        // 根据记录来源判断显示内容
                                        const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                                        const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                                        const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                                        studentName = isDormCheck ? '宿舍整体' : '班级整体';
                                    }
                                    return (
                                        <tr key={record.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.class}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.majorCategory}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.minorCategory}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600" title={record.content}>{record.content}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{studentName}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600">{record.type}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.score}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-500">{record.time}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2 text-sm text-slate-600">
                           <span>共 {data.records.length} 条</span>
                           <select className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none">
                               <option>10条/页</option>
                           </select>
                           <button className="px-2 py-1 text-slate-400 hover:text-blue-600">&lt;</button>
                           <button className="px-2 py-1 text-blue-600 font-bold">1</button>
                           <button className="px-2 py-1 text-slate-400 hover:text-blue-600">&gt;</button>
                           <span>前往</span>
                           <input type="text" defaultValue="1" className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"/>
                           <span>页</span>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                        <div className="flex items-center justify-center text-slate-500">
                            暂无数据
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header/Filter - 参考教学管理模块优化 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                 <h2 className="text-xl font-bold text-center text-slate-800">
                     {filters.school} {filters.grade || '年级'} 五育量化表
                 </h2>
                 
                 <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-end gap-4">
                          <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500">学校</label>
                              <div className="relative">
                                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <select 
                                    className="min-w-[180px] max-w-[280px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={filters.school}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, school: e.target.value})}
                                  >
                                      {filterOptions.schools.map((school: FilterOptions['schools'][0]) => (
                                          <option key={school.id} value={school.name}>{school.name}</option>
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
                                    value={filters.grade}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, grade: e.target.value})}
                                  >
                                      {filterOptions.grades.map((grade: FilterOptions['grades'][0]) => (
                                          <option key={grade.id} value={grade.name}>{grade.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          <DateRangePicker 
                              value={filters.dateRange}
                              onChange={(dateRange: { start: string; end: string }) => setFilters({...filters, dateRange})}
                          />
                      </div>
                      <div className="flex space-x-2">
                          <button 
                              onClick={fetchData}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                              查询
                          </button>
                          <button 
                              onClick={() => setFilters({
                                  school: filterOptions.schools[0]?.name || '',
                                  grade: filterOptions.grades[0]?.name || '',
                                  dateRange: getBeijingWeekRange()
                              })}
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
            {loading ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                    <div className="flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <span className="ml-3 text-slate-600">正在加载数据...</span>
                    </div>
                </div>
            ) : data ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <div className="min-w-[1200px] p-4">
                        <div className="text-center font-bold text-slate-800 mb-2">
                            {filters.school} {data.gradeName} 五育量化表
                        </div>
                        <div className="text-right text-xs text-slate-500 mb-2">
                            年级: {data.gradeName} &nbsp;&nbsp; 
                            日期: {data.reportPeriod.startDate} 至 {data.reportPeriod.endDate}
                        </div>
                        
                        <table className="w-full border-collapse border border-slate-300 text-xs">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th rowSpan={2} className="border border-slate-300 px-2 py-1">班级</th>
                                    <th rowSpan={2} className="border border-slate-300 px-2 py-1">班主任</th>
                                    {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                        <th 
                                            key={cat.name} 
                                            colSpan={cat.subCategories.length} 
                                            className={`border border-slate-300 px-2 py-1 ${
                                                cat.name === '德育' ? 'bg-blue-50' :
                                                cat.name === '智育' ? 'bg-green-50' :
                                                cat.name === '体育' ? 'bg-yellow-50' :
                                                cat.name === '美育' ? 'bg-purple-50' :
                                                cat.name === '劳育' ? 'bg-orange-50' : 'bg-slate-50'
                                            }`}
                                        >
                                            {cat.name}
                                        </th>
                                    ))}
                                    <th rowSpan={2} className="border border-slate-300 px-2 py-1">综合扣分</th>
                                    <th rowSpan={2} className="border border-slate-300 px-2 py-1">人均扣分</th>
                                    <th rowSpan={2} className="border border-slate-300 px-2 py-1">班级排名</th>
                                </tr>
                                <tr>
                                    {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                        cat.subCategories.map((sub: IndicatorSubCategory) => (
                                            <th key={sub.fieldKey} className="border border-slate-300 px-1 py-1 font-normal">
                                                {sub.name}
                                            </th>
                                        ))
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.classes.map((row: DynamicClassData, idx: number) => (
                                    <tr key={idx} className="text-center hover:bg-slate-50">
                                        <td className="border border-slate-300 px-2 py-1.5">{row.class}</td>
                                        <td className="border border-slate-300 px-2 py-1.5">{row.headTeacher}</td>
                                        {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                            cat.subCategories.map((sub: IndicatorSubCategory) => (
                                                <td key={sub.fieldKey} className="border border-slate-300 px-1 py-1.5 text-slate-600">
                                                    {row[sub.fieldKey] || 0}
                                                </td>
                                            ))
                                        ))}
                                        <td className="border border-slate-300 px-2 py-1.5 font-bold text-slate-800">{row.totalDed}</td>
                                        <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{row.perCapita}</td>
                                        <td className="border border-slate-300 px-2 py-1.5 font-bold text-blue-600">{row.rank}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                    <div className="flex items-center justify-center text-slate-500">
                        暂无数据
                    </div>
                </div>
            )}

            {/* Analysis Input */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 border-l-4 border-blue-500 pl-3">五育分析评价</h3>
                
                <div className="flex space-x-4 border-b border-slate-200 pb-2">
                     {['德育', '智育', '体育', '美育', '劳育'].map((tab, idx) => (
                        <button key={tab} className={`text-sm font-medium pb-2 ${idx === 0 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                            {tab}
                        </button>
                     ))}
                </div>

                <div className="relative">
                    <textarea 
                        className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="请输入德育方面的分析评价..."
                    ></textarea>
                    <div className="absolute bottom-2 right-2 text-xs text-slate-400">提示：最多输入2000字</div>
                </div>

                {hasPermission('moral:edit') && (
                    <div>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">保存德育评价</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// 3. School Report Component - 使用 API 数据
const SchoolReport: React.FC = () => {
    // ... (Use existing code for SchoolReport if needed, but the user didn't ask to change it specifically, just DistrictReport)
    // To save tokens, I'll just include the necessary parts for the file update.
    // Assuming the user wants the FULL file content to be valid, I need to include SchoolReport and DormReport.
    // I'll copy them from the original file content provided in the prompt.
    const [analysisType, setAnalysisType] = useState('德育');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SchoolReportData | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        school: '',
        dateRange: getBeijingWeekRange(),
        category: 'all'
    });
    const filtersRef = useRef(filters);
    useEffect(() => {
    filtersRef.current = filters;
    }, [filters]);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        schools: [],
        grades: [],
        classes: []
    });
    // 加载学校列表
    useEffect(() => {
        const loadSchools = async () => {
            try {
                const response = await api.get('/api/org/tree');
                if (response && Array.isArray(response)) {
                    const schools = extractSchools(response);
                    setFilterOptions((prev: FilterOptions) => ({ ...prev, schools }));
                    if (schools.length > 0 && !filters.school) {
                        setFilters((prev: typeof filters) => ({ ...prev, school: schools[0].name }));
                    }
                }
            } catch (error) {
                console.error('加载学校列表失败:', error);
            }
        };
        loadSchools();
    }, []);

    // 获取当前选中学校的ID
    const getSelectedSchoolId = () => {
        const selectedSchool = filterOptions.schools.find((s: { id: number; name: string }) => s.name === filters.school);
        return selectedSchool?.id;
    };

    // 加载报表数据
    const loadSchoolReport = useCallback(async () => {
        const schoolId = getSelectedSchoolId();
        if (!schoolId) return;

        setLoading(true);
        setDataError(null);
        try {
            const response = await api.get<SchoolReportData>('/api/moral/school-report', {
                params: {
                    school_id: schoolId,  // ✅ 使用数字ID
                    start_date: filters.dateRange.start,
                    end_date: filters.dateRange.end,
                    category: filters.category === 'all' ? undefined : filters.category
                }
            });
            setData(response);
        } catch (error: any) {
            console.error('加载校级报表失败:', error);
            setDataError(error?.response?.data?.detail || '加载数据失败');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [filters.school, filters.dateRange, filters.category, filterOptions.schools]);

    // 初始加载和筛选变化时重新加载
    useEffect(() => {
        if (filters.school && filterOptions.schools.length > 0) {
            loadSchoolReport();
        }
    }, [filters.school, filters.dateRange, filters.category, filterOptions.schools, loadSchoolReport]);

    const [view, setView] = useState<'summary' | 'detail'>('summary');
    
    // 导出详情报表
    const handleExportSchoolDetail = () => {
        if (!data || !data.records || data.records.length === 0) return;
        
        const wb = XLSX.utils.book_new();
        
        const schoolName = filters.school || '学校';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${schoolName} 校级五育量化详情`]);
        
        // 添加日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['年级', '班级', '大项', '小项', '检查内容', '学生', '加分/减分', '分数', '时间']);
        
        // 数据行
        data.records.forEach((record: SchoolReportData['records'][0]) => {
            let studentName: string;
            if (record.student && !record.student.startsWith('学生None')) {
                studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
            } else {
                // 根据记录来源判断显示内容
                const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                studentName = isDormCheck ? '宿舍整体' : '班级整体';
            }
            tableData.push([
                record.grade,
                record.class,
                record.majorCategory,
                record.minorCategory,
                record.content,
                studentName,
                record.type,
                record.score,
                record.time
            ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 9;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 10 }, // 年级
            { wch: 10 }, // 班级
            { wch: 10 }, // 大项
            { wch: 12 }, // 小项
            { wch: 30 }, // 检查内容
            { wch: 10 }, // 学生
            { wch: 10 }, // 加分/减分
            { wch: 8 },  // 分数
            { wch: 20 }  // 时间
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            ...data.records.map(() => ({ hpt: 20 }))
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
        
        XLSX.utils.book_append_sheet(wb, ws, '校级五育量化详情');
        const fileName = `${schoolName}_校级五育量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // Detailed View (School-Level Detail)
    if (view === 'detail') {
        return (
            <div className="space-y-6">
                 {/* Header */}
                <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1"></div>
                    <h2 className="text-2xl font-bold text-slate-900 text-center flex-1 whitespace-nowrap">
                        {data?.schoolName || filters.school || '学校'} 校级五育量化详情
                    </h2>
                    <div className="flex-1 flex justify-end space-x-3">
                         <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                         >
                             <ArrowLeft className="w-4 h-4 mr-1" />
                             返回
                         </button>
                         <button 
                            onClick={handleExportSchoolDetail}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center">
                             <Download className="w-4 h-4 mr-1" />
                             导出
                         </button>
                    </div>
                </div>
  
                 {/* Detail Table */}
                 {loading ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                        <div className="flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <span className="ml-3 text-slate-600">正在加载数据...</span>
                        </div>
                    </div>
                 ) : data && data.records && data.records.length > 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">年级</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">班级</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">大项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">小项</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500 w-1/4">检查内容</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">学生</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">加分/减分</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">分数</th>
                                    <th className="px-6 py-4 text-center text-sm font-medium text-slate-500">时间</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {data.records.map((record: SchoolReportData['records'][0]) => {
                                    let studentName: string;
                                    if (record.student && !record.student.startsWith('学生None')) {
                                        studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
                                    } else {
                                        // 根据记录来源判断显示内容
                                        const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                                        const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                                        const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                                        studentName = isDormCheck ? '宿舍整体' : '班级整体';
                                    }
                                    return (
                                        <tr key={record.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.grade}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.class}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.majorCategory}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.minorCategory}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600" title={record.content}>{record.content}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{studentName}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-600">{record.type}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-900">{record.score}</td>
                                            <td className="px-6 py-4 text-sm text-center text-slate-500">{record.time}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2 text-sm text-slate-600">
                            <span>共 {data.records.length} 条</span>
                            <select className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none">
                                <option>10条/页</option>
                            </select>
                            <button className="px-2 py-1 text-slate-400 hover:text-blue-600">&lt;</button>
                            <button className="px-2 py-1 text-blue-600 font-bold">1</button>
                            <button className="px-2 py-1 text-slate-400 hover:text-blue-600">&gt;</button>
                            <span>前往</span>
                            <input type="text" defaultValue="1" className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"/>
                            <span>页</span>
                        </div>
                    </div>
                 ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                        <div className="flex items-center justify-center text-slate-500">
                            暂无数据
                        </div>
                    </div>
                 )}
            </div>
        );
    }
  
    // 导出报表 - XLSX格式，带美观样式
    const handleExport = () => {
        if (!data) return;
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        const schoolName = data.schoolName || filters.school || '学校';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        // 准备表格数据
        const tableData: any[] = [];
        
        // 使用动态指标结构
        const indicatorStructure = data.indicatorStructure || [];
        const totalIndicatorCols = indicatorStructure.reduce((sum, cat) => sum + cat.subCategories.length, 0);
        const totalCols = 1 + totalIndicatorCols + 3; // 年级 + 五育 + 统计
        
        // 添加主标题行
        tableData.push([`${schoolName} 校级五育量化表`]);
        
        // 添加部门和日期信息行
        const schoolDeptDateRow = [`部门: ${schoolName}`, '', '', `日期: ${startDate} 至 ${endDate}`];
        while (schoolDeptDateRow.length < totalCols) schoolDeptDateRow.push('');
        tableData.push(schoolDeptDateRow);

        // 构建表头
        const headerRow1: string[] = ['年级'];
        const headerRow2: string[] = [''];
        
        // 从 indicatorStructure 动态构建表头
        indicatorStructure.forEach((cat) => {
            headerRow1.push(cat.name);
            for (let i = 1; i < cat.subCategories.length; i++) {
                headerRow1.push('');
            }
            cat.subCategories.forEach(sub => {
                headerRow2.push(sub.name);
            });
        });
        
        // 添加统计列
        headerRow1.push('综合扣分', '人均扣分', '年级排名');
        headerRow2.push('', '', '');
        
        tableData.push(headerRow1);
        tableData.push(headerRow2);
        
        // 添加数据行
        data.grades.forEach((row: SchoolReportData['grades'][0]) => {
            const rowData: any[] = [row.grade];
            
            indicatorStructure.forEach((cat) => {
                cat.subCategories.forEach(sub => {
                    rowData.push((row as any)[sub.fieldKey] || 0);
                });
            });
            
            rowData.push(row.totalDed, row.perCapita, row.rank);
            tableData.push(rowData);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        
        // 设置列宽
        const colWidths = [{ wch: 10 }];
        indicatorStructure.forEach((cat) => {
            cat.subCategories.forEach(() => colWidths.push({ wch: 8 }));
        });
        colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 10 });
        ws['!cols'] = colWidths;
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            { hpt: 25 },
            ...data.grades.map(() => ({ hpt: 20 }))
        ];
        
        // 合并单元格
        const merges: XLSX.Range[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
            { s: { r: 1, c: 3 }, e: { r: 1, c: totalCols - 1 } }
        ];
        
        // 合并五育大项表头 (headerRow1 在第2行，索引为2)
        let colIdx = 1;
        indicatorStructure.forEach((cat) => {
            if (cat.subCategories.length > 1) {
                merges.push({ s: { r: 2, c: colIdx }, e: { r: 2, c: colIdx + cat.subCategories.length - 1 } });
            }
            colIdx += cat.subCategories.length;
        });
        
        // 合并统计列表头
        merges.push({ s: { r: 2, c: colIdx }, e: { r: 3, c: colIdx } });
        merges.push({ s: { r: 2, c: colIdx + 1 }, e: { r: 3, c: colIdx + 1 } });
        merges.push({ s: { r: 2, c: colIdx + 2 }, e: { r: 3, c: colIdx + 2 } });
        
        ws['!merges'] = merges;
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const subHeaderFill = { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' as const };
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
                } else if (R === 3) {
                    cell.s.font = { bold: true, sz: 9, color: { rgb: '000000' } };
                    cell.s.fill = subHeaderFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, '校级五育量化表');
        const fileName = `${schoolName}_校级报表_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };


    // 如果有错误，显示错误提示
    if (dataError) {
        return (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center space-x-3">
                <div className="flex-1">
                    <div className="font-medium">数据加载失败</div>
                    <div className="text-sm mt-1">{dataError}</div>
                </div>
                <button
                    onClick={loadSchoolReport}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
                >
                    重试
                </button>
            </div>
        );
    }

    // Summary View
    return (
       <div className="space-y-6">
          {/* Header/Filter - 参考教学管理模块优化 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
              <h2 className="text-xl font-bold text-center text-slate-800">
                  {filters.school || '学校'} 校级五育量化表
              </h2>
              
              <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-end gap-4">
                      <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-500">学校</label>
                          <div className="relative">
                              <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <select 
                                  className="min-w-[180px] max-w-[280px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                  value={filters.school}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, school: e.target.value})}
                              >
                                  {filterOptions.schools.map((school: FilterOptions['schools'][0]) => (
                                      <option key={school.id} value={school.name}>{school.name}</option>
                                  ))}
                              </select>
                          </div>
                      </div>
                      <DateRangePicker 
                          value={filters.dateRange}
                          onChange={(dateRange: { start: string; end: string }) => setFilters({...filters, dateRange})}
                      />
                  </div>
                  <div className="flex space-x-2">
                      <button 
                          onClick={loadSchoolReport}
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                          查询
                      </button>
                      <button 
                          onClick={() => setFilters({
                              ...filters,
                              school: filterOptions.schools[0]?.name || '',
                              dateRange: getBeijingWeekRange()
                          })}
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
          {loading ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                  <div className="flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <span className="ml-3 text-slate-600">正在加载数据...</span>
                  </div>
              </div>
          ) : data ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                  <div className="min-w-[1500px] p-4">
                       <div className="flex justify-between items-end mb-2 relative">
                           <p className="text-xs text-slate-500 mx-auto font-bold text-base">{data.schoolName} 学生事务部五育量化表</p>
                           <div className="text-xs text-slate-500 sticky right-0 bg-white pl-4">
                              <span className="mr-4">部门: 学生事务部</span>
                              <span>日期: {filters.dateRange.start} 至 {filters.dateRange.end}</span>
                           </div>
                       </div>
                       
                       <table className="w-full border-collapse border border-slate-200 text-xs text-center">
                          <thead className="bg-slate-50">
                              <tr>
                                  <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">年级</th>
                                  {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                      <th 
                                          key={cat.name} 
                                          colSpan={cat.subCategories.length} 
                                          className="border border-slate-200 px-2 py-2 text-slate-600 font-medium"
                                      >
                                          {cat.name}
                                      </th>
                                  ))}
                                  <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">综合扣分</th>
                                  <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">人均扣分</th>
                                  <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">年级排名</th>
                              </tr>
                              <tr>
                                  {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                      cat.subCategories.map((sub: IndicatorSubCategory) => (
                                          <th key={sub.fieldKey} className="border border-slate-200 px-1 py-1 font-normal text-slate-500">
                                              {sub.name}
                                          </th>
                                      ))
                                  ))}
                              </tr>
                          </thead>
                          <tbody>
                              {data.grades.map((row: DynamicGradeData, index: number) => (
                                  <tr key={index} className="hover:bg-slate-50">
                                      <td className="border border-slate-200 px-2 py-2 text-slate-700 bg-slate-50">{row.grade}</td>
                                      {data.indicatorStructure?.map((cat: IndicatorCategory) => (
                                          cat.subCategories.map((sub: IndicatorSubCategory) => (
                                              <td key={sub.fieldKey} className="border border-slate-200 px-1 py-2 text-slate-600">
                                                  {row[sub.fieldKey] || 0}
                                              </td>
                                          ))
                                      ))}
                                      <td className="border border-slate-200 px-1 py-2 font-bold text-slate-800 bg-slate-50">{row.totalDed}</td>
                                      <td className="border border-slate-200 px-1 py-2 text-slate-600">{row.perCapita}</td>
                                      <td className="border border-slate-200 px-1 py-2 font-medium text-slate-800">{row.rank}</td>
                                  </tr>
                              ))}
                          </tbody>
                       </table>
                  </div>
              </div>
          ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                  <div className="flex items-center justify-center text-slate-500">
                      暂无数据
                  </div>
              </div>
          )}
  
          {/* Analysis */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900">五育分析评价</h3>
              
              <div className="flex space-x-6 border-b border-slate-200">
                  {['德育', '智育', '体育', '美育', '劳育'].map(type => (
                      <button
                          key={type}
                          onClick={() => setAnalysisType(type)}
                          className={`pb-2 text-sm font-medium transition-colors ${
                              analysisType === type 
                                  ? 'border-b-2 border-blue-500 text-blue-600' 
                                  : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                          {type}
                      </button>
                  ))}
              </div>
              
              <div className="relative">
                  <textarea 
                      className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                      placeholder={`请输入${analysisType}方面的分析评价...`}
                  ></textarea>
                  <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
              </div>
  
              {hasPermission('moral:edit') && (
                  <div className="flex justify-start">
                       <button className="px-6 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                           保存德育评价
                       </button>
                  </div>
              )}
          </div>
       </div>
    )
  }

// 4. Dorm Report Component - 使用 API 数据
const DormReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DormReportData[]>([]);
    const [detailData, setDetailData] = useState<DormDetailRecord[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [analysisType, setAnalysisType] = useState('寝室内务');
    
    // 筛选器状态
    const [filters, setFilters] = useState({
        school: '',
        grade: '',
        class: '',
        dateRange: getBeijingWeekRange()
    });
    
    // 筛选选项
    const [filterOptions, setFilterOptions] = useState<{
        schools: { id: number; name: string }[];
        grades: { id: number; name: string }[];
        classes: { id: number; name: string }[];
    }>({
        schools: [],
        grades: [],
        classes: []
    });
    
    // 保存完整的组织机构树，用于联动筛选
    const [orgTreeData, setOrgTreeData] = useState<any[]>([]);
    
    // 详情页分页
    const [detailPagination, setDetailPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0
    });
    
    // ref for filters
    const filtersRef = useRef(filters);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);
    
    // 加载筛选选项
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const orgTree = await api.get<any[]>('/api/org/tree');
                setOrgTreeData(orgTree);
                
                const schools: { id: number; name: string }[] = [];
                
                orgTree.forEach((group: any) => {
                    if (group.children) {
                        group.children.forEach((school: any) => {
                            if (school.type === 'school') {
                                schools.push({ id: school.id, name: school.name });
                            }
                        });
                    }
                });
                
                // 设置默认值并触发年级班级加载
                if (schools.length > 0 && !filters.school) {
                    const defaultSchool = schools[0].name;
                    setFilters((prev: typeof filters) => ({ ...prev, school: defaultSchool }));
                    // 根据默认学校加载年级和班级
                    updateGradeClassOptions(orgTree, defaultSchool);
                } else if (filters.school) {
                    // 如果已有选中的学校，更新年级班级选项
                    updateGradeClassOptions(orgTree, filters.school);
                }
                
                setFilterOptions(prev => ({ ...prev, schools }));
            } catch (error) {
                console.error('加载筛选选项失败:', error);
            }
        };
        
        loadFilterOptions();
    }, []);
    
    // 根据选中的学校更新年级和班级选项
    const [gradeClassMap, setGradeClassMap] = useState<Record<string, { id: number; name: string }[]>>({});
    
    const updateGradeClassOptions = (orgTree: any[], schoolName: string) => {
        const grades: { id: number; name: string }[] = [];
        const allClasses: { id: number; name: string }[] = [];
        const newGradeClassMap: Record<string, { id: number; name: string }[]> = {};
        
        orgTree.forEach((group: any) => {
            if (group.children) {
                group.children.forEach((school: any) => {
                    if (school.type === 'school' && school.name === schoolName) {
                        if (school.children) {
                            school.children.forEach((grade: any) => {
                                if (grade.type === 'grade') {
                                    grades.push({ id: grade.id, name: grade.name });
                                    
                                    const gradeClasses: { id: number; name: string }[] = [];
                                    if (grade.children) {
                                        grade.children.forEach((cls: any) => {
                                            if (cls.type === 'class') {
                                                gradeClasses.push({ id: cls.id, name: cls.name });
                                                allClasses.push({ id: cls.id, name: cls.name });
                                            }
                                        });
                                    }
                                    newGradeClassMap[grade.name] = gradeClasses;
                                }
                            });
                        }
                    }
                });
            }
        });
        
        setGradeClassMap(newGradeClassMap);
        setFilterOptions(prev => ({ ...prev, grades, classes: allClasses }));
    };
    
    // 监听学校变化，更新年级和班级选项
    useEffect(() => {
        if (orgTreeData.length > 0 && filters.school) {
            updateGradeClassOptions(orgTreeData, filters.school);
            // 清空已选中的年级和班级
            setFilters(prev => ({ ...prev, grade: '', class: '' }));
        }
    }, [filters.school, orgTreeData]);
    
    // 获取当前选中学校的ID
    const getSelectedSchoolId = () => {
        const selectedSchool = filterOptions.schools.find((s: { id: number; name: string }) => s.name === filters.school);
        return selectedSchool?.id;
    };

    // 加载报表数据
    const loadDormReport = useCallback(async () => {
        const schoolId = getSelectedSchoolId();
        if (!schoolId) return;
        
        setLoading(true);
        setDataError(null);
        try {
            // 从API获取班级列表
            const classesResponse = await api.get<any[]>(`/api/org/${schoolId}/classes`);
            
            // 获取年级信息（用于关联班级到年级）
            // 从学校组织架构树中获取年级信息
            const orgTreeResponse = await api.get<any[]>(`/api/org/tree`);
            let gradeMap: Record<number, string> = {};
            
            // 递归查找学校下的年级
            const findGrades = (orgs: any[], targetSchoolId: number): boolean => {
                for (const org of orgs) {
                    if (org.type === 'school' && org.id === targetSchoolId) {
                        // 找到学校，提取其下的年级
                        if (org.children) {
                            org.children.forEach((child: any) => {
                                if (child.type === 'grade') {
                                    gradeMap[child.id] = child.name;
                                }
                            });
                        }
                        return true;
                    }
                    if (org.children && findGrades(org.children, targetSchoolId)) {
                        return true;
                    }
                }
                return false;
            };
            findGrades(orgTreeResponse, schoolId);

            // 直接使用 classesResponse 中的数据（已包含班主任信息）
            const classDetails = classesResponse.map((cls: any) => ({
                id: cls.id,
                name: cls.name,
                grade: gradeMap[cls.parent_id] || '',
                headTeacher: cls.head_teacher || '',  // 直接使用API返回的head_teacher
                studentCount: cls.student_count || 0
            }));

            // 定义年级排序顺序
            const gradeOrder: Record<string, number> = {
                '初一': 1, '初二': 2, '初三': 3,
                '高一': 4, '高二': 5, '高三': 6,
                '小一': 1, '小二': 2, '小三': 3, '小四': 4, '小五': 5, '小六': 6
            };

            // 根据排序规则排序：先按年级，再按班级名称
            const sortedClassDetails = classDetails.sort((a: any, b: any) => {
                // 比较年级
                const gradeOrderA = gradeOrder[a.grade] ?? 999;
                const gradeOrderB = gradeOrder[b.grade] ?? 999;
                if (gradeOrderA !== gradeOrderB) {
                    return gradeOrderA - gradeOrderB;
                }

                // 年级相同，按班级名称排序
                return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
            });

            // 根据筛选条件过滤
            let filteredClasses = sortedClassDetails;
            if (filters.grade) {
                filteredClasses = filteredClasses.filter((c: any) => c.grade === filters.grade);
            }
            if (filters.class) {
                filteredClasses = filteredClasses.filter((c: any) => c.name === filters.class);
            }

            // 调用宿舍报表API获取量化数据
            const dormReportParams = new URLSearchParams({
                school_id: schoolId.toString(),
                start_date: filters.dateRange.start,
                end_date: filters.dateRange.end
            });
            if (filters.grade) dormReportParams.append('grade', filters.grade);
            if (filters.class) dormReportParams.append('class_name', filters.class);
            
            const dormReportResponse = await api.get<{data: DormReportData[], total: number}>(
                `/api/dorm/report?${dormReportParams.toString()}`
            );
            
            setData(dormReportResponse.data || []);
        } catch (error: any) {
            console.error('加载宿舍报表失败:', error);
            setDataError(error?.response?.data?.detail || '加载数据失败');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [filters, filterOptions.schools]);
    
    // 初始加载和筛选变化时重新加载
    useEffect(() => {
        if (filters.school && filterOptions.schools.length > 0) {
            loadDormReport();
        }
    }, [filters.school, filters.grade, filters.class, filters.dateRange, filterOptions.schools, loadDormReport]);
    
    // 处理查询
    const handleSearch = useCallback(() => {
        loadDormReport();
    }, [loadDormReport]);
    
    // 处理重置
    const handleReset = useCallback(() => {
        setFilters(prev => ({
            ...prev,
            grade: '',
            class: '',
            dateRange: getBeijingWeekRange()
        }));
        // 触发重新加载数据
        loadDormReport();
    }, [loadDormReport]);
    
    // 处理导出 - XLSX格式，带美观样式
    const handleExport = useCallback(() => {
        if (!data || data.length === 0) return;
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        const schoolName = filters.school || '学校';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        // 准备表格数据
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${schoolName} 宿舍量化报表`]);
        
        // 添加部门和日期信息行 - 宿舍报表共14列
        const dormTotalCols = 14;
        const dormDeptDateRow = [`部门: ${schoolName}`, '', '', `日期: ${startDate} 至 ${endDate}`];
        while (dormDeptDateRow.length < dormTotalCols) dormDeptDateRow.push('');
        tableData.push(dormDeptDateRow);
        
        // 构建双行表头
        const headerRow1: string[] = ['年级', '班级', '班主任', '寝室内务', '', '', '午休晚休', '', '', '总扣分', '班级人数', '人均扣分', '排名', '综合得分'];
        const headerRow2: string[] = ['', '', '', '男生寝室内务', '女生寝室内务', '寝室内务总分', '男生午休晚休', '女生午休晚休', '午休晚休总分', '', '', '', '', ''];
        
        tableData.push(headerRow1);
        tableData.push(headerRow2);
        
        // 添加数据行
        data.forEach((row: DormReportData) => {
            const rowData: any[] = [
                row.grade, row.class, row.headTeacher,
                row.mContent, row.fContent, row.content,
                row.mNap, row.fNap, row.nap,
                row.totalDed, row.student_count, row.perCapita, row.rank, row.score
            ];
            tableData.push(rowData);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = headerRow1.length;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 8 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 8 }, { wch: 10 }
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            { hpt: 25 },
            ...data.map(() => ({ hpt: 20 }))
        ];
        
        // 合并单元格
        const merges: XLSX.Range[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
            { s: { r: 1, c: 3 }, e: { r: 1, c: totalCols - 1 } },
            // 年级、班级、班主任（两行合并）
            { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
            { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
            { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },
            // 寝室内务合并
            { s: { r: 3, c: 3 }, e: { r: 3, c: 5 } },
            // 午休晚休合并
            { s: { r: 3, c: 6 }, e: { r: 3, c: 8 } },
            // 统计列合并
            { s: { r: 3, c: 9 }, e: { r: 4, c: 9 } },
            { s: { r: 3, c: 10 }, e: { r: 4, c: 10 } },
            { s: { r: 3, c: 11 }, e: { r: 4, c: 11 } },
            { s: { r: 3, c: 12 }, e: { r: 4, c: 12 } },
            { s: { r: 3, c: 13 }, e: { r: 4, c: 13 } }
        ];
        
        ws['!merges'] = merges;
        
        // 设置样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const };
        const subHeaderFill = { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' as const };
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
                } else if (R === 3) {
                    cell.s.font = { bold: true, sz: 9, color: { rgb: '000000' } };
                    cell.s.fill = subHeaderFill;
                    cell.s.alignment = centerAlign;
                } else {
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, '宿舍量化报表');
        const fileName = `${schoolName}_宿舍量化报表_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }, [data, filters.dateRange, filters.school]);

    // 导出详情报表
    const handleExportDetail = useCallback(() => {
        if (!detailData || detailData.length === 0) return;
        
        const wb = XLSX.utils.book_new();
        
        const schoolName = filters.school || '学校';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${schoolName} 宿舍量化详情`]);
        
        // 添加日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['年级', '班级', '班主任', '学生姓名', '宿舍号', '大项', '小项', '扣分项', '加分/减分', '分数', '时间']);
        
        // 数据行
        detailData.forEach((record: DormDetailRecord) => {
            tableData.push([
                record.grade,
                record.class,
                record.headTeacher,
                record.student,
                record.dormNo,
                record.majorCategory,
                record.minorCategory,
                record.reason,
                record.type,
                record.score,
                record.time
            ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 11;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 10 }, // 年级
            { wch: 10 }, // 班级
            { wch: 10 }, // 班主任
            { wch: 10 }, // 学生姓名
            { wch: 10 }, // 宿舍号
            { wch: 10 }, // 大项
            { wch: 12 }, // 小项
            { wch: 30 }, // 扣分项
            { wch: 10 }, // 加分/减分
            { wch: 8 },  // 分数
            { wch: 20 }  // 时间
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            ...detailData.map(() => ({ hpt: 20 }))
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
        
        XLSX.utils.book_append_sheet(wb, ws, '宿舍量化详情');
        const fileName = `${schoolName}_宿舍量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }, [detailData, filters.dateRange, filters.school]);
    
    // 加载详情数据
    const loadDetailData = useCallback(async (page: number = detailPagination.page, pageSize: number = detailPagination.pageSize) => {
        const schoolId = getSelectedSchoolId();
        if (!schoolId) return;
        
        setDetailLoading(true);
        setDataError(null);
        try {
            // 先获取班级列表和班主任信息
            const classesResponse = await api.get<any[]>(`/api/org/${schoolId}/classes`);
            const classMap: Record<number, any> = {};
            classesResponse.forEach((cls: any) => {
                if (cls.id) {
                    classMap[cls.id] = cls;
                }
            });
            
            // 调用API获取宿舍检查记录
            const params = new URLSearchParams({
                school_id: schoolId.toString(),
                page: page.toString(),
                page_size: pageSize.toString()
            });
            
            // 添加年级筛选参数
            if (filters.grade) {
                params.append('grade', filters.grade);
            }
            // 添加班级筛选参数
            if (filters.class) {
                params.append('class_name', filters.class);
            }
            
            if (filters.dateRange?.start) {
                params.append('start_date', filters.dateRange.start + 'T00:00:00');
            }
            if (filters.dateRange?.end) {
                params.append('end_date', filters.dateRange.end + 'T23:59:59');
            }
            
            const response = await api.get<{total: number; page: number; page_size: number; records: any[]}>(
                `/api/dorm/records?${params.toString()}`
            );
            
            // 转换API返回数据为前端格式
            const formattedRecords: DormDetailRecord[] = response.records?.map((record: any) => {
                // 从description解析宿舍号
                // description格式: [午休晚休] 不按时午休 (生活老师检查扣分) | 男生宿舍楼1层109房间
                let dormNo = '-';
                if (record.description) {
                    // 尝试匹配 "XXX楼X层XXX房间" 格式
                    const roomMatch = record.description.match(/(\S+楼\d+层\d+房间?)/);
                    if (roomMatch) {
                        dormNo = roomMatch[1];
                    } else {
                        // 尝试匹配 "|" 后面的内容
                        const pipeMatch = record.description.split('|');
                        if (pipeMatch.length > 1) {
                            dormNo = pipeMatch[1].trim();
                        }
                    }
                }
                
                // 处理学生姓名 - 去掉 "床位X " 前缀
                // 宿舍检查的整体检查记录没有学生姓名，显示"宿舍整体"而不是"班级整体"
                let studentName = record.student_name;
                if (!studentName) {
                    // 根据记录来源判断显示内容
                    // source='overall' 表示整体检查记录
                    studentName = record.source === 'overall' 
                        ? '宿舍整体' 
                        : '班级整体';
                }
                studentName = studentName.replace(/^床位\d+\s+/, '');
                
                // 获取班主任信息 - 从班级API数据中获取
                const classId = record.class_id;
                const classInfo = classId ? classMap[classId] : null;
                const headTeacher = classInfo?.head_teacher || classInfo?.headTeacher || classInfo?.class_info?.head_teacher_name || '-';
                
                return {
                    id: record.id,
                    grade: record.grade_name || '-',
                    class: record.class_name || '-',
                    headTeacher: headTeacher,
                    student: studentName,
                    dormNo: dormNo,
                    majorCategory: record.major_category || '宿舍检查',
                    minorCategory: record.minor_category || '-',
                    reason: record.rule_snapshot || '-',
                    type: (record.score_change || 0) >= 0 ? '加分' : '减分',
                    score: record.score_change || 0,
                    time: record.record_time ? new Date(record.record_time).toLocaleString('zh-CN') : '-'
                };
            }) || [];
            
            setDetailData(formattedRecords);
            setDetailPagination(prev => ({ 
                ...prev, 
                total: response.total || 0,
                page: response.page || page
            }));
        } catch (error: any) {
            console.error('加载详情失败:', error);
            setDataError(error?.response?.data?.detail || '加载详情数据失败');
            setDetailData([]);
            setDetailPagination(prev => ({ ...prev, total: 0 }));
        } finally {
            setDetailLoading(false);
        }
    }, [filters.school, filters.grade, filters.class, filters.dateRange, filterOptions.schools, detailPagination.page, detailPagination.pageSize]);
    
    // 切换到详情页时加载数据
    useEffect(() => {
        if (view === 'detail' && filters.school) {
            // 重置到第一页
            setDetailPagination(prev => ({ ...prev, page: 1 }));
            loadDetailData(1, detailPagination.pageSize);
        }
    }, [view, filters.school, filters.grade, filters.class, filters.dateRange.start, filters.dateRange.end]);
    
    // Process data to group by grade for rowspan logic
    const groupedData: Record<string, DormReportData[]> = {};
    data.forEach((record: DormReportData) => {
        if (!groupedData[record.grade]) {
            groupedData[record.grade] = [];
        }
        groupedData[record.grade].push(record);
    });
    
    // 对每个年级内的班级按年级排名排序
    Object.keys(groupedData).forEach(grade => {
        groupedData[grade].sort((a, b) => (a.gradeRank || 999) - (b.gradeRank || 999));
    });

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                 {/* Header */}
                 <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex-1"></div>
                      <h2 className="text-2xl font-bold text-slate-900 text-center flex-1 whitespace-nowrap">
                          {filters.school || '学校'} 宿舍量化详情
                      </h2>
                      <div className="flex-1 flex justify-end space-x-3">
                          <button 
                              onClick={() => setView('summary')}
                              className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                          >
                              <ArrowLeft className="w-4 h-4 mr-1" />
                              返回
                          </button>
                          <button 
                              onClick={handleExportDetail}
                              className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                          >
                              <Download className="w-4 h-4 mr-1" />
                              导出
                          </button>
                      </div>
                 </div>
                 
                 {/* Detail Table Container */}
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                      {detailLoading ? (
                          <div className="flex items-center justify-center h-64">
                              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                              <span className="ml-3 text-slate-600">正在加载数据...</span>
                          </div>
                      ) : (
                          <>
                              <table className="min-w-full divide-y divide-slate-200">
                                   <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">年级</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">班级</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">班主任</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">学生姓名</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">宿舍号</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">大项</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">小项</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-64">扣分项</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">加分/减分</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">分数</th>
                                            <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">时间</th>
                                        </tr>
                                   </thead>
                                   <tbody className="bg-white divide-y divide-slate-200">
                                        {detailData.length > 0 ? (
                                            detailData.map((record: DormDetailRecord) => (
                                                <tr key={record.id} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 text-sm text-center">{record.grade}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.class}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.headTeacher}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.student}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.dormNo}</td>
                                                        <td className="px-4 py-3 text-sm text-center">{record.majorCategory}</td>
                                                        <td className="px-4 py-3 text-sm text-center">{record.minorCategory}</td>
                                                        <td className="px-4 py-3 text-sm text-center text-slate-500">{record.reason}</td>
                                                        <td className="px-4 py-3 text-sm text-center">
                                                            <span className={record.type === '加分' ? 'text-green-600' : 'text-red-600'}>{record.type}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-center">{record.score}</td>
                                                        <td className="px-4 py-3 text-sm text-center text-slate-500">{record.time}</td>
                                                    </tr>
                                            ))
                                        ) : (
                                            <tr>
                                               <td colSpan={11} className="px-6 py-20 text-center text-slate-400">
                                                   暂无数据
                                               </td>
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
                                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                          const newPageSize = Number(e.target.value);
                                          setDetailPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
                                          loadDetailData(1, newPageSize);
                                      }}
                                  >
                                      <option value={10}>10条/页</option>
                                      <option value={20}>20条/页</option>
                                      <option value={50}>50条/页</option>
                                  </select>
                                  <button 
                                      className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
                                      disabled={detailPagination.page === 1}
                                      onClick={() => {
                                          const newPage = detailPagination.page - 1;
                                          setDetailPagination(prev => ({ ...prev, page: newPage }));
                                          loadDetailData(newPage, detailPagination.pageSize);
                                      }}
                                  >&lt;</button>
                                  <button className="px-2 py-1 text-blue-600 font-bold">{detailPagination.page}</button>
                                  <button 
                                      className="px-2 py-1 text-slate-600 hover:text-blue-600 disabled:opacity-50"
                                      disabled={detailPagination.page * detailPagination.pageSize >= detailPagination.total}
                                      onClick={() => {
                                          const newPage = detailPagination.page + 1;
                                          setDetailPagination(prev => ({ ...prev, page: newPage }));
                                          loadDetailData(newPage, detailPagination.pageSize);
                                      }}
                                  >&gt;</button>
                                  <span>前往</span>
                                  <input 
                                      type="text" 
                                      className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                          if (e.key === 'Enter') {
                                              const page = Number((e.target as HTMLInputElement).value);
                                              if (page > 0) {
                                                  setDetailPagination(prev => ({ ...prev, page }));
                                                  loadDetailData(page, detailPagination.pageSize);
                                              }
                                          }
                                      }}
                                  />
                                  <span>页</span>
                             </div>
                          </>
                      )}
                 </div>
            </div>
        );
    }

    // 如果有错误，显示错误提示
    if (dataError) {
        return (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center space-x-3">
                <div className="flex-1">
                    <div className="font-medium">数据加载失败</div>
                    <div className="text-sm mt-1">{dataError}</div>
                </div>
                <button
                    onClick={loadDormReport}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
                >
                    重试
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header/Filter - 参考教学管理模块优化 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                <h2 className="text-xl font-bold text-center text-slate-800">
                    {filters.school || '学校'} 宿舍量化表
                </h2>
                
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">学校</label>
                            <div className="relative">
                                <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select 
                                    className="min-w-[180px] max-w-[280px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={filters.school}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                        const newSchool = e.target.value;
                                        setFilters({...filters, school: newSchool, grade: '', class: ''});
                                    }}
                                >
                                    {filterOptions.schools.map((school: {id: number; name: string}) => (
                                        <option key={school.id} value={school.name}>{school.name}</option>
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
                                    value={filters.grade}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, grade: e.target.value, class: ''})}
                                >
                                    <option value="">全部年级</option>
                                    {filterOptions.grades.map((grade: {id: number; name: string}) => (
                                        <option key={grade.id} value={grade.name}>{grade.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">班级</label>
                            <div className="relative">
                                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select 
                                    className="min-w-[120px] max-w-[160px] pl-9 pr-8 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 whitespace-nowrap"
                                    value={filters.class}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({...filters, class: e.target.value})}
                                >
                                    <option value="">全部班级</option>
                                    {(filters.grade && gradeClassMap[filters.grade] 
                                        ? gradeClassMap[filters.grade] 
                                        : filterOptions.classes
                                    ).map((cls: {id: number; name: string}) => (
                                        <option key={cls.id} value={cls.name}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <DateRangePicker 
                            value={filters.dateRange}
                            onChange={(dateRange: {start: string; end: string}) => setFilters({...filters, dateRange})}
                        />
                    </div>
                    <div className="flex space-x-2">
                        <button 
                            onClick={handleSearch}
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
            {loading ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                    <div className="flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <span className="ml-3 text-slate-600">正在加载数据...</span>
                    </div>
                </div>
            ) : data.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <div className="min-w-[1200px] p-4">
                        <div className="flex justify-between items-end mb-2 relative">
                            <p className="text-xs text-slate-500 mx-auto font-bold text-base">{filters.school} 学生事务部宿舍量化表</p>
                            <div className="text-xs text-slate-500 sticky right-0 bg-white pl-4">
                                <span className="mr-4">部门: 学生事务部</span>
                                <span>日期: {filters.dateRange.start} 至 {filters.dateRange.end}</span>
                            </div>
                        </div>
                        
                        <table className="w-full border-collapse border border-slate-200 text-xs text-center">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">年级</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">班级</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">班主任</th>
                                    <th colSpan={3} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium">寝室内务</th>
                                    <th colSpan={3} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium">午休晚休</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">总扣分</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">班级人数</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">人均扣分</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">排名</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">综合得分</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">年级人均扣分</th>
                                    <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">年级排名</th>
                                </tr>
                                <tr>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">男生寝室内务</th>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">女生寝室内务</th>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">寝室内务总分</th>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">男生午休晚休</th>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">女生午休晚休</th>
                                    <th className="border border-slate-200 px-1 py-1 font-normal text-slate-500">午休晚休总分</th>
                                </tr>
                            </thead>
                             <tbody>
                                {Object.entries(groupedData).map(([grade, records]) => (
                                    <React.Fragment key={grade}>
                                        {records.map((row: DormReportData, idx: number) => (
                                            <tr key={`${grade}-${row.class}`} className="hover:bg-slate-50 border-b border-slate-100 last:border-0 text-slate-600">
                                                {idx === 0 && (
                                                    <td 
                                                        rowSpan={records.length} 
                                                        className="px-2 py-3 border-r border-slate-100 bg-white font-medium text-slate-700 align-middle"
                                                    >
                                                        {grade}
                                                    </td>
                                                )}
                                                <td className="px-2 py-3 border-r border-slate-100">{row.class}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.headTeacher || ''}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.mContent}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.fContent}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.content}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.mNap}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.fNap}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.nap}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.totalDed}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.student_count}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.perCapita}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.rank}</td>
                                                <td className="px-2 py-3 border-r border-slate-100">{row.score}</td>
                                                {idx === 0 && (
                                                    <td 
                                                        rowSpan={records.length} 
                                                        className="px-2 py-3 border-r border-slate-100 bg-white align-middle"
                                                    >
                                                        {row.gradePerCapita}
                                                    </td>
                                                )}
                                                {idx === 0 && (
                                                    <td 
                                                        rowSpan={records.length} 
                                                        className="px-2 py-3 bg-white align-middle"
                                                    >
                                                        {row.gradeRank}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                    <div className="flex items-center justify-center text-slate-500">
                        暂无数据
                    </div>
                </div>
            )}
            
            {/* Analysis */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-900">宿舍管理分析评价</h3>
                
                <div className="flex space-x-6 border-b border-slate-200">
                    {['寝室内务', '午休晚休'].map(type => (
                        <button
                            key={type}
                            onClick={() => setAnalysisType(type)}
                            className={`pb-2 text-sm font-medium transition-colors ${
                                analysisType === type 
                                    ? 'border-b-2 border-blue-500 text-blue-600' 
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                
                <div className="relative">
                    <textarea 
                        className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                        placeholder={`请输入${analysisType}方面的分析评价...`}
                    ></textarea>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                </div>

                {hasPermission('moral:edit') && (
                    <div className="flex justify-start">
                         <button className="px-6 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                             保存评价
                         </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// 5. District Report Component - 使用 API 数据

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
                className="text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-44 pl-9 pr-3 py-2 bg-white text-left flex items-center justify-between hover:border-blue-400"
            >
                <span className={selectedSchools.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
                    {selectedSchools.length === 0
                        ? '请选择学校'
                        : `已选择 ${selectedSchools.length} 所学校`
                    }
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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

const DistrictReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [detailData, setDetailData] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [analysisType, setAnalysisType] = useState('德育');
    
    // 筛选器状态
    const [filters, setFilters] = useState({
        group: '',
        schools: [] as string[],
        dateRange: getBeijingWeekRange()
    });

    // 筛选选项
    const [filterOptions, setFilterOptions] = useState<{
        groups: { id: number; name: string }[];
        schools: { id: number; name: string; groupId: number }[];
    }>({
        groups: [],
        schools: []
    });
    
    // 详情页分页
    const [detailPagination, setDetailPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0
    });
    
    const filtersRef = useRef(filters);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);
    
    // 加载集团和学校列表
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const response = await api.get('/api/org/tree');
                if (response && Array.isArray(response)) {
                    // 提取集团列表
                    const groups = response.map((g: any) => ({
                        id: g.id,
                        name: g.name
                    }));
                    
                    // 提取学校列表（包含所属集团ID）
                    const schools = extractSchools(response);
                    const schoolsWithGroup = schools.map((school: any) => {
                        // 查找学校所属的集团
                        let groupId = 0;
                        for (const group of response) {
                            if (group.children) {
                                for (const child of group.children) {
                                    if (child.type === 'school' && child.id === school.id) {
                                        groupId = group.id;
                                        break;
                                    }
                                }
                            }
                            if (groupId > 0) break;
                        }
                        return { ...school, groupId };
                    });
                    
                    setFilterOptions((prev) => ({ ...prev, groups, schools: schoolsWithGroup }));

                    // 设置默认值
                    // 不自动选择集团，让用户主动选择
                    // if (groups.length > 0 && !filters.group) {
                    //     setFilters((prev: typeof filters) => ({ ...prev, group: groups[0].name }));
                    // }
                    if (schoolsWithGroup.length > 0 && filters.schools.length === 0) {
                        // 默认全选所有学校
                        const allSchoolNames = schoolsWithGroup.map((s: any) => s.name);
                        setFilters((prev: typeof filters) => ({ ...prev, schools: allSchoolNames }));
                    }
                }
            } catch (error) {
                console.error('加载筛选选项失败:', error);
            }
        };
        loadFilterOptions();
    }, []);
    
    // 获取当前选中学校的ID列表
    const getSelectedSchoolIds = () => {
        console.log('[DEBUG] filters.schools:', filters.schools);
        console.log('[DEBUG] filterOptions.schools:', filterOptions.schools);
        const selectedSchoolIds = filters.schools
            .map((schoolName: string) => {
                const school = filterOptions.schools.find((s: { id: number; name: string }) => s.name === schoolName);
                console.log(`[DEBUG] Looking for school "${schoolName}":`, school?.id);
                return school?.id;
            })
            .filter((id: number | undefined) => id !== undefined);
        console.log('[DEBUG] selectedSchoolIds:', selectedSchoolIds);
        return selectedSchoolIds;
    };
    
    // 获取当前选中集团的ID
    const getSelectedGroupId = () => {
        const selectedGroup = filterOptions.groups.find((g: { id: number; name: string }) => g.name === filters.group);
        return selectedGroup?.id;
    };
    
    // 加载学区报表数据
    const loadDistrictReport = useCallback(async () => {
        const schoolIds = getSelectedSchoolIds();
        const groupId = getSelectedGroupId();
        console.log('[DEBUG] loadDistrictReport - schoolIds:', schoolIds, 'groupId:', groupId);
        if (schoolIds.length === 0 && !groupId) return;

        setLoading(true);
        setDataError(null);
        try {
            const params = {
                group_id: groupId,
                school_ids: schoolIds.join(','),
                start_date: filters.dateRange.start,
                end_date: filters.dateRange.end
            };
            console.log('[DEBUG] API request params:', params);
            const response = await api.get<any>('/api/moral/district-report', { params });
            console.log('[DEBUG] API response schools count:', response?.schools?.length);
            console.log('[DEBUG] API response schools:', response?.schools?.map((s: any) => s.schoolName));
            setData(response);
        } catch (error: any) {
            console.error('加载学区报表失败:', error);
            setDataError(error?.response?.data?.detail || '加载数据失败');
            
        
        } finally {
            setLoading(false);
        }
    }, [filters.group, filters.school, filters.dateRange, filterOptions.schools, filterOptions.groups]);

    // 初始加载和筛选变化时重新加载
    useEffect(() => {
        if (filters.schools.length > 0 && filterOptions.schools.length > 0) {
            loadDistrictReport();
        }
    }, [filters.schools, filters.dateRange, filterOptions.schools, loadDistrictReport]);

    // 导出报表 - XLSX格式，参考图片样式，带美观样式
    const handleExport = useCallback(() => {
        if (!data || !data.schools) return;
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        // 构建表头数据（参考图片中的红框样式）
        const districtName = data.districtName || '长水教育集团';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        // 先构建表头以确定总列数
        const headerRow1: string[] = ['学校'];
        const headerRow2: string[] = [''];
        
        // 遍历指标结构，构建合并表头
        data.indicatorStructure?.forEach((cat: IndicatorCategory) => {
            const subCount = cat.subCategories.length;
            // 第一行：大项名称（合并单元格）
            headerRow1.push(cat.name);
            for (let i = 1; i < subCount; i++) {
                headerRow1.push(''); // 占位用于合并
            }
            // 第二行：小项名称
            cat.subCategories.forEach((sub: IndicatorSubCategory) => {
                headerRow2.push(sub.name);
            });
        });
        
        // 添加统计列（只添加最终统计，不再重复添加宿舍管理）
        headerRow1.push('综合扣分', '人均扣分', '学校排名');
        headerRow2.push('', '', '');
        
        const totalCols = headerRow1.length;
        
        // 准备表格数据
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${districtName} 五育量化表`]);
        
        // 添加部门和日期信息行 - 确保列数与表头一致
        const deptDateRow: string[] = [];
        deptDateRow.push(`部门: ${districtName}`);  // 第0列
        deptDateRow.push('');  // 第1列
        deptDateRow.push('');  // 第2列
        deptDateRow.push(`日期: ${startDate} 至 ${endDate}`);  // 第3列
        // 填充剩余空列
        while (deptDateRow.length < totalCols) deptDateRow.push('');
        tableData.push(deptDateRow);
        
        tableData.push(headerRow1);
        tableData.push(headerRow2);
        
        // 添加数据行
        data.schools.forEach((row: any) => {
            const rowData: any[] = [row.schoolName];
            
            // 按指标结构添加数据
            data.indicatorStructure?.forEach((cat: IndicatorCategory) => {
                cat.subCategories.forEach((sub: IndicatorSubCategory) => {
                    rowData.push(row[sub.fieldKey] || 0);
                });
            });
            
            // 添加统计列数据
            rowData.push(row.totalDed, row.perCapita, row.rank);
            
            tableData.push(rowData);
        });
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        
        // 设置列宽
        const colWidths: any[] = [{ wch: 22 }]; // 学校列宽度
        data.indicatorStructure?.forEach((cat: IndicatorCategory) => {
            cat.subCategories.forEach(() => {
                colWidths.push({ wch: 10 });
            });
        });
        colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 10 });
        ws['!cols'] = colWidths;
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },  // 第1行：主标题行高
            { hpt: 22 },  // 第2行：部门日期行高
            { hpt: 25 },  // 第3行：表头第1行
            { hpt: 25 },  // 第4行：表头第2行
            ...data.schools.map(() => ({ hpt: 22 }))  // 数据行
        ];
        
        // 合并单元格设置
        const merges: XLSX.Range[] = [];
        
        // 主标题行合并（整行）
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
        
        // 部门信息合并（左对齐区域）
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });
        // 日期信息合并（右对齐区域）
        merges.push({ s: { r: 1, c: 3 }, e: { r: 1, c: totalCols - 1 } });
        
        // 大项表头合并（第3行，索引为2）
        let colIdx = 1;
        data.indicatorStructure?.forEach((cat: IndicatorCategory) => {
            const subCount = cat.subCategories.length;
            if (subCount > 1) {
                merges.push({ s: { r: 2, c: colIdx }, e: { r: 2, c: colIdx + subCount - 1 } });
            }
            colIdx += subCount;
        });
        
        // 统计列合并（两行合并）
        merges.push({ s: { r: 2, c: colIdx }, e: { r: 3, c: colIdx } }); // 综合扣分
        merges.push({ s: { r: 2, c: colIdx + 1 }, e: { r: 3, c: colIdx + 1 } }); // 人均扣分
        merges.push({ s: { r: 2, c: colIdx + 2 }, e: { r: 3, c: colIdx + 2 } }); // 学校排名
        
        ws['!merges'] = merges;
        
        // 设置单元格样式
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        
        // 定义样式
        const headerFill = { fgColor: { rgb: '4472C4' }, patternType: 'solid' as const }; // 蓝色背景
        const subHeaderFill = { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' as const }; // 浅蓝色背景
        const titleFill = { fgColor: { rgb: 'E7E6E6' }, patternType: 'solid' as const }; // 灰色背景
        
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }; // 白色粗体
        const titleFont = { bold: true, color: { rgb: '000000' }, sz: 14 }; // 黑色粗体标题
        const normalFont = { sz: 10 }; // 正常字体
        
        const centerAlign = { horizontal: 'center' as const, vertical: 'center' as const };
        const leftAlign = { horizontal: 'left' as const, vertical: 'center' as const };
        const rightAlign = { horizontal: 'right' as const, vertical: 'center' as const };
        
        const thinBorder = {
            top: { style: 'thin' as const, color: { rgb: '000000' } },
            bottom: { style: 'thin' as const, color: { rgb: '000000' } },
            left: { style: 'thin' as const, color: { rgb: '000000' } },
            right: { style: 'thin' as const, color: { rgb: '000000' } }
        };
        
        // 遍历所有单元格设置样式
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                
                // 如果单元格不存在，创建它
                if (!ws[cellRef]) {
                    ws[cellRef] = { v: '' };
                }
                
                const cell = ws[cellRef];
                cell.s = cell.s || {};
                
                // 设置边框（所有单元格）
                cell.s.border = thinBorder;
                
                if (R === 0) {
                    // 第1行：主标题行
                    cell.s.font = titleFont;
                    cell.s.alignment = centerAlign;
                    cell.s.fill = titleFill;
                } else if (R === 1) {
                    // 第2行：部门和日期行
                    cell.s.font = { sz: 10 };
                    cell.s.fill = { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' as const };
                    cell.s.alignment = centerAlign;
                } else if (R === 2) {
                    // 第3行：大项表头
                    cell.s.font = headerFont;
                    cell.s.fill = headerFill;
                    cell.s.alignment = centerAlign;
                } else if (R === 3) {
                    // 第4行：小项表头
                    cell.s.font = { bold: true, sz: 9, color: { rgb: '000000' } };
                    cell.s.fill = subHeaderFill;
                    cell.s.alignment = centerAlign;
                } else if (R >= 4) {
                    // 数据行：全部居中对齐
                    cell.s.font = normalFont;
                    cell.s.alignment = centerAlign;
                }
            }
        }

        // 将工作表添加到工作簿
        XLSX.utils.book_append_sheet(wb, ws, '五育量化表');
        
        // 导出文件
        const fileName = `${districtName}_五育量化表_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }, [data, filters.dateRange]);

    // 导出详情报表
    const handleExportDetail = useCallback(() => {
        if (!detailData || detailData.length === 0) return;
        
        const wb = XLSX.utils.book_new();
        
        const districtName = data?.districtName || filters.schools[0] || '学区';
        const startDate = filters.dateRange.start;
        const endDate = filters.dateRange.end;
        
        const tableData: any[] = [];
        
        // 添加主标题行
        tableData.push([`${districtName} 五育量化详情`]);
        
        // 添加日期行
        tableData.push([`日期: ${startDate} 至 ${endDate}`]);
        
        // 表头
        tableData.push(['学校', '年级', '班级', '大项', '小项', '检查内容', '学生', '加分/减分', '分数', '时间']);
        
        // 数据行
        detailData.forEach((record: any) => {
            let studentName: string;
            if (record.student && !record.student.startsWith('学生None')) {
                studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
            } else {
                // 根据记录来源判断显示内容
                const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                studentName = isDormCheck ? '宿舍整体' : '班级整体';
            }
            tableData.push([
                record.school,
                record.grade,
                record.class,
                record.majorCategory,
                record.minorCategory,
                record.content,
                studentName,
                record.type,
                record.score,
                record.time
            ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(tableData);
        const totalCols = 10;
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 20 }, // 学校
            { wch: 10 }, // 年级
            { wch: 10 }, // 班级
            { wch: 10 }, // 大项
            { wch: 12 }, // 小项
            { wch: 30 }, // 检查内容
            { wch: 10 }, // 学生
            { wch: 10 }, // 加分/减分
            { wch: 8 },  // 分数
            { wch: 20 }  // 时间
        ];
        
        // 设置行高
        ws['!rows'] = [
            { hpt: 30 },
            { hpt: 22 },
            { hpt: 25 },
            ...detailData.map(() => ({ hpt: 20 }))
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
        
        XLSX.utils.book_append_sheet(wb, ws, '五育量化详情');
        const fileName = `${districtName}_五育量化详情_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }, [detailData, data, filters.dateRange, filters.schools]);
    
    // 加载详情数据
    const loadDetailData = useCallback(async () => {
        setDetailLoading(true);
        try {
            const schoolIds = getSelectedSchoolIds();
            console.log('[DEBUG] loadDetailData - schoolIds:', schoolIds);
            if (schoolIds.length === 0) return;

            const response = await api.get<any>('/api/moral/district-detail', {
                params: {
                    school_ids: schoolIds.join(','),
                    start_date: filters.dateRange.start,
                    end_date: filters.dateRange.end
                }
            });

            console.log('[DEBUG] Detail API response:', response);
            console.log('[DEBUG] Total records:', response.records?.length);

            // 统计各学校记录数量
            const schoolCount: Record<string, number> = {};
            response.records?.forEach((r: any) => {
                schoolCount[r.school] = (schoolCount[r.school] || 0) + 1;
            });
            console.log('[DEBUG] School distribution:', schoolCount);

            setDetailData(response.records || []);
            setDetailPagination((prev: typeof detailPagination) => ({ ...prev, total: response.records?.length || 0, page: 1 }));
        } catch (error) {
            console.error('加载详情失败:', error);
            setDetailData([]);
            setDetailPagination((prev: typeof detailPagination) => ({ ...prev, total: 0 }));
        } finally {
            setDetailLoading(false);
        }
    }, [filters.schools, filters.dateRange, filterOptions.schools]);
    
    // 切换到详情页时加载数据
    useEffect(() => {
        if (view === 'detail') {
            loadDetailData();
        }
    }, [view, loadDetailData]);

    if (view === 'detail') {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1"></div>
                    <h2 className="text-2xl font-bold text-slate-900 text-center flex-1 whitespace-nowrap">
                        {data?.districtName || filters.school || '学区'} 五育量化详情
                    </h2>
                    <div className="flex-1 flex justify-end space-x-3">
                        <button 
                            onClick={() => setView('summary')}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            返回
                        </button>
                        <button 
                            onClick={handleExportDetail}
                            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                        >
                            <Download className="w-4 h-4 mr-1" />
                            导出
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                    {detailLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <span className="ml-3 text-slate-600">正在加载数据...</span>
                        </div>
                    ) : detailData.length > 0 ? (
                        <>
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">学校</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">年级</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">班级</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">大项</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">小项</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-1/4">检查内容</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">加分/减分</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">分数</th>
                                        <th className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">时间</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {detailData
                                        .slice((detailPagination.page - 1) * detailPagination.pageSize, detailPagination.page * detailPagination.pageSize)
                                        .map((record: any, index: number) => {
                                            let studentName: string;
                                            if (record.student && !record.student.startsWith('学生None')) {
                                                studentName = record.student.replace(/^学生\s+temp_\d+_[A-Z]-\d+\s+/, '');
                                            } else {
                                                // 根据记录来源判断显示内容
                                                const hasDormInfo = record.description && /\d+层\d+房间/.test(record.description);
                                                const isDormCategory = record.minorCategory === '午休晚休' || record.minorCategory === '寝室内务';
                                                const isDormCheck = record.source === 'overall' && (hasDormInfo || isDormCategory);
                                                studentName = isDormCheck ? '宿舍整体' : '班级整体';
                                            }
                                            return (
                                                <tr key={index} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 text-sm text-center">{record.school}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.grade}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.class}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.majorCategory}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.minorCategory}</td>
                                                    <td className="px-4 py-3 text-sm text-center text-slate-500" title={record.content}>{record.content}</td>
                                                    <td className="px-4 py-3 text-sm text-center">{studentName}</td>
                                                    <td className="px-4 py-3 text-sm text-center">
                                                        <span className={record.type === '加分' ? 'text-green-600' : 'text-red-600'}>{record.type}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-center">{record.score}</td>
                                                    <td className="px-4 py-3 text-sm text-center text-slate-500">{record.time}</td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                            {/* Pagination */}
                            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                                <span>共 {detailPagination.total} 条</span>
                                <select
                                    className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    value={detailPagination.pageSize}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDetailPagination((prev: typeof detailPagination) => ({ ...prev, pageSize: Number(e.target.value), page: 1 }))}
                                >
                                    <option value={10}>10条/页</option>
                                    <option value={20}>20条/页</option>
                                    <option value={50}>50条/页</option>
                                    <option value={100}>100条/页</option>
                                </select>
                                <button
                                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
                                    disabled={detailPagination.page === 1}
                                    onClick={() => setDetailPagination((prev: typeof detailPagination) => ({ ...prev, page: 1 }))}
                                >首页</button>
                                <button
                                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
                                    disabled={detailPagination.page === 1}
                                    onClick={() => setDetailPagination((prev: typeof detailPagination) => ({ ...prev, page: prev.page - 1 }))}
                                >&lt;</button>
                                <span className="px-2 py-1 text-blue-600 font-bold">
                                    {detailPagination.page} / {Math.ceil(detailPagination.total / detailPagination.pageSize) || 1}
                                </span>
                                <button
                                    className="px-2 py-1 text-slate-600 hover:text-blue-600 disabled:opacity-50"
                                    disabled={detailPagination.page * detailPagination.pageSize >= detailPagination.total}
                                    onClick={() => setDetailPagination((prev: typeof detailPagination) => ({ ...prev, page: prev.page + 1 }))}
                                >&gt;</button>
                                <button
                                    className="px-2 py-1 text-slate-600 hover:text-blue-600 disabled:opacity-50"
                                    disabled={detailPagination.page * detailPagination.pageSize >= detailPagination.total}
                                    onClick={() => setDetailPagination((prev: typeof detailPagination) => ({ ...prev, page: Math.ceil(prev.total / prev.pageSize) }))}
                                >末页</button>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
                            <div className="flex items-center justify-center text-slate-500">
                                暂无数据
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // 如果有错误，显示错误提示
    if (dataError) {
        return (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-xl flex items-center space-x-3">
                <div className="flex-1">
                    <div className="font-medium">数据加载失败</div>
                    <div className="text-sm mt-1">{dataError}</div>
                </div>
                <button
                    onClick={loadDistrictReport}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
                >
                    重试
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header/Filter - 参考校级报表优化 */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col space-y-6">
                <h2 className="text-xl font-bold text-center text-slate-800">
                    {data?.districtName || filters.schools[0] || '学区'} 五育量化表
                </h2>
                
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap items-start gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">集团</label>
                            <div className="relative">
                                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select
                                    className="w-36 pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    value={filters.group}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                        const newGroup = e.target.value;
                                        if (newGroup === '') {
                                            // 集团选择"全部"时，默认全选所有学校
                                            const allSchoolNames = filterOptions.schools.map((s: any) => s.name);
                                            setFilters({...filters, group: '', schools: allSchoolNames});
                                            return;
                                        }
                                        const selectedGroupId = filterOptions.groups.find((g: { id: number; name: string }) => g.name === newGroup)?.id;
                                        if (selectedGroupId) {
                                            // 选择集团后，默认全选本集团的全部学校
                                            const groupSchools = filterOptions.schools.filter((s: any) => s.groupId === selectedGroupId);
                                            const groupSchoolNames = groupSchools.map((s: any) => s.name);
                                            setFilters({...filters, group: newGroup, schools: groupSchoolNames});
                                        } else {
                                            setFilters({...filters, group: newGroup, schools: []});
                                        }
                                    }}
                                >
                                    <option value="">全部</option>
                                    {filterOptions.groups.map((group: { id: number; name: string }) => (
                                        <option key={group.id} value={group.name}>{group.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">学校</label>
                            <div className="relative">
                                <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
                                <div className="w-44">
                                    <SchoolMultiSelect
                                        schools={filterOptions.schools
                                            .filter((s: any) => {
                                                if (!filters.group) return true;
                                                const selectedGroupId = filterOptions.groups.find((g: { id: number; name: string }) => g.name === filters.group)?.id;
                                                return s.groupId === selectedGroupId;
                                            })
                                        }
                                        selectedSchools={filters.schools}
                                        onChange={(selected) => {
                                            if (selected.length === 0) {
                                                setFilters({...filters, schools: []});
                                                return;
                                            }
                                            const visibleSchools = filterOptions.schools.filter((s: any) => {
                                                if (!filters.group) return true;
                                                const selectedGroupId = filterOptions.groups.find((g: { id: number; name: string }) => g.name === filters.group)?.id;
                                                return s.groupId === selectedGroupId;
                                            });
                                            const isSelectAllVisible = selected.length === visibleSchools.length &&
                                                                     visibleSchools.length > 0 &&
                                                                     filters.schools.length < visibleSchools.length;
                                            if (isSelectAllVisible && filters.group) {
                                                setFilters({...filters, schools: selected, group: ''});
                                                return;
                                            }
                                            const selectedGroup = filterOptions.groups.find((g: { id: number; name: string }) => g.name === filters.group);
                                            if (selectedGroup && selected.length > 0) {
                                                const groupSchools = filterOptions.schools.filter((s: any) => s.groupId === selectedGroup.id);
                                                const allInGroup = selected.every((name: string) => groupSchools.some((s: any) => s.name === name));
                                                if (!allInGroup) {
                                                    setFilters({...filters, schools: selected, group: ''});
                                                } else {
                                                    setFilters({...filters, schools: selected});
                                                }
                                            } else {
                                                setFilters({...filters, schools: selected});
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <DateRangePicker 
                            value={filters.dateRange}
                            onChange={(dateRange: { start: string; end: string }) => setFilters({...filters, dateRange})}
                        />
                    </div>
                    <div className="flex space-x-2">
                        <button 
                            onClick={loadDistrictReport}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                            查询
                        </button>
                        <button 
                            onClick={() => setFilters({
                                ...filters,
                                group: '',
                                schools: filterOptions.schools.length > 0 ? [filterOptions.schools[0].name] : [],
                                dateRange: getBeijingWeekRange()
                            })}
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
            
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <div className="min-w-[1500px] p-4">
                    <div className="flex justify-between items-end mb-2 relative">
                        <p className="text-xs text-slate-500 mx-auto font-bold text-base">{data?.districtName || '学区'} 五育量化表</p>
                        <div className="text-xs text-slate-500 sticky right-0 bg-white pl-4">
                            <span className="mr-4">部门: {data?.districtName || '学区'}</span>
                            <span>日期: {filters.dateRange.start} 至 {filters.dateRange.end}</span>
                        </div>
                    </div>
                    
                    <table className="w-full border-collapse border border-slate-200 text-xs text-center">
                        <thead className="bg-slate-50">
                            <tr>
                                <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">学校</th>
                                {data?.indicatorStructure?.map((cat: IndicatorCategory) => (
                                    <th 
                                        key={cat.name} 
                                        colSpan={cat.subCategories.length} 
                                        className="border border-slate-200 px-2 py-2 text-slate-600 font-medium"
                                    >
                                        {cat.name}
                                    </th>
                                ))}
                                <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">综合扣分</th>
                                <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">人均扣分</th>
                                <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-slate-600 font-medium bg-slate-50">学校排名</th>
                            </tr>
                            <tr>
                                {data?.indicatorStructure?.map((cat: IndicatorCategory) => (
                                    cat.subCategories.map((sub: IndicatorSubCategory) => (
                                        <th key={sub.fieldKey} className="border border-slate-200 px-1 py-1 font-normal text-slate-500">
                                            {sub.name}
                                        </th>
                                    ))
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data?.schools?.map((row: any, index: number) => (
                                <tr key={index} className="hover:bg-slate-50">
                                    <td className="border border-slate-200 px-2 py-2 text-slate-700 bg-slate-50 text-left">{row.schoolName}</td>
                                    {data?.indicatorStructure?.map((cat: IndicatorCategory) => (
                                        cat.subCategories.map((sub: IndicatorSubCategory) => (
                                            <td key={sub.fieldKey} className="border border-slate-200 px-1 py-2 text-slate-600">
                                                {row[sub.fieldKey] || 0}
                                            </td>
                                        ))
                                    ))}
                                    <td className="border border-slate-200 px-1 py-2 font-bold text-slate-800 bg-slate-50">{row.totalDed}</td>
                                    <td className="border border-slate-200 px-1 py-2 text-slate-600">{row.perCapita}</td>
                                    <td className="border border-slate-200 px-1 py-2 font-medium text-slate-800">{row.rank}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-900">五育分析评价</h3>
                
                <div className="flex space-x-6 border-b border-slate-200">
                    {['德育', '智育', '体育', '美育', '劳育'].map(type => (
                        <button
                            key={type}
                            onClick={() => setAnalysisType(type)}
                            className={`pb-2 text-sm font-medium transition-colors ${
                                analysisType === type 
                                    ? 'border-b-2 border-blue-500 text-blue-600' 
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                
                <div className="relative">
                    <textarea 
                        className="w-full h-32 p-4 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                        placeholder={`请输入${analysisType}方面的分析评价...`}
                    ></textarea>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                </div>

                <div className="flex justify-start">
                    <button className="px-6 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                        保存{analysisType}评价
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MoralEducation;
