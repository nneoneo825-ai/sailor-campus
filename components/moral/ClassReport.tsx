import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import {
  Search, ArrowLeft, Download, Calendar, X, Filter, RefreshCw,
  TrendingUp, TrendingDown, Award, Users, FileText, Loader2,
  School, GraduationCap, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Building
} from 'lucide-react';
import { api } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import {
  getBeijingDate, getBeijingDateOffset, getBeijingWeekRange, getBeijingLastWeekRange,
  getBeijingMonthRange, getBeijingLastMonthRange, formatBeijingTime,
  getRecentDaysRange, getLastWeekRange
} from '../../src/utils/dateUtils';
import { extractSchools } from '../../src/utils/orgUtils';
import { hasPermission } from '../../src/utils/permission';
import type {
  ClassDetailRecord, GradeDetailRecord, SchoolDetailListRecord,
  DormReportData, DormDetailRecord, ClassReportData, FilterOptions,
  IndicatorSubCategory, IndicatorCategory, DynamicClassData,
  GradeReportData, DynamicGradeData, SchoolReportData
} from '../../src/types/moral';
import { DateRangePicker } from './DateRangePicker';

// 1. Class Report Component - 使用 API 数据

export const ClassReport: React.FC = () => {
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
