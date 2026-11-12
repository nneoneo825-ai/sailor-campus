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

// 3. School Report Component - 使用 API 数据
export const SchoolReport: React.FC = () => {
    const [analysisType, setAnalysisType] = useState('德育');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SchoolReportData | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const { toast } = useToast();

    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);

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

    // 保存评价
    const handleSaveEvaluation = async () => {
        const schoolId = getSelectedSchoolId();
        if (!schoolId || !filters.dateRange.start || !filters.dateRange.end) return;

        try {
            setSavingEvaluation(true);
            await api.post('/api/moral/reports/school/evaluation', null, {
                params: {
                    school_id: schoolId,
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
                           {savingEvaluation ? '保存中...' : '保存德育评价'}
                       </button>
                  </div>
              )}
          </div>
       </div>
    )
  }
