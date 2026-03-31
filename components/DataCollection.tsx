import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Save,
  Calendar,
  User,
  FileText,
  Trash2,
  Edit3,
  Building2,
  Users,
  BedDouble,
  Grid3X3
} from 'lucide-react';
import { api } from '../src/services/apiClient';
import { getBeijingDate } from '../src/utils/dateUtils';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/Confirm';

// 常量定义
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

// 草稿接口
interface Draft {
  id: string;
  type: 'moral' | 'teaching' | 'dorm' | 'overall';
  target: string;
  category: string;
  subCategory?: string;
  item: string;
  description: string;
  timestamp: number;
  formData?: any;
}

// 座位表学生接口
interface SeatStudent {
  id: string;
  name: string;
  coord: string;
  isSelected: boolean;
}

// 指标接口
interface Indicator {
  id: number;
  name: string;
  type?: string;
  default_score: number;
  major_category?: string;
  minor_category?: string;
  indicator_id?: number;
  category?: string;
  subCategory?: string;
  isSelected?: boolean;
}

// 指标分类接口
interface IndicatorCategory {
  name: string;
  subCategories?: { name: string; indicators: Indicator[] }[];
  items?: Indicator[];
}

// 学生接口
interface Student {
  id: string | number;
  name: string;
  gender?: string;
  class_id?: number;
}

// 教师接口
interface Teacher {
  id: string | number;
  name: string;
  real_name?: string;
  school?: string;
  subject?: string;
  user_id?: number;
  teacher_id?: number;
  isSelected?: boolean;
}

// 年级接口
interface Grade {
  id: number;
  name: string;
  schoolId?: number;
  schoolName?: string;
  isSelected?: boolean;
}

// 班级接口
interface ClassInfo {
  id: number;
  name: string;
  gradeId: number;
  gradeName: string;
  schoolId?: number;
  isSelected?: boolean;
}

// 楼栋楼层房间接口
interface Building {
  name: string;
  isSelected?: boolean;
}

interface FloorInfo {
  name: string;
  value: number;
  isSelected?: boolean;
}

interface RoomInfo {
  name: string;
  isSelected?: boolean;
}

// 宿舍学生接口
interface DormStudent {
  id: string;
  name: string;
  bed_no?: string;
  class_id?: number;
  class_name?: string;
  grade_name?: string;
  isSelected?: boolean;
}

const DataCollection: React.FC = () => {
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const saved = localStorage.getItem('edu_inspect_drafts');
    if (saved) {
      setDrafts(JSON.parse(saved));
    }
  };

  const saveDraft = (draft: Draft) => {
    const newDrafts = [draft, ...drafts];
    localStorage.setItem('edu_inspect_drafts', JSON.stringify(newDrafts));
    setDrafts(newDrafts);
  };

  const deleteDraft = (id: string) => {
    const newDrafts = drafts.filter(d => d.id !== id);
    localStorage.setItem('edu_inspect_drafts', JSON.stringify(newDrafts));
    setDrafts(newDrafts);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">数据采集 (Data Collection)</h1>
          <p className="text-slate-500 mt-1">
            数据录入入口 (Data Entry Portal)
          </p>
        </div>
        <div className="flex items-center gap-3 mt-3 md:mt-0">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
              showDrafts ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText size={18} />
            <span>草稿箱</span>
            {drafts.length > 0 && (
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{drafts.length}</span>
            )}
          </button>
        </div>
      </div>

      {showDrafts && (
        <DraftsPanel
          drafts={drafts}
          onDelete={deleteDraft}
          onLoad={(draft) => {
            setShowDrafts(false);
          }}
        />
      )}

      <WebCollectionForm
        onSaveDraft={saveDraft}
        loadDraft={drafts.find(d => d.id === '')}
      />
    </div>
  );
};

// 草稿箱面板组件
const DraftsPanel: React.FC<{
  drafts: Draft[];
  onDelete: (id: string) => void;
  onLoad: (draft: Draft) => void;
}> = ({ drafts, onDelete, onLoad }) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      moral: '德育检查',
      teaching: '教学检查',
      dorm: '宿舍检查',
      overall: '整体检查'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      moral: 'bg-blue-100 text-blue-700',
      teaching: 'bg-green-100 text-green-700',
      dorm: 'bg-purple-100 text-purple-700',
      overall: 'bg-indigo-100 text-indigo-700'
    };
    return colors[type] || 'bg-slate-100 text-slate-700';
  };

  if (drafts.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center">
        <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">暂无草稿</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
      <div className="space-y-3">
        {drafts.map(draft => (
          <div key={draft.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(draft.type)}`}>
                  {getTypeLabel(draft.type)}
                </span>
                <span className="text-xs text-slate-400">{formatTime(draft.timestamp)}</span>
              </div>
              <p className="text-sm font-medium text-slate-700 truncate">{draft.target}</p>
              <p className="text-xs text-slate-500 truncate">{draft.item}</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button
                onClick={() => onLoad(draft)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="加载草稿"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => onDelete(draft.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="删除草稿"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface WebCollectionFormProps {
  onSaveDraft: (draft: Draft) => void;
  loadDraft?: Draft;
}

const WebCollectionForm: React.FC<WebCollectionFormProps> = ({ onSaveDraft }) => {
  const [selectedType, setSelectedType] = useState<'moral' | 'teaching' | 'dorm' | 'overall'>('moral');
  const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 动态数据
  const [grades, setGrades] = useState<Grade[]>([]);
  const [allClasses, setAllClasses] = useState<ClassInfo[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<FloorInfo[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // 指标数据
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [moralData, setMoralData] = useState<IndicatorCategory[]>([]);
  const [teachingData, setTeachingData] = useState<IndicatorCategory[]>([]);
  const [dormData, setDormData] = useState<IndicatorCategory[]>([]);
  const [overallData, setOverallData] = useState<Record<string, any>>({});
  
  // 当前学校ID（从用户信息获取）
  const [currentSchoolId, setCurrentSchoolId] = useState<number | null>(null);
  const [currentSchoolName, setCurrentSchoolName] = useState<string>('');
  
  // 德育检查专用状态
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<SeatStudent[]>([]);
  const [moralCategory, setMoralCategory] = useState('');
  const [moralSubCategory, setMoralSubCategory] = useState('');
  const [moralSubItems, setMoralSubItems] = useState<string[]>([]);
  const [moralDetailItems, setMoralDetailItems] = useState<Indicator[]>([]);
  const [selectedMoralItems, setSelectedMoralItems] = useState<string[]>([]);
  const [currentMoralCategoryData, setCurrentMoralCategoryData] = useState<IndicatorCategory | null>(null);
  
  // 宿舍检查专用状态
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<FloorInfo | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [dormStudents, setDormStudents] = useState<DormStudent[]>([]);
  const [dormCategory, setDormCategory] = useState('');
  const [dormDetailItems, setDormDetailItems] = useState<Indicator[]>([]);
  const [selectedDormItems, setSelectedDormItems] = useState<string[]>([]);
  
  // 整体检查专用状态
  const [overallModule, setOverallModule] = useState<'CLASS' | 'SUBJECT' | 'DORM'>('CLASS');
  const [overallGrade, setOverallGrade] = useState<Grade | null>(null);
  const [overallClasses, setOverallClasses] = useState<ClassInfo[]>([]);
  const [selectedOverallClasses, setSelectedOverallClasses] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<{name: string; isSelected?: boolean}[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [overallBuilding, setOverallBuilding] = useState<Building | null>(null);
  const [overallFloor, setOverallFloor] = useState<FloorInfo | null>(null);
  const [overallRooms, setOverallRooms] = useState<RoomInfo[]>([]);
  const [selectedOverallRooms, setSelectedOverallRooms] = useState<string[]>([]);
  const [overallCategories, setOverallCategories] = useState<{name: string; subCategories?: any[]}[]>([]);
  const [overallItems, setOverallItems] = useState<Indicator[]>([]);
  const [overallCategory, setOverallCategory] = useState('');
  const [overallSubCategory, setOverallSubCategory] = useState('');
  const [overallSubItems, setOverallSubItems] = useState<{name: string}[]>([]);
  const [overallDetailItems, setOverallDetailItems] = useState<Indicator[]>([]);
  const [selectedOverallItems, setSelectedOverallItems] = useState<string[]>([]);
  
  // 教学检查状态
  const [teachingCategory, setTeachingCategory] = useState('');
  const [teachingDetailItems, setTeachingDetailItems] = useState<Indicator[]>([]);
  const [selectedTeachingItems, setSelectedTeachingItems] = useState<string[]>([]);
  const [teachingMembers, setTeachingMembers] = useState<[string, Teacher[]][]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<Teacher[]>([]);

  // Form data
  const [formData, setFormData] = useState({
    record_time: getBeijingDate(),
    description: ''
  });

  // 座位表数据
  const [studentsGrid, setStudentsGrid] = useState<SeatStudent[][]>([]);

  // 加载初始数据
  useEffect(() => {
    loadInitialData();
  }, [selectedType]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取用户信息
      const userInfoStr = localStorage.getItem('user_info');
      let schoolId = null;
      let schoolName = '';
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        schoolId = userInfo.school_id || userInfo.org_id;
        schoolName = userInfo.school_name || userInfo.org_name || '';
        setCurrentSchoolId(schoolId);
        setCurrentSchoolName(schoolName);
      }

      // 加载组织树
      const orgTree: any = await api.get('/api/org/tree');
      const { grades: parsedGrades, classes: parsedClasses } = parseGradesAndClasses(orgTree, schoolId);
      setGrades(parsedGrades);
      setAllClasses(parsedClasses);

      // 根据类型加载指标数据
      if (selectedType === 'moral') {
        const params = schoolId ? `?org_id=${schoolId}` : '';
        const moralRes: any = await api.get(`/api/moral/indicators/report-structure${params}`);
        setMoralData(moralRes.categories || []);
      } else if (selectedType === 'teaching') {
        const teachingRes: any = await api.get('/api/teaching/indicators/structure');
        setTeachingData(teachingRes.categories || []);
        // 加载教师数据
        await loadTeachersData();
      } else if (selectedType === 'dorm') {
        const dormRes: any = await api.get('/api/dorm/indicators');
        setDormData(dormRes.categories || []);
        // 加载宿舍楼栋
        await loadDormBuildings();
      } else if (selectedType === 'overall') {
        const overallRes: any = await api.get('/api/overall/indicators');
        setOverallData(overallRes.indicators || {});
        initOverallData(overallRes.indicators || {});
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 解析组织树获取年级和班级
  const parseGradesAndClasses = (tree: any[], targetSchoolId: number | null) => {
    const gradesList: Grade[] = [];
    const classesList: ClassInfo[] = [];

    const isGradeNode = (node: any) => {
      return node.type === 'grade' || 
             (node.type === 'department' && node.name && node.name.includes('年级'));
    };

    const traverse = (nodes: any[], parentSchoolId: number | null = null, parentSchoolName: string = '') => {
      if (!nodes || !Array.isArray(nodes)) return;
      
      nodes.forEach(node => {
        let currentSchoolId = parentSchoolId;
        let currentSchoolName = parentSchoolName;
        
        if (node.type === 'school') {
          currentSchoolId = node.id;
          currentSchoolName = node.name;
        }
        
        if (isGradeNode(node)) {
          if (targetSchoolId && currentSchoolId !== targetSchoolId) {
            if (node.children) {
              traverse(node.children, currentSchoolId, currentSchoolName);
            }
            return;
          }
          
          gradesList.push({
            id: node.id,
            name: node.name,
            schoolId: currentSchoolId || undefined,
            schoolName: currentSchoolName,
            isSelected: false
          });
          
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach((child: any) => {
              if (child.type === 'class') {
                classesList.push({
                  id: child.id,
                  name: child.name,
                  gradeId: node.id,
                  gradeName: node.name,
                  schoolId: currentSchoolId || undefined,
                  isSelected: false
                });
              }
            });
          }
        }
        
        if (node.children && !isGradeNode(node)) {
          traverse(node.children, currentSchoolId, currentSchoolName);
        }
      });
    };

    traverse(tree);
    return { grades: gradesList, classes: classesList };
  };

  // 加载教师数据
  const loadTeachersData = async (gradeName?: string) => {
    try {
      const params: any = { page_size: 200 };
      if (gradeName) params.grade = gradeName;
      const teachersRes: any = await api.get('/api/org/teachers/all', { params });
      const teachersList = teachersRes.teachers || [];
      setTeachers(teachersList);

      // 按学科分组
      const grouped: Record<string, Teacher[]> = {};
      teachersList.forEach((teacher: any) => {
        const name = teacher.real_name || teacher.name || teacher.username;
        const subject = teacher.subject || '其他';
        if (!grouped[subject]) {
          grouped[subject] = [];
        }
        grouped[subject].push({
          id: teacher.teacher_id || teacher.id,
          user_id: teacher.id,
          name,
          subject,
          real_name: teacher.real_name,
          teacher_id: teacher.teacher_id
        });
      });

      setTeachingMembers(Object.entries(grouped) as [string, Teacher[]][]);
    } catch (err) {
      console.error('Failed to load teachers:', err);
    }
  };

  // 加载宿舍楼栋
  const loadDormBuildings = async () => {
    try {
      const res: any = await api.get('/api/dorm/buildings');
      const buildingsList = (res.buildings || []).map((name: string) => ({
        name,
        isSelected: false
      }));
      setBuildings(buildingsList);
      if (buildingsList.length > 0) {
        await loadDormFloors(buildingsList[0].name);
      }
    } catch (err) {
      console.error('Failed to load dorm buildings:', err);
    }
  };

  // 加载宿舍楼层
  const loadDormFloors = async (building: string) => {
    try {
      const res: any = await api.get('/api/dorm/floors', { params: { building } });
      const floorsList = (res.floors || []).map((floor: number) => ({
        name: `${floor}层`,
        value: floor,
        isSelected: false
      }));
      setFloors(floorsList);
      if (floorsList.length > 0) {
        await loadDormRooms(building, floorsList[0].value);
      }
    } catch (err) {
      console.error('Failed to load dorm floors:', err);
    }
  };

  // 加载宿舍房间
  const loadDormRooms = async (building: string, floor: number) => {
    try {
      const res: any = await api.get('/api/dorm/rooms', { params: { building, floor } });
      const roomsList = (res.rooms || []).map((name: string) => ({
        name,
        isSelected: false
      }));
      setRooms(roomsList);
    } catch (err) {
      console.error('Failed to load dorm rooms:', err);
    }
  };

  // 加载房间学生
  const loadDormStudents = async (building: string, floor: number, room: string) => {
    try {
      const res: any = await api.get('/api/dorm/students', { params: { building, floor, room } });
      const studentsList = (res.students || []).map((s: any) => ({
        id: String(s.id),
        name: s.name,
        bed_no: s.bed_no,
        class_id: s.class_id,
        class_name: s.class_name,
        grade_name: s.grade_name,
        isSelected: false
      }));
      setDormStudents(studentsList);
    } catch (err) {
      console.error('Failed to load dorm students:', err);
      setDormStudents([]);
    }
  };

  // 初始化整体检查数据
  const initOverallData = (data: Record<string, any>) => {
    const defaultModule = 'CLASS';
    const moduleData = data[defaultModule];
    
    if (moduleData && moduleData.categories) {
      const categories = moduleData.categories.map((cat: any) => ({
        name: cat.name,
        subCategories: cat.subCategories || []
      }));
      setOverallCategories(categories);

      const items: Indicator[] = [];
      moduleData.categories.forEach((cat: any) => {
        if (cat.subCategories && Array.isArray(cat.subCategories)) {
          cat.subCategories.forEach((subCat: any) => {
            if (subCat.indicators && Array.isArray(subCat.indicators)) {
              subCat.indicators.forEach((item: any) => {
                items.push({
                  ...item,
                  category: cat.name,
                  subCategory: subCat.name,
                  isSelected: false
                });
              });
            }
          });
        }
      });
      setOverallItems(items);
    }
  };

  // 加载座位表
  const loadSeatingChart = async (classId: number) => {
    try {
      const res: any = await api.get(`/api/org/class/${classId}/seating-chart`);
      console.log('[DEBUG] Seating chart response:', res);
      const seatingChart = res.seating_chart;
      const students = res.students || [];
      const rowCount = res.rowCount || 8;

      // 构建学生ID映射
      const nameToIdMap: Record<string, string> = {};
      students.forEach((s: any) => {
        if (s.name && s.id) {
          nameToIdMap[s.name] = String(s.id);
        }
      });

      if (seatingChart && seatingChart.groups && Array.isArray(seatingChart.groups)) {
        // 后端返回 groups 格式: [{id, name, students: string[]}]
        const groups = seatingChart.groups;
        const numCols = groups.length || 9;
        
        // 找到最大行数
        const maxRows = Math.max(
          rowCount,
          ...groups.map((g: any) => g.students?.length || 0)
        );

        // 转换为二维网格 (按行排列)
        const grid: SeatStudent[][] = [];
        for (let row = 0; row < maxRows; row++) {
          const rowStudents: SeatStudent[] = [];
          for (let col = 0; col < numCols; col++) {
            const group = groups[col];
            const studentName = group?.students?.[row] || '';
            const studentId = studentName ? (nameToIdMap[studentName] || `temp_${classId}_${COL_LABELS[col]}-${row + 1}`) : '';
            
            rowStudents.push({
              id: studentId,
              name: studentName,
              coord: `${COL_LABELS[col]}-${row + 1}`,
              isSelected: false
            });
          }
          grid.push(rowStudents);
        }
        console.log('[DEBUG] Parsed seating grid:', grid);
        setStudentsGrid(grid);
      } else if (students && students.length > 0) {
        // 没有座位表但有学生列表，创建默认网格
        const numCols = 9;
        const numRows = Math.ceil(students.length / numCols);
        const grid: SeatStudent[][] = [];
        
        for (let row = 0; row < numRows; row++) {
          const rowStudents: SeatStudent[] = [];
          for (let col = 0; col < numCols; col++) {
            const studentIndex = row * numCols + col;
            const student = students[studentIndex];
            
            rowStudents.push({
              id: student?.id ? String(student.id) : `temp_${classId}_${COL_LABELS[col]}-${row + 1}`,
              name: student?.name || '',
              coord: `${COL_LABELS[col]}-${row + 1}`,
              isSelected: false
            });
          }
          grid.push(rowStudents);
        }
        setStudentsGrid(grid);
      } else {
        // 空座位表
        const grid = Array(6).fill(null).map((_, rowIndex) =>
          Array(9).fill(null).map((_, colIndex) => ({
            id: `seat-${rowIndex * 9 + colIndex}`,
            name: '',
            coord: `${COL_LABELS[colIndex]}-${rowIndex + 1}`,
            isSelected: false
          }))
        );
        setStudentsGrid(grid);
      }
    } catch (err) {
      console.error('Failed to load seating chart:', err);
      setStudentsGrid([]);
    }
  };

  // 重置表单
  useEffect(() => {
    setFormData({
      record_time: getBeijingDate(),
      description: ''
    });
    setSelectedStudents([]);
    setMoralCategory('');
    setMoralSubCategory('');
    setSelectedMoralItems([]);
    setMoralDetailItems([]);
    setDormCategory('');
    setSelectedDormItems([]);
    setDormDetailItems([]);
    setDormStudents([]);
    setOverallCategory('');
    setOverallSubCategory('');
    setSelectedOverallItems([]);
    setOverallDetailItems([]);
    setTeachingCategory('');
    setSelectedTeachingItems([]);
    setTeachingDetailItems([]);
    setSelectedTeachers([]);
    setSelectedRoom('');
  }, [selectedType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 座位表学生选择
  const toggleStudent = (student: SeatStudent) => {
    const exists = selectedStudents.find(s => s.id === student.id);
    if (exists) {
      setSelectedStudents(selectedStudents.filter(s => s.id !== student.id));
      setStudentsGrid(studentsGrid.map(row =>
        row.map(s => s.id === student.id ? { ...s, isSelected: false } : s)
      ));
    } else {
      setSelectedStudents([...selectedStudents, student]);
      setStudentsGrid(studentsGrid.map(row =>
        row.map(s => s.id === student.id ? { ...s, isSelected: true } : s)
      ));
    }
  };

  // 宿舍床位选择
  const toggleBed = (bedId: string) => {
    const bed = dormStudents.find(b => b.id === bedId);
    if (!bed) return;
    
    if (bed.isSelected) {
      setDormStudents(dormStudents.map(b => b.id === bedId ? { ...b, isSelected: false } : b));
    } else {
      setDormStudents(dormStudents.map(b => b.id === bedId ? { ...b, isSelected: true } : b));
    }
  };

  // 教师选择
  const toggleTeacher = (teacher: Teacher) => {
    const exists = selectedTeachers.find(t => t.id === teacher.id);
    if (exists) {
      setSelectedTeachers(selectedTeachers.filter(t => t.id !== teacher.id));
    } else {
      setSelectedTeachers([...selectedTeachers, teacher]);
    }
  };

  // 生成目标字符串
  const getTargetString = () => {
    if (selectedType === 'moral') {
      const gradeStr = selectedGrade?.name || '';
      const classStr = selectedClass?.name || '';
      const studentStr = selectedStudents.length > 0 ? `: ${selectedStudents.map(s => s.name).join(', ')}` : '';
      return `${gradeStr}${classStr}${studentStr}`;
    } else if (selectedType === 'teaching') {
      const gradeStr = selectedGrade?.name || '';
      const teacherStr = selectedTeachers.length > 0 ? `: ${selectedTeachers.map(t => t.name).join(', ')}` : '';
      return `${gradeStr}${teacherStr}`;
    } else if (selectedType === 'dorm') {
      const buildingStr = selectedBuilding?.name || '';
      const floorStr = selectedFloor?.name || '';
      const roomStr = selectedRoom || '';
      const bedStr = dormStudents.filter(b => b.isSelected).length > 0 
        ? ` (${dormStudents.filter(b => b.isSelected).map(b => `床位${b.bed_no}`).join(', ')})` 
        : '';
      return `${buildingStr}${floorStr}: ${roomStr}${bedStr}`;
    } else if (selectedType === 'overall') {
      if (overallModule === 'CLASS') {
        const gradeStr = overallGrade?.name || '';
        const classStr = allClasses.filter(c => selectedOverallClasses.includes(c.id)).map(c => c.name).join(', ') || '未选择班级';
        return `${gradeStr}: ${classStr}`;
      } else if (overallModule === 'SUBJECT') {
        const gradeStr = overallGrade?.name || '';
        const subStr = selectedSubjects.length > 0 ? selectedSubjects.join(', ') : '未选择学科组';
        return `${gradeStr}: ${subStr}`;
      } else {
        const buildingStr = overallBuilding?.name || '';
        const floorStr = overallFloor?.name || '';
        const roomStr = selectedOverallRooms.length > 0 ? selectedOverallRooms.join(', ') : '未选择房号';
        return `${buildingStr}${floorStr}: ${roomStr}`;
      }
    }
    return '';
  };

  const handleSaveDraft = () => {
    const draft: Draft = {
      id: `draft-${Date.now()}`,
      type: selectedType,
      target: getTargetString(),
      category: moralCategory || teachingCategory || dormCategory || overallCategory,
      subCategory: moralSubCategory || overallSubCategory,
      item: selectedMoralItems.join(', ') || selectedTeachingItems.join(', ') || 
            selectedDormItems.join(', ') || selectedOverallItems.join(', '),
      description: formData.description,
      timestamp: Date.now(),
      formData
    };
    onSaveDraft(draft);
    toast.success('草稿已保存');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.record_time) {
      toast.warning('请选择检查日期');
      return;
    }

    setFormStatus('saving');
    let success = false;

    // 安全超时：防止API请求挂起导致表单永久卡在提交状态
    const safetyTimer = setTimeout(() => {
      if (!success) {
        setFormStatus('idle');
        toast.warning('提交超时，请检查网络后重试');
      }
    }, 30000);

    try {
      if (selectedType === 'moral') {
        await submitMoralRecord();
      } else if (selectedType === 'teaching') {
        await submitTeachingRecord();
      } else if (selectedType === 'dorm') {
        await submitDormRecord();
      } else if (selectedType === 'overall') {
        await submitOverallRecord();
      }

      success = true;
      clearTimeout(safetyTimer);
      setFormStatus('saved');
      // 重置表单
      setFormData({ record_time: getBeijingDate(), description: '' });
      setSelectedStudents([]);
      setSelectedMoralItems([]);
      setSelectedTeachers([]);
      setSelectedDormItems([]);
      setSelectedOverallItems([]);
      
      setTimeout(() => setFormStatus('idle'), 2000);
    } catch (error: any) {
      clearTimeout(safetyTimer);
      console.error('Failed to submit record:', error);
      try {
        toast.error(error.message || '提交失败，请重试');
      } catch (_) { /* ignore toast errors */ }
    } finally {
      if (!success) {
        setFormStatus('idle');
      }
    }
  };

  // 提交德育记录
  const submitMoralRecord = async () => {
    if (!selectedClass) {
      throw new Error('请选择班级');
    }
    if (selectedStudents.length === 0) {
      throw new Error('请选择被检查的学生');
    }
    if (selectedMoralItems.length === 0) {
      throw new Error('请选择检查指标');
    }

    const records: any[] = [];
    
    selectedStudents.forEach(student => {
      selectedMoralItems.forEach(itemName => {
        const itemData = moralDetailItems.find(item => item.name === itemName);
        records.push({
          student_id: student.id,
          class_id: selectedClass.id,
          rule_id: itemData?.id || 1,
          score_change: itemData?.default_score || -1,
          description: `${moralCategory}-${moralSubCategory}: ${itemName}${formData.description ? ' | ' + formData.description : ''}`,
          record_time: new Date(formData.record_time).toISOString()
        });
      });
    });

    await api.post('/api/moral/records/batch', { records });
    toast.success(`成功提交 ${records.length} 条德育记录`);
  };

  // 提交教学记录
  const submitTeachingRecord = async () => {
    if (selectedTeachers.length === 0) {
      throw new Error('请选择被检查的教师');
    }
    if (selectedTeachingItems.length === 0) {
      throw new Error('请选择检查指标');
    }

    const records: any[] = [];
    
    selectedTeachers.forEach(teacher => {
      selectedTeachingItems.forEach(itemName => {
        const itemData = teachingDetailItems.find(item => item.name === itemName);
        records.push({
          teacher_id: teacher.teacher_id || teacher.id,
          check_item: itemName,
          type: (itemData?.default_score || 0) >= 0 ? 'POSITIVE' : 'NEGATIVE',
          score: itemData?.default_score || 0,
          content: formData.description,
          major_category: teachingCategory,
          description: `[${teachingCategory}] ${itemName}`,
          indicator_id: itemData?.id,
          record_time: new Date(formData.record_time).toISOString()
        });
      });
    });

    await api.post('/api/teaching/records/batch', { records });
    toast.success(`成功提交 ${records.length} 条教学记录`);
  };

  // 提交宿舍记录
  const submitDormRecord = async () => {
    if (!selectedBuilding || !selectedFloor || !selectedRoom) {
      throw new Error('请选择楼栋、楼层和房间');
    }
    if (selectedDormItems.length === 0) {
      throw new Error('请选择检查指标');
    }

    const selectedBeds = dormStudents.filter(b => b.isSelected);
    const targets = selectedBeds.length > 0 ? selectedBeds : [{ id: null, name: '' }];
    const records: any[] = [];
    
    targets.forEach((target: any) => {
      selectedDormItems.forEach(itemName => {
        const itemData = dormDetailItems.find(item => item.name === itemName);
        records.push({
          student_id: target.id,
          student_name: target.name,
          class_id: target.class_id,
          class_name: target.class_name,
          grade_name: target.grade_name,
          building: selectedBuilding.name,
          floor: selectedFloor.value,
          room: selectedRoom,
          category: dormCategory,
          item: itemName,
          score_change: itemData?.default_score || -1,
          description: formData.description,
          record_time: new Date(formData.record_time).toISOString()
        });
      });
    });

    await api.post('/api/dorm/records/batch', { records });
    toast.success(`成功提交 ${records.length} 条宿舍检查记录`);
  };

  // 提交整体检查记录
  const submitOverallRecord = async () => {
    if (selectedOverallItems.length === 0) {
      throw new Error('请选择检查指标');
    }

    let checkType = overallModule;
    let targets: { target_id: number | null; target_name: string; room?: string; subject_group?: string }[] = [];

    if (overallModule === 'CLASS') {
      if (selectedOverallClasses.length === 0) {
        throw new Error('请选择班级');
      }
      selectedOverallClasses.forEach((classId, index) => {
        const cls = allClasses.find(c => c.id === classId);
        targets.push({
          target_id: classId,
          target_name: `${overallGrade?.name || ''}: ${cls?.name || ''}`
        });
      });
    } else if (overallModule === 'SUBJECT') {
      if (selectedSubjects.length === 0) {
        throw new Error('请选择学科组');
      }
      selectedSubjects.forEach(subject => {
        targets.push({
          target_id: overallGrade?.id || null,
          target_name: `${overallGrade?.name || ''}: ${subject}`,
          subject_group: subject
        });
      });
    } else if (overallModule === 'DORM') {
      if (selectedOverallRooms.length === 0) {
        throw new Error('请选择宿舍房间');
      }
      selectedOverallRooms.forEach(room => {
        targets.push({
          target_id: null,
          target_name: `${overallBuilding?.name || ''}${overallFloor?.name || ''}: ${room}`,
          room
        });
      });
    }

    const records: any[] = [];
    
    targets.forEach(target => {
      selectedOverallItems.forEach(itemKey => {
        const itemData = overallItems.find(item => 
          String(item.indicator_id || item.id) === itemKey || item.name === itemKey
        );
        
        let category = itemData?.category || overallCategory;
        let majorCategory = itemData?.category || '';
        
        if (checkType === 'SUBJECT' && target.subject_group) {
          category = target.subject_group;
        }

        records.push({
          check_type: checkType,
          target_id: target.target_id,
          target_name: target.target_name,
          category,
          major_category: majorCategory,
          sub_category: itemData?.subCategory || '',
          item: itemData?.name || itemKey,
          indicator_id: itemData?.indicator_id || itemData?.id,
          score_change: itemData?.default_score || -1,
          description: formData.description,
          building: checkType === 'DORM' ? overallBuilding?.name : null,
          floor: checkType === 'DORM' ? overallFloor?.value : null,
          room: checkType === 'DORM' ? target.room : null,
          record_time: new Date(formData.record_time).toISOString()
        });
      });
    });

    await api.post('/api/overall/records/batch', { records });
    toast.success(`成功提交 ${records.length} 条整体检查记录`);
  };

  const typeButtons = [
    { id: 'moral', label: '德育检查', icon: '📋', color: 'blue' },
    { id: 'teaching', label: '教学检查', icon: '📖', color: 'green' },
    { id: 'dorm', label: '宿舍检查', icon: '🏠', color: 'purple' },
    { id: 'overall', label: '整体检查', icon: '📊', color: 'indigo' },
  ] as const;

  const getColorClass = (color: string, isActive: boolean) => {
    if (!isActive) return 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50';
    const colors: Record<string, string> = {
      blue: 'bg-blue-600 text-white shadow-md',
      green: 'bg-green-600 text-white shadow-md',
      purple: 'bg-purple-600 text-white shadow-md',
      indigo: 'bg-indigo-600 text-white shadow-md',
    };
    return colors[color];
  };

  return (
    <>
      {/* 类型选择 */}
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {typeButtons.map(btn => (
          <button
            key={btn.id}
            onClick={() => setSelectedType(btn.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${getColorClass(btn.color, selectedType === btn.id)}`}
          >
            <span>{btn.icon}</span>
            <span>{btn.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-slate-500">加载数据中...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-red-500 mb-2">⚠️ 加载失败</div>
            <p className="text-slate-500">{error}</p>
            <button
              onClick={() => loadInitialData()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              重新加载
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 日期选择 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">检查日期 *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="date"
                    name="record_time"
                    value={formData.record_time}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                </div>
              </div>

              {/* 目标显示 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">检查对象</label>
                <input
                  type="text"
                  value={getTargetString() || '请在下方选择'}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-slate-600 text-sm"
                  disabled
                />
              </div>
            </div>

            {/* 德育检查 */}
            {selectedType === 'moral' && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-slate-700 flex items-center gap-2">
                  <Users size={18} className="text-blue-600" />
                  选择检查对象
                </h4>

                {/* 年级选择 */}
                <div>
                  <label className="block text-sm text-slate-600 mb-2">选择年级</label>
                  <div className="flex flex-wrap gap-2">
                    {grades.map(grade => (
                      <button
                        key={grade.id}
                        type="button"
                        onClick={async () => {
                          setSelectedGrade(grade);
                          setGrades(grades.map(g => ({ ...g, isSelected: g.id === grade.id })));
                          // 更新班级列表
                          const gradeClasses = allClasses.filter(c => c.gradeId === grade.id);
                          setClasses(gradeClasses);
                          setSelectedClass(null);
                          setStudentsGrid([]);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          selectedGrade?.id === grade.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50'
                        }`}
                      >
                        {grade.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 班级选择 */}
                {selectedGrade && (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">选择班级</label>
                    <div className="flex flex-wrap gap-2">
                      {classes.map(cls => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={async () => {
                            setSelectedClass(cls);
                            setClasses(classes.map(c => ({ ...c, isSelected: c.id === cls.id })));
                            setSelectedStudents([]);
                            await loadSeatingChart(cls.id);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            selectedClass?.id === cls.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50'
                          }`}
                        >
                          {cls.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 座位表 */}
                {selectedClass && studentsGrid.length > 0 && (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2 flex items-center gap-2">
                      <Grid3X3 size={16} />
                      班级座位表（点击选择学生）
                    </label>
                    <div className="overflow-x-auto bg-white rounded-lg border border-slate-200 p-3">
                      <div className="inline-block">
                        {/* 列标签 */}
                        <div className="flex">
                          <div className="w-12"></div>
                          {COL_LABELS.map(label => (
                            <div key={label} className="w-16 text-center text-xs text-slate-400 font-medium">{label}</div>
                          ))}
                        </div>
                        {/* 座位网格 */}
                        {studentsGrid.map((row, rowIndex) => (
                          <div key={rowIndex} className="flex items-center">
                            <div className="w-12 text-center text-xs text-slate-400">{rowIndex + 1}</div>
                            {row.map(student => (
                              <button
                                key={student.id}
                                type="button"
                                onClick={() => toggleStudent(student)}
                                className={`w-16 h-12 m-0.5 rounded text-xs transition-all ${
                                  student.isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-blue-100'
                                }`}
                                title={`${student.coord} ${student.name}`}
                              >
                                <div className="truncate">{student.name}</div>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    {selectedStudents.length > 0 && (
                      <p className="text-sm text-blue-600 mt-2">
                        已选择: {selectedStudents.map(s => s.name).join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* 德育指标三级选择 */}
                <div className="pt-4 border-t border-blue-200">
                  <h4 className="font-medium text-slate-700 mb-3">选择检查指标</h4>

                  {/* 大项 */}
                  <div className="mb-3">
                    <label className="block text-sm text-slate-600 mb-2">指标大项</label>
                    <div className="flex flex-wrap gap-2">
                      {moralData.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setMoralCategory(cat.name);
                            setMoralSubCategory('');
                            setMoralSubItems(cat.subCategories?.map(s => s.name) || []);
                            setSelectedMoralItems([]);
                            setMoralDetailItems([]);
                            setCurrentMoralCategoryData(cat);
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            moralCategory === cat.name ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 小项 */}
                  {moralCategory && moralSubItems.length > 0 && (
                    <div className="mb-3">
                      <label className="block text-sm text-slate-600 mb-2">小项</label>
                      <div className="flex flex-wrap gap-2">
                        {moralSubItems.map(sub => (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => {
                              setMoralSubCategory(sub);
                              const subData = currentMoralCategoryData?.subCategories?.find(s => s.name === sub);
                              setMoralDetailItems(subData?.indicators?.map(ind => ({
                                ...ind,
                                isSelected: false
                              })) || []);
                              setSelectedMoralItems([]);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              moralSubCategory === sub ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 具体指标 */}
                  {moralSubCategory && moralDetailItems.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">具体指标（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {moralDetailItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (selectedMoralItems.includes(item.name)) {
                                setSelectedMoralItems(selectedMoralItems.filter(i => i !== item.name));
                              } else {
                                setSelectedMoralItems([...selectedMoralItems, item.name]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedMoralItems.includes(item.name)
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50'
                            }`}
                          >
                            {selectedMoralItems.includes(item.name) && '✓ '}{item.name} ({item.default_score}分)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 教学检查 */}
            {selectedType === 'teaching' && (
              <div className="space-y-4 p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-slate-700 flex items-center gap-2">
                  <User size={18} className="text-green-600" />
                  教学检查
                </h4>

                {/* 年级选择 */}
                <div>
                  <label className="block text-sm text-slate-600 mb-2">选择年级（可选）</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGrade(null);
                        loadTeachersData();
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        !selectedGrade ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      全部年级
                    </button>
                    {grades.map(grade => (
                      <button
                        key={grade.id}
                        type="button"
                        onClick={() => {
                          setSelectedGrade(grade);
                          loadTeachersData(grade.name);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          selectedGrade?.id === grade.id ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        {grade.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 教师选择（按教研组） */}
                <div>
                  <label className="block text-sm text-slate-600 mb-2">选择教师</label>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {teachingMembers.map(([groupName, members]) => (
                      <div key={groupName} className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="text-sm font-medium text-slate-700 mb-2">{groupName}</div>
                        <div className="flex flex-wrap gap-2">
                          {members.map(teacher => (
                            <button
                              key={String(teacher.id)}
                              type="button"
                              onClick={() => toggleTeacher(teacher)}
                              className={`px-2 py-1 rounded text-xs transition-all ${
                                selectedTeachers.find(t => t.id === teacher.id)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-green-50'
                              }`}
                            >
                              {teacher.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedTeachers.length > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      已选择: {selectedTeachers.map(t => t.name).join(', ')}
                    </p>
                  )}
                </div>

                {/* 教学指标选择 */}
                <div className="pt-4 border-t border-green-200">
                  <h4 className="font-medium text-slate-700 mb-3">选择检查指标</h4>

                  {/* 大项 */}
                  <div className="mb-3">
                    <label className="block text-sm text-slate-600 mb-2">指标大项</label>
                    <div className="flex flex-wrap gap-2">
                      {teachingData.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setTeachingCategory(cat.name);
                            setTeachingDetailItems(cat.items?.map(item => ({ ...item, isSelected: false })) || []);
                            setSelectedTeachingItems([]);
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            teachingCategory === cat.name ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 具体指标 */}
                  {teachingCategory && teachingDetailItems.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">具体指标（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {teachingDetailItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (selectedTeachingItems.includes(item.name)) {
                                setSelectedTeachingItems(selectedTeachingItems.filter(i => i !== item.name));
                              } else {
                                setSelectedTeachingItems([...selectedTeachingItems, item.name]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedTeachingItems.includes(item.name)
                                ? 'bg-green-600 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-green-50'
                            }`}
                          >
                            {selectedTeachingItems.includes(item.name) && '✓ '}{item.name} ({item.default_score > 0 ? '+' : ''}{item.default_score}分)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 宿舍检查 */}
            {selectedType === 'dorm' && (
              <div className="space-y-4 p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium text-slate-700 flex items-center gap-2">
                  <BedDouble size={18} className="text-purple-600" />
                  宿舍检查
                </h4>

                {/* 楼栋/楼层 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">选择楼栋</label>
                    <div className="flex flex-wrap gap-2">
                      {buildings.map(building => (
                        <button
                          key={building.name}
                          type="button"
                          onClick={async () => {
                            setSelectedBuilding(building);
                            setBuildings(buildings.map(b => ({ ...b, isSelected: b.name === building.name })));
                            setSelectedFloor(null);
                            setSelectedRoom('');
                            setDormStudents([]);
                            await loadDormFloors(building.name);
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                            selectedBuilding?.name === building.name ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {building.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">选择楼层</label>
                    <div className="flex flex-wrap gap-2">
                      {floors.map(floor => (
                        <button
                          key={floor.name}
                          type="button"
                          onClick={async () => {
                            setSelectedFloor(floor);
                            setFloors(floors.map(f => ({ ...f, isSelected: f.name === floor.name })));
                            setSelectedRoom('');
                            setDormStudents([]);
                            if (selectedBuilding) {
                              await loadDormRooms(selectedBuilding.name, floor.value);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                            selectedFloor?.name === floor.name ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {floor.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 房间选择 */}
                {selectedFloor && (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">选择房间</label>
                    <div className="flex flex-wrap gap-2">
                      {rooms.map(room => (
                        <button
                          key={room.name}
                          type="button"
                          onClick={async () => {
                            setSelectedRoom(room.name);
                            setRooms(rooms.map(r => ({ ...r, isSelected: r.name === room.name })));
                            if (selectedBuilding && selectedFloor) {
                              await loadDormStudents(selectedBuilding.name, selectedFloor.value, room.name);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            selectedRoom === room.name ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {room.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 床位选择 */}
                {selectedRoom && dormStudents.length > 0 && (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">选择床位（可多选）</label>
                    <div className="flex flex-wrap gap-2">
                      {dormStudents.map((bed, index) => (
                        <button
                          key={bed.id}
                          type="button"
                          onClick={() => toggleBed(bed.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                            bed.isSelected ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          🛏️ 床位 {bed.bed_no || index + 1}: {bed.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 宿舍检查指标 */}
                <div className="pt-4 border-t border-purple-200">
                  <h4 className="font-medium text-slate-700 mb-3">选择检查指标</h4>

                  <div className="mb-3">
                    <label className="block text-sm text-slate-600 mb-2">指标大项</label>
                    <div className="flex flex-wrap gap-2">
                      {dormData.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setDormCategory(cat.name);
                            setDormDetailItems(cat.items?.map(item => ({ ...item, isSelected: false })) || []);
                            setSelectedDormItems([]);
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            dormCategory === cat.name ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {dormCategory && dormDetailItems.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">具体指标（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {dormDetailItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (selectedDormItems.includes(item.name)) {
                                setSelectedDormItems(selectedDormItems.filter(i => i !== item.name));
                              } else {
                                setSelectedDormItems([...selectedDormItems, item.name]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedDormItems.includes(item.name)
                                ? 'bg-purple-600 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-purple-50'
                            }`}
                          >
                            {selectedDormItems.includes(item.name) && '✓ '}{item.name} ({item.default_score}分)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 整体检查 */}
            {selectedType === 'overall' && (
              <div className="space-y-4 p-4 bg-indigo-50 rounded-lg">
                <h4 className="font-medium text-slate-700 flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600" />
                  整体检查
                </h4>

                {/* 模式选择 */}
                <div>
                  <label className="block text-sm text-slate-600 mb-2">检查模式</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'CLASS', label: '班级检查', icon: '🎓' },
                      { id: 'SUBJECT', label: '学科检查', icon: '📚' },
                      { id: 'DORM', label: '宿舍检查', icon: '🏢' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setOverallModule(mode.id as any);
                          setSelectedOverallClasses([]);
                          setSelectedSubjects([]);
                          setSelectedOverallRooms([]);
                          setSelectedOverallItems([]);
                          setOverallCategory('');
                          setOverallSubCategory('');
                          // 切换模块时重新初始化指标
                          if (overallData[mode.id]) {
                            const moduleData = overallData[mode.id];
                            if (moduleData.categories) {
                              setOverallCategories(moduleData.categories.map((cat: any) => ({
                                name: cat.name,
                                subCategories: cat.subCategories || []
                              })));
                            }
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          overallModule === mode.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        <span>{mode.icon}</span>
                        <span>{mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 班级检查模式 */}
                {overallModule === 'CLASS' && (
                  <>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">选择年级</label>
                      <div className="flex flex-wrap gap-2">
                        {grades.map(grade => (
                          <button
                            key={grade.id}
                            type="button"
                            onClick={() => {
                              setOverallGrade(grade);
                              const gradeClasses = allClasses.filter(c => c.gradeId === grade.id);
                              setOverallClasses(gradeClasses);
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                              overallGrade?.id === grade.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {grade.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">选择班级（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {overallClasses.map(cls => (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => {
                              if (selectedOverallClasses.includes(cls.id)) {
                                setSelectedOverallClasses(selectedOverallClasses.filter(id => id !== cls.id));
                              } else {
                                setSelectedOverallClasses([...selectedOverallClasses, cls.id]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedOverallClasses.includes(cls.id) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {cls.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 学科检查模式 */}
                {overallModule === 'SUBJECT' && (
                  <>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">选择年级</label>
                      <div className="flex flex-wrap gap-2">
                        {grades.map(grade => (
                          <button
                            key={grade.id}
                            type="button"
                            onClick={async () => {
                              setOverallGrade(grade);
                              // 加载该年级的教研组
                              const res: any = await api.get('/api/org/teachers/all', { params: { page_size: 200, grade: grade.name } });
                              const teachersList = res.teachers || [];
                              const grouped: Record<string, boolean> = {};
                              teachersList.forEach((t: any) => {
                                if (t.subject) grouped[t.subject] = true;
                              });
                              setSubjects(Object.keys(grouped).map(name => ({ name, isSelected: false })));
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                              overallGrade?.id === grade.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {grade.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">选择学科组（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {subjects.map(sub => (
                          <button
                            key={sub.name}
                            type="button"
                            onClick={() => {
                              if (selectedSubjects.includes(sub.name)) {
                                setSelectedSubjects(selectedSubjects.filter(s => s !== sub.name));
                              } else {
                                setSelectedSubjects([...selectedSubjects, sub.name]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedSubjects.includes(sub.name) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {sub.name}组
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 宿舍检查模式 */}
                {overallModule === 'DORM' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">选择楼栋</label>
                        <div className="flex flex-wrap gap-2">
                          {buildings.map(building => (
                            <button
                              key={building.name}
                              type="button"
                              onClick={async () => {
                                setOverallBuilding(building);
                                await loadDormFloors(building.name);
                              }}
                              className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                                overallBuilding?.name === building.name ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                              }`}
                            >
                              {building.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">选择楼层</label>
                        <div className="flex flex-wrap gap-2">
                          {floors.map(floor => (
                            <button
                              key={floor.name}
                              type="button"
                              onClick={async () => {
                                setOverallFloor(floor);
                                if (overallBuilding) {
                                  await loadDormRooms(overallBuilding.name, floor.value);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                                overallFloor?.name === floor.name ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                              }`}
                            >
                              {floor.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">选择房间（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {rooms.map(room => (
                          <button
                            key={room.name}
                            type="button"
                            onClick={() => {
                              if (selectedOverallRooms.includes(room.name)) {
                                setSelectedOverallRooms(selectedOverallRooms.filter(r => r !== room.name));
                              } else {
                                setSelectedOverallRooms([...selectedOverallRooms, room.name]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedOverallRooms.includes(room.name) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {room.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 整体检查指标 */}
                <div className="pt-4 border-t border-indigo-200">
                  <h4 className="font-medium text-slate-700 mb-3">选择评价/扣分项</h4>

                  {/* 大项选择 */}
                  <div className="mb-3">
                    <label className="block text-sm text-slate-600 mb-2">指标大项</label>
                    <div className="flex flex-wrap gap-2">
                      {overallCategories.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setOverallCategory(cat.name);
                            setOverallSubCategory('');
                            // 班级模块：显示小项
                            if (overallModule === 'CLASS' && cat.subCategories) {
                              setOverallSubItems(cat.subCategories.map(s => ({ name: s.name })));
                              setOverallDetailItems([]);
                            } else {
                              // 学科/宿舍模块：直接显示指标
                              setOverallSubItems([]);
                              // 需要从 overallItems 中筛选
                              const items = overallItems.filter(item => item.category === cat.name);
                              setOverallDetailItems(items.map(item => ({ ...item, isSelected: selectedOverallItems.includes(String(item.indicator_id || item.id)) })));
                            }
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            overallCategory === cat.name ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 小项选择（仅班级模块） */}
                  {overallModule === 'CLASS' && overallCategory && overallSubItems.length > 0 && (
                    <div className="mb-3">
                      <label className="block text-sm text-slate-600 mb-2">小项</label>
                      <div className="flex flex-wrap gap-2">
                        {overallSubItems.map(sub => (
                          <button
                            key={sub.name}
                            type="button"
                            onClick={() => {
                              setOverallSubCategory(sub.name);
                              const items = overallItems.filter(item => 
                                item.category === overallCategory && item.subCategory === sub.name
                              );
                              setOverallDetailItems(items.map(item => ({ 
                                ...item, 
                                isSelected: selectedOverallItems.includes(String(item.indicator_id || item.id)) 
                              })));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              overallSubCategory === sub.name ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 具体指标 */}
                  {overallDetailItems.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">具体指标（可多选）</label>
                      <div className="flex flex-wrap gap-2">
                        {overallDetailItems.map(item => {
                          const itemKey = String(item.indicator_id || item.id);
                          return (
                            <button
                              key={itemKey}
                              type="button"
                              onClick={() => {
                                if (selectedOverallItems.includes(itemKey)) {
                                  setSelectedOverallItems(selectedOverallItems.filter(i => i !== itemKey));
                                } else {
                                  setSelectedOverallItems([...selectedOverallItems, itemKey]);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                selectedOverallItems.includes(itemKey)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50'
                              }`}
                            >
                              {selectedOverallItems.includes(itemKey) && '✓ '}{item.name} ({item.default_score}分)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 备注 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">情况说明/备注</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border border-slate-300 rounded-md p-2"
                placeholder="请详细描述违规或表彰的具体情况..."
              ></textarea>
            </div>

            {/* 提交按钮 */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
              >
                <FileText size={16} />
                保存草稿
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      record_time: getBeijingDate(),
                      description: ''
                    });
                    setSelectedStudents([]);
                    setSelectedMoralItems([]);
                    setSelectedTeachers([]);
                    setSelectedTeachingItems([]);
                    setSelectedDormItems([]);
                    setSelectedOverallItems([]);
                  }}
                  className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  重置
                </button>
                <button
                  type="submit"
                  disabled={formStatus === 'saving' || formStatus === 'saved'}
                  className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    formStatus === 'saved' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {formStatus === 'saving' && <span className="animate-spin mr-2">⏳</span>}
                  {formStatus === 'saved' && <CheckCircle className="mr-2 h-4 w-4" />}
                  {formStatus === 'idle' && <Save className="mr-2 h-4 w-4" />}
                  {formStatus === 'idle' ? '提交记录' : formStatus === 'saving' ? '提交中...' : '提交成功'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </>
  );
};

export default DataCollection;
