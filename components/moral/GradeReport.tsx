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

// 2. Grade Report Component - 使用 API 数据

// 指标子项接口

// 指标大类接口

// 动态指标班级数据


// 动态指标年级数据


export const GradeReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<GradeReportData | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const { toast } = useToast();

    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);
    
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

    // 保存评价
    const handleSaveEvaluation = async () => {
        const gradeId = getGradeIdByName(filters.school, filters.grade);
        if (!gradeId || !filters.dateRange.start || !filters.dateRange.end) return;

        try {
            setSavingEvaluation(true);
            await api.post('/api/moral/reports/grade/evaluation', null, {
                params: {
                    grade_id: gradeId,
                    start_date: filters.dateRange.start,
                    end_date: filters.dateRange.end,
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
                        value={evaluation}
                        onChange={(e) => setEvaluation(e.target.value.slice(0, 2000))}
                        maxLength={2000}
                    ></textarea>
                    <div className="absolute bottom-2 right-2 text-xs text-slate-400">提示：最多输入2000字</div>
                </div>

                {hasPermission('moral:edit') && (
                    <div>
                        <button
                            onClick={handleSaveEvaluation}
                            disabled={savingEvaluation}
                            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {savingEvaluation ? '保存中...' : '保存德育评价'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
