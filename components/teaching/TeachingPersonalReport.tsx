import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  Download, Filter, Search, Calendar, ChevronDown, X, ArrowLeft,
  ChevronLeft, ChevronRight, RefreshCw, FileText, TrendingUp,
  TrendingDown, Users, School, GraduationCap, BarChart3, Loader2,
  Award, BookOpen, ClipboardList, Building
} from 'lucide-react';
import { api } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import {
  getBeijingDate, getBeijingDateOffset, getBeijingWeekRange, getBeijingLastWeekRange,
  getBeijingMonthRange, getBeijingLastMonthRange, formatBeijingTime, getRecentDaysRange
} from '../../src/utils/dateUtils';
import { hasPermission } from '../../src/utils/permission';
import type {
  PersonalTeachingReportResponse, GradeTeachingReportResponse,
  SchoolTeachingReportResponse, ProvincialTeachingReportResponse,
  TeacherMetric, SchoolTeachingMetric, ProvincialTeachingMetric,
  ApiTeachingIndicator, TeachingDetailRecord, GradeTeachingDetailRecord,
  SchoolTeachingDetailRecord, ProvincialTeachingDetailRecord,
  PersonalDetailRecord, FilterOptions, SchoolTeachersResponse,
  TeacherDetail, TeachingIndicator
} from '../../src/types/teaching';
import { DateRangePicker } from './DateRangePicker';

export const TeachingPersonalReport: React.FC = () => {
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
