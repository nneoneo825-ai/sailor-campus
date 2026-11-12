import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, Download, Search, Plus, Minus, X, ChevronDown, ArrowUpCircle,
  Settings as SettingsIcon, GraduationCap, AlertTriangle, Info, CheckCircle2,
  Trash2, Grid, UserPlus, Users, Maximize2, Monitor, Columns, Rows,
  FileSpreadsheet, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, API_BASE_URL } from '../../src/services/apiClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { getBeijingDate } from '../../src/utils/dateUtils';
import { hasPermission } from '../../src/utils/permission';
import type { Student } from '../../types';
import type { School, SeatingGroup, ClassInfo, TeachingClass, Teacher } from '../../src/types/school';
import { CHINA_REGIONS } from '../../src/data/chinaRegions';
import { SeatingEditorModal } from './SeatingEditorModal';

export const ClassList: React.FC<{ useApiData?: boolean }> = ({ useApiData = true }) => {
    const [view, setView] = useState<'list' | 'edit' | 'detail'>('list');
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [filteredClasses, setFilteredClasses] = useState<ClassInfo[]>([]);
    const [editForm, setEditForm] = useState<ClassInfo | null>(null);
    const [detailClass, setDetailClass] = useState<ClassInfo | null>(null);
    const [filterSchool, setFilterSchool] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentSchoolId, setCurrentSchoolId] = useState<number | null>(null);
    const [schools, setSchools] = useState<Array<{id: number, name: string}>>([]);
    const [grades, setGrades] = useState<Array<{id: number, name: string, stage: string, classCount: number}>>([]);
    const [gradeClasses, setGradeClasses] = useState<Array<{id: number, name: string}>>([]);
    const { toast } = useToast();
    const { confirm } = useConfirm();

    // Debug: 监听 filteredClasses 变化
    useEffect(() => {
        console.log('[DEBUG] filteredClasses changed:', filteredClasses.map(c => ({ id: c.id, name: c.name, grade: c.grade })));
    }, [filteredClasses]);

    // 筛选功能
    const handleSearch = () => {
        const filtered = classes.filter(c => {
            return (
                (!filterGrade || c.grade === filterGrade) &&
                (!filterClass || c.name === filterClass)
            );
        });
        setFilteredClasses(filtered);
    };

    const handleReset = () => {
        setFilterGrade('');
        setFilterClass('');
        setGradeClasses([]);
        setFilteredClasses(classes);
    };

    // 加载年级列表（基于组织机构）
    const loadGradesFromApi = async (schoolId: number) => {
        try {
            console.log('正在加载年级列表, schoolId:', schoolId);
            const gradesResponse: any = await api.get(`/api/schools/${schoolId}/grades`);
            console.log('年级列表API返回:', gradesResponse);
            if (Array.isArray(gradesResponse)) {
                const mappedGrades = gradesResponse.map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    stage: g.stage || '',
                    classCount: g.classCount || 0
                }));
                console.log('设置年级列表:', mappedGrades);
                setGrades(mappedGrades);
            } else {
                console.warn('年级API返回格式不正确:', gradesResponse);
                setGrades([]);
            }
        } catch (err: any) {
            console.error('加载年级列表失败:', err);
            setGrades([]);
        }
    };

    // 加载指定年级下的班级列表（基于组织机构）
    const loadGradeClassesFromApi = async (schoolId: number, gradeId: number) => {
        try {
            const classesResponse: any = await api.get(`/api/schools/${schoolId}/grades/${gradeId}/classes`);
            if (Array.isArray(classesResponse)) {
                setGradeClasses(classesResponse.map((c: any) => ({
                    id: c.id,
                    name: c.name
                })));
            }
        } catch (err) {
            console.error('加载班级列表失败:', err);
        }
    };

    // Modal states
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedUpgradeSource, setSelectedUpgradeSource] = useState('初一');
    const [upgradeSelectedClasses, setUpgradeSelectedClasses] = useState<string[]>([]);
    const [autoArchiveGraduates, setAutoArchiveGraduates] = useState(true);
    const [clearSeatingChart, setClearSeatingChart] = useState(true);
    const [resetMoralScore, setResetMoralScore] = useState(true);
    const [backupData, setBackupData] = useState(true);

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalClasses, setTotalClasses] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentGradeFilter, setCurrentGradeFilter] = useState<number | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');

    // 从API加载班级数据
    useEffect(() => {
        console.log('useApiData changed:', useApiData);
        if (useApiData) {
            console.log('切换到API模式，开始加载数据');
            loadClassesFromApi();
        } else {
            // Mock模式下清空API数据
            setGrades([]);
            setGradeClasses([]);
            setSchools([]);
        }
    }, [useApiData]);

    const loadClassesFromApi = async () => {
        try {
            setLoading(true);
            setError(null);

            // 检查登录状态
            const token = localStorage.getItem('auth_token');
            console.log('当前登录token:', token ? '存在' : '不存在');
            if (!token) {
                setError('请先登录系统');
                setClasses([]);
                setGrades([]);
                setSchools([]);
                return;
            }

            // 首先获取学校列表
            const schoolsResponse: any = await api.get('/api/schools/list');
            console.log('学校列表API返回:', schoolsResponse);
            if (!schoolsResponse.schools || schoolsResponse.schools.length === 0) {
                console.warn('学校列表为空或格式不正确');
                setClasses([]);
                setSchools([]);
                setGrades([]);
                return;
            }

            // 保存学校列表到下拉框
            setSchools(schoolsResponse.schools.map((s: any) => ({ id: s.id, name: s.name })));

            // 使用第一个学校获取班级数据
            const firstSchool = schoolsResponse.schools[0];
            const schoolId = firstSchool.id;
            setCurrentSchoolId(schoolId);
            setFilterSchool(firstSchool.name);

            // 加载该学校的年级列表（基于组织机构）
            await loadGradesFromApi(schoolId);

            // 获取该学校的班级数据（带分页）
            await loadClassesForSchool(schoolId, firstSchool.name);
        } catch (err: any) {
            console.error('加载班级数据失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '加载班级数据失败';
            setError(`加载失败: ${errorMsg}`);
            if (err.response?.status === 401) {
                setError('登录已过期，请重新登录');
                localStorage.removeItem('auth_token');
            }
        } finally {
            setLoading(false);
        }
    };

    // 加载指定学校的班级数据
    const loadClassesForSchool = async (schoolId: number, schoolName: string, page: number = currentPage, gradeId: number | null = currentGradeFilter, keyword: string = searchKeyword) => {
        try {
            setLoading(true);
            setError(null);

            const token = localStorage.getItem('auth_token');
            if (!token) {
                setError('请先登录系统');
                return;
            }

            // 构建查询参数
            const params: any = {
                page,
                page_size: pageSize
            };

            // 添加年级筛选
            if (gradeId) {
                params.grade_id = gradeId;
            }

            // 添加关键词搜索
            if (keyword) {
                params.keyword = keyword;
            }

            const classesResponse: any = await api.get(`/api/schools/${schoolId}/classes`, { params });

            if (classesResponse && classesResponse.classes && Array.isArray(classesResponse.classes)) {
                console.log('[DEBUG] Raw classes from API:', classesResponse.classes.map((c: any) => ({ id: c.id, name: c.name, grade: c.grade })));
                const mappedClasses: ClassInfo[] = classesResponse.classes.map((cls: any) => ({
                    id: cls.id.toString(),
                    name: cls.name,
                    grade: cls.grade || '',
                    stage: cls.stage || '',
                    school: cls.school || schoolName,
                    headTeacher: cls.headTeacher || '未分配',
                    teachers: cls.teachers || {},
                    seatingGroups: cls.seatingGroups || [],
                    seatingRowCount: cls.seatingRowCount || 8,
                    allStudents: cls.allStudents || []
                }));
                console.log('[DEBUG] Mapped classes:', mappedClasses.map((c: ClassInfo) => ({ id: c.id, name: c.name, grade: c.grade })));
                console.log('[DEBUG] Setting classes and filteredClasses with', mappedClasses.length, 'items');

                setClasses(mappedClasses);
                setFilteredClasses(mappedClasses);
                setTotalClasses(classesResponse.total || 0);
                setTotalPages(classesResponse.total_pages || 1);
                setCurrentPage(page);
            } else {
                console.log('[DEBUG] Invalid classesResponse:', classesResponse);
            }

            // 同时加载该学校的年级列表
            await loadGradesFromApi(schoolId);
        } catch (err: any) {
            console.error('加载班级数据失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '加载班级数据失败';
            setError(`加载失败: ${errorMsg}`);
            if (err.response?.status === 401) {
                setError('登录已过期，请重新登录');
                localStorage.removeItem('auth_token');
            }
        } finally {
            setLoading(false);
        }
    };

    // Seating Editor States
    const [isSeatingModalOpen, setIsSeatingModalOpen] = useState(false);
    const seatingFileInputRef = useRef<HTMLInputElement>(null);

    // Import States
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importPreview, setImportPreview] = useState<{
        students: Array<{name: string, gender: string, studentId?: string}>;
        seating?: SeatingGroup[];
    } | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);

    // Edit Page States
    const [editTeachers, setEditTeachers] = useState<Array<{id: number, name: string, subject: string, user_id?: number}>>([]);
    const [editStudents, setEditStudents] = useState<Array<{id: number, name: string, gender: string}>>([]);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTeacher, setSelectedTeacher] = useState('');
    const [selectedHeadTeacherId, setSelectedHeadTeacherId] = useState<string>('');
    const [isLoadingEditData, setIsLoadingEditData] = useState(false);

    // 学科选项（从API动态获取，这里作为备用默认值）
    const subjectOptions = [
        { value: 'chinese', label: '语文' },
        { value: 'math', label: '数学' },
        { value: 'english', label: '英语' },
        { value: 'physics', label: '物理' },
        { value: 'chemistry', label: '化学' },
        { value: 'biology', label: '生物' },
        { value: 'geography', label: '地理' },
        { value: 'politics', label: '政治' },
        { value: 'history', label: '历史' }
    ];

    // 加载编辑页面数据
    const loadEditPageData = async (cls: ClassInfo) => {
        setIsLoadingEditData(true);
        try {
            // 获取班级所属学校的ID
            const schoolId = currentSchoolId || schools.find(s => s.name === cls.school)?.id;
            
            if (schoolId) {
                // 加载教师列表
                try {
                    const teachersResponse: any = await api.get(`/api/schools/${schoolId}/teachers`, {
                        params: { page_size: 100 }
                    });
                    if (teachersResponse && teachersResponse.teachers) {
                        const teachers = teachersResponse.teachers.map((t: any) => ({
                            id: parseInt(t.id),
                            user_id: t.user_id,
                            name: t.name,
                            subject: t.subject || ''
                        }));
                        setEditTeachers(teachers);
                        console.log('[DEBUG] Loaded editTeachers:', teachers);

                        // 如果班级已有班主任，查找对应的教师ID
                        console.log('[DEBUG] Checking for existing head teacher in class:', cls.headTeacher);
                        if (cls.headTeacher && cls.headTeacher !== '未分配') {
                            const headTeacher = teachers.find((t: any) => t.name === cls.headTeacher);
                            console.log('[DEBUG] Found head teacher in teachers list:', headTeacher);
                            if (headTeacher) {
                                setSelectedHeadTeacherId(headTeacher.id.toString());
                                console.log('[DEBUG] Set selectedHeadTeacherId to:', headTeacher.id.toString());
                            } else {
                                console.warn('[WARNING] Could not find head teacher in teachers list:', cls.headTeacher);
                            }
                        }
                    }
                } catch (err) {
                    console.error('加载教师列表失败:', err);
                    setEditTeachers([]);
                }

                // 加载学生列表
                try {
                    const classId = parseInt(cls.id);
                    // 获取所有学生，设置较大的page_size（班级学生数一般不超过200）
                    const studentsResponse: any = await api.get(`/api/org/${classId}/students`, {
                        params: { page_size: 200 }
                    });
                    if (studentsResponse && studentsResponse.students) {
                        setEditStudents(studentsResponse.students.map((s: any) => ({
                            id: s.id,
                            name: s.name,
                            gender: s.gender === 'M' ? '男' : s.gender === 'F' ? '女' : ''
                        })));
                        // 更新班级学生列表
                        setEditForm(prev => prev ? {
                            ...prev,
                            allStudents: studentsResponse.students.map((s: any) => s.name)
                        } : null);
                    }
                } catch (err) {
                    console.error('加载学生列表失败:', err);
                    setEditStudents([]);
                }
            }
        } catch (err) {
            console.error('加载编辑页面数据失败:', err);
        } finally {
            setIsLoadingEditData(false);
        }
    };

    const handleEditClick = async (cls: ClassInfo) => {
        setEditForm({ ...cls });
        setView('edit');
        // 加载编辑页面所需数据
        await loadEditPageData(cls);
    };

    // 查看班级详情
    const handleViewClick = (cls: ClassInfo) => {
        setDetailClass(cls);
        setView('detail');
    };

    const handleBack = () => {
        setView('list');
        setEditForm(null);
        setDetailClass(null);
    };

    // 添加任课教师
    const handleAddSubjectTeacher = () => {
        if (!selectedSubject || !selectedTeacher || !editForm) return;
        
        const teacher = editTeachers.find(t => t.id === parseInt(selectedTeacher));
        
        if (!teacher) return;
        
        setEditForm({
            ...editForm,
            teachers: {
                ...editForm.teachers,
                [selectedSubject]: teacher.name
            }
        });
        setSelectedSubject('');
        setSelectedTeacher('');
    };

    const handleSave = async () => {
        if (!editForm) return;

        try {
            setLoading(true);
            if (useApiData && currentSchoolId) {
                // 调用API保存班级信息
                const classId = parseInt(editForm.id);
                
                // 获取班主任信息 - 只发送教师姓名，后端通过姓名查找 SysUser
                let headTeacherName: string = '';  // 默认为空字符串，表示未分配

                console.log('[DEBUG] selectedHeadTeacherId:', selectedHeadTeacherId);
                console.log('[DEBUG] editForm.headTeacher:', editForm.headTeacher);

                if (selectedHeadTeacherId && selectedHeadTeacherId !== '') {
                    const selectedTeacher = editTeachers.find(t => t.id.toString() === selectedHeadTeacherId);
                    if (selectedTeacher) {
                        headTeacherName = selectedTeacher.name;
                        console.log('[DEBUG] Found head teacher by selectedHeadTeacherId:', headTeacherName);
                    }
                } else if (editForm.headTeacher && editForm.headTeacher !== '未分配') {
                    headTeacherName = editForm.headTeacher;
                    console.log('[DEBUG] Found head teacher by editForm.headTeacher:', headTeacherName);
                }

                // 如果没有找到班主任，headTeacherName 保持为空字符串，表示未分配
                if (!headTeacherName) {
                    console.log('[DEBUG] No head teacher selected, will set to empty (未分配)');
                }
                
                // 1. 更新班级基本信息（班级名称、班主任、任课教师）
                // 将任课教师信息转换为格式（只发送教师姓名，后端通过姓名查找 SysUser）
                const teachersData: Record<string, string> = {};

                console.log('[DEBUG] editForm.teachers:', editForm.teachers);
                console.log('[DEBUG] editTeachers:', editTeachers);

                if (editForm.teachers && Object.keys(editForm.teachers).length > 0) {
                    for (const [subject, teacherName] of Object.entries(editForm.teachers)) {
                        console.log(`[DEBUG] Processing subject: ${subject}, teacherName: ${teacherName}`);
                        teachersData[subject] = teacherName as string;
                        console.log(`[DEBUG] Added ${subject}: ${teacherName}`);
                    }
                }

                // 构建请求数据
                const requestData: any = {
                    head_teacher: headTeacherName,
                };

                // 只在有教师数据时才发送 teachers 字段（避免清空已有教师）
                if (editForm.teachers && Object.keys(editForm.teachers).length > 0) {
                    requestData.teachers = teachersData;
                }

                console.log('[DEBUG] Final request data:', requestData);

                // 如果没有班主任信息（空字符串表示未分配），提示用户
                if (requestData.head_teacher === '') {
                    const confirmed = await confirm('未选择班主任，确定要保存吗？如果确认，班主任将被设置为"未分配"。');
                    if (!confirmed) {
                        return; // 用户取消保存
                    }
                }

                await api.put(`/api/schools/${currentSchoolId}/classes/${classId}`, requestData);

                // 2. 保存座位表（如果有变更）
                if (editForm.seatingGroups) {
                    console.log('[DEBUG] handleSave - editForm.seatingRowCount:', editForm.seatingRowCount);
                    const seatingData = {
                        groups: editForm.seatingGroups,
                        rowCount: editForm.seatingRowCount || 8
                    };
                    console.log('[DEBUG] handleSave - sending seatingData:', seatingData);
                    await api.post(`/api/org/class/${classId}/seating-chart`, seatingData);
                }

                toast.success('班级信息保存成功！');
                // 重新加载班级列表以刷新数据
                await loadClassesForSchool(currentSchoolId, editForm.school);
            } else {
                // Mock模式：直接更新本地状态
                setClasses(classes.map(c => c.id === editForm.id ? editForm : c));
                setFilteredClasses(filteredClasses.map(c => c.id === editForm.id ? editForm : c));
                toast.success('班级信息保存成功！');
            }

            setView('list');
            setEditForm(null);
            setEditTeachers([]);
            setEditStudents([]);
            setSelectedHeadTeacherId('');
        } catch (err: any) {
            console.error('保存班级信息失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '保存失败';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };
    
    const handleRemoveSubjectTeacher = (subject: string) => {
        if (!editForm) return;
        const newTeachers = { ...editForm.teachers };
        delete newTeachers[subject];
        setEditForm({ ...editForm, teachers: newTeachers });
    }

    // --- Seating Chart Handlers ---

    // 解析Excel文件
    const parseExcelFile = async (file: File): Promise<{students: Array<{name: string, gender: string, studentId?: string}>, seating?: SeatingGroup[]}> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 获取第一个工作表
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    
                    // 转换为JSON数组
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                    
                    if (jsonData.length === 0) {
                        reject(new Error('Excel文件为空'));
                        return;
                    }
                    
                    // 检测文件格式类型
                    const firstRow = jsonData[0] as string[];
                    const hasStudentId = firstRow.some(cell => 
                        cell && (cell.includes('学号') || cell.toLowerCase().includes('id'))
                    );
                    const hasName = firstRow.some(cell => 
                        cell && (cell.includes('姓名') || cell.includes('名字') || cell.toLowerCase().includes('name'))
                    );
                    const hasGender = firstRow.some(cell => 
                        cell && (cell.includes('性别') || cell.toLowerCase().includes('gender'))
                    );
                    
                    // 判断是座位表格式还是学生名单格式
                    // 座位表格式：多列布局，每个单元格是学生姓名
                    // 学生名单格式：每行一个学生，包含学号、姓名、性别等
                    
                    const students: Array<{name: string, gender: string, studentId?: string}> = [];
                    let seating: SeatingGroup[] | undefined;
                    
                    // 如果第一行看起来像标题行（包含"姓名"、"学号"等关键词）
                    if (hasName || hasStudentId) {
                        // 学生名单格式
                        const headerRow = jsonData[0] as string[];
                        const nameIdx = headerRow.findIndex(cell => 
                            cell && (cell.includes('姓名') || cell.includes('名字') || cell.toLowerCase().includes('name'))
                        );
                        const genderIdx = headerRow.findIndex(cell => 
                            cell && (cell.includes('性别') || cell.toLowerCase().includes('gender'))
                        );
                        const studentIdIdx = headerRow.findIndex(cell => 
                            cell && (cell.includes('学号') || cell.toLowerCase().includes('id'))
                        );
                        
                        // 从第二行开始解析学生数据
                        for (let i = 1; i < jsonData.length; i++) {
                            const row = jsonData[i];
                            if (!row || row.length === 0) continue;
                            
                            const name = row[nameIdx]?.toString().trim();
                            if (!name) continue;
                            
                            let gender = '';
                            if (genderIdx >= 0 && row[genderIdx]) {
                                const g = row[genderIdx].toString().trim();
                                if (g === '男' || g.toLowerCase() === 'm') gender = '男';
                                else if (g === '女' || g.toLowerCase() === 'f') gender = '女';
                            }
                            
                            const studentId = studentIdIdx >= 0 ? row[studentIdIdx]?.toString().trim() : undefined;
                            
                            students.push({ name, gender, studentId });
                        }
                    } else {
                        // 座位表格式 - 每列代表一个小组，每行代表一排
                        // 第一行可能是列标签(第1组(A列)、第2组(B列)... 或 A、B、C...)
                        const isHeaderRow = firstRow.some(cell => {
                            if (!cell) return false;
                            const cellStr = cell.toString().trim();
                            // 检测单字母列标签（A、B、C...）
                            if (cellStr.length <= 2 && /^[A-Z]$/i.test(cellStr)) return true;
                            // 检测"第X组"格式（第1组、第2组...）
                            if (/^第\d+组/.test(cellStr)) return true;
                            // 检测"(A列)"、"(B列)"格式
                            if (/\([A-Z]列\)/.test(cellStr)) return true;
                            return false;
                        });
                        const startRow = isHeaderRow ? 1 : 0;
                        
                        // 计算最大列数和行数
                        const maxCols = Math.max(...jsonData.slice(startRow).map(row => row?.length || 0));
                        const maxRows = jsonData.length - startRow;
                        const groups: SeatingGroup[] = [];
                        
                        // 初始化每组，预分配空位置以保持原始布局
                        for (let col = 0; col < maxCols; col++) {
                            groups.push({
                                id: col + 1,
                                name: `第${String.fromCharCode(65 + col)}列`,
                                students: Array(maxRows).fill('')  // 预填充空字符串保持位置
                            });
                        }
                        
                        // 遍历每一行，将学生添加到对应的组
                        for (let rowIdx = startRow; rowIdx < jsonData.length; rowIdx++) {
                            const row = jsonData[rowIdx];
                            if (!row) continue;
                            
                            // 第一列可能是行号，跳过
                            const startCol = (row[0] && !isNaN(Number(row[0]))) ? 1 : 0;
                            const dataRowIdx = rowIdx - startRow; // 数据在组中的实际行索引
                            
                            for (let col = startCol; col < row.length; col++) {
                                const cell = row[col];
                                
                                const groupIdx = col - startCol;
                                if (groupIdx < 0 || groupIdx >= groups.length) continue;
                                
                                // 如果单元格有值，放入对应位置
                                if (cell) {
                                    const name = cell.toString().trim();
                                    if (name && name.length > 0 && !/^\d+$/.test(name)) {
                                        groups[groupIdx].students[dataRowIdx] = name;
                                        // 添加到学生列表（去重）
                                        if (!students.find(s => s.name === name)) {
                                            students.push({ name, gender: '' });
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 过滤掉全空的组（但保留有空位置的组）
                        seating = groups.filter(g => g.students.some(s => s && s.length > 0));
                    }
                    
                    resolve({ students, seating });
                } catch (err) {
                    reject(new Error(`解析Excel文件失败: ${err instanceof Error ? err.message : '未知错误'}`));
                }
            };
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsArrayBuffer(file);
        });
    };

    const handleImportSeating = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if(!file) return;
        
        // 检查文件类型
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        
        if (!validTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
            toast.warning('请上传 Excel 文件 (.xlsx, .xls) 或 CSV 文件');
            e.target.value = '';
            return;
        }
        
        try {
            setIsImporting(true);
            const result = await parseExcelFile(file);
            
            if (result.students.length === 0) {
                toast.warning('未能从文件中解析出学生数据，请检查文件格式');
                setIsImporting(false);
                e.target.value = '';
                return;
            }
            
            // 保存预览数据和文件
            setImportPreview(result);
            setImportFile(file);
            setIsImportModalOpen(true);
            
        } catch (err) {
            console.error('解析文件失败:', err);
            toast.error(err.message || "操作失败");
        } finally {
            setIsImporting(false);
            e.target.value = '';
        }
    };

    // 确认导入
    const handleConfirmImport = async () => {
        if (!importPreview || !editForm) return;
        
        setIsImporting(true);
        try {
            const classId = parseInt(editForm.id);
            
            // 1. 更新本地学生列表状态
            const newStudents = [...editStudents];
            const existingNames = new Set(editStudents.map(s => s.name));
            
            for (const student of importPreview.students) {
                if (!existingNames.has(student.name)) {
                    newStudents.push({
                        id: Date.now() + Math.random(), // 临时ID
                        name: student.name,
                        gender: student.gender || ''
                    });
                    existingNames.add(student.name);
                }
            }
            
            setEditStudents(newStudents);
            
            // 2. 更新座位表（如果有）
            if (importPreview.seating && importPreview.seating.length > 0) {
                setEditForm({
                    ...editForm,
                    seatingGroups: importPreview.seating,
                    allStudents: newStudents.map(s => s.name)
                });
            } else {
                // 如果没有座位布局，自动生成
                const studentsPerGroup = 8;
                const groups: SeatingGroup[] = [];
                const allStudentNames = newStudents.map(s => s.name);
                
                for (let i = 0; i < allStudentNames.length; i += studentsPerGroup) {
                    groups.push({
                        id: groups.length + 1,
                        name: `第${String.fromCharCode(65 + groups.length)}列`,
                        students: allStudentNames.slice(i, i + studentsPerGroup)
                    });
                }
                
                setEditForm({
                    ...editForm,
                    seatingGroups: groups,
                    allStudents: allStudentNames
                });
            }
            
            // 3. 同步到后端数据库
            if (useApiData && !isNaN(classId)) {
                try {
                    // 批量导入学生到数据库
                    const importResponse: any = await api.post('/api/schools/students/import', {
                        class_id: classId,
                        students: importPreview.students.map(s => ({
                            name: s.name,
                            gender: s.gender === '男' ? 'M' : s.gender === '女' ? 'F' : s.gender,
                            student_no: s.studentId || null
                        }))
                    });
                    
                    console.log('学生导入结果:', importResponse);
                    
                    // 保存座位表
                    const seatingData = {
                        groups: importPreview.seating || editForm.seatingGroups,
                        rowCount: editForm.seatingRowCount || 8
                    };
                    await api.post(`/api/org/class/${classId}/seating-chart`, seatingData);
                    console.log('座位表同步成功');
                    
                    const skippedCount = importResponse.skipped || 0;
                    const failedCount = importResponse.failed || 0;
                    let message = `导入完成！成功 ${importResponse.success} 名学生`;
                    if (skippedCount > 0) {
                        message += `，跳过 ${skippedCount} 名已存在学生`;
                    }
                    if (failedCount > 0) {
                        message += `，失败 ${failedCount} 名`;
                    }
                    toast.info(message);
                } catch (err) {
                    console.error('同步到后端失败:', err);
            toast.error(err.message || "操作失败");
                }
            } else {
                toast.success(`导入成功！共导入 ${importPreview.students.length} 名学生`);
            }
            
            setIsImportModalOpen(false);
            setImportPreview(null);
            setImportFile(null);
            
        } catch (err) {
            console.error('导入失败:', err);
            toast.error(err.message || "操作失败");
        } finally {
            setIsImporting(false);
        }
    };

    // 下载座位表导入模板
    const handleDownloadSeatingTemplate = async () => {
        try {
            const XLSX = await import('xlsx');
            
            // 根据当前班级的座位表配置生成模板
            // 优先使用已保存的配置，否则使用默认值（9列8行）
            const colCount = editForm?.seatingGroups?.length || 9;
            const rowCount = editForm?.seatingRowCount || 8;
            
            // 生成列标题：第1组(A列)、第2组(B列)...
            const headerRow: string[] = [];
            for (let i = 0; i < colCount; i++) {
                const colLetter = String.fromCharCode(65 + i); // A, B, C...
                headerRow.push(`第${i + 1}组(${colLetter}列)`);
            }
            
            // 生成数据行（包含行号）
            const templateData: (string | number)[][] = [headerRow];
            for (let rowIdx = 1; rowIdx <= rowCount; rowIdx++) {
                const row: (string | number)[] = new Array(colCount).fill('');
                templateData.push(row);
            }
            
            // 创建座位表工作表
            const ws = XLSX.utils.aoa_to_sheet(templateData);
            
            // 设置列宽
            ws['!cols'] = Array(colCount).fill({ wch: 15 });
            
            // 设置行高（第1行表头稍高）
            ws['!rows'] = [{ hpt: 30 }, ...Array(rowCount).fill({ hpt: 25 })];
            
            // 设置表头样式（蓝色背景，白色字体）
            const headerRange = XLSX.utils.decode_range(ws['!ref'] || `A1:${String.fromCharCode(64 + colCount)}1`);
            for (let C = headerRange.s.c; C <= headerRange.e.c && C < colCount; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
                if (!ws[cellRef]) ws[cellRef] = {};
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: "3B82F6" } }, // Tailwind blue-500
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin", color: { rgb: "2563EB" } },
                        bottom: { style: "thin", color: { rgb: "2563EB" } },
                        left: { style: "thin", color: { rgb: "2563EB" } },
                        right: { style: "thin", color: { rgb: "2563EB" } }
                    }
                };
            }
            
            // 设置数据单元格样式（带边框）
            for (let R = 1; R <= rowCount; ++R) {
                for (let C = 0; C < colCount; ++C) {
                    const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellRef]) ws[cellRef] = {};
                    if (!ws[cellRef].s) ws[cellRef].s = {};
                    ws[cellRef].s = {
                        alignment: { horizontal: "center", vertical: "center" },
                        border: {
                            top: { style: "thin", color: { rgb: "E5E7EB" } },
                            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
                            left: { style: "thin", color: { rgb: "E5E7EB" } },
                            right: { style: "thin", color: { rgb: "E5E7EB" } }
                        }
                    };
                }
            }
            
            // 创建使用说明工作表
            const instructionsData = [
                ['座位表导入模板使用说明'],
                [''],
                ['📋 模板结构说明'],
                ['• 每列代表一个小组（如：第1组对应A列）'],
                ['• 每行代表一个座位位置（第2行开始为第1排）'],
                [`• 当前模板尺寸：${colCount}列 × ${rowCount}行（与座位表编辑器设置一致）`],
                [''],
                ['📝 填写规则'],
                ['1. 在单元格中填写学生姓名即可'],
                ['2. 每个单元格只能填写一个学生姓名'],
                ['3. 姓名必须与系统中的学生名单一致'],
                ['4. 不分配座位的单元格请留空'],
                [''],
                ['💡 填写示例'],
                ['第1组(A列)', '第2组(B列)', '第3组(C列)'],
                ['张三', '李四', '王五'],
                ['赵六', '孙七', '周八'],
                [''],
                ['⚠️ 注意事项'],
                ['• 请勿修改表头（第一行）'],
                ['• 请勿在第一行上方插入新行'],
                ['• 导入时会自动跳过姓名为空的单元格'],
                ['• 如学生姓名不存在系统中，该座位将不会被分配'],
            ];
            
            const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
            
            // 设置说明Sheet的列宽
            wsInstructions['!cols'] = [
                { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 50 }
            ];
            
            // 设置说明Sheet的标题样式
            const titleCell = wsInstructions['A1'];
            if (titleCell) {
                titleCell.s = {
                    font: { bold: true, sz: 14, color: { rgb: "1E40AF" } },
                    alignment: { horizontal: "left", vertical: "center" }
                };
            }
            
            // 创建工作簿，添加两个Sheet
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '座位表模板');
            XLSX.utils.book_append_sheet(wb, wsInstructions, '使用说明');
            
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            
            // 生成文件名（包含班级名称和尺寸信息）
            const className = editForm?.name || '班级';
            const fileName = `座位表模板_${className}_${colCount}列${rowCount}行.xlsx`;
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log(`[DEBUG] 座位表模板已下载: ${colCount}列 × ${rowCount}行`);
        } catch (err: any) {
            console.error('下载模板失败:', err);
            toast.error(err.message || "操作失败");
        }
    };

    const handleSaveSeating = async (newGroups: SeatingGroup[], rowCount: number) => {
        if(editForm) {
            console.log('[DEBUG] handleSaveSeating called with rowCount:', rowCount);
            // 先更新本地状态，同时保存行数
            setEditForm({ ...editForm, seatingGroups: newGroups, seatingRowCount: rowCount });
            setIsSeatingModalOpen(false);
            
            // 如果使用API数据，同步保存到后端
            if (useApiData) {
                try {
                    const classId = parseInt(editForm.id);
                    if (isNaN(classId)) {
                        throw new Error('班级ID无效');
                    }
                    
                    const seatingData = {
                        groups: newGroups,
                        rowCount: rowCount
                    };
                    console.log('[DEBUG] Saving seating data:', seatingData);
                    
                    // 使用不依赖 schoolId 的 API
                    await api.post(`/api/org/class/${classId}/seating-chart`, seatingData);
                    console.log('[DEBUG] 座位表保存成功，rowCount:', rowCount);
                } catch (err: any) {
                    console.error('保存座位表失败:', err);
            toast.error(err.message || "操作失败");
                }
            }
        }
    };

    const executeBatchUpgrade = async () => {
        if (upgradeSelectedClasses.length === 0) {
            toast.warning('请先选择需要升级的班级');
            return;
        }

        // 获取年级映射关系
        const gradeMapping: Record<string, string> = {
            '初一': '初二',
            '初二': '初三',
            '初三': '已毕业',
            '高一': '高二',
            '高二': '高三',
            '高三': '已毕业'
        };

        const targetGradeName = gradeMapping[selectedUpgradeSource];

        if (!useApiData) {
            // Mock模式下只更新前端数据
            if (targetGradeName === '已毕业') {
                // 毕业班级在Mock模式下只显示提示
                setIsUpgradeModalOpen(false);
                setUpgradeSelectedClasses([]);
                toast.info(`已将 ${upgradeSelectedClasses.length} 个班级标记为毕业！`);
                return;
            }

            const upgradedClasses = classes.map(cls => {
                if (upgradeSelectedClasses.includes(cls.id)) {
                    return {
                        ...cls,
                        grade: targetGradeName
                    };
                }
                return cls;
            });

            setClasses(upgradedClasses);
            setFilteredClasses(upgradedClasses);
            setIsUpgradeModalOpen(false);
            setUpgradeSelectedClasses([]);
            toast.success(`成功升级 ${upgradeSelectedClasses.length} 个班级！`);
            return;
        }

        // API模式下调用后端
        try {
            setLoading(true);

            // 查找"已毕业"年级
            let targetGrade = grades.find(g => g.name === targetGradeName);

            // 如果找不到"已毕业"年级，需要创建或提示
            if (!targetGrade && targetGradeName === '已毕业') {
                toast.warning('系统未配置"已毕业"年级，请先在组织架构中创建该年级');
                return;
            }

            if (!targetGrade) {
                toast.info(`未找到目标年级：${targetGradeName}`);
                return;
            }

            const classIds = upgradeSelectedClasses.map(id => parseInt(id));

            const response: any = await api.post(
                `/api/schools/${currentSchoolId}/classes/batch-upgrade`,
                {
                    class_ids: classIds,
                    target_grade_id: targetGrade.id,
                    settings: {
                        autoArchiveGraduates,
                        clearSeatingChart,
                        resetMoralScore,
                        backupData
                    }
                }
            );

            const message = targetGradeName === '已毕业'
                ? `成功毕业 ${response.graduated_count || 0} 个班级`
                : `成功升级 ${response.upgraded_count || 0} 个班级${response.graduated_count > 0 ? `，毕业 ${response.graduated_count} 个班级` : ''}`;

            toast.info(message);
            // 刷新班级数据
            await loadClassesForSchool(currentSchoolId!, filterSchool);

            setIsUpgradeModalOpen(false);
            setUpgradeSelectedClasses([]);
        } catch (err: any) {
            console.error('班级升级失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '升级失败';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const toggleUpgradeClassSelection = (id: string) => {
        setUpgradeSelectedClasses(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // 班级详情视图
    if (view === 'detail' && detailClass) {
        return (
            <div className="space-y-6">
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>班级管理</span>
                    <span>-&gt;</span>
                    <span className="font-bold text-slate-800">班级详情</span>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
                    {/* 基本信息 */}
                    <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">基本信息</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">班级名称</label>
                                <div className="flex-1 text-sm text-slate-900">{detailClass.name}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">所属年级</label>
                                <div className="flex-1 text-sm text-slate-900">{detailClass.grade}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">班主任</label>
                                <div className="flex-1 text-sm text-slate-900">{detailClass.headTeacher || '-'}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学生人数</label>
                                <div className="flex-1 text-sm text-slate-900">{detailClass.studentCount || 0} 人</div>
                            </div>
                        </div>
                    </div>

                    {/* 任课教师信息 */}
                    <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">任课教师</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {detailClass.teachers && Object.entries(detailClass.teachers).map(([subject, teacher]) => (
                                <div key={subject} className="flex items-center space-x-2 bg-slate-50 px-4 py-3 rounded-lg">
                                    <span className="text-sm font-medium text-slate-600">{subject}:</span>
                                    <span className="text-sm text-slate-900">{teacher || '-'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 按钮 */}
                    <div className="flex space-x-4 pt-4 border-t border-slate-100">
                        <button 
                            onClick={handleBack}
                            className="rounded-md border border-slate-300 bg-white px-8 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                        >
                            返回
                        </button>
                        {hasPermission('class:edit') && (
                            <button 
                                onClick={() => handleEditClick(detailClass)}
                                className="rounded-md bg-blue-500 px-8 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none"
                            >
                                编辑
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'edit' && editForm) {
        return (
            <div className="space-y-6">
                 <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>班级管理</span>
                    <span>-&gt;</span>
                    <span className="font-bold text-slate-800">班级管理-编辑</span>
                </div>

                {/* Loading Indicator */}
                {isLoadingEditData && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-600 px-4 py-3 rounded-md text-sm flex items-center">
                        <div className="animate-spin mr-2 w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        正在加载班级数据...
                    </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
                     {/* Basic Info */}
                     <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center">
                            <span className="w-1 h-5 bg-blue-500 rounded-full mr-2"></span>
                            基础信息
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="flex items-center space-x-3">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学校</label>
                                <select 
                                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={editForm.school}
                                    disabled
                                >
                                    {schools.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                             </div>
                             <div className="flex items-center space-x-3">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>班级名称</label>
                                <input 
                                    type="text" 
                                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none"
                                    value={editForm.name}
                                    disabled
                                />
                             </div>
                             <div className="flex items-center space-x-3">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学段</label>
                                <select 
                                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={editForm.stage}
                                    disabled
                                >
                                    <option value="">{editForm.stage || '未设置'}</option>
                                </select>
                             </div>
                              <div className="flex items-center space-x-3">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>年级</label>
                                <select 
                                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={editForm.grade}
                                    disabled
                                >
                                    <option value="">{editForm.grade || '未设置'}</option>
                                </select>
                             </div>
                        </div>
                     </div>

                     {/* Teacher Info */}
                     <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center">
                            <span className="w-1 h-5 bg-blue-500 rounded-full mr-2"></span>
                            教师信息
                        </h3>
                        <div className="space-y-4">
                             <div className="flex items-center space-x-3 max-w-lg">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">班主任</label>
                                <select 
                                    className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={selectedHeadTeacherId}
                                    onChange={(e) => {
                                        const teacherId = e.target.value;
                                        setSelectedHeadTeacherId(teacherId);
                                        const teacher = editTeachers.find(t => t.id.toString() === teacherId);
                                        if (teacher) {
                                            setEditForm({...editForm, headTeacher: teacher.name});
                                        } else {
                                            setEditForm({...editForm, headTeacher: ''});
                                        }
                                    }}
                                >
                                    <option value="">请选择班主任</option>
                                    {editTeachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} {t.subject ? `(${t.subject})` : ''}</option>
                                    ))}
                                </select>
                             </div>
                             <div className="flex items-center space-x-3 max-w-3xl">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">任课教师</label>
                                <select 
                                    className="w-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={selectedSubject}
                                    onChange={(e) => setSelectedSubject(e.target.value)}
                                >
                                    <option value="">请选择学科</option>
                                    {subjectOptions.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                                <select 
                                    className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    value={selectedTeacher}
                                    onChange={(e) => setSelectedTeacher(e.target.value)}
                                >
                                    <option value="">请选择教师</option>
                                    {editTeachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} {t.subject ? `(${t.subject})` : ''}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleAddSubjectTeacher}
                                    disabled={!selectedSubject || !selectedTeacher}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-600 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                                >
                                    添加
                                </button>
                             </div>
                             <div className="flex flex-wrap gap-2 pl-28">
                                 {Object.entries(editForm.teachers).length === 0 && (
                                     <span className="text-slate-400 text-sm">暂无任课教师</span>
                                 )}
                                 {Object.entries(editForm.teachers).map(([subject, teacher]) => {
                                     const subjectMap: Record<string, string> = {
                                         chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学',
                                         biology: '生物', geography: '地理', politics: '政治', history: '历史', morality: '道德与法治',
                                         it: '信息技术', pe: '体育', music: '音乐', art: '美术', psychology: '心理'
                                     };
                                     const label = subjectMap[subject] || subject;
                                     return (
                                         <div key={subject} className="flex items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm border border-blue-100">
                                             <span className="font-medium">{label}</span>
                                             <span className="mx-1 text-blue-400">|</span>
                                             <span>{teacher}</span>
                                             <button 
                                                onClick={() => handleRemoveSubjectTeacher(subject)}
                                                className="ml-2 text-blue-400 hover:text-red-500 transition-colors"
                                             >
                                                <X size={14} />
                                             </button>
                                         </div>
                                     );
                                 })}
                             </div>
                        </div>
                     </div>

                     {/* Student Info */}
                     <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center">
                            <span className="w-1 h-5 bg-blue-500 rounded-full mr-2"></span>
                            学生信息
                            <span className="ml-2 text-sm font-normal text-slate-500">
                                ({editStudents.length}人)
                            </span>
                        </h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex flex-wrap gap-3 mb-4">
                                    <input 
                                        type="file" 
                                        ref={seatingFileInputRef}
                                        className="hidden"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleImportSeating}
                                    />
                                    <button 
                                        onClick={() => seatingFileInputRef.current?.click()}
                                        disabled={isImporting}
                                        className="flex items-center bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isImporting ? (
                                            <>
                                                <div className="animate-spin mr-2 w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                                                导入中...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-4 h-4 mr-2" />
                                                导入学生
                                            </>
                                        )}
                                    </button>
                                    <button 
                                        onClick={handleDownloadSeatingTemplate}
                                        className="flex items-center bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm hover:bg-slate-50 transition-colors"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        下载座位表模板
                                    </button>
                                    <button 
                                        onClick={() => setIsSeatingModalOpen(true)}
                                        className="flex items-center bg-blue-500 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-600 transition-colors"
                                    >
                                        <Grid className="w-4 h-4 mr-2" />
                                        编辑座位表
                                    </button>
                                </div>
                                
                                {/* 导入提示 */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
                                    <p className="font-medium mb-1">导入说明：</p>
                                    <ul className="list-disc list-inside text-xs text-blue-600 space-y-1">
                                        <li>支持 Excel (.xlsx, .xls) 和 CSV 格式</li>
                                        <li>学生名单格式：每行一个学生，包含学号、姓名、性别列</li>
                                        <li>座位表格式：每列代表一个小组，单元格填写学生姓名</li>
                                        <li>点击"下载座位表模板"获取标准格式模板</li>
                                    </ul>
                                </div>
                                
                                {/* 学生列表 */}
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-700">学生名单</span>
                                        <span className="text-xs text-slate-500">共 {editStudents.length} 人</span>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto p-4">
                                        {editStudents.length > 0 ? (
                                            <div className="grid grid-cols-6 gap-2">
                                                {editStudents.map((stu, idx) => (
                                                    <div 
                                                        key={stu.id} 
                                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-center text-sm hover:bg-white hover:border-blue-200 transition-colors cursor-default"
                                                        title={`${stu.name} (${stu.gender || '性别未知'})`}
                                                    >
                                                        <span className="text-slate-400 text-xs mr-1">{idx + 1}</span>
                                                        <span className="text-slate-700">{stu.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-slate-400 text-sm">
                                                暂无学生信息，请点击"导入学生"添加
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                             <div>
                                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                                    当前座位预览
                                    {editForm.seatingGroups && editForm.seatingGroups.length > 0 && (
                                        <span className="ml-2 text-xs font-normal text-slate-500">
                                            ({editForm.seatingGroups.length} 组)
                                        </span>
                                    )}
                                </h4>
                                {/* Seating Chart Grid - 与座位表编辑器布局一致 */}
                                <div className="overflow-x-auto pb-4 border border-slate-200 rounded-lg p-4 bg-slate-50">
                                    {editForm.seatingGroups && editForm.seatingGroups.length > 0 ? (
                                        <div className="inline-block min-w-max">
                                            {/* 讲台标识 */}
                                            <div className="w-full flex justify-center mb-4">
                                                <div className="bg-slate-800 text-white px-16 py-2 rounded-b-xl shadow-md flex items-center justify-center text-sm font-bold tracking-widest border-t-4 border-blue-500">
                                                    <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                    </svg>
                                                    讲台 (Podium)
                                                </div>
                                            </div>
                                            
                                            {/* 座位网格 - 列=小组，行=座位号 */}
                                            <div className="flex flex-row gap-3">
                                                {editForm.seatingGroups.map((group, groupIdx) => (
                                                    <div key={group.id} className="flex flex-col">
                                                        {/* 列标签 A, B, C... */}
                                                        <div className="text-center mb-2">
                                                            <span className="bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full text-xs font-bold shadow-sm border border-blue-200">
                                                                {String.fromCharCode(65 + groupIdx)} 列
                                                            </span>
                                                        </div>
                                                        {/* 小组名称 */}
                                                        <div className="text-center text-[10px] text-slate-500 mb-1">{group.name}</div>
                                                        {/* 座位列表 - 动态行数 */}
                                                        <div className="flex flex-col gap-1">
                                                            {Array.from({ length: editForm.seatingRowCount || Math.max(...editForm.seatingGroups.map(g => g.students.length), 8) }).map((_, rowIdx) => {
                                                                const student = group.students[rowIdx];
                                                                return (
                                                                    <div key={rowIdx} className="flex items-center gap-1">
                                                                        {/* 行号 */}
                                                                        <div className="w-5 text-[10px] text-slate-400 font-medium text-right">
                                                                            {rowIdx + 1}
                                                                        </div>
                                                                        {/* 座位格 */}
                                                                        <div 
                                                                            className={`w-16 h-10 rounded flex flex-col items-center justify-center text-center shadow-sm ${
                                                                                student 
                                                                                    ? 'bg-blue-50 border border-blue-200' 
                                                                                    : 'bg-white border border-dashed border-slate-300'
                                                                            }`}
                                                                            title={student ? `${String.fromCharCode(65 + groupIdx)}-${rowIdx + 1} ${student}` : `${String.fromCharCode(65 + groupIdx)}-${rowIdx + 1}`}
                                                                        >
                                                                            {student ? (
                                                                                <>
                                                                                    <div className="text-[9px] text-blue-400">{String.fromCharCode(65 + groupIdx)}-{rowIdx + 1}</div>
                                                                                    <div className="text-[11px] text-slate-700 truncate w-full px-1">{student}</div>
                                                                                </>
                                                                            ) : (
                                                                                <div className="text-[10px] text-slate-300">-</div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full text-center py-8 text-sm text-slate-400">
                                            <div className="mb-2">暂无座位分组</div>
                                            <div className="text-xs">请点击"编辑座位表"进行设置</div>
                                        </div>
                                    )}
                                </div>
                             </div>
                        </div>
                     </div>

                      {/* Action Buttons */}
                    <div className="flex justify-center space-x-4 pt-4 mt-8 border-t border-slate-100">
                        <button
                            onClick={handleBack}
                            className="rounded-md border border-slate-300 bg-white px-8 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="rounded-md bg-blue-500 px-8 py-2.5 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>

                {/* Seating Editor Modal */}
                {isSeatingModalOpen && (
                    <SeatingEditorModal 
                        initialGroups={editForm.seatingGroups || []}
                        initialRowCount={editForm.seatingRowCount}
                        allStudents={editForm.allStudents || []}
                        onSave={handleSaveSeating}
                        onClose={() => setIsSeatingModalOpen(false)}
                    />
                )}

                {/* Import Preview Modal */}
                {isImportModalOpen && importPreview && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                                <div className="flex items-center space-x-3">
                                    <FileSpreadsheet className="w-6 h-6" />
                                    <div>
                                        <h3 className="text-lg font-bold">导入预览</h3>
                                        <p className="text-xs text-blue-100">文件: {importFile?.name}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        setIsImportModalOpen(false);
                                        setImportPreview(null);
                                        setImportFile(null);
                                    }}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* 校验结果 - 检查导入学生是否与班级学生一致 */}
                                {(() => {
                                    const existingStudentNames = new Set(editStudents.map(s => s.name));
                                    const unmatchedStudents = importPreview.students.filter(s => !existingStudentNames.has(s.name));
                                    const hasUnmatched = unmatchedStudents.length > 0;
                                    
                                    return hasUnmatched ? (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <div className="flex items-start space-x-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-red-700">校验失败 - 存在不匹配的学生</p>
                                                    <p className="text-xs text-red-600 mt-1">
                                                        导入的学生必须与班级学生管理中的学生一致。以下 {unmatchedStudents.length} 名学生在班级学生列表中不存在：
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {unmatchedStudents.slice(0, 10).map((s, idx) => (
                                                            <span key={idx} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                                {s.name}
                                                            </span>
                                                        ))}
                                                        {unmatchedStudents.length > 10 && (
                                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                                ...等共 {unmatchedStudents.length} 名
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-red-600 mt-2">
                                                        请先在「学生管理」页面添加这些学生，或修改导入文件中的学生姓名。
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <div className="flex items-center space-x-3">
                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                <div>
                                                    <p className="text-sm font-medium text-green-700">校验通过</p>
                                                    <p className="text-xs text-green-600">
                                                        导入的 {importPreview.students.length} 名学生均在班级学生列表中存在
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 统计信息 */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
                                        <div className="text-3xl font-bold text-blue-600">{importPreview.students.length}</div>
                                        <div className="text-sm text-blue-600 mt-1">学生总数</div>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                                        <div className="text-3xl font-bold text-green-600">
                                            {importPreview.students.filter(s => s.gender === '男').length}
                                        </div>
                                        <div className="text-sm text-green-600 mt-1">男生</div>
                                    </div>
                                    <div className="bg-pink-50 rounded-xl p-4 text-center border border-pink-100">
                                        <div className="text-3xl font-bold text-pink-600">
                                            {importPreview.students.filter(s => s.gender === '女').length}
                                        </div>
                                        <div className="text-sm text-pink-600 mt-1">女生</div>
                                    </div>
                                </div>

                                {/* 学生列表预览 */}
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                                        <UserCheck className="w-4 h-4 mr-2 text-blue-500" />
                                        学生列表预览
                                    </h4>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        <div className="max-h-60 overflow-y-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 sticky top-0">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-500">序号</th>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-500">学号</th>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-500">姓名</th>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-500">性别</th>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-500">匹配状态</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {importPreview.students.slice(0, 50).map((student, idx) => {
                                                        const existingStudentNames = new Set(editStudents.map(s => s.name));
                                                        const isMatched = existingStudentNames.has(student.name);
                                                        return (
                                                        <tr key={idx} className={`hover:bg-slate-50 ${!isMatched ? 'bg-red-50' : ''}`}>
                                                            <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                                                            <td className="px-4 py-2 text-slate-700">{student.studentId || '-'}</td>
                                                            <td className={`px-4 py-2 font-medium ${!isMatched ? 'text-red-700' : 'text-slate-700'}`}>
                                                                {student.name}
                                                                {!isMatched && <span className="ml-1 text-red-500">*</span>}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                {student.gender ? (
                                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                                        student.gender === '男' 
                                                                            ? 'bg-blue-100 text-blue-700' 
                                                                            : 'bg-pink-100 text-pink-700'
                                                                    }`}>
                                                                        {student.gender}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400 text-xs">未知</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                {isMatched ? (
                                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                                                        已匹配
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                                                        不匹配
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {importPreview.students.length > 50 && (
                                            <div className="px-4 py-2 bg-slate-50 text-center text-xs text-slate-500 border-t">
                                                仅显示前50条，共 {importPreview.students.length} 条记录
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 座位表预览 */}
                                {importPreview.seating && importPreview.seating.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                                            <Grid className="w-4 h-4 mr-2 text-blue-500" />
                                            座位表预览 ({importPreview.seating.length} 列)
                                        </h4>
                                        <div className="border border-slate-200 rounded-lg p-4 overflow-x-auto bg-slate-50">
                                            {/* 讲台标识 */}
                                            <div className="w-full flex justify-center mb-4">
                                                <div className="bg-slate-800 text-white px-16 py-2 rounded-b-xl shadow-md flex items-center justify-center text-sm font-bold tracking-widest border-t-4 border-blue-500">
                                                    <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                    </svg>
                                                    讲台 (Podium)
                                                </div>
                                            </div>
                                            {/* 座位网格 */}
                                            <div className="flex gap-3 min-w-max">
                                                {importPreview.seating.map((group, idx) => (
                                                    <div key={group.id} className="flex flex-col">
                                                        {/* 列标签 */}
                                                        <div className="text-center mb-2">
                                                            <span className="bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full text-xs font-bold shadow-sm border border-blue-200">
                                                                {String.fromCharCode(65 + idx)} 列
                                                            </span>
                                                        </div>
                                                        {/* 座位列表 - 动态行数 */}
                                                        <div className="flex flex-col gap-1">
                                                            {Array.from({ length: Math.max(...importPreview.seating.map((g: any) => g.students?.length || 0), 8) }).map((_, rowIdx) => {
                                                                const student = group.students[rowIdx];
                                                                const hasStudent = student && student.length > 0;
                                                                return (
                                                                    <div key={rowIdx} className="flex items-center gap-1">
                                                                        <div className="w-4 text-[10px] text-slate-400 text-right">{rowIdx + 1}</div>
                                                                        <div 
                                                                            className={`w-14 h-8 rounded flex items-center justify-center text-center text-xs shadow-sm ${
                                                                                hasStudent
                                                                                    ? 'bg-blue-50 border border-blue-200 text-slate-700' 
                                                                                    : 'bg-white border border-dashed border-slate-300 text-slate-300'
                                                                            }`}
                                                                        >
                                                                            {hasStudent ? student : '-'}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 班级学生信息 */}
                                {editStudents.length > 0 && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                        <div className="flex items-center space-x-3">
                                            <Users className="w-5 h-5 text-slate-500" />
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">班级学生管理</p>
                                                <p className="text-xs text-slate-500">
                                                    当前班级已有 {editStudents.length} 名学生。导入的学生座位表必须与学生管理中的学生一致。
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            {(() => {
                                const existingStudentNames = new Set(editStudents.map(s => s.name));
                                const unmatchedCount = importPreview.students.filter(s => !existingStudentNames.has(s.name)).length;
                                const canImport = unmatchedCount === 0;
                                
                                return (
                                <div className="border-t border-slate-200 px-6 py-4 flex justify-between items-center bg-slate-50">
                                    <div className="text-xs text-slate-500">
                                        {canImport ? (
                                            <>点击"确认导入"将更新座位表</>
                                        ) : (
                                            <span className="text-red-600 font-medium">
                                                存在 {unmatchedCount} 名不匹配的学生，请先在学生管理中添加这些学生
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex space-x-3">
                                        <button
                                            onClick={() => {
                                                setIsImportModalOpen(false);
                                                setImportPreview(null);
                                                setImportFile(null);
                                            }}
                                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handleConfirmImport}
                                            disabled={isImporting || !canImport}
                                            className={`px-6 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center ${
                                                canImport ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400'
                                            }`}
                                        >
                                            {isImporting ? (
                                                <>
                                                    <div className="animate-spin mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                                    导入中...
                                                </>
                                            ) : (
                                                '确认导入'
                                            )}
                                        </button>
                                    </div>
                                </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                    {error}
                </div>
            )}
             {/* Filter Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-6 flex-1 flex-wrap gap-y-4">
                        <div className="flex items-center space-x-2">
                            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">学校</label>
                            <select 
                                className="block w-60 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-700"
                                value={filterSchool}
                                onChange={(e) => {
                                    const schoolName = e.target.value;
                                    setFilterSchool(schoolName);
                                    const selectedSchool = schools.find(s => s.name === schoolName);
                                    if (selectedSchool && useApiData) {
                                        setCurrentSchoolId(selectedSchool.id);
                                        // 重新加载新学校的班级数据
                                        loadClassesForSchool(selectedSchool.id, selectedSchool.name, 1, currentGradeFilter, searchKeyword);
                                    }
                                }}
                                disabled={!useApiData}
                            >
                                {useApiData ? (
                                    schools.map(school => (
                                        <option key={school.id} value={school.name}>{school.name}</option>
                                    ))
                                ) : (
                                    <option value="">请选择学校</option>
                                )}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">年级</label>
                            <select 
                                className="block w-40 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-500"
                                value={filterGrade}
                                onChange={(e) => {
                                    const gradeName = e.target.value;
                                    setFilterGrade(gradeName);
                                    setFilterClass(''); // 清空班级选择
                                    
                                    if (useApiData && currentSchoolId && gradeName) {
                                        // 根据年级名称找到年级ID，然后加载该年级下的班级
                                        const selectedGrade = grades.find(g => g.name === gradeName);
                                        if (selectedGrade) {
                                            loadGradeClassesFromApi(currentSchoolId, selectedGrade.id);
                                        }
                                    } else {
                                        setGradeClasses([]);
                                    }
                                }}
                                disabled={!useApiData}
                            >
                                <option value="">{useApiData && grades.length === 0 ? '暂无年级数据' : '请选择年级'}</option>
                                {useApiData ? (
                                    grades.map(grade => (
                                        <option key={grade.id} value={grade.name}>{grade.name}</option>
                                    ))
                                ) : (
                                    <>
                                        <option value="初一">初一</option>
                                        <option value="初二">初二</option>
                                        <option value="初三">初三</option>
                                        <option value="高一">高一</option>
                                    </>
                                )}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">班级</label>
                            <select 
                                className="block w-40 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-500"
                                value={filterClass}
                                onChange={(e) => setFilterClass(e.target.value)}
                                disabled={!useApiData || !filterGrade}
                            >
                                <option value="">请选择班级</option>
                                {useApiData ? (
                                    gradeClasses.map(cls => (
                                        <option key={cls.id} value={cls.name}>{cls.name}</option>
                                    ))
                                ) : (
                                    <option value="37班">37班</option>
                                )}
                            </select>
                        </div>
                    </div>
                     <div className="flex space-x-3">
                         <button 
                            onClick={handleSearch}
                            className="rounded-md bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none">
                            查询
                         </button>
                         <button 
                            onClick={handleReset}
                            className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none">
                            重置
                         </button>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex space-x-3">
                <button 
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="flex items-center rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none shadow-sm transition-all active:scale-95"
                >
                    <ArrowUpCircle className="w-4 h-4 mr-2" />
                    批量升级
                </button>
                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex items-center rounded-md bg-white border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none shadow-sm transition-all"
                >
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    升级设置
                </button>
            </div>

            {/* Table */}
             <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-max w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-center"><input type="checkbox" className="rounded border-slate-300" /></th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">序号</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">班级</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">年级</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">学段</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">学校</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500">班主任</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">语文</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">数学</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">英语</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">物理</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">化学</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">生物</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">地理</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">政治</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">历史</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">道德与法治</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">信息技术</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">体育</th>
                            <th className="px-2 py-3 text-center font-medium text-slate-500">音乐</th>
                            <th className="px-4 py-3 text-center font-medium text-slate-500 sticky right-0 bg-slate-50">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredClasses.length === 0 && (
                            <tr>
                                <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                                    <div className="flex flex-col items-center space-y-2">
                                        <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        <span>暂无班级数据</span>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {filteredClasses.map((cls, idx) => (
                            <tr key={cls.id} className={`hover:bg-slate-50 text-center ${cls.grade === '已毕业' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                                <td className="px-4 py-4"><input type="checkbox" className="rounded border-slate-300" /></td>
                                <td className="px-4 py-4 text-slate-500">{idx + 1}</td>
                                <td className="px-4 py-4 font-medium text-slate-900">{cls.name}</td>
                                <td className="px-4 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls.grade === '已毕业' ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>
                                        {cls.grade}
                                    </span>
                                </td>
                                <td className="px-4 py-4 text-slate-600">{cls.stage}</td>
                                <td className="px-4 py-4 text-slate-600">{cls.school}</td>
                                <td className="px-4 py-4 text-slate-600">{cls.headTeacher}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.chinese}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.math}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.english}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.physics}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.chemistry}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.biology}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.geography}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.politics}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.history}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.morality}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.it}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.pe}</td>
                                <td className="px-2 py-4 text-slate-600">{cls.teachers.music}</td>
                                <td className="px-4 py-4 whitespace-nowrap sticky right-0 bg-white shadow-[-5px_0px_5px_-5px_rgba(0,0,0,0.1)]">
                                     <div className="flex justify-center space-x-3">
                                        <button 
                                            onClick={() => handleViewClick(cls)} 
                                            className="text-green-500 hover:text-green-700 text-sm font-medium"
                                        >
                                            查看
                                        </button>
                                        {hasPermission('class:edit') && (
                                            <button 
                                                onClick={() => handleEditClick(cls)} 
                                                className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                                            >
                                                编辑
                                            </button>
                                        )}
                                     </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>

              {/* Pagination */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                <span>共 {totalClasses} 条</span>
                <select
                    className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={pageSize}
                    onChange={(e) => {
                        const newSize = parseInt(e.target.value);
                        setPageSize(newSize);
                        setCurrentPage(1);
                        if (currentSchoolId) {
                            loadClassesForSchool(currentSchoolId, filterSchool, 1, currentGradeFilter, searchKeyword);
                        }
                    }}
                >
                    <option value={10}>10条/页</option>
                    <option value={20}>20条/页</option>
                    <option value={50}>50条/页</option>
                    <option value={100}>100条/页</option>
                </select>
                <button
                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                    disabled={currentPage <= 1}
                    onClick={() => {
                        if (currentSchoolId) {
                            loadClassesForSchool(currentSchoolId, filterSchool, 1, currentGradeFilter, searchKeyword);
                        }
                    }}
                >
                    {'<<'}
                </button>
                <button
                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                    disabled={currentPage <= 1}
                    onClick={() => {
                        if (currentPage > 1 && currentSchoolId) {
                            loadClassesForSchool(currentSchoolId, filterSchool, currentPage - 1, currentGradeFilter, searchKeyword);
                        }
                    }}
                >
                    {'<'}
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                        pageNum = i + 1;
                    } else if (currentPage <= 3) {
                        pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                    } else {
                        pageNum = currentPage - 2 + i;
                    }

                    return (
                        <button
                            key={pageNum}
                            className={`px-2 py-1 ${currentPage === pageNum ? 'text-blue-600 font-bold' : 'text-slate-600 hover:text-blue-600'}`}
                            onClick={() => {
                                if (currentSchoolId) {
                                    loadClassesForSchool(currentSchoolId, filterSchool, pageNum, currentGradeFilter, searchKeyword);
                                }
                            }}
                        >
                            {pageNum}
                        </button>
                    );
                })}
                <button
                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                        if (currentPage < totalPages && currentSchoolId) {
                            loadClassesForSchool(currentSchoolId, filterSchool, currentPage + 1, currentGradeFilter, searchKeyword);
                        }
                    }}
                >
                    {'>'}
                </button>
                <button
                    className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                        if (currentSchoolId) {
                            loadClassesForSchool(currentSchoolId, filterSchool, totalPages, currentGradeFilter, searchKeyword);
                        }
                    }}
                >
                    {'>>'}
                </button>
                <span>前往</span>
                <input
                    type="number"
                    min={1}
                    max={totalPages}
                    defaultValue={currentPage}
                    className="w-10 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            const targetPage = parseInt((e.target as HTMLInputElement).value);
                            if (targetPage >= 1 && targetPage <= totalPages && currentSchoolId) {
                                loadClassesForSchool(currentSchoolId, filterSchool, targetPage, currentGradeFilter, searchKeyword);
                            }
                        }
                    }}
                />
                <span>页</span>
            </div>

            {/* Batch Upgrade Modal */}
            {isUpgradeModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="text-lg font-bold flex items-center">
                                <ArrowUpCircle className="w-5 h-5 mr-2" />
                                班级批量升级
                            </h3>
                            <button onClick={() => setIsUpgradeModalOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-slate-700">源年级</label>
                                    <select 
                                        className="block w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        value={selectedUpgradeSource}
                                        onChange={(e) => {
                                            setSelectedUpgradeSource(e.target.value);
                                            setUpgradeSelectedClasses([]);
                                        }}
                                    >
                                        {grades.length > 0 ? (
                                            grades.map(grade => (
                                                <option key={grade.id} value={grade.name}>{grade.name}</option>
                                            ))
                                        ) : (
                                            <>
                                                <option value="初一">初一</option>
                                                <option value="初二">初二</option>
                                                <option value="初三">初三</option>
                                                <option value="高一">高一</option>
                                                <option value="高二">高二</option>
                                                <option value="高三">高三</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500">升级后目标年级</p>
                                    <p className="text-lg font-bold text-blue-600">
                                        {(() => {
                                            // 根据源年级计算目标年级
                                            const gradeOrder: Record<string, string[]> = {
                                                '小学': ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
                                                '初中': ['初一', '初二', '初三'],
                                                '高中': ['高一', '高二', '高三']
                                            };
                                            
                                            // 判断学段
                                            let stage: '小学' | '初中' | '高中' | null = null;
                                            if (selectedUpgradeSource.includes('一') || selectedUpgradeSource.includes('二') || selectedUpgradeSource.includes('三') || selectedUpgradeSource.includes('四') || selectedUpgradeSource.includes('五') || selectedUpgradeSource.includes('六')) {
                                                if (selectedUpgradeSource.startsWith('初')) stage = '初中';
                                                else if (selectedUpgradeSource.startsWith('高')) stage = '高中';
                                                else stage = '小学';
                                            }
                                            
                                            if (!stage) return '已毕业 (归档)';
                                            
                                            const grades = gradeOrder[stage];
                                            const currentIndex = grades.indexOf(selectedUpgradeSource);
                                            
                                            if (currentIndex === -1 || currentIndex >= grades.length - 1) {
                                                return '已毕业 (归档)';
                                            }
                                            
                                            return grades[currentIndex + 1];
                                        })()}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-bold text-slate-800">选择待升级班级 ({upgradeSelectedClasses.length})</h4>
                                    <button 
                                        onClick={() => {
                                            const availableInGrade = classes.filter(c => c.grade === selectedUpgradeSource).map(c => c.id);
                                            setUpgradeSelectedClasses(availableInGrade.length === upgradeSelectedClasses.length ? [] : availableInGrade);
                                        }}
                                        className="text-xs text-blue-600 font-medium hover:underline"
                                    >
                                        全选/取消
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {classes.filter(c => c.grade === selectedUpgradeSource).map(cls => (
                                        <label key={cls.id} className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${
                                            upgradeSelectedClasses.includes(cls.id) 
                                                ? 'bg-blue-100 border-blue-400 text-blue-800' 
                                                : 'bg-white border-slate-200 hover:border-blue-300 text-slate-700'
                                        }`}>
                                            <input 
                                                type="checkbox" 
                                                className="hidden" 
                                                checked={upgradeSelectedClasses.includes(cls.id)}
                                                onChange={() => toggleUpgradeClassSelection(cls.id)}
                                            />
                                            <span className="text-xs font-medium w-full text-center">{cls.name}</span>
                                        </label>
                                    ))}
                                    {classes.filter(c => c.grade === selectedUpgradeSource).length === 0 && (
                                        <div className="col-span-full py-8 text-center text-slate-400 text-sm">该年级暂无班级数据</div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start space-x-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-amber-800 leading-relaxed">
                                    <p className="font-bold mb-1">升级提醒：</p>
                                    <p>1. 升级后，班级名称保持不变，年级属性将自动步进。</p>
                                    <p>2. 毕业班级升级后将进入"已毕业"状态，学生档案将根据设置自动处理。</p>
                                    <p>3. 此操作不可逆，请核对后再提交。</p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
                            <button 
                                onClick={() => setIsUpgradeModalOpen(false)}
                                className="px-6 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white"
                            >
                                取消
                            </button>
                            <button 
                                onClick={executeBatchUpgrade}
                                className="px-6 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center"
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                立即升级
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upgrade Settings Modal */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center">
                                <SettingsIcon className="w-5 h-5 mr-2 text-slate-600" />
                                升级规则设置
                            </h3>
                            <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center">
                                    <GraduationCap className="w-4 h-4 mr-2" />
                                    毕业处理逻辑
                                </h4>
                                <div className="space-y-3 pl-6">
                                    <label className="flex items-center space-x-3 cursor-pointer group">
                                        <div className={`w-10 h-6 rounded-full relative transition-colors ${autoArchiveGraduates ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                            <input 
                                                type="checkbox" 
                                                className="hidden" 
                                                checked={autoArchiveGraduates}
                                                onChange={() => setAutoArchiveGraduates(!autoArchiveGraduates)}
                                            />
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoArchiveGraduates ? 'translate-x-4' : ''}`} />
                                        </div>
                                        <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">毕业班级自动进入归档库</span>
                                    </label>
                                    <p className="text-xs text-slate-500">开启后，初三/高三毕业班在升级操作后，将自动移动至"毕业管理"模块，不再出现在日常教学列表中。</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center">
                                    <ArrowUpCircle className="w-4 h-4 mr-2" />
                                    升级策略
                                </h4>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600">自动清理座位表</span>
                                        <input
                                            type="checkbox"
                                            checked={clearSeatingChart}
                                            onChange={(e) => setClearSeatingChart(e.target.checked)}
                                            className="rounded border-slate-300 text-blue-600"
                                        />
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600">重置德育评分</span>
                                        <input
                                            type="checkbox"
                                            checked={resetMoralScore}
                                            onChange={(e) => setResetMoralScore(e.target.checked)}
                                            className="rounded border-slate-300 text-blue-600"
                                        />
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600">备份上一学年数据</span>
                                        <input
                                            type="checkbox"
                                            checked={backupData}
                                            onChange={(e) => setBackupData(e.target.checked)}
                                            className="rounded border-slate-300 text-blue-600"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start space-x-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-blue-700">设置将在下次执行"批量升级"时生效。</p>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
                            <button
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="px-6 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white"
                            >
                                取消
                            </button>
                            <button
                                onClick={async () => {
                                    if (!useApiData) {
                                        toast.info('升级规则已更新！');
                                        setIsSettingsModalOpen(false);
                                        return;
                                    }

                                    try {
                                        setLoading(true);
                                        await api.post(`/api/schools/${currentSchoolId}/upgrade-settings`, {
                                            autoArchiveGraduates,
                                            clearSeatingChart,
                                            resetMoralScore,
                                            backupData
                                        });
                                        toast.success('升级规则已保存！');
                                        setIsSettingsModalOpen(false);
                                    } catch (err: any) {
                                        console.error('保存设置失败:', err);
                                        const errorMsg = err.response?.data?.detail || err.message || '保存失败';
                                        toast.error(errorMsg);
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                className="px-6 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm"
                            >
                                保存设置
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
