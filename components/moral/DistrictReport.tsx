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
import { SchoolMultiSelect } from './SchoolMultiSelect';

export const DistrictReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [detailData, setDetailData] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [analysisType, setAnalysisType] = useState('德育');
    const { toast } = useToast();

    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);
    
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

    // 保存评价
    const handleSaveEvaluation = async () => {
        const groupId = filterOptions.groups.find((g) => g.name === filters.group)?.id;
        if (!groupId || !filters.dateRange.start || !filters.dateRange.end) return;

        try {
            setSavingEvaluation(true);
            await api.post('/api/moral/reports/district/evaluation', null, {
                params: {
                    group_id: groupId,
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
                        value={evaluation}
                        onChange={(e) => setEvaluation(e.target.value.slice(0, 2000))}
                        maxLength={2000}
                    ></textarea>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-400">提示: 最多输入2000字</div>
                </div>

                {hasPermission('moral:edit') && (
                    <div className="flex justify-start">
                        <button
                            onClick={handleSaveEvaluation}
                            disabled={savingEvaluation}
                            className="px-6 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {savingEvaluation ? '保存中...' : `保存${analysisType}评价`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
