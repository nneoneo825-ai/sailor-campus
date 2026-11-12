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

// 4. Dorm Report Component - 使用 API 数据
export const DormReport: React.FC = () => {
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DormReportData[]>([]);
    const [detailData, setDetailData] = useState<DormDetailRecord[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [analysisType, setAnalysisType] = useState('寝室内务');
    const { toast } = useToast();

    // 评价内容状态
    const [evaluation, setEvaluation] = useState<string>('');
    const [savingEvaluation, setSavingEvaluation] = useState(false);
    
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

    // 保存评价
    const handleSaveEvaluation = async () => {
        const schoolId = filterOptions.schools.find((s) => s.name === filters.school)?.id;
        if (!schoolId || !filters.dateRange.start || !filters.dateRange.end) return;

        try {
            setSavingEvaluation(true);
            await api.post('/api/moral/reports/dorm/evaluation', null, {
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
                             {savingEvaluation ? '保存中...' : '保存评价'}
                         </button>
                    </div>
                )}
            </div>
        </div>
    );
};
