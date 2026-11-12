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

export const TeachingSchoolReport: React.FC = () => {
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
