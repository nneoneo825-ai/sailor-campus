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

export const TeachingGradeReport: React.FC = () => {
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
