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

export const TeacherList: React.FC<{ useApiData?: boolean }> = ({ useApiData = true }) => {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [view, setView] = useState<'list' | 'edit' | 'add' | 'detail'>('list');
    const [editForm, setEditForm] = useState<Teacher | null>(null);
    const [detailTeacher, setDetailTeacher] = useState<Teacher | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentSchoolId, setCurrentSchoolId] = useState<number | null>(null);
    const [schoolsList, setSchoolsList] = useState<{id: number, name: string}[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { confirm } = useConfirm();

    // 分页状态
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);

    const [filterSchool, setFilterSchool] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterPosition, setFilterPosition] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterName, setFilterName] = useState('');

    // API筛选数据状态
    const [apiGrades, setApiGrades] = useState<{id: number, name: string}[]>([]);
    const [apiClasses, setApiClasses] = useState<{id: number, name: string}[]>([]);
    const [apiPositions, setApiPositions] = useState<string[]>([]);
    const [apiSubjects, setApiSubjects] = useState<string[]>([]);

    // 编辑页面多选年级状态
    const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
    const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
    const gradeDropdownRef = useRef<HTMLDivElement>(null);
    
    // 任课班级编辑状态
    const [editGradeId, setEditGradeId] = useState<number | ''>('');
    const [editClassId, setEditClassId] = useState<number | ''>('');
    const [editSubject, setEditSubject] = useState('');
    const [editIsHead, setEditIsHead] = useState(false);
    const [editGradeClasses, setEditGradeClasses] = useState<{id: number, name: string}[]>([]);

    // 从API加载教师数据
    useEffect(() => {
        if (useApiData) {
            loadTeachersFromApi();
        }
    }, [useApiData]);

    // 计算分页
    useEffect(() => {
        setTotalPages(Math.ceil(teachers.length / pageSize));
        setCurrentPage(1);
    }, [teachers.length, pageSize]);

    // 点击外部关闭年级下拉框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (gradeDropdownRef.current && !gradeDropdownRef.current.contains(event.target as Node)) {
                setIsGradeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // 年级变化时加载班级列表
    useEffect(() => {
        const loadClassesForGrade = async () => {
            if (editGradeId && currentSchoolId) {
                try {
                    const response = await api.get<{id: number, name: string}[]>(`/api/schools/${currentSchoolId}/grades/${editGradeId}/classes`);
                    setEditGradeClasses(response || []);
                } catch (err) {
                    console.error('加载班级列表失败:', err);
                    setEditGradeClasses([]);
                }
            } else {
                setEditGradeClasses([]);
            }
            setEditClassId('');
        };
        loadClassesForGrade();
    }, [editGradeId, currentSchoolId]);

    const paginatedTeachers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return teachers.slice(start, start + pageSize);
    }, [teachers, currentPage, pageSize]);

    const loadTeachersFromApi = async (targetSchoolId?: number) => {
        try {
            setLoading(true);
            setError(null);
            
            // 检查登录状态
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setError('请先登录系统');
                setTeachers([]);
                return;
            }
            
            // 首先获取学校列表
            const schoolsResponse: any = await api.get('/api/schools/list');
            if (!schoolsResponse.schools || schoolsResponse.schools.length === 0) {
                setTeachers([]);
                return;
            }
            
            // 保存学校列表供表单使用
            setSchoolsList(schoolsResponse.schools.map((s: any) => ({ id: s.id, name: s.name })));
            
            // 使用指定的学校ID或第一个学校获取教师数据
            const targetSchool = targetSchoolId 
                ? schoolsResponse.schools.find((s: any) => s.id === targetSchoolId)
                : schoolsResponse.schools[0];
            
            if (!targetSchool) {
                setError('未找到指定的学校');
                return;
            }
            
            const schoolId = targetSchool.id;
            setCurrentSchoolId(schoolId);
            setFilterSchool(targetSchool.name);
            
            // 加载筛选选项数据
            await loadFilterOptions(schoolId);
            
            // 获取该学校的教师数据
            const teachersResponse: any = await api.get(`/api/schools/${schoolId}/teachers`);
            
            if (teachersResponse.teachers && Array.isArray(teachersResponse.teachers)) {
                const mappedTeachers: Teacher[] = teachersResponse.teachers.map((t: any) => ({
                    id: t.id?.toString() || '',
                    name: t.name,
                    gender: t.gender || '男',
                    school: t.school || targetSchool.name,
                    grades: t.grades || '',
                    positions: t.positions || '教师',
                    subject: t.subject || '',
                    phone: t.phone || '',
                    teaching_classes: t.teaching_classes || []
                }));
                setTeachers(mappedTeachers);
            }
        } catch (err: any) {
            console.error('加载教师数据失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '加载教师数据失败';
            setError(`加载失败: ${errorMsg}`);
            // 如果是401错误，提示登录
            if (err.response?.status === 401) {
                setError('登录已过期，请重新登录');
                localStorage.removeItem('auth_token');
            }
        } finally {
            setLoading(false);
        }
    };

    // 加载筛选选项数据
    const loadFilterOptions = async (schoolId: number) => {
        try {
            // 加载年级数据 - 后端直接返回数组格式
            const gradesResponse: any = await api.get(`/api/schools/${schoolId}/grades`);
            if (Array.isArray(gradesResponse)) {
                setApiGrades(gradesResponse.map((g: any) => ({
                    id: g.id,
                    name: g.name
                })));
            } else if (gradesResponse.grades) {
                setApiGrades(gradesResponse.grades);
            }

            // 加载岗位和学科数据
            const filterResponse: any = await api.get(`/api/schools/${schoolId}/filter-options`);
            if (filterResponse.positions) {
                setApiPositions(filterResponse.positions);
            }
            if (filterResponse.subjects) {
                setApiSubjects(filterResponse.subjects);
            }

            // 加载班级数据
            const classesResponse: any = await api.get(`/api/schools/${schoolId}/classes`, {
                params: { page_size: 100 }
            });
            if (classesResponse.classes) {
                setApiClasses(classesResponse.classes.map((c: any) => ({
                    id: c.id,
                    name: c.name
                })));
            }
        } catch (err: any) {
            console.error('加载筛选选项失败:', err);
        }
    };

    // 当选择年级时加载对应班级
    useEffect(() => {
        if (useApiData && currentSchoolId && filterGrade) {
            loadClassesByGrade(currentSchoolId, filterGrade);
        }
    }, [filterGrade, useApiData, currentSchoolId]);

    const loadClassesByGrade = async (schoolId: number, gradeName: string) => {
        try {
            const grade = apiGrades.find(g => g.name === gradeName);
            if (grade) {
                const classesResponse: any = await api.get(`/api/schools/${schoolId}/classes`, {
                    params: { grade_id: grade.id, page_size: 100 }
                });
                if (classesResponse.classes) {
                    setApiClasses(classesResponse.classes.map((c: any) => ({
                        id: c.id,
                        name: c.name
                    })));
                }
            }
        } catch (err: any) {
            console.error('加载班级数据失败:', err);
        }
    };

    const handleSearch = async () => {
        if (currentSchoolId) {
            // API模式：调用带筛选参数的API
            try {
                setLoading(true);
                const params: any = {};
                if (filterGrade) params.grade = filterGrade;
                if (filterPosition) params.position = filterPosition;
                if (filterSubject) params.subject = filterSubject;
                if (filterName) params.name = filterName;
                
                const teachersResponse: any = await api.get(`/api/schools/${currentSchoolId}/teachers`, { params });
                
                if (teachersResponse.teachers && Array.isArray(teachersResponse.teachers)) {
                    const mappedTeachers: Teacher[] = teachersResponse.teachers.map((t: any) => ({
                        id: t.id?.toString() || '',
                        name: t.name,
                        gender: t.gender || '男',
                        school: t.school || filterSchool,
                        grades: t.grades || '',
                        positions: t.positions || '教师',
                        subject: t.subject || '',
                        phone: t.phone || ''
                    }));
                    setTeachers(mappedTeachers);
                } else {
                    setTeachers([]);
                }
            } catch (err: any) {
                console.error('筛选教师数据失败:', err);
            toast.error(err.message || "操作失败");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleReset = () => {
        setFilterSchool('');
        setFilterGrade('');
        setFilterClass('');
        setFilterPosition('');
        setFilterSubject('');
        setFilterName('');
        if (currentSchoolId) {
            loadTeachersFromApi(currentSchoolId);
        }
    };

    const handleEditClick = async (teacher: Teacher) => {
        setEditForm({ ...teacher, teaching_classes: [] });
        // 将grades字符串转换为数组（支持逗号、换行符分隔）
        const gradesArray = teacher.grades
            ? teacher.grades.split(/[,，\n]/).map(g => g.trim()).filter(g => g)
            : [];
        setSelectedGrades(gradesArray);
        setView('edit');
        
        if (useApiData && teacher.id) {
            // 确保加载编辑页面所属学校的岗位和学科数据
            const schoolId = currentSchoolId || schoolsList.find(s => s.name === teacher.school)?.id;
            if (schoolId && (apiPositions.length === 0 || apiSubjects.length === 0)) {
                try {
                    const filterResponse: any = await api.get(`/api/schools/${schoolId}/filter-options`);
                    if (filterResponse.positions) setApiPositions(filterResponse.positions);
                    if (filterResponse.subjects) setApiSubjects(filterResponse.subjects);
                } catch (err) {
                    console.error('加载岗位和学科数据失败:', err);
                }
            }

            // 加载教师的任课班级数据
            try {
                const response = await api.get<Teacher & { teaching_classes: TeachingClass[] }>(`/api/schools/teachers/${teacher.id}`);
                if (response && response.teaching_classes) {
                    setEditForm(prev => prev ? { ...prev, teaching_classes: response.teaching_classes } : null);
                }
            } catch (err) {
                console.error('加载教师任课班级失败:', err);
            }
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm('确定要删除该教师信息吗？此操作不可撤销。', { type: 'danger', confirmText: '删除' }); 
        if (!confirmed) return;
        if (useApiData) {
            try {
                setLoading(true);
                await api.delete(`/api/schools/teachers/${id}`);
                // 重新加载教师列表
                await loadTeachersFromApi();
                toast.success('教师删除成功！');
            } catch (err: any) {
                console.error('删除教师失败:', err);
                toast.error(err.message || "操作失败");
            } finally {
                setLoading(false);
            }
        } else {
            setTeachers(teachers.filter(t => t.id !== id));
        }
    };

    const handleSave = async () => {
        if (editForm) {
            if (useApiData) {
                try {
                    setLoading(true);
                    // 准备API请求数据
                    const teacherData = {
                        name: editForm.name,
                        gender: editForm.gender === '男' ? 'M' : 'F',
                        phone: editForm.phone,
                        school_id: currentSchoolId,
                        grades: editForm.grades,
                        positions: editForm.positions,
                        subject: editForm.subject,
                        teaching_classes: editForm.teaching_classes
                    };
                    
                    // 调用更新API
                    await api.put(`/api/schools/teachers/${editForm.id}`, teacherData);
                    
                    // 重新加载教师列表
                    await loadTeachersFromApi();
                    
                    setView('list');
                    setEditForm(null);
                    setSelectedGrades([]);
                    toast.success('教师信息更新成功！');
                } catch (err: any) {
                    console.error('更新教师失败:', err);
            toast.error(err.message || "操作失败");
                } finally {
                    setLoading(false);
                }
            } else {
                setTeachers(teachers.map(t => t.id === editForm.id ? editForm : t));
                setView('list');
                setEditForm(null);
                setSelectedGrades([]);
            }
        }
    };

    const handleBack = () => {
        setView('list');
        setEditForm(null);
        setDetailTeacher(null);
        setSelectedGrades([]);
    };

    // 新增教师
    const handleAddClick = () => {
        setSelectedGrades([]);
        const newTeacher: Teacher = {
            id: '',
            name: '',
            gender: '男',
            school: filterSchool,
            grades: '',
            positions: '',
            subject: '',
            phone: ''
        };
        setEditForm(newTeacher);
        setView('add');
    };

    // 查看教师详情
    const handleViewClick = (teacher: Teacher) => {
        setDetailTeacher(teacher);
        setView('detail');
    };

    // 保存新增教师
    const handleAddSave = async () => {
        if (editForm) {
            if (!editForm.name.trim()) {
                toast.warning('请输入教师姓名');
                return;
            }
            if (!editForm.phone.trim()) {
                toast.warning('请输入联系电话');
                return;
            }

            if (useApiData) {
                try {
                    setLoading(true);
                    const teacherData = {
                        name: editForm.name,
                        gender: editForm.gender === '男' ? 'M' : 'F',
                        phone: editForm.phone,
                        school_id: currentSchoolId,
                        grades: editForm.grades,
                        positions: editForm.positions,
                        subject: editForm.subject
                    };
                    
                    await api.post('/api/schools/teachers', teacherData);
                    await loadTeachersFromApi();
                    
                    setView('list');
                    setEditForm(null);
                    setSelectedGrades([]);
                    toast.success('教师添加成功！');
                } catch (err: any) {
                    console.error('添加教师失败:', err);
            toast.error(err.message || "操作失败");
                } finally {
                    setLoading(false);
                }
            } else {
                const newTeacher = { ...editForm, id: Date.now().toString() };
                setTeachers([newTeacher, ...teachers]);
                setView('list');
                setEditForm(null);
                setSelectedGrades([]);
                toast.success('教师添加成功！');
            }
        }
    };

    // 导入教师
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (useApiData) {
            try {
                setLoading(true);
                const formData = new FormData();
                formData.append('file', file);
                
                await api.post('/api/schools/teachers/import', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                await loadTeachersFromApi();
                toast.success('教师导入成功！');
            } catch (err: any) {
                console.error('导入教师失败:', err);
            toast.error(err.message || "操作失败");
            } finally {
                setLoading(false);
                event.target.value = '';
            }
        } else {
            toast.success(`已成功选择文件: ${file.name}\n正在解析导入... (系统演示：导入成功)`);
            event.target.value = '';
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const baseUrl = API_BASE_URL;
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const response = await fetch(`${baseUrl}/api/schools/teachers/import-template`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) {
                throw new Error(`下载失败: ${response.status}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'teacher_import_template.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            console.error('下载模板失败:', err);
            toast.error(err.message || "操作失败");
        }
    };

    const handleExport = () => {
        const headers = ['序号', '姓名', '性别', '学校', '年级', '岗位', '学科', '联系方式'];
        const rows = teachers.map((t, index) => [
            index + 1,
            t.name,
            t.gender,
            t.school,
            t.grades.replace(/\n/g, ' '),
            t.positions,
            t.subject,
            t.phone
        ]);

        // 使用 XLSX 库生成 Excel 文件
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 6 },   // 序号
            { wch: 10 },  // 姓名
            { wch: 6 },   // 性别
            { wch: 20 },  // 学校
            { wch: 15 },  // 年级
            { wch: 15 },  // 岗位
            { wch: 10 },  // 学科
            { wch: 15 }   // 联系方式
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, '教师名单');
        XLSX.writeFile(wb, `教师名单_${getBeijingDate()}.xlsx`);
    };

    if ((view === 'edit' || view === 'add') && editForm) {
        const isEdit = view === 'edit';
        return (
            <div className="space-y-6">
                {/* 页面标题 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>教师管理</span>
                        <span className="text-slate-400">/</span>
                        <span className="font-bold text-slate-800">{isEdit ? '编辑教师' : '新增教师'}</span>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* 基础信息卡片 */}
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-center space-x-2 mb-5">
                            <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                            <h3 className="text-base font-semibold text-slate-800">基础信息</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">
                                    <span className="text-red-500">*</span> 姓名
                                </label>
                                <input 
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                    placeholder="请输入姓名"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">
                                    <span className="text-red-500">*</span> 性别
                                </label>
                                <div className="flex space-x-6 py-2.5">
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                        <input 
                                            type="radio" 
                                            name="gender" 
                                            value="男" 
                                            checked={editForm.gender === '男'} 
                                            onChange={() => setEditForm({...editForm, gender: '男'})}
                                            className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-700 group-hover:text-slate-900">男</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                        <input 
                                            type="radio" 
                                            name="gender" 
                                            value="女" 
                                            checked={editForm.gender === '女'} 
                                            onChange={() => setEditForm({...editForm, gender: '女'})}
                                            className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-700 group-hover:text-slate-900">女</span>
                                    </label>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">
                                    <span className="text-red-500">*</span> 联系电话
                                </label>
                                <input 
                                    type="text"
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                                    placeholder="请输入联系电话"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 教学信息卡片 */}
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-center space-x-2 mb-5">
                            <div className="w-1 h-5 bg-green-500 rounded-full"></div>
                            <h3 className="text-base font-semibold text-slate-800">教学信息</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">
                                    <span className="text-red-500">*</span> 所属学校
                                </label>
                                <select 
                                    value={editForm.school}
                                    onChange={(e) => setEditForm({...editForm, school: e.target.value})}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                >
                                    {useApiData && schoolsList.length > 0 ? (
                                        schoolsList.map(school => (
                                            <option key={school.id} value={school.name}>{school.name}</option>
                                        ))
                                    ) : (
                                        <option value="">请选择学校</option>
                                    )}
                                </select>
                            </div>

                            <div className="space-y-1.5" ref={gradeDropdownRef}>
                                <label className="block text-sm font-medium text-slate-700">年级</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsGradeDropdownOpen(!isGradeDropdownOpen)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-left focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none flex items-center justify-between transition-colors"
                                    >
                                        <span className={selectedGrades.length === 0 ? 'text-slate-400' : 'text-slate-900'}>
                                            {selectedGrades.length === 0 ? '请选择年级（可多选）' : `已选择 ${selectedGrades.length} 个年级`}
                                        </span>
                                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isGradeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    
                                    {isGradeDropdownOpen && (
                                        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto">
                                            {(useApiData && apiGrades.length > 0 ? apiGrades.map(g => ({ value: g.name, label: g.name })) : []).map((option) => (
                                                <label
                                                    key={option.value}
                                                    className="flex items-center px-3 py-2.5 hover:bg-blue-50 cursor-pointer transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedGrades.includes(option.value)}
                                                        onChange={(e) => {
                                                            let newGrades: string[];
                                                            if (e.target.checked) {
                                                                newGrades = [...selectedGrades, option.value];
                                                            } else {
                                                                newGrades = selectedGrades.filter(g => g !== option.value);
                                                            }
                                                            setSelectedGrades(newGrades);
                                                            setEditForm({...editForm, grades: newGrades.join(', ')});
                                                        }}
                                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                                    />
                                                    <span className="ml-3 text-sm text-slate-700">{option.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {selectedGrades.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedGrades.map(grade => (
                                            <span key={grade} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                {grade}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newGrades = selectedGrades.filter(g => g !== grade);
                                                        setSelectedGrades(newGrades);
                                                        setEditForm({...editForm, grades: newGrades.join(', ')});
                                                    }}
                                                    className="ml-1.5 text-blue-500 hover:text-blue-700"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">岗位</label>
                                <select 
                                    value={editForm.positions}
                                    onChange={(e) => setEditForm({...editForm, positions: e.target.value})}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                >
                                    <option value="">请选择岗位</option>
                                    {useApiData && apiPositions.length > 0 ? (
                                        apiPositions.map((position, index) => (
                                            <option key={index} value={position}>{position}</option>
                                        ))
                                    ) : (
                                        <option value="" disabled>暂无岗位数据</option>
                                    )}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">学科</label>
                                <select 
                                    value={editForm.subject}
                                    onChange={(e) => setEditForm({...editForm, subject: e.target.value})}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                >
                                    <option value="">请选择学科</option>
                                    {useApiData && apiSubjects.length > 0 ? (
                                        apiSubjects.map((subject, index) => (
                                            <option key={index} value={subject}>{subject}</option>
                                        ))
                                    ) : (
                                        <option value="" disabled>暂无学科数据</option>
                                    )}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    {/* 任课班级卡片 - 仅在编辑模式下显示 */}
                    {isEdit && (
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center space-x-2">
                                    <div className="w-1 h-5 bg-purple-500 rounded-full"></div>
                                    <h3 className="text-base font-semibold text-slate-800">任课班级</h3>
                                </div>
                                {editForm.teaching_classes && editForm.teaching_classes.length > 0 && (
                                    <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                                        共 {editForm.teaching_classes.length} 个班级
                                    </span>
                                )}
                            </div>
                            
                            {/* 当前任课班级列表 */}
                            <div className="space-y-3">
                                {editForm.teaching_classes && editForm.teaching_classes.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {editForm.teaching_classes.map((tc, idx) => (
                                            <div key={idx} className="group flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all">
                                                <div className="flex items-center space-x-2">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium">
                                                        {tc.class_name.replace(/[^0-9]/g, '') || tc.class_name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-800">{tc.grade_name}-{tc.class_name}</div>
                                                        <div className="flex items-center space-x-2 mt-0.5">
                                                            <span className="text-xs text-slate-500">{tc.subject}</span>
                                                            {tc.is_head_teacher && (
                                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">班主任</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newClasses = editForm.teaching_classes?.filter((_, i) => i !== idx);
                                                        setEditForm({...editForm, teaching_classes: newClasses});
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-sm transition-all p-1 hover:bg-red-50 rounded"
                                                    title="移除"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center py-8 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                        <span className="text-sm">暂无任课班级，请在下方添加</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* 添加任课班级 */}
                            <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200">
                                <div className="text-sm font-medium text-slate-700 mb-3">添加任课班级</div>
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="flex-1 min-w-[140px]">
                                        <label className="block text-xs text-slate-500 mb-1">年级</label>
                                        <select 
                                            value={editGradeId}
                                            onChange={(e) => setEditGradeId(e.target.value ? parseInt(e.target.value) : '')}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                        >
                                            <option value="">选择年级</option>
                                            {apiGrades.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1 min-w-[140px]">
                                        <label className="block text-xs text-slate-500 mb-1">班级</label>
                                        <select 
                                            value={editClassId}
                                            onChange={(e) => setEditClassId(e.target.value ? parseInt(e.target.value) : '')}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                                            disabled={!editGradeId}
                                        >
                                            <option value="">选择班级</option>
                                            {editGradeClasses.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <label className="block text-xs text-slate-500 mb-1">学科</label>
                                        <select 
                                            value={editSubject}
                                            onChange={(e) => setEditSubject(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                                        >
                                            <option value="">选择学科</option>
                                            {useApiData && apiSubjects.length > 0 ? (
                                                apiSubjects.map((subject, index) => (
                                                    <option key={index} value={subject}>{subject}</option>
                                                ))
                                            ) : (
                                                <option value="" disabled>暂无学科数据</option>
                                            )}
                                        </select>
                                    </div>
                                    <label className="flex items-center space-x-2 py-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={editIsHead}
                                            onChange={(e) => setEditIsHead(e.target.checked)}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                        />
                                        <span className="text-sm text-slate-600">班主任</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!editGradeId || !editClassId || !editSubject) {
                                                toast.warning('请选择年级、班级和学科');
                                                return;
                                            }
                                            
                                            const gradeName = apiGrades.find(g => g.id === editGradeId)?.name || '';
                                            const className = editGradeClasses.find(c => c.id === editClassId)?.name || '';
                                            
                                            if (editForm.teaching_classes?.some(tc => tc.class_id === editClassId)) {
                                                toast.info('该班级已添加');
                                                return;
                                            }
                                            
                                            const newClass: TeachingClass = {
                                                class_id: editClassId as number,
                                                class_name: className,
                                                grade_name: gradeName,
                                                subject: editSubject,
                                                is_head_teacher: editIsHead
                                            };
                                            
                                            setEditForm({
                                                ...editForm,
                                                teaching_classes: [...(editForm.teaching_classes || []), newClass]
                                            });
                                            
                                            setEditGradeId('');
                                            setEditClassId('');
                                            setEditSubject('');
                                            setEditIsHead(false);
                                        }}
                                        className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all flex items-center space-x-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <span>添加</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* 操作按钮 */}
                    <div className="p-6 bg-slate-50 flex justify-end space-x-3">
                        <button 
                            onClick={handleBack}
                            className="px-6 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 transition-all"
                        >
                            取消
                        </button>
                        <button 
                            onClick={view === 'edit' ? handleSave : handleAddSave}
                            disabled={loading}
                            className="px-6 py-2.5 rounded-lg bg-blue-500 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
                        >
                            {loading && (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            <span>{loading ? '保存中...' : '保存'}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 教师详情视图
    if (view === 'detail' && detailTeacher) {
        return (
            <div className="space-y-6">
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>教师管理</span>
                    <span>-&gt;</span>
                    <span className="font-bold text-slate-800">教师详情</span>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
                    {/* 基本信息 */}
                    <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">基本信息</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">姓名</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.name}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">性别</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.gender}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">联系电话</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.phone}</div>
                            </div>
                        </div>
                    </div>

                    {/* 教学信息 */}
                    <div>
                        <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">教学信息</h3>
                        <div className="grid grid-cols-1 gap-6">
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">所属学校</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.school}</div>
                            </div>
                            <div className="flex items-start space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">任教年级</label>
                                <div className="flex-1 text-sm text-slate-900 whitespace-pre-wrap">{detailTeacher.grades || '-'}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">岗位</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.positions || '-'}</div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="w-24 text-sm font-medium text-slate-600 text-right">学科</label>
                                <div className="flex-1 text-sm text-slate-900">{detailTeacher.subject || '-'}</div>
                            </div>
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
                        {hasPermission('teacher:edit') && (
                            <button 
                                onClick={() => {
                                    setEditForm({ ...detailTeacher });
                                    setView('edit');
                                }}
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

    return (
        <div className="space-y-4">
            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                    {error}
                </div>
            )}
             {/* Filter Bar - 自适应宽度布局 */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-end gap-4">
                    {/* 学校 - 最宽，因为学校名称可能很长 */}
                    <div className="flex items-center space-x-2" style={{ minWidth: '240px', flex: '2 1 240px' }}>
                        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">学校</label>
                        <select
                            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-700"
                            value={filterSchool}
                            onChange={(e) => {
                                const schoolName = e.target.value;
                                setFilterSchool(schoolName);
                                if (useApiData) {
                                    const selectedSchool = schoolsList.find(s => s.name === schoolName);
                                    if (selectedSchool) {
                                        loadTeachersFromApi(selectedSchool.id);
                                    }
                                }
                            }}
                        >
                            {useApiData && schoolsList.length > 0 ? (
                                schoolsList.map(school => (
                                    <option key={school.id} value={school.name}>{school.name}</option>
                                ))
                            ) : (
                                <option value="">请选择学校</option>
                            )}
                        </select>
                    </div>
                    
                    {/* 年级 - 窄一些，选项较短 */}
                    <div className="flex items-center space-x-2" style={{ minWidth: '120px', flex: '1 1 120px' }}>
                        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">年级</label>
                        <select
                            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-500"
                            value={filterGrade}
                            onChange={(e) => setFilterGrade(e.target.value)}
                        >
                            <option value="">{useApiData && apiGrades.length === 0 ? '暂无年级数据' : '请选择年级'}</option>
                            {useApiData && apiGrades.length > 0 ? (
                                apiGrades.map(grade => (
                                    <option key={grade.id} value={grade.name}>{grade.name}</option>
                                ))
                            ) : null}
                        </select>
                    </div>
                    
                    {/* 岗位 - 中等宽度 */}
                    <div className="flex items-center space-x-2" style={{ minWidth: '140px', flex: '1 1 140px' }}>
                        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">岗位</label>
                        <select
                            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-500"
                            value={filterPosition}
                            onChange={(e) => setFilterPosition(e.target.value)}
                        >
                            <option value="">{useApiData && apiPositions.length === 0 ? '暂无岗位数据' : '请选择岗位'}</option>
                            {useApiData && apiPositions.length > 0 ? (
                                apiPositions.map((position, index) => (
                                    <option key={index} value={position}>{position}</option>
                                ))
                            ) : null}
                        </select>
                    </div>
                    
                    {/* 学科 - 窄一些 */}
                    <div className="flex items-center space-x-2" style={{ minWidth: '120px', flex: '1 1 120px' }}>
                        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">学科</label>
                        <select
                            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none text-slate-500"
                            value={filterSubject}
                            onChange={(e) => setFilterSubject(e.target.value)}
                        >
                            <option value="">{useApiData && apiSubjects.length === 0 ? '暂无学科数据' : '请选择学科'}</option>
                            {useApiData && apiSubjects.length > 0 ? (
                                apiSubjects.map((subject, index) => (
                                    <option key={index} value={subject}>{subject}</option>
                                ))
                            ) : null}
                        </select>
                    </div>
                    
                    {/* 姓名 - 中等宽度输入框 */}
                    <div className="flex items-center space-x-2" style={{ minWidth: '140px', flex: '1 1 140px' }}>
                        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">姓名</label>
                        <input
                            type="text"
                            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none placeholder-slate-400"
                            placeholder="请输入姓名"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                    </div>
                    
                    {/* 按钮组 */}
                    <div className="flex items-center space-x-3" style={{ minWidth: '140px' }}>
                        <button
                            onClick={handleSearch}
                            className="rounded-md bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none"
                        >
                            查询
                        </button>
                        <button
                            onClick={handleReset}
                            className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                        >
                            重置
                        </button>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex space-x-3">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                />
                {hasPermission('teacher:edit') && (
                    <button
                        onClick={handleAddClick}
                        className="rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none flex items-center"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        新增教师
                    </button>
                )}
                {hasPermission('teacher:edit') && (
                    <button
                        onClick={handleImportClick}
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none flex items-center"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        导入名单
                    </button>
                )}
                <button
                    onClick={handleDownloadTemplate}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none flex items-center"
                >
                    <Download className="mr-2 h-4 w-4" />
                    下载模板
                </button>
                <button
                    onClick={handleExport}
                    className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none flex items-center"
                >
                    <Download className="mr-2 h-4 w-4" />
                    导出名单
                </button>
            </div>

             {/* Table */}
             <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">序号</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">姓名</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">性别</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">学校</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500 max-w-xs">年级</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">任课班级</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">岗位</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">学科</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">联系方式</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                     <tbody className="divide-y divide-slate-200 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                                    <div className="flex items-center justify-center space-x-2">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                                        <span>加载中...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : paginatedTeachers.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                                    暂无教师数据
                                </td>
                            </tr>
                        ) : (
                            paginatedTeachers.map((teacher, index) => (
                                <tr key={teacher.id} className="hover:bg-slate-50 text-center">
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{(currentPage - 1) * pageSize + index + 1}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">{teacher.name}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{teacher.gender}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{teacher.school}</td>
                                    <td className="whitespace-pre-wrap px-6 py-4 text-sm text-slate-600 max-w-xs">{teacher.grades}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                        {teacher.teaching_classes && teacher.teaching_classes.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 justify-center">
                                                {teacher.teaching_classes.map((tc, idx) => (
                                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                                        {tc.grade_name} {tc.class_name}
                                                        {tc.is_head_teacher && <span className="ml-1 text-orange-500">(班)</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400">-</span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{teacher.positions}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{teacher.subject}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{teacher.phone}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                                        <div className="flex justify-center space-x-3">
                                            <button 
                                                onClick={() => handleViewClick(teacher)}
                                                className="text-green-500 hover:text-green-700"
                                            >
                                                查看
                                            </button>
                                            {hasPermission('teacher:edit') && (
                                                <button 
                                                    onClick={() => handleEditClick(teacher)}
                                                    className="text-blue-500 hover:text-blue-700"
                                                >
                                                    编辑
                                                </button>
                                            )}
                                            {hasPermission('teacher:delete') && (
                                                <button 
                                                    onClick={() => handleDelete(teacher.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    删除
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                     </tbody>
                </table>
                {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
                    <span>共 {teachers.length} 条</span>
                    <select
                        className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                        <option value={10}>10条/页</option>
                        <option value={20}>20条/页</option>
                        <option value={50}>50条/页</option>
                        <option value={100}>100条/页</option>
                    </select>
                    <button
                        className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                    >
                        {'<<'}
                    </button>
                    <button
                        className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                    >
                        {'<'}
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
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
                                onClick={() => setCurrentPage(pageNum)}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                    <button
                        className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                    >
                        {'>'}
                    </button>
                    <button
                        className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages || totalPages === 0}
                    >
                        {'>>'}
                    </button>
                    <span>前往</span>
                    <input
                        type="number"
                        min={1}
                        max={totalPages || 1}
                        value={currentPage}
                        onChange={(e) => {
                            const page = Math.max(1, Math.min(totalPages, Number(e.target.value)));
                            setCurrentPage(page);
                        }}
                        className="w-12 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span>页</span>
                </div>
             </div>
        </div>
    );
};
