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

export const StudentList: React.FC<{ useApiData?: boolean }> = ({ useApiData = true }) => {
  const [view, setView] = useState<'list' | 'edit' | 'detail' | 'add'>('list');
  const [students, setStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]); // 保存筛选后的数据（用于分页显示）
  const [originalStudents, setOriginalStudents] = useState<Student[]>([]); // 保存原始完整数据（用于筛选）
  const [editForm, setEditForm] = useState<Student | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 学校列表状态
  const [schools, setSchools] = useState<Array<{id: number, name: string}>>([]);
  
  // 导入相关状态
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{
    name: string, 
    gender: string, 
    student_no?: string,
    school?: string,
    grade?: string,
    className?: string,
    dorm_building?: string,
    dorm_floor?: number,
    dorm_room?: string,
    bed_no?: number
  }>>([]);
  const [importTargetSchool, setImportTargetSchool] = useState('');
  const [importTargetGrade, setImportTargetGrade] = useState('');
  const [importTargetClass, setImportTargetClass] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importGradeOptions, setImportGradeOptions] = useState<string[]>([]);
  const [importClassOptions, setImportClassOptions] = useState<{id: number, name: string}[]>([]);
  // 缓存已加载的年级数据（schoolId -> [{id, name}]），供编辑页和导入弹窗共用
  const [editGradesCache, setEditGradesCache] = useState<Record<number, {id: number, name: string}[]>>({});

  // 导入弹窗：学校变化时加载年级
  useEffect(() => {
    if (importTargetSchool && schools.length > 0) {
      const selectedSchool = schools.find(s => s.name === importTargetSchool);
      if (selectedSchool) {
        // 复用 editGradesCache
        const cached = editGradesCache[selectedSchool.id];
        if (cached) {
          setImportGradeOptions(cached.map(g => g.name).sort((a, b) => getGradeSortWeight(a) - getGradeSortWeight(b)));
        } else {
          api.get(`/api/schools/${selectedSchool.id}/grades`).then((resp: any) => {
            const grades = resp?.grades || resp || [];
            const mapped = (Array.isArray(grades) ? grades : []).map((g: any) => ({ id: g.id, name: g.name }));
            setEditGradesCache(prev => ({ ...prev, [selectedSchool.id]: mapped }));
            setImportGradeOptions(mapped.map(g => g.name).sort((a, b) => getGradeSortWeight(a) - getGradeSortWeight(b)));
          }).catch(() => setImportGradeOptions([]));
        }
      }
    } else {
      setImportGradeOptions([]);
    }
    setImportTargetGrade('');
    setImportClassOptions([]);
    setImportTargetClass('');
  }, [importTargetSchool, schools, editGradesCache]);

  // 导入弹窗：年级变化时加载班级
  useEffect(() => {
    if (importTargetSchool && importTargetGrade && schools.length > 0) {
      const selectedSchool = schools.find(s => s.name === importTargetSchool);
      if (selectedSchool) {
        const cachedGrades = editGradesCache[selectedSchool.id] || [];
        const selectedGrade = cachedGrades.find(g => g.name === importTargetGrade);
        if (selectedGrade) {
          api.get(`/api/schools/${selectedSchool.id}/grades/${selectedGrade.id}/classes`).then((resp: any) => {
            const classes = resp?.classes || resp || [];
            setImportClassOptions((Array.isArray(classes) ? classes : []).map((c: any) => ({ id: c.id, name: c.name })));
          }).catch(() => setImportClassOptions([]));
        }
      }
    } else {
      setImportClassOptions([]);
    }
    setImportTargetClass('');
  }, [importTargetGrade, importTargetSchool, schools, editGradesCache]);

  // Filter States
  const [filterSchool, setFilterSchool] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterName, setFilterName] = useState('');

  // 动态获取年级和班级选项
  const [gradeOptions, setGradeOptions] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalStudents, setTotalStudents] = useState(0);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [totalPages, setTotalPages] = useState(1);

  // 年级排序权重映射（初一 -> 高三）
  const getGradeSortWeight = (gradeName: string): number => {
    const weightMap: Record<string, number> = {
      '初一': 1,
      '初二': 2,
      '初三': 3,
      '高一': 4,
      '高二': 5,
      '高三': 6,
    };
    return weightMap[gradeName] || 999;
  };

  // 根据学校加载年级列表（三级联动）
  const loadGradesBySchool = async (schoolName: string) => {
    if (!schoolName || !useApiData) {
      setGradeOptions([]);
      return;
    }
    
    const selectedSchool = schools.find(s => s.name === schoolName);
    if (!selectedSchool) {
      setGradeOptions([]);
      return;
    }

    try {
      // 从API获取年级列表
      const response: any = await api.get(`/api/schools/${selectedSchool.id}/grades`);
      if (response && Array.isArray(response.grades)) {
        const gradeNames = response.grades
          .map((g: any) => g.name)
          .sort((a: string, b: string) => getGradeSortWeight(a) - getGradeSortWeight(b));
        setGradeOptions(gradeNames);
      } else {
        // 如果API没有返回年级数据，从已加载的学生数据中筛选
        const grades = (Array.from(
          new Set(
            originalStudents
              .filter(s => s.school === schoolName)
              .map(s => s.grade)
              .filter(Boolean)
          )
        ) as string[]).sort((a, b) => getGradeSortWeight(a) - getGradeSortWeight(b));
        setGradeOptions(grades);
      }
    } catch (err) {
      console.error('加载年级列表失败:', err);
      // 从已加载的学生数据中筛选作为备选
      const grades = (Array.from(
        new Set(
          originalStudents
            .filter(s => s.school === schoolName)
            .map(s => s.grade)
            .filter(Boolean)
        )
      ) as string[]).sort((a, b) => getGradeSortWeight(a) - getGradeSortWeight(b));
      setGradeOptions(grades);
    }
  };

  // 根据学校和年级加载班级列表（三级联动）
  const loadClassesBySchoolAndGrade = async (schoolName: string, gradeName: string) => {
    if (!schoolName || !gradeName || !useApiData) {
      setClassOptions([]);
      return;
    }

    const selectedSchool = schools.find(s => s.name === schoolName);
    if (!selectedSchool) {
      setClassOptions([]);
      return;
    }

    try {
      // 先获取年级ID
      const gradesResponse: any = await api.get(`/api/schools/${selectedSchool.id}/grades`);
      const grades = gradesResponse?.grades || [];
      const selectedGrade = grades.find((g: any) => g.name === gradeName);
      
      if (selectedGrade) {
        // 使用年级ID获取班级列表
        const classesResponse: any = await api.get(`/api/schools/${selectedSchool.id}/grades/${selectedGrade.id}/classes`);
        if (classesResponse && Array.isArray(classesResponse)) {
          const classNames = classesResponse.map((c: any) => c.name).sort();
          setClassOptions(classNames);
          return;
        }
      }
      
      // 如果API没有返回班级数据，从已加载的学生数据中筛选
      const classes = Array.from(
        new Set(
          originalStudents
            .filter(s => s.school === schoolName && s.grade === gradeName)
            .map(s => s.class)
            .filter(Boolean)
        )
      ).sort();
      setClassOptions(classes);
    } catch (err) {
      console.error('加载班级列表失败:', err);
      // 从已加载的学生数据中筛选作为备选
      const classes = Array.from(
        new Set(
          originalStudents
            .filter(s => s.school === schoolName && s.grade === gradeName)
            .map(s => s.class)
            .filter(Boolean)
        )
      ).sort();
      setClassOptions(classes);
    }
  };

  // 学校变化时：加载对应年级，重置年级和班级选择
  useEffect(() => {
    if (useApiData && filterSchool) {
      loadGradesBySchool(filterSchool);
    } else {
      setGradeOptions([]);
    }
    // 当学校变化时，重置年级和班级选择
    if (filterGrade !== '' || filterClass !== '') {
      setFilterGrade('');
      setFilterClass('');
    }
  }, [filterSchool, useApiData, schools]);

  // 年级变化时：加载对应班级，重置班级选择
  useEffect(() => {
    if (useApiData && filterSchool && filterGrade) {
      loadClassesBySchoolAndGrade(filterSchool, filterGrade);
    } else {
      setClassOptions([]);
    }
    // 当年级变化时，重置班级选择
    if (filterClass !== '') {
      setFilterClass('');
    }
  }, [filterGrade, filterSchool, useApiData]);

  // 编辑页面年级/班级选项（与列表筛选器使用相同API，确保数据一致）
  const [newStudentGradeOptions, setNewStudentGradeOptions] = useState<string[]>([]);
  const [newStudentClassOptions, setNewStudentClassOptions] = useState<string[]>([]);

  // 当选择的学校变化时，从 /grades API 加载年级选项（与列表筛选器一致）
  useEffect(() => {
    if (editForm && editForm.school && schools.length > 0) {
      const selectedSchool = schools.find(s => s.name === editForm.school);
      if (selectedSchool) {
        loadEditGrades(selectedSchool.id);
      } else {
        setNewStudentGradeOptions([]);
      }
    } else {
      setNewStudentGradeOptions([]);
    }
  }, [editForm?.school, schools]);

  const loadEditGrades = async (schoolId: number) => {
    try {
      const response: any = await api.get(`/api/schools/${schoolId}/grades`);
      let gradeList: {id: number, name: string}[] = [];
      if (response && Array.isArray(response.grades)) {
        gradeList = response.grades.map((g: any) => ({ id: g.id, name: g.name }));
      } else if (Array.isArray(response)) {
        gradeList = response.map((g: any) => ({ id: g.id, name: g.name }));
      }
      setEditGradesCache(prev => ({ ...prev, [schoolId]: gradeList }));
      const gradeNames = gradeList.map(g => g.name).sort((a, b) => getGradeSortWeight(a) - getGradeSortWeight(b));
      setNewStudentGradeOptions(gradeNames);
      console.log('编辑页年级选项（API加载）:', gradeNames, 'schoolId:', schoolId);
    } catch (err) {
      console.error('编辑页加载年级失败:', err);
      setNewStudentGradeOptions([]);
    }
  };

  // 当选择的年级变化时，从 /grades/{id}/classes API 加载班级选项（与列表筛选器一致）
  useEffect(() => {
    if (editForm && editForm.grade && editForm.school && schools.length > 0) {
      const selectedSchool = schools.find(s => s.name === editForm.school);
      if (selectedSchool) {
        const cachedGrades = editGradesCache[selectedSchool.id] || [];
        const selectedGrade = cachedGrades.find(g => g.name === editForm.grade);
        if (selectedGrade) {
          loadEditClasses(selectedSchool.id, selectedGrade.id);
        } else {
          // 缓存未命中，重新加载年级列表
          loadEditGrades(selectedSchool.id).then(() => {
            const grades = editGradesCache[selectedSchool.id] || [];
            const grade = grades.find(g => g.name === editForm.grade);
            if (grade) loadEditClasses(selectedSchool.id, grade.id);
          });
        }
      }
    } else {
      setNewStudentClassOptions([]);
    }
  }, [editForm?.grade, editForm?.school, editGradesCache, schools]);

  const loadEditClasses = async (schoolId: number, gradeId: number) => {
    try {
      const response: any = await api.get(`/api/schools/${schoolId}/grades/${gradeId}/classes`);
      const classList = response.classes || response || [];
      const classNames = (Array.isArray(classList) ? classList : []).map((c: any) => c.name).sort();
      setNewStudentClassOptions(classNames);
      console.log('编辑页班级选项（API加载）:', classNames, 'schoolId:', schoolId, 'gradeId:', gradeId);
    } catch (err) {
      console.error('编辑页加载班级失败:', err);
      setNewStudentClassOptions([]);
    }
  };

  // 从API加载学生数据
  useEffect(() => {
    if (useApiData) {
      loadStudentsFromApi();
    }
  }, [useApiData]);

  // 监听筛选条件变化，自动更新显示
  useEffect(() => {
    if (useApiData && originalStudents.length > 0) {
      applyFilters();
    }
  }, [filterSchool, filterGrade, filterClass, filterName, pageSize, useApiData]);

  const loadStudentsFromApi = async () => {
    try {
      setLoading(true);
      setError(null);

      // 检查登录状态
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('请先登录系统');
        setStudents([]);
        return;
      }

      // 首先获取学校列表
      const schoolsResponse: any = await api.get('/api/schools/list');
      if (!schoolsResponse.schools || schoolsResponse.schools.length === 0) {
        setStudents([]);
        setSchools([]);
        return;
      }

      // 保存学校列表到状态
      const allSchools = schoolsResponse.schools.map((s: any) => ({ id: s.id, name: s.name }));
      setSchools(allSchools);

      // 加载所有学校的学生数据
      let allStudentsData: any[] = [];
      const apiPageSize = 100;  // API每次请求的最大条数

      for (const school of allSchools) {
        let currentPage = 1;
        let hasMore = true;

        while (hasMore) {
          try {
            const studentsResponse: any = await api.get(`/api/schools/${school.id}/students`, {
              params: {
                page: currentPage,
                page_size: apiPageSize
              }
            });

            const students = studentsResponse.students || [];
            // 为每个学生添加学校信息
            const studentsWithSchool = students.map((s: any) => ({
              ...s,
              school: s.school || school.name,
              schoolId: school.id
            }));
            allStudentsData = [...allStudentsData, ...studentsWithSchool];

            // 检查是否还有更多数据
            if (students.length < apiPageSize) {
              hasMore = false;
            } else {
              currentPage++;
            }
          } catch (err) {
            console.error(`加载学校 ${school.name} 的学生数据失败:`, err);
            hasMore = false;
          }
        }
      }

      // 转换后端数据格式为前端格式
      const formattedStudents = allStudentsData.map((s: any) => ({
        id: s.studentId || s.id,  // 数据库主键ID（用于删除等操作）
        studentNo: s.id,  // 学号（用于显示）
        name: s.name,
        gender: s.gender,
        school: s.school || '',
        grade: s.grade || '',
        class: s.class || '',
        building: s.building || '',
        floor: s.floor || 0,
        dorm: s.dorm || '',
        bedNo: s.bedNo || 0,
        createTime: s.createTime || getBeijingDate(),
        score: s.score || 100
      }));

      // 更新状态（所有数据）
      setAllStudents(formattedStudents);
      setOriginalStudents(formattedStudents); // 保存原始完整数据
      setTotalStudents(formattedStudents.length);
      setTotalPages(Math.ceil(formattedStudents.length / pageSize));

      // 设置当前页显示的数据（第一页）
      const paginatedData = formattedStudents.slice(0, pageSize);
      setStudents(paginatedData);
    } catch (err: any) {
      console.error('加载学生数据失败:', err);
      const errorMsg = err.response?.data?.detail || err.message || '加载学生数据失败';
      setError(`加载失败: ${errorMsg}`);
      if (err.response?.status === 401) {
        setError('登录已过期，请重新登录');
        localStorage.removeItem('auth_token');
      }
    } finally {
      setLoading(false);
    }
  };

  // 应用筛选条件（基于原始数据）
  const applyFilters = () => {
    const filtered = originalStudents.filter(s => {
      const matchSchool = !filterSchool || filterSchool === '请选择学校' || s.school === filterSchool;
      const matchGrade = !filterGrade || filterGrade === '请选择年级' || s.grade === filterGrade;
      const matchClass = !filterClass || filterClass === '请选择班级' || s.class === filterClass;
      const matchName = !filterName || s.name.includes(filterName);
      return matchSchool && matchGrade && matchClass && matchName;
    });

    setAllStudents(filtered);
    setTotalStudents(filtered.length);
    setTotalPages(Math.ceil(filtered.length / pageSize));
    setCurrentPage(1);

    // 设置当前页显示的数据
    const paginatedData = filtered.slice(0, pageSize);
    setStudents(paginatedData);
  };

  // 处理翻页
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && !loading) {
      const startIndex = (newPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = allStudents.slice(startIndex, endIndex);
      setStudents(paginatedData);
      setCurrentPage(newPage);
    }
  };

  // 处理每页条数变化
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setTotalPages(Math.ceil(allStudents.length / newSize));
    setCurrentPage(1);
    // 显示第一页
    const paginatedData = allStudents.slice(0, newSize);
    setStudents(paginatedData);
  };

  const handleEditClick = (student: Student) => {
    setEditForm({ ...student });
    setView('edit');
  };

  // 查看学生详情
  const handleViewClick = (student: Student) => {
    setDetailStudent(student);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setEditForm(null);
    setDetailStudent(null);
  };

  // 新增学生
  const handleAddClick = () => {
    const newStudent: Student = {
      id: '',
      name: '',
      gender: '',
      school: '',
      grade: '',
      class: '',
      building: '',
      floor: 0,
      dorm: '',
      bedNo: 0,
      createTime: getBeijingDate(),
      score: 100
    };
    setEditForm(newStudent);
    setView('add');
  };

  const handleDelete = async (id: string) => {
      const confirmed = await confirm('确定要删除该学生信息吗？此操作不可撤销。', { type: 'danger', confirmText: '删除' }); 
      if (!confirmed) return;
      if (useApiData) {
          try {
              setLoading(true);
              await api.delete(`/api/students/${id}`);
              // 重新加载学生列表
              await loadStudentsFromApi();
              toast.success('学生删除成功！');
          } catch (err: any) {
              console.error('删除学生失败:', err);
              toast.error(err.message || "操作失败");
          } finally {
              setLoading(false);
          }
      } else {
          // Mock模式：从当前页、筛选结果和原始数据中同时删除，保持数据一致性
          setStudents(students.filter(s => s.id !== id));
          setAllStudents(allStudents.filter(s => s.id !== id));
          setOriginalStudents(originalStudents.filter(s => s.id !== id));
      }
  };

  const handleSave = async () => {
    if (!editForm) return;
    
        try {
            setLoading(true);
            if (useApiData) {
                // 调用API保存学生信息
                const studentData: any = {
                  name: editForm.name,
                  gender: editForm.gender === '男' ? 'M' : editForm.gender === '女' ? 'F' : 'M',
                };
                
                // 如果年级和班级有值，查找对应的class_id发送给后端
                if (editForm.grade && editForm.class) {
                  const selectedSchool = schools.find(s => s.name === editForm.school);
                  if (selectedSchool) {
                    const cachedGrades = editGradesCache[selectedSchool.id] || [];
                    const selectedGrade = cachedGrades.find(g => g.name === editForm.grade);
                    if (selectedGrade) {
                      const classResponse: any = await api.get(`/api/schools/${selectedSchool.id}/grades/${selectedGrade.id}/classes`);
                      const classList = classResponse.classes || classResponse || [];
                      const matchedClass = (Array.isArray(classList) ? classList : []).find((c: any) => c.name === editForm.class);
                      if (matchedClass) {
                        studentData.class_id = matchedClass.id;
                      }
                    }
                  }
                }
                
                // 宿舍相关字段：始终发送当前值（包括清空的情况）
                studentData.dorm_building = editForm.building || '';
                studentData.dorm_floor = editForm.floor || null;
                studentData.dorm_room = editForm.dorm || '';
                studentData.bed_no = editForm.bedNo || null;
                
                await api.put(`/api/students/${editForm.id}`, studentData);
                toast.success('学生信息保存成功！');
                // 重新加载学生列表
                await loadStudentsFromApi();
            } else {
                // Mock模式：直接更新本地状态
                setStudents(students.map(s => s.id === editForm.id ? editForm : s));
                toast.success('学生信息保存成功！');
            }
            
            setView('list');
            setEditForm(null);
        } catch (err: any) {
            console.error('保存学生信息失败:', err);
            const errorMsg = err.response?.data?.detail || err.message || '保存失败';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

  // 保存新增学生
  const handleAddSave = async () => {
    if (editForm) {
      if (!editForm.name.trim()) {
        toast.warning('请输入学生姓名');
        return;
      }
      if (!editForm.id.trim()) {
        toast.warning('请输入学号');
        return;
      }
      if (!editForm.gender) {
        toast.warning('请选择性别');
        return;
      }
      if (!editForm.school) {
        toast.warning('请选择学校');
        return;
      }

      if (useApiData) {
        try {
          setLoading(true);

          // 根据选择的年级和班级名称找到对应的班级ID（通过API查询）
          let classId: number | null = null;
          if (editForm.grade && editForm.class) {
            const selectedSchool = schools.find(s => s.name === editForm.school);
            if (selectedSchool) {
              const cachedGrades = editGradesCache[selectedSchool.id] || [];
              const selectedGrade = cachedGrades.find(g => g.name === editForm.grade);
              if (selectedGrade) {
                const classResponse: any = await api.get(`/api/schools/${selectedSchool.id}/grades/${selectedGrade.id}/classes`);
                const classList = classResponse.classes || classResponse || [];
                const matchedClass = (Array.isArray(classList) ? classList : []).find((c: any) => c.name === editForm.class);
                if (matchedClass) classId = matchedClass.id;
              }
            }
          }

          const studentData = {
            id: editForm.id,
            name: editForm.name,
            gender: editForm.gender === '男' ? 'M' : 'F',
            school_id: schools.find(s => s.name === editForm.school)?.id || null,
            class_id: classId,
            dorm_building: editForm.building || null,
            dorm_floor: editForm.floor || null,
            dorm_room: editForm.dorm || null,
            bed_no: editForm.bedNo || null
          };

          console.log('保存学生数据:', studentData);

          await api.post('/api/students', studentData);
          await loadStudentsFromApi();

          setView('list');
          setEditForm(null);
          toast.success('学生添加成功！');
        } catch (err: any) {
          console.error('添加学生失败:', err);
            toast.error(err.message || "操作失败");
        } finally {
          setLoading(false);
        }
      } else {
        const newStudent = { ...editForm };
        setStudents([newStudent, ...students]);
        setAllStudents([newStudent, ...allStudents]);
        setOriginalStudents([newStudent, ...originalStudents]);
        setTotalStudents(totalStudents + 1);
        setView('list');
        setEditForm(null);
        toast.success('学生添加成功！');
      }
    }
  };

  const handleSearch = () => {
      // 使用原始数据（originalStudents）进行前端筛选
      applyFilters();
  };

  const handleReset = () => {
      setFilterSchool('');
      setFilterGrade('');
      setFilterClass('');
      setFilterName('');

      // 从原始API数据中重新筛选（但此时无筛选条件）
      // 需要重新加载全部数据
      loadStudentsFromApi();
  };

  const handleImportClick = () => {
      // 打开导入弹窗
      setIsImportModalOpen(true);
      // 重置导入状态
      setImportPreview([]);
      setImportTargetSchool('');
      setImportTargetGrade('');
      setImportTargetClass('');
  };

  const handleDownloadTemplate = async () => {
      try {
          const baseUrl = API_BASE_URL;
          const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
          const response = await fetch(`${baseUrl}/api/schools/students/import-template`, {
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
          a.download = 'student_import_template.xlsx';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
      } catch (err: any) {
          console.error('下载模板失败:', err);
            toast.error(err.message || "操作失败");
      }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      try {
          const XLSX = await import('xlsx');
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (jsonData.length < 2) {
              toast.error('文件内容为空或格式错误');
              event.target.value = '';
              return;
          }
          
          // 解析表头
          const headerRow = jsonData[0] as string[];
          const nameIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('姓名') || cell.toLowerCase().includes('name'))
          );
          const genderIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('性别') || cell.toLowerCase().includes('gender'))
          );
          const studentNoIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('学号') || cell.toLowerCase().includes('student_no'))
          );
          const schoolIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('学校') || cell.toLowerCase().includes('school'))
          );
          const gradeIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('年级') || cell.toLowerCase().includes('grade'))
          );
          const classIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('班级') || cell.toLowerCase().includes('class'))
          );
          const buildingIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('楼栋') || cell.toLowerCase().includes('building'))
          );
          const floorIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('楼层') || cell.toLowerCase().includes('floor'))
          );
          const roomIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('宿舍号') || cell.toLowerCase().includes('room'))
          );
          const bedIdx = headerRow.findIndex(cell => 
              cell && (cell.includes('床位号') || cell.toLowerCase().includes('bed'))
          );
          
          if (nameIdx === -1) {
              toast.warning('未找到"姓名"列，请检查文件格式');
              event.target.value = '';
              return;
          }
          
          // 解析学生数据
          const parsedStudents: Array<{
              name: string, 
              gender: string, 
              student_no?: string,
              school?: string,
              grade?: string,
              className?: string,
              dorm_building?: string,
              dorm_floor?: number,
              dorm_room?: string,
              bed_no?: number
          }> = [];
          for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i] as any[];
              const name = row[nameIdx]?.toString().trim();
              if (name) {
                  let gender = '';
                  if (genderIdx >= 0 && row[genderIdx]) {
                      const g = row[genderIdx].toString().trim();
                      if (g === '男' || g.toLowerCase() === 'm') gender = '男';
                      else if (g === '女' || g.toLowerCase() === 'f') gender = '女';
                  }
                  
                  const student_no = studentNoIdx >= 0 ? row[studentNoIdx]?.toString().trim() : undefined;
                  const school = schoolIdx >= 0 ? row[schoolIdx]?.toString().trim() : undefined;
                  const grade = gradeIdx >= 0 ? row[gradeIdx]?.toString().trim() : undefined;
                  const className = classIdx >= 0 ? row[classIdx]?.toString().trim() : undefined;
                  const dorm_building = buildingIdx >= 0 ? row[buildingIdx]?.toString().trim() : undefined;
                  const dorm_floor = floorIdx >= 0 ? parseInt(row[floorIdx]) || undefined : undefined;
                  const dorm_room = roomIdx >= 0 ? row[roomIdx]?.toString().trim() : undefined;
                  const bed_no = bedIdx >= 0 ? parseInt(row[bedIdx]) || undefined : undefined;
                  
                  parsedStudents.push({ 
                      name, 
                      gender, 
                      student_no,
                      school,
                      grade,
                      className,
                      dorm_building,
                      dorm_floor,
                      dorm_room,
                      bed_no
                  });
              }
          }
          
          if (parsedStudents.length === 0) {
              toast.info('未找到有效的学生数据');
              event.target.value = '';
              return;
          }
          
          setImportPreview(parsedStudents);
          
      } catch (err) {
          console.error('解析文件失败:', err);
            toast.error(err.message || "操作失败");
      }
      
      event.target.value = '';
  };
  
  // 确认导入学生
  const handleConfirmImport = async () => {
      if (importPreview.length === 0) {
          toast.info('没有可导入的学生数据');
          return;
      }
      
      // 按班级分组学生
      const groupedByClass: Record<string, typeof importPreview> = {};
      
      for (const student of importPreview) {
          // 优先使用Excel中的班级信息，否则使用弹窗中选择的目标班级
          const schoolName = student.school || importTargetSchool;
          const gradeName = student.grade || importTargetGrade;
          const className = student.className || importTargetClass;
          
          if (!schoolName || !gradeName || !className) {
              toast.info(`学生 ${student.name} 缺少学校、年级或班级信息，且未在弹窗中选择目标班级`);
              return;
          }
          
          const key = `${gradeName}-${className}`;
          if (!groupedByClass[key]) {
              groupedByClass[key] = [];
          }
          groupedByClass[key].push(student);
      }
      
      setIsImporting(true);
      let totalSuccess = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const allErrors: any[] = [];
      
      try {
          // 逐个班级导入
          for (const [key, students] of Object.entries(groupedByClass)) {
              const [gradeName, className] = key.split('-');
              
              // 通过API查找班级ID
              let targetClassId: number | null = null;
              const importSchool = schools.find(s => s.name === importTargetSchool);
              if (importSchool) {
                const cachedGrades = editGradesCache[importSchool.id] || [];
                const importGrade = cachedGrades.find((g: any) => g.name === gradeName);
                if (importGrade) {
                  const classResponse: any = await api.get(`/api/schools/${importSchool.id}/grades/${importGrade.id}/classes`);
                  const classList = classResponse.classes || classResponse || [];
                  const matchedClass = (Array.isArray(classList) ? classList : []).find((c: any) => c.name === className);
                  if (matchedClass) targetClassId = matchedClass.id;
                }
              }
              
              if (!targetClassId) {
                  allErrors.push({ class: key, message: '未找到目标班级' });
                  totalFailed += students.length;
                  continue;
              }
              
              const response: any = await api.post('/api/schools/students/import', {
                  class_id: targetClassId,
                  students: students.map(s => ({
                      name: s.name,
                      gender: s.gender === '男' ? 'M' : s.gender === '女' ? 'F' : null,
                      student_no: s.student_no || null,
                      dorm_building: s.dorm_building || null,
                      dorm_floor: s.dorm_floor || null,
                      dorm_room: s.dorm_room || null,
                      bed_no: s.bed_no || null
                  }))
              });
              
              totalSuccess += response.success || 0;
              totalSkipped += response.skipped || 0;
              totalFailed += response.failed || 0;
              if (response.errors) {
                  allErrors.push(...response.errors);
              }
          }
          
          // 刷新学生列表
          await loadStudentsFromApi();
          
          // 关闭弹窗
          setIsImportModalOpen(false);
          setImportPreview([]);
          setImportTargetSchool('');
          setImportTargetGrade('');
          setImportTargetClass('');
          
          let message = `导入完成！成功 ${totalSuccess} 名学生`;
          if (totalSkipped > 0) {
              message += `，跳过 ${totalSkipped} 名已存在学生`;
          }
          if (totalFailed > 0) {
              message += `，失败 ${totalFailed} 名`;
          }
          toast.info(message);
      } catch (err: any) {
          console.error('导入失败:', err);
            toast.error(err.message || "操作失败");
      } finally {
          setIsImporting(false);
      }
  };

  const handleExport = async () => {
      // 导出所有数据（从API获取）
      try {
        setLoading(true);
        const token = localStorage.getItem('auth_token');
        if (!token) {
          toast.warning('请先登录系统');
          return;
        }

        // 获取学校列表
        const schoolsResponse: any = await api.get('/api/schools/list');
        if (schoolsResponse.schools && schoolsResponse.schools.length > 0) {
          const firstSchool = schoolsResponse.schools[0];
          const schoolId = firstSchool.id;

          // 分批获取所有学生数据（由于后端限制page_size最大为100）
          let allStudentsData: any[] = [];
          let currentPage = 1;
          const apiPageSize = 100;  // API每次请求的最大条数
          let hasMore = true;

          while (hasMore) {
            const studentsResponse: any = await api.get(`/api/schools/${schoolId}/students`, {
              params: {
                page: currentPage,
                page_size: apiPageSize
              }
            });

            const students = studentsResponse.students || [];
            allStudentsData = [...allStudentsData, ...students];

            // 检查是否还有更多数据
            if (students.length < apiPageSize) {
              hasMore = false;
            } else {
              currentPage++;
            }
          }

          const headers = ['姓名', '性别', '学号', '学校', '年级', '班级', '楼栋', '楼层', '宿舍号', '床位号', '创建时间'];
          const rows = allStudentsData.map((s: any) => [
            s.name,
            s.gender,
            s.id,
            s.school || firstSchool.name,
            s.grade || '',
            s.class || '',
            s.building || '',
            s.floor || 0,
            s.dorm || '',
            s.bedNo || 0,
            s.createTime || ''
          ]);

          // 使用 XLSX 库生成 Excel 文件
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          
          // 设置列宽
          ws['!cols'] = [
            { wch: 10 },  // 姓名
            { wch: 6 },   // 性别
            { wch: 12 },  // 学号
            { wch: 20 },  // 学校
            { wch: 8 },   // 年级
            { wch: 15 },  // 班级
            { wch: 10 },  // 楼栋
            { wch: 6 },   // 楼层
            { wch: 10 },  // 宿舍号
            { wch: 8 },   // 床位号
            { wch: 18 }   // 创建时间
          ];
          
          XLSX.utils.book_append_sheet(wb, ws, '学生名单');
          XLSX.writeFile(wb, `学生名单_全部_${getBeijingDate()}.xlsx`);
        }
        setLoading(false);
      } catch (err: any) {
        console.error('导出失败:', err);
            toast.error(err.message || "操作失败");
        setLoading(false);
      }
  };

  // 学生详情视图
  if (view === 'detail' && detailStudent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>学生管理</span>
          <span>-&gt;</span>
          <span className="font-bold text-slate-800">学生详情</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
          {/* 基本信息 */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">基本信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">姓名</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.name}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">性别</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.gender}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">学号</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.id}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">学校</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.school}</div>
              </div>
            </div>
          </div>

          {/* 班级信息 */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">班级信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">年级</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.grade}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">班级</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.class}</div>
              </div>
            </div>
          </div>

          {/* 住宿信息 */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-blue-500 pl-3">住宿信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">楼栋</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.building || '-'}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">楼层</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.floor || '-'}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">宿舍号</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.dorm || '-'}</div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">床位号</label>
                <div className="flex-1 text-sm text-slate-900">{detailStudent.bedNo || '-'}</div>
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
            {hasPermission('student:edit') && (
              <button
                onClick={() => handleEditClick(detailStudent)}
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

  // 新增学生视图
  if (view === 'add' && editForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>学生管理</span>
          <span>-&gt;</span>
          <span className="font-bold text-slate-800">学生管理-新增</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
          {/* Basic Info */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">基础信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>姓名</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>性别</label>
                <select
                  value={editForm.gender}
                  onChange={(e) => setEditForm({...editForm, gender: e.target.value as '男' | '女'})}
                  className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">请选择性别</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学号</label>
                <input
                  type="text"
                  value={editForm.id}
                  onChange={(e) => setEditForm({...editForm, id: e.target.value})}
                  placeholder="请输入学号"
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学校</label>
                <select
                  value={editForm.school}
                  onChange={(e) => setEditForm({...editForm, school: e.target.value})}
                  className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">请选择学校</option>
                  {useApiData && schools.length > 0 && (
                    schools.map(school => (
                      <option key={school.id} value={school.name}>{school.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Academic Info */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">班级信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>年级</label>
                <select
                  value={editForm.grade}
                  onChange={(e) => setEditForm({...editForm, grade: e.target.value, class: ''})}
                  className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">请选择年级</option>
                  {newStudentGradeOptions.length > 0 ? (
                    newStudentGradeOptions.map(grade => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))
                  ) : (
                    <option value="" disabled>暂无年级数据</option>
                  )}
                </select>
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>班级</label>
                <select
                  value={editForm.class}
                  onChange={(e) => setEditForm({...editForm, class: e.target.value})}
                  disabled={!editForm.grade}
                  className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">请选择班级</option>
                  {newStudentClassOptions.length > 0 ? (
                    newStudentClassOptions.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))
                  ) : (
                    <option value="" disabled>请先选择年级</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Accommodation Info */}
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">住宿信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">楼栋</label>
                <input
                  type="text"
                  value={editForm.building || ''}
                  onChange={(e) => setEditForm({...editForm, building: e.target.value})}
                  placeholder="请输入楼栋名称"
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">楼层</label>
                <input
                  type="number"
                  value={editForm.floor || ''}
                  onChange={(e) => setEditForm({...editForm, floor: Number(e.target.value)})}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">宿舍号</label>
                <input
                  type="text"
                  value={editForm.dorm || ''}
                  onChange={(e) => setEditForm({...editForm, dorm: e.target.value})}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-4">
                <label className="w-24 text-sm font-medium text-slate-600 text-right">床位号</label>
                <input
                  type="number"
                  value={editForm.bedNo || ''}
                  onChange={(e) => setEditForm({...editForm, bedNo: Number(e.target.value)})}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4 border-t border-slate-100">
            <button
              onClick={handleBack}
              className="rounded-md border border-slate-300 bg-white px-8 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
            >
              取消
            </button>
            <button
              onClick={handleAddSave}
              className="rounded-md bg-green-500 px-8 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'edit' && editForm) {
      return (
        <div className="space-y-6">
            <div className="flex items-center space-x-2 text-sm text-slate-600">
                <span className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer" onClick={handleBack}>学生管理</span>
                <span>-&gt;</span>
                <span className="font-bold text-slate-800">学生管理-编辑</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8">
                 {/* Basic Info */}
                 <div>
                    <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">基础信息</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>姓名</label>
                            <input 
                                type="text" 
                                value={editForm.name} 
                                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>性别</label>
                            <select 
                                value={editForm.gender} 
                                onChange={(e) => setEditForm({...editForm, gender: e.target.value as '男' | '女'})}
                                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="男">男</option>
                                <option value="女">女</option>
                            </select>
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学号</label>
                            <input 
                                type="text" 
                                value={editForm.id} 
                                disabled
                                className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                            />
                        </div>
                         <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>学校</label>
                            <select
                                value={editForm.school}
                                onChange={(e) => setEditForm({...editForm, school: e.target.value})}
                                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                {useApiData && schools.length > 0 ? (
                                    schools.map(school => (
                                        <option key={school.id} value={school.name}>{school.name}</option>
                                    ))
                                ) : (
                                    <option value="">请选择学校</option>
                                )}
                            </select>
                        </div>
                    </div>
                 </div>

                 {/* Academic Info */}
                 <div>
                    <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">班级信息</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>年级</label>
                            <select 
                                value={editForm.grade}
                                onChange={(e) => setEditForm({...editForm, grade: e.target.value})}
                                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">请选择年级</option>
                                {newStudentGradeOptions.map(grade => (
                                    <option key={grade} value={grade}>{grade}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right"><span className="text-red-500 mr-1">*</span>班级</label>
                            <select 
                                value={editForm.class}
                                onChange={(e) => setEditForm({...editForm, class: e.target.value})}
                                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">请选择班级</option>
                                {newStudentClassOptions.map(cls => (
                                    <option key={cls} value={cls}>{cls}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                 </div>

                 {/* Accommodation Info */}
                 <div>
                    <h3 className="text-base font-bold text-slate-800 mb-6 border-l-4 border-slate-800 pl-2">住宿信息</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right">楼栋</label>
                            <input 
                                type="text"
                                value={editForm.building || ''}
                                onChange={(e) => setEditForm({...editForm, building: e.target.value})}
                                placeholder="请输入楼栋名称"
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                         <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right">楼层</label>
                            <input 
                                type="number"
                                value={editForm.floor || ''}
                                onChange={(e) => setEditForm({...editForm, floor: Number(e.target.value)})}
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right">宿舍号</label>
                            <input 
                                type="text"
                                value={editForm.dorm || ''}
                                onChange={(e) => setEditForm({...editForm, dorm: e.target.value})}
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="w-24 text-sm font-medium text-slate-600 text-right">床位号</label>
                            <input 
                                type="number"
                                value={editForm.bedNo || ''}
                                onChange={(e) => setEditForm({...editForm, bedNo: Number(e.target.value)})}
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>
                 </div>

                 {/* Action Buttons */}
                 <div className="flex space-x-4 pt-4 border-t border-slate-100">
                    <button 
                        onClick={handleBack}
                        className="rounded-md border border-slate-300 bg-white px-8 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSave}
                        className="rounded-md bg-blue-500 px-8 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <>
    <div className="space-y-4">
      {/* Filter Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-6 flex-1 flex-wrap gap-y-4">
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-slate-600 whitespace-nowrap w-8 text-right">学校</label>
                    <select
                        className="block w-60 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                        value={filterSchool}
                        onChange={(e) => {
                            const newSchool = e.target.value;
                            setFilterSchool(newSchool);
                            // 学校变化时，年级和班级会自动通过 useEffect 重置
                        }}
                        disabled={!useApiData || loading}
                    >
                        <option value="">请选择学校</option>
                        {useApiData && schools.length > 0 ? (
                            schools.map(school => (
                                <option key={school.id} value={school.name}>{school.name}</option>
                            ))
                        ) : null}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-slate-600 whitespace-nowrap w-8 text-right">年级</label>
                    <select
                        className="block w-40 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                        value={filterGrade}
                        onChange={(e) => {
                            const newGrade = e.target.value;
                            setFilterGrade(newGrade);
                            // 年级变化时，班级会自动通过 useEffect 重置
                        }}
                        disabled={!useApiData || loading || !filterSchool || gradeOptions.length === 0}
                    >
                        <option value="">
                            {!filterSchool ? '请先选择学校' : gradeOptions.length === 0 ? '暂无年级' : '请选择年级'}
                        </option>
                        {gradeOptions.map(grade => (
                            <option key={grade} value={grade}>{grade}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-slate-600 whitespace-nowrap w-8 text-right">班级</label>
                    <select
                        className="block w-40 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                        value={filterClass}
                        onChange={(e) => setFilterClass(e.target.value)}
                        disabled={!useApiData || loading || !filterGrade || classOptions.length === 0}
                    >
                        <option value="">
                            {!filterGrade ? '请先选择年级' : classOptions.length === 0 ? '暂无班级' : '请选择班级'}
                        </option>
                        {classOptions.map(cls => (
                            <option key={cls} value={cls}>{cls}</option>
                        ))}
                    </select>
                </div>
                 <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-slate-600 whitespace-nowrap w-8 text-right">姓名</label>
                    <input 
                        type="text" 
                        placeholder="请输入姓名" 
                        className="block w-40 rounded-md border border-slate-300 bg-white py-2 px-3 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex space-x-3">
                 <button 
                    onClick={handleSearch}
                    className="rounded-md bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                 >
                    查询
                 </button>
                 <button 
                    onClick={handleReset}
                    className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
        {hasPermission('student:edit') && (
            <button
                onClick={handleAddClick}
                className="rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center"
            >
                <Plus className="mr-2 h-4 w-4" />
                新增学生
            </button>
        )}
        {hasPermission('student:import') && (
            <button
                onClick={handleImportClick}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
            >
                <Upload className="mr-2 h-4 w-4" />
                导入名单
            </button>
        )}
        <button
            onClick={handleDownloadTemplate}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
        >
            <Download className="mr-2 h-4 w-4" />
            下载模板
        </button>
        <button
            onClick={handleExport}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
        >
            <Download className="mr-2 h-4 w-4" />
            导出名单
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">序号</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">姓名</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">性别</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">学号</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">学校</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">年级</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">班级</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">楼栋</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">楼层</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">宿舍号</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">床位号</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">创建时间</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {students.map((student, index) => (
              <tr key={student.id} className="hover:bg-slate-50 text-center">
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">{student.name}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.gender}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.studentNo || student.id}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.school}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.grade}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.class}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.building}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.floor}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.dorm}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{student.bedNo}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{student.createTime}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                   <div className="flex justify-center space-x-3">
                      <button 
                        onClick={() => handleViewClick(student)}
                        className="text-green-500 hover:text-green-700"
                      >
                        查看
                      </button>
                      {hasPermission('student:edit') && (
                        <button 
                          onClick={() => handleEditClick(student)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          编辑
                        </button>
                      )}
                      {hasPermission('student:delete') && (
                        <button 
                          onClick={() => handleDelete(student.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          删除
                        </button>
                      )}
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-2 text-sm text-slate-600">
             <span>共 {totalStudents} 条</span>
             <select
                className="border-slate-300 rounded text-sm py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={pageSize}
                onChange={(e) => {
                  const newSize = parseInt(e.target.value);
                  handlePageSizeChange(newSize);
                }}
                disabled={loading}
             >
                 <option value={10}>10条/页</option>
                 <option value={20}>20条/页</option>
                 <option value={50}>50条/页</option>
                 <option value={100}>100条/页</option>
             </select>
             <button
                className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || loading}
             >
                {'<<'}
             </button>
             <button
                className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
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
                        onClick={() => handlePageChange(pageNum)}
                        disabled={loading}
                    >
                        {pageNum}
                    </button>
                );
             })}
             <button
                className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
             >
                {'>'}
             </button>
             <button
                className="px-2 py-1 text-slate-400 hover:text-blue-600 disabled:text-slate-300"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || loading}
             >
                {'>>'}
             </button>
             <span>前往</span>
             <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = Math.max(1, Math.min(totalPages, Number(e.target.value)));
                  setCurrentPage(page);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handlePageChange(currentPage);
                  }
                }}
                className="w-12 border border-slate-300 rounded text-center py-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={loading}
             />
             <span>页</span>
        </div>
      </div>
    </div>

    {/* 学生导入弹窗 */}
    {isImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Upload className="w-6 h-6 text-white" />
                            <div>
                                <h3 className="text-lg font-bold text-white">导入学生</h3>
                                <p className="text-xs text-blue-100">选择目标班级并上传学生名单</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                setIsImportModalOpen(false);
                                setImportPreview([]);
                                setImportTargetSchool('');
                                setImportTargetGrade('');
                                setImportTargetClass('');
                            }}
                            className="p-2 hover:bg-white/20 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* 目标班级选择 */}
                    <div className="mb-6">
                        <h4 className="text-sm font-medium text-slate-700 mb-3">选择目标班级</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">学校</label>
                                <select
                                    className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none"
                                    value={importTargetSchool}
                                    onChange={(e) => {
                                        setImportTargetSchool(e.target.value);
                                        setImportTargetGrade('');
                                        setImportTargetClass('');
                                    }}
                                >
                                    <option value="">请选择学校</option>
                                    {schools.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">年级</label>
                                <select
                                    className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                                    value={importTargetGrade}
                                    onChange={(e) => {
                                        setImportTargetGrade(e.target.value);
                                        setImportTargetClass('');
                                    }}
                                    disabled={!importTargetSchool}
                                >
                                    <option value="">请选择年级</option>
                                    {importGradeOptions.map(grade => (
                                        <option key={grade} value={grade}>{grade}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">班级</label>
                                <select
                                    className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                                    value={importTargetClass}
                                    onChange={(e) => setImportTargetClass(e.target.value)}
                                    disabled={!importTargetGrade}
                                >
                                    <option value="">请选择班级</option>
                                    {importClassOptions.map(cls => (
                                        <option key={cls.id} value={cls.name}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* 文件上传 */}
                    <div className="mb-6">
                        <h4 className="text-sm font-medium text-slate-700 mb-3">上传学生名单</h4>
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept=".xlsx,.xls,.csv"
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                            >
                                选择文件
                            </button>
                            <p className="text-xs text-slate-500 mt-2">支持 Excel (.xlsx, .xls) 和 CSV 格式</p>
                        </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-700">
                            <span className="font-medium">💡 提示：</span>
                            如果Excel中包含学校、年级、班级信息，系统将自动匹配；否则将导入到上方选择的目标班级。
                            支持批量导入多个班级的学生。
                        </p>
                    </div>

                    {/* 预览 */}
                    {importPreview.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-slate-700 mb-3">预览 ({importPreview.length} 名学生)</h4>
                            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">序号</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">姓名</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">性别</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">学号</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">学校</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">年级</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">班级</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">楼栋</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">楼层</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">宿舍</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">床位</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {importPreview.slice(0, 20).map((student, idx) => (
                                            <tr key={idx}>
                                                <td className="px-3 py-2 text-sm text-slate-600">{idx + 1}</td>
                                                <td className="px-3 py-2 text-sm text-slate-900">{student.name}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.gender || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.student_no || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.school || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.grade || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.className || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.dorm_building || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.dorm_floor || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.dorm_room || '-'}</td>
                                                <td className="px-3 py-2 text-sm text-slate-600">{student.bed_no || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {importPreview.length > 20 && (
                                    <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50">
                                        还有 {importPreview.length - 20} 名学生未显示...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-6 py-4 flex justify-end space-x-3">
                    <button
                        onClick={() => {
                            setIsImportModalOpen(false);
                            setImportPreview([]);
                            setImportTargetSchool('');
                            setImportTargetGrade('');
                            setImportTargetClass('');
                        }}
                        className="px-4 py-2 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirmImport}
                        disabled={importPreview.length === 0 || isImporting}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
        </div>
    )}
  </>
  );
};

// --- Main Component ---
