/**
 * 数据服务模块
 * 统一管理从API获取的数据，提供缓存机制
 */

const api = require('./api.js');

// 缓存数据
const cache = {
  orgTree: null,
  moralIndicators: null,
  teachingIndicators: null,
  dormIndicators: null,
  overallIndicators: null,
  teachers: null,
  dormBuildings: null
};

// 缓存过期时间（毫秒）
const CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟

// 缓存时间戳
const cacheTimestamp = {
  orgTree: 0,
  moralIndicators: 0,
  teachingIndicators: 0,
  dormIndicators: 0,
  overallIndicators: 0,
  teachers: 0,
  dormBuildings: 0
};

/**
 * 检查缓存是否有效
 */
function isCacheValid(key) {
  return cache[key] !== undefined && cache[key] !== null && (Date.now() - (cacheTimestamp[key] || 0) < CACHE_EXPIRE_TIME);
}

/**
 * 设置缓存
 */
function setCache(key, data) {
  cache[key] = data;
  cacheTimestamp[key] = Date.now();
}

/**
 * 清除缓存
 */
function clearCache(key) {
  if (key) {
    cache[key] = null;
    cacheTimestamp[key] = 0;
  } else {
    // 清除所有缓存
    Object.keys(cache).forEach(k => {
      cache[k] = null;
      cacheTimestamp[k] = 0;
    });
  }
}

const dataService = {
  /**
   * 获取组织树
   */
  async getOrgTree() {
    if (isCacheValid('orgTree')) {
      return cache.orgTree;
    }
    
    try {
      const tree = await api.getOrgTree();
      setCache('orgTree', tree);
      return tree;
    } catch (error) {
      console.error('获取组织树失败:', error);
      return [];
    }
  },

  /**
   * 获取年级列表
   */
  async getGrades() {
    const tree = await this.getOrgTree();
    const grades = [];
    
    const traverse = (nodes) => {
      if (!nodes || !Array.isArray(nodes)) return;
      nodes.forEach(node => {
        if (node.type === 'grade') {
          grades.push({
            id: node.id,
            name: node.name
          });
        }
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    
    traverse(tree);
    return grades;
  },

  /**
   * 获取指定年级下的班级列表
   */
  async getClassesByGrade(gradeId) {
    if (!gradeId) return [];
    
    try {
      const classes = await api.getOrgClasses(gradeId);
      return classes || [];
    } catch (error) {
      console.error('获取班级列表失败:', error);
      return [];
    }
  },

  /**
   * 获取德育指标结构（三级）
   * @param {number} orgId - 学校ID，传null则获取全集团通用指标
   */
  async getMoralIndicators(orgId = null) {
    // 缓存key需要包含orgId以区分不同学校
    const cacheKey = orgId ? `moralIndicators_${orgId}` : 'moralIndicators';
    
    if (isCacheValid(cacheKey)) {
      return cache[cacheKey];
    }
    
    try {
      const res = await api.getMoralIndicatorsReportStructure(orgId);
      const data = res.categories || [];
      setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('获取德育指标失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取教学指标结构
   */
  async getTeachingIndicators() {
    if (isCacheValid('teachingIndicators')) {
      return cache.teachingIndicators;
    }
    
    try {
      const res = await api.getTeachingIndicatorsStructure();
      const data = res.categories || [];
      setCache('teachingIndicators', data);
      return data;
    } catch (error) {
      console.error('获取教学指标失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取宿舍指标结构
   */
  async getDormIndicators() {
    if (isCacheValid('dormIndicators')) {
      return cache.dormIndicators;
    }
    
    try {
      const res = await api.getDormIndicators();
      const data = res.categories || [];
      setCache('dormIndicators', data);
      return data;
    } catch (error) {
      console.error('获取宿舍指标失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取整体检查指标
   */
  async getOverallIndicators() {
    if (isCacheValid('overallIndicators')) {
      return cache.overallIndicators;
    }
    
    try {
      const res = await api.getOverallIndicators();
      const data = res.indicators || {};
      setCache('overallIndicators', data);
      return data;
    } catch (error) {
      console.error('获取整体检查指标失败:', error);
      return {}; // 返回空对象，不使用mock数据
    }
  },

  /**
   * 获取所有教师
   * @param {string} grade - 年级名称，可选，传入时只返回该年级的教师
   */
  async getAllTeachers(grade = null) {
    // 如果有年级参数，不使用缓存，直接请求
    if (!grade && isCacheValid('teachers')) {
      return cache.teachers;
    }
    
    try {
      const res = await api.getAllTeachers(200, grade);
      const teachers = res.teachers || [];
      // 只有获取全部教师时才缓存
      if (!grade) {
        setCache('teachers', teachers);
      }
      return teachers;
    } catch (error) {
      console.error('获取教师列表失败:', error);
      return [];
    }
  },

  /**
   * 获取按学科分组的教师
   * @param {string} grade - 年级名称，可选，传入时只返回该年级的教师
   */
  async getTeachersBySubject(grade = null) {
    const teachers = await this.getAllTeachers(grade);
    
    const grouped = {};
    teachers.forEach(teacher => {
      const name = teacher.real_name || teacher.name || teacher.username;
      const subject = teacher.subject || '其他';
      
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      // 使用 teacher_id（BaseTeacher.id）作为教学记录的教师ID
      grouped[subject].push({
        id: teacher.teacher_id || teacher.id,  // 优先使用 teacher_id
        user_id: teacher.id,  // SysUser.id
        name: name,
        subject: subject,
        org_id: teacher.org_id
      });
    });
    
    return grouped;
  },

  /**
   * 获取宿舍楼栋列表
   */
  async getDormBuildings() {
    if (isCacheValid('dormBuildings')) {
      return cache.dormBuildings;
    }
    
    try {
      const res = await api.getDormBuildings();
      const buildings = res.buildings || [];
      setCache('dormBuildings', buildings);
      return buildings;
    } catch (error) {
      console.error('获取宿舍楼栋失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取宿舍楼层列表
   */
  async getDormFloors(building) {
    try {
      const res = await api.getDormFloors(building);
      return res.floors || [];
    } catch (error) {
      console.error('获取楼层失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取宿舍房间列表
   */
  async getDormRooms(building, floor) {
    try {
      const res = await api.getDormRooms(building, floor);
      return res.rooms || [];
    } catch (error) {
      console.error('获取房间失败:', error);
      return []; // 返回空数组，不使用mock数据
    }
  },

  /**
   * 获取房间学生列表
   */
  async getDormStudents(building, floor, room) {
    try {
      const res = await api.getDormStudents(building, floor, room);
      return res.students || [];
    } catch (error) {
      console.error('获取房间学生失败:', error);
      return [];
    }
  },

  /**
   * 获取班级座位表
   * 支持两种数据格式：
   * 1. layout 格式（二维网格）- 直接返回
   * 2. groups 格式（分组形式）- 转换为 layout 格式
   * 
   * 返回值包含 layout 和 students，用于匹配学生真实ID
   */
  async getSeatingChart(classId) {
    try {
      console.log(`[DEBUG] getSeatingChart: 开始获取班级 ${classId} 的座位表`);
      const res = await api.getSeatingChart(classId);
      console.log('[DEBUG] getSeatingChart: API返回', JSON.stringify(res));
      
      const seatingChart = res.seating_chart;
      const students = res.students || []; // 后端返回的学生列表
      
      console.log(`[DEBUG] getSeatingChart: seating_chart存在=${!!seatingChart}, students数量=${students.length}`);
      
      if (!seatingChart) {
        console.log('[DEBUG] getSeatingChart: 无座位表数据');
        return { layout: null, students };
      }
      
      // 如果已有 layout 格式，使用学生列表匹配ID
      if (seatingChart.layout && Array.isArray(seatingChart.layout)) {
        console.log('[DEBUG] getSeatingChart: 使用layout格式');
        const layout = this.matchStudentIds(seatingChart.layout, students);
        return { layout, students };
      }
      
      // 如果是 groups 格式，转换为 layout 格式并匹配ID
      if (seatingChart.groups && Array.isArray(seatingChart.groups)) {
        console.log('[DEBUG] getSeatingChart: 使用groups格式');
        const layout = this.convertGroupsToLayout(seatingChart.groups, students);
        return { layout, students };
      }
      
      console.log('[DEBUG] getSeatingChart: 未知格式');
      return { layout: null, students };
    } catch (error) {
      console.error('获取座位表失败:', error);
      return { layout: null, students: [] };
    }
  },
  
  /**
   * 使用学生列表匹配真实学生ID
   * 解决座位表数据中学生ID缺失的问题
   */
  matchStudentIds(layout, students) {
    if (!students || students.length === 0) {
      console.log('[DEBUG] matchStudentIds: 学生列表为空');
      return layout;
    }
    
    console.log('[DEBUG] matchStudentIds: 学生数量', students.length);
    
    // 创建姓名到学生ID的映射
    const nameToIdMap = {};
    students.forEach(s => {
      if (s.name && s.id) {
        nameToIdMap[s.name] = String(s.id);
        console.log(`[DEBUG] matchStudentIds: 映射 ${s.name} -> ${s.id}`);
      }
    });
    
    return layout.map(row => 
      row.map(student => {
        const studentName = student.name || '';
        const currentId = String(student.id || '');
        
        // 检查是否为临时ID（以特定前缀开头）
        const isTemporaryId = currentId.startsWith('student_') || 
                              currentId.startsWith('student-') ||
                              currentId.startsWith('seat-') ||
                              currentId.startsWith('temp_');
        
        // 如果已有真实ID，直接使用
        if (currentId && !isTemporaryId) {
          console.log(`[DEBUG] matchStudentIds: ${studentName} 已有真实ID: ${currentId}`);
          return student;
        }
        
        // 通过姓名匹配真实ID
        const realId = nameToIdMap[studentName];
        if (realId) {
          console.log(`[DEBUG] matchStudentIds: ${studentName} 匹配到ID: ${realId}`);
          return { ...student, id: realId };
        }
        
        console.log(`[DEBUG] matchStudentIds: ${studentName} 未匹配到ID`);
        return student;
      })
    );
  },
  
  /**
   * 将 Web 端 groups 格式转换为小程序 layout 格式
   * groups: [{ id: 1, name: '第1组', students: ['张三', '李四', ...] }, ...]
   * layout: [[{id, name, coord}, ...], ...]
   * 
   * @param {Array} groups - 分组数据
   * @param {Array} students - 学生列表（用于匹配真实ID）
   */
  convertGroupsToLayout(groups, students = []) {
    const layout = [];
    const COLS = 9; // 每行最多9列（对应 A-I）
    const colLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    
    console.log('[DEBUG] convertGroupsToLayout: 学生数量', students?.length || 0);
    console.log('[DEBUG] convertGroupsToLayout: students', JSON.stringify(students));
    
    // 创建姓名到学生ID的映射
    const nameToIdMap = {};
    students.forEach(s => {
      if (s.name && s.id) {
        nameToIdMap[s.name] = String(s.id);
        console.log(`[DEBUG] convertGroupsToLayout: 映射 ${s.name} -> ${s.id}`);
      }
    });
    
    let rowIndex = 0;
    let colIndex = 0;
    let currentRow = [];
    
    groups.forEach((group, groupIdx) => {
      if (!group.students || !Array.isArray(group.students)) return;
      
      group.students.forEach((student, studentIdx) => {
        const studentName = typeof student === 'string' ? student : (student.name || '');
        
        console.log(`[DEBUG] convertGroupsToLayout: 处理学生 [${groupIdx},${studentIdx}] name=${studentName}, raw=`, student);
        
        // 判断是否为真实学生ID
        let studentId;
        if (typeof student === 'object' && student.id) {
          const idStr = String(student.id);
          // 检查是否为临时ID格式
          const isTemporaryId = idStr.startsWith('student_') || 
                               idStr.startsWith('student-') ||
                               idStr.startsWith('seat-') ||
                               idStr.startsWith('temp_');
          if (!isTemporaryId) {
            studentId = idStr;
            console.log(`[DEBUG] convertGroupsToLayout: 使用对象中的ID: ${studentId}`);
          }
        }
        
        // 通过姓名匹配
        if (!studentId && nameToIdMap[studentName]) {
          studentId = String(nameToIdMap[studentName]);
          console.log(`[DEBUG] convertGroupsToLayout: 通过姓名匹配到ID: ${studentName} -> ${studentId}`);
        }
        
        // 使用临时ID作为最后选择
        if (!studentId) {
          studentId = `student_${groupIdx}_${studentIdx}`;
          console.log(`[DEBUG] convertGroupsToLayout: 使用临时ID: ${studentId}`);
        }
        
        currentRow.push({
          id: studentId,
          name: studentName,
          coord: `${colLabels[colIndex]}-${rowIndex + 1}`
        });
        
        colIndex++;
        
        // 每行满9列后换行
        if (colIndex >= COLS) {
          layout.push(currentRow);
          currentRow = [];
          colIndex = 0;
          rowIndex++;
        }
      });
    });
    
    // 处理最后一行（可能不满9列）
    if (currentRow.length > 0) {
      layout.push(currentRow);
    }
    
    console.log('[DEBUG] convertGroupsToLayout: 最终layout', JSON.stringify(layout));
    return layout;
  },

  /**
   * 获取组织下的学生
   */
  async getOrgStudents(orgId, page = 1, pageSize = 100) {
    try {
      const res = await api.getOrgStudents(orgId, page, pageSize);
      return {
        students: res.students || [],
        total: res.total || 0
      };
    } catch (error) {
      console.error('获取学生列表失败:', error);
      return { students: [], total: 0 };
    }
  },

  /**
   * 清除缓存
   */
  clearCache,

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return api.isLoggedIn();
  },

  /**
   * 获取当前用户信息
   */
  getUserInfo() {
    return api.getUserInfo();
  }
};

module.exports = dataService;
