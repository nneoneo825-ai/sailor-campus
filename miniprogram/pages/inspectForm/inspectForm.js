const api = require('../../utils/api.js');
const dataService = require('../../utils/dataService.js');

// 常量（仅用于后备）
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

Page({
  data: {
    type: '',
    typeLabel: '',
    
    // 表单数据
    target: '',
    category: '',
    subCategory: '',
    selectedMoralItems: [],
    selectedTeachingItems: [],
    selectedDormItems: [],
    selectedOverallItems: [],
    description: '',
    score: 0,
    
    // 选择状态
    selectedGrade: null,
    selectedGradeId: null,
    selectedClasses: [],
    selectedClassIds: [],
    selectedSubjects: [],
    selectedItems: [],
    selectedBuilding: '',
    selectedFloor: null,
    selectedRoom: '',
    selectedRooms: [],  // 宿舍号多选（整体检查宿舍模块用）
    
    // 整体检查模块
    overallModule: 'CLASS',
    
    // UI状态
    isSubmitting: false,
    isSuccess: false,
    isOffline: false,
    isLoading: true,
    
    // GPS位置信息
    location: null,
    locationName: '',
    
    // 从API加载的数据
    grades: [],
    classes: [],
    buildings: [],
    floors: [],
    rooms: [],
    colLabels: COL_LABELS,
    studentsGrid: [],
    dormStudents: [],
    teachingMembers: [],
    subjects: [],  // 教研组列表（整体检查学科模块用）

    // 德育指标数据
    moralCategories: [],
    moralSubItems: [],
    moralDetailItems: [],
    moralData: null, // 完整的德育指标数据

    // 教学指标数据
    teachingCategories: [],
    teachingDetailItems: [],
    teachingData: null,

    // 宿舍指标数据
    dormCategories: [],
    dormDetailItems: [],
    dormData: null,

    // 整体检查数据
    overallItems: [],
    overallData: null,
    overallCategory: '',  // 当前选中的大项分类
    overallSubCategory: '',  // 当前选中的小项分类
    overallSubItems: [],  // 当前大项下的小项列表
    overallDetailItems: [],  // 当前小项下的具体指标

    // 组织树数据
    orgTree: [],
    allClasses: [],
    
    // 当前学校ID（从用户信息获取，默认第一中学=2）
    currentSchoolId: null,
    currentSchoolName: ''
  },

  onLoad(options) {
    const type = options.type || 'moral';
    const typeLabels = {
      'moral': '德育检查',
      'teaching': '教学评价',
      'dorm': '宿舍检查',
      'overall': '整体检查'
    };
    
    // 从用户信息获取学校ID
    const userInfo = api.getUserInfo();
    const schoolId = userInfo?.school_id || userInfo?.org_id || 2;
    const schoolName = userInfo?.school_name || userInfo?.org_name || '第一中学';
    
    this.setData({
      type: type,
      typeLabel: typeLabels[type] || '检查录入',
      currentSchoolId: schoolId,
      currentSchoolName: schoolName
    });
    
    console.log(`当前用户学校: ${schoolName} (ID: ${schoolId})`);
    
    this.checkNetworkStatus();
    this.getLocation();
    this.loadAllData();
  },

  // 加载所有数据
  async loadAllData() {
    this.setData({ isLoading: true });
    
    try {
      // 始终加载组织树（用于年级班级选择）
      await this.loadOrgTree();
      
      // 根据类型加载不同数据
      if (this.data.type === 'moral') {
        await this.loadMoralData();
      } else if (this.data.type === 'teaching') {
        await this.loadTeachingData();
      } else if (this.data.type === 'dorm') {
        await this.loadDormData();
      } else if (this.data.type === 'overall') {
        await this.loadOverallData();
      }
      
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 加载组织树
  async loadOrgTree() {
    try {
      const tree = await dataService.getOrgTree();
      this.setData({ orgTree: tree });
      
      // 解析年级和班级
      this.parseGradesAndClasses(tree);
    } catch (error) {
      console.error('加载组织树失败:', error);
    }
  },

  // 解析年级和班级
  parseGradesAndClasses(tree) {
    const grades = [];
    const allClasses = [];
    // 使用用户所属学校ID（已在onLoad中设置）
    const targetSchoolId = this.data.currentSchoolId;
    const targetSchoolName = this.data.currentSchoolName;
    
    // 判断是否为年级组（支持 type='grade' 或 type='department' 且名称包含"年级"）
    const isGradeNode = (node) => {
      return node.type === 'grade' || 
             (node.type === 'department' && node.name && node.name.includes('年级'));
    };
    
    const traverse = (nodes, parentSchoolId = null, parentSchoolName = null) => {
      if (!nodes || !Array.isArray(nodes)) return;
      
      nodes.forEach(node => {
        // 确定当前节点的学校信息
        let currentSchoolId = parentSchoolId;
        let currentSchoolName = parentSchoolName;
        
        if (node.type === 'school') {
          currentSchoolId = node.id;
          currentSchoolName = node.name;
        }
        
        // 检查是否为年级节点
        if (isGradeNode(node)) {
          // 如果设置了目标学校ID，只收集该学校的年级
          if (targetSchoolId && currentSchoolId !== targetSchoolId) {
            // 继续遍历子节点，可能包含其他学校的年级
            if (node.children) {
              traverse(node.children, currentSchoolId, currentSchoolName);
            }
            return;
          }
          
          grades.push({
            id: node.id,
            name: node.name,
            isSelected: false,
            schoolId: currentSchoolId,
            schoolName: currentSchoolName
          });
          
          // 收集该年级下的班级
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
              if (child.type === 'class') {
                allClasses.push({
                  id: child.id,
                  name: child.name,
                  gradeId: node.id,
                  gradeName: node.name,
                  schoolId: currentSchoolId,
                  schoolName: currentSchoolName,
                  isSelected: false
                });
              }
            });
          }
        }
        
        // 递归遍历子节点
        if (node.children && !isGradeNode(node)) {
          traverse(node.children, currentSchoolId, currentSchoolName);
        }
      });
    };
    
    traverse(tree);
    
    console.log(`解析组织树完成: ${grades.length}个年级, ${allClasses.length}个班级, 当前学校: ${targetSchoolName}(${targetSchoolId})`);
    
    // 如果没有找到年级，可能是用户信息中的 school_id 不在组织树中
    // 尝试收集所有年级（不限学校）
    if (grades.length === 0 && targetSchoolId) {
      console.log('未找到目标学校的年级，尝试收集所有年级...');
      const allGrades = [];
      const allClassesAll = [];
      
      const collectAll = (nodes, schoolId = null, schoolName = null) => {
        if (!nodes || !Array.isArray(nodes)) return;
        
        nodes.forEach(node => {
          let sid = schoolId;
          let sname = schoolName;
          
          if (node.type === 'school') {
            sid = node.id;
            sname = node.name;
          }
          
          if (isGradeNode(node)) {
            allGrades.push({
              id: node.id,
              name: node.name,
              isSelected: false,
              schoolId: sid,
              schoolName: sname
            });
            
            if (node.children) {
              node.children.forEach(child => {
                if (child.type === 'class') {
                  allClassesAll.push({
                    id: child.id,
                    name: child.name,
                    gradeId: node.id,
                    gradeName: node.name,
                    schoolId: sid,
                    schoolName: sname,
                    isSelected: false
                  });
                }
              });
            }
          }
          
          if (node.children) {
            collectAll(node.children, sid, sname);
          }
        });
      };
      
      collectAll(tree);
      
      if (allGrades.length > 0) {
        this.setData({
          grades: allGrades,
          allClasses: allClassesAll
        });
        console.log(`收集到所有年级: ${allGrades.length}个`);
      }
    } else {
      this.setData({
        grades,
        allClasses
      });
    }
    
    // 默认选中第一个年级
    if (this.data.grades.length > 0) {
      this.setData({
        selectedGrade: this.data.grades[0].name,
        selectedGradeId: this.data.grades[0].id
      });
      this.updateClassesForGrade(this.data.grades[0].id);
    }
  },

  // 更新指定年级的班级列表
  updateClassesForGrade(gradeId) {
    const classes = this.data.allClasses
      .filter(c => c.gradeId === gradeId)
      .map(c => ({
        ...c,
        isSelected: this.data.selectedClassIds.includes(c.id)
      }));
    
    this.setData({ classes });
  },

  // 加载德育相关数据
  async loadMoralData() {
    try {
      // 使用当前学校ID获取德育指标（第一中学 org_id=2）
      const moralData = await dataService.getMoralIndicators(this.data.currentSchoolId);
      
      const moralCategories = moralData.map(cat => ({
        name: cat.name,
        subCategories: cat.subCategories || []
      }));
      
      console.log(`加载德育指标 - 学校: ${this.data.currentSchoolName}, ID: ${this.data.currentSchoolId}, 指标数: ${moralData.length}`);
      
      this.setData({ 
        moralCategories, 
        moralData 
      });
      
      // 加载座位表
      if (this.data.classes.length > 0 && this.data.classes[0].id) {
        await this.loadSeatingChartForClass(this.data.classes[0].id);
      } else {
        this.loadDefaultSeatingChart();
      }
    } catch (error) {
      console.error('加载德育数据失败:', error);
    }
  },

  // 加载教学相关数据
  async loadTeachingData() {
    try {
      const teachingData = await dataService.getTeachingIndicators();
      
      const teachingCategories = teachingData.map(cat => cat.name);
      
      this.setData({ 
        teachingCategories, 
        teachingData 
      });
      
      // 加载教师数据
      await this.loadTeachersData();
    } catch (error) {
      console.error('加载教学数据失败:', error);
    }
  },

  // 加载教师数据
  async loadTeachersData() {
    try {
      const grouped = await dataService.getTeachersBySubject();
      
      const teachingMembers = Object.entries(grouped).map(([subject, teachers]) => {
        return [
          subject,
          teachers.map(t => ({
            name: t.name,
            id: `teacher-${t.id}`,
            teacher_id: t.id,
            isSelected: false
          }))
        ];
      });
      
      this.setData({ teachingMembers });
    } catch (error) {
      console.error('加载教师数据失败:', error);
    }
  },

  // 加载宿舍相关数据
  async loadDormData() {
    try {
      const [dormData, buildings] = await Promise.all([
        dataService.getDormIndicators(),
        dataService.getDormBuildings()
      ]);
      
      const dormCategories = dormData.map(cat => cat.name);
      
      const buildingsData = buildings.map(name => ({
        name,
        isSelected: name === buildings[0]
      }));
      
      this.setData({ 
        dormCategories, 
        dormData,
        buildings: buildingsData,
        selectedBuilding: buildings[0] || ''
      });
      
      // 加载第一个楼栋的楼层
      if (buildings[0]) {
        await this.loadDormFloors(buildings[0]);
      }
    } catch (error) {
      console.error('加载宿舍数据失败:', error);
    }
  },

  // 加载宿舍楼层
  async loadDormFloors(building) {
    try {
      const floors = await dataService.getDormFloors(building);
      
      const floorsData = floors.map(floor => ({
        name: `${floor}层`,
        value: floor,
        isSelected: floor === floors[0]
      }));
      
      this.setData({
        floors: floorsData,
        selectedFloor: floors[0]
      });
      
      if (floors[0]) {
        await this.loadDormRooms(building, floors[0]);
      }
    } catch (error) {
      console.error('加载楼层失败:', error);
    }
  },

  // 加载宿舍房间
  async loadDormRooms(building, floor) {
    try {
      const rooms = await dataService.getDormRooms(building, floor);
      
      const roomsData = rooms.map(name => ({
        name,
        isSelected: false
      }));
      
      this.setData({ rooms: roomsData });
    } catch (error) {
      console.error('加载房间失败:', error);
    }
  },

  // 加载整体检查相关数据
  async loadOverallData() {
    try {
      const overallData = await dataService.getOverallIndicators();
      
      // 初始化默认模块（班级检查）的指标列表
      const defaultModule = 'CLASS';
      const moduleData = overallData[defaultModule];
      
      // 构建分类列表（用于大项选择）
      let overallCategories = [];
      let overallItems = [];
      
      if (moduleData && moduleData.categories) {
        // 提取所有大项名称
        overallCategories = moduleData.categories.map(cat => ({
          name: cat.name,
          subCategories: cat.subCategories || []
        }));
        
        // 收集所有大项-小项-指标的数据（用于提交时查找）
        moduleData.categories.forEach(cat => {
          if (cat.subCategories && Array.isArray(cat.subCategories)) {
            cat.subCategories.forEach(subCat => {
              if (subCat.indicators && Array.isArray(subCat.indicators)) {
                subCat.indicators.forEach(item => {
                  overallItems.push({
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
      }
      
      // 加载教研组数据（用于学科模块）
      await this.loadSubjectsData();
      
      // 加载宿舍楼栋数据（用于宿舍模块）
      await this.loadDormBuildingsData();
      
      this.setData({ 
        overallCategories, 
        overallData,
        overallItems,
        overallCategory: '',
        overallSubCategory: '',
        overallSubItems: [],
        overallDetailItems: []
      });
      
      console.log(`加载整体检查指标 - ${defaultModule}模块，共 ${overallCategories.length} 个大项，${overallItems.length} 项指标`);
    } catch (error) {
      console.error('加载整体检查数据失败:', error);
    }
  },

  // 加载教研组数据
  async loadSubjectsData(gradeName = null) {
    try {
      const grouped = await dataService.getTeachersBySubject(gradeName);
      
      // 提取教研组名称列表
      const subjects = Object.keys(grouped).map(name => ({
        name,
        isSelected: false
      }));
      
      this.setData({ subjects });
      console.log(`加载教研组数据: ${gradeName || '全部'}，共 ${subjects.length} 个教研组`);
    } catch (error) {
      console.error('加载教研组数据失败:', error);
      // 使用默认教研组列表
      const defaultSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
      this.setData({
        subjects: defaultSubjects.map(name => ({ name, isSelected: false }))
      });
    }
  },

  // 加载宿舍楼栋数据（用于整体检查宿舍模块）
  async loadDormBuildingsData() {
    try {
      const buildings = await dataService.getDormBuildings();
      
      const buildingsData = buildings.map(name => ({
        name,
        isSelected: name === buildings[0]
      }));
      
      this.setData({ 
        buildings: buildingsData,
        selectedBuilding: buildings[0] || ''
      });
      
      // 加载第一个楼栋的楼层
      if (buildings[0]) {
        await this.loadDormFloors(buildings[0]);
      }
      
      console.log(`加载宿舍楼栋数据，共 ${buildings.length} 个楼栋`);
    } catch (error) {
      console.error('加载宿舍楼栋数据失败:', error);
    }
  },

  // 加载座位表
  async loadSeatingChartForClass(classId) {
    try {
      const { layout, students } = await dataService.getSeatingChart(classId);
      
      console.log('[DEBUG] 加载座位表 - 班级ID:', classId);
      console.log('[DEBUG] 学生列表:', students);
      console.log('[DEBUG] 座位表布局:', layout);
      
      if (layout) {
        // 创建姓名到学生ID的映射（用于二次验证）
        const nameToIdMap = {};
        if (students && students.length > 0) {
          students.forEach(s => {
            if (s.name && s.id) {
              nameToIdMap[s.name] = String(s.id);
              console.log(`[DEBUG] 学生映射: ${s.name} -> ${s.id}`);
            }
          });
        } else {
          console.log('[DEBUG] 警告: 学生列表为空');
        }
        
        const studentsGrid = layout.map((row, rowIndex) =>
          row.map((student, colIndex) => {
            const studentName = student.name || student;
            // 优先使用已有ID，其次通过姓名匹配，最后使用临时ID
            let studentId = student.id;
            // 学生ID可能是字符串格式的学号（如 "2024001"），只要非空就使用
            if (!studentId || studentId.startsWith('student_') || studentId.startsWith('student-')) {
              studentId = nameToIdMap[studentName] || `student-${rowIndex * 9 + colIndex}`;
            }
            console.log(`[DEBUG] 座位学生: ${studentName}, ID: ${studentId}`);
            return {
              name: studentName,
              id: String(studentId),
              coord: `${COL_LABELS[colIndex]}-${rowIndex + 1}`,
              isSelected: false
            };
          })
        );
        this.setData({ studentsGrid });
      } else {
        console.log('[DEBUG] 座位表为空，使用默认');
        this.loadDefaultSeatingChart();
      }
    } catch (error) {
      console.log('加载座位表失败:', error);
      this.loadDefaultSeatingChart();
    }
  },

  // 加载默认座位表
  loadDefaultSeatingChart() {
    // 生成空座位表
    const studentsGrid = Array(6).fill(null).map((_, rowIndex) =>
      Array(9).fill(null).map((_, colIndex) => ({
        name: '',
        id: `seat-${rowIndex * 9 + colIndex}`,
        coord: `${COL_LABELS[colIndex]}-${rowIndex + 1}`,
        isSelected: false
      }))
    );
    this.setData({ studentsGrid });
  },

  // 检查网络状态
  checkNetworkStatus() {
    wx.getNetworkType({
      success: (res) => {
        this.setData({ isOffline: res.networkType === 'none' });
      }
    });
    
    wx.onNetworkStatusChange((res) => {
      this.setData({ isOffline: !res.isConnected });
    });
  },

  // 获取GPS位置
  getLocation() {
    wx.getLocation({
      type: 'wgs84',
      success: (res) => {
        this.setData({
          location: { latitude: res.latitude, longitude: res.longitude },
          locationName: `${res.latitude.toFixed(4)}, ${res.longitude.toFixed(4)}`
        });
      },
      fail: () => {}
    });
  },

  // 更新目标
  updateTarget() {
    const { type, overallModule, selectedGrade, selectedClasses, selectedSubjects, 
            selectedBuilding, selectedFloor, selectedRoom, selectedItems } = this.data;
    
    let target = '';
    let category = '';
    
    if (type === 'overall') {
      if (overallModule === 'CLASS') {
        const classStr = selectedClasses.length > 0 ? selectedClasses.join(', ') : '未选择班级';
        target = `${selectedGrade || ''}: ${classStr}`;
        category = '班级检查';
      } else if (overallModule === 'SUBJECT') {
        const subStr = selectedSubjects.length > 0 ? selectedSubjects.join(', ') : '未选择学科组';
        target = `${selectedGrade || ''}: ${subStr}`;
        category = '学科检查';
      } else if (overallModule === 'DORM') {
        // 宿舍号多选显示
        const roomStr = this.data.selectedRooms.length > 0 
          ? this.data.selectedRooms.join(', ') 
          : '未选择房号';
        target = `${selectedBuilding || ''}${selectedFloor || ''}层: ${roomStr}`;
        category = '宿舍检查';
      }
    } else if (type === 'moral') {
      const classStr = selectedClasses.length > 0 ? selectedClasses.join(', ') : '';
      const seatStr = selectedItems.length > 0 ? `: ${selectedItems.map(s => s.name).join(', ')}` : '';
      target = `${selectedGrade || ''}${classStr}${seatStr}`;
    } else if (type === 'teaching') {
      const memberStr = selectedItems.length > 0 ? `: ${selectedItems.map(s => s.name).join(', ')}` : '';
      target = `${selectedGrade || ''}${memberStr}`;
    } else if (type === 'dorm') {
      const roomStr = selectedRoom || '';
      const bedStr = selectedItems.length > 0 ? ` (${selectedItems.map(s => s.name).join(', ')})` : '';
      target = `${selectedBuilding || ''}${selectedFloor || ''}层: ${roomStr}${bedStr}`;
    }
    
    this.setData({ target, category });
  },

  // 切换整体检查模块
  onModuleChange(e) {
    const module = e.currentTarget.dataset.module;
    this.setData({
      overallModule: module,
      selectedClasses: [],
      selectedClassIds: [],
      selectedSubjects: [],
      selectedRoom: '',
      selectedRooms: [],
      selectedOverallItems: [],
      category: '',
      overallItems: [],
      overallCategory: '',
      overallSubCategory: '',
      overallSubItems: [],
      overallDetailItems: []
    });
    
    // 更新整体检查指标
    if (this.data.overallData) {
      const moduleKey = module === 'CLASS' ? 'CLASS' : module === 'SUBJECT' ? 'SUBJECT' : 'DORM';
      const moduleData = this.data.overallData[moduleKey];
      
      let overallCategories = [];
      let overallItems = [];
      
      if (moduleData && moduleData.categories) {
        // 学科/宿舍模块使用二层结构（大项 -> 具体指标）
        if (module === 'SUBJECT' || module === 'DORM') {
          // 宿舍模块只筛选"寝室内务"和"午休晚休"两个类别
          const dormAllowedCategories = ['寝室内务', '午休晚休'];
          
          overallCategories = moduleData.categories
            .filter(cat => module === 'SUBJECT' || dormAllowedCategories.includes(cat.name))
            .map(cat => {
              // 宿舍模块需要将三层结构扁平化为二层
              if (cat.subCategories && !cat.items) {
                // 将所有小项的指标合并到items中
                const allItems = [];
                cat.subCategories.forEach(subCat => {
                  if (subCat.indicators && Array.isArray(subCat.indicators)) {
                    subCat.indicators.forEach(item => {
                      allItems.push({
                        ...item,
                        subCategory: subCat.name  // 保留小项信息用于显示
                      });
                    });
                  }
                });
                return { name: cat.name, items: allItems };
              }
              return { name: cat.name, items: cat.items || [] };
            });
          
          // 收集所有指标（二层结构）
          overallCategories.forEach(cat => {
            if (cat.items && Array.isArray(cat.items)) {
              cat.items.forEach(item => {
                const itemWithCategory = {
                  ...item,
                  category: cat.name,  // 大项名称（指标大项）
                  isSelected: false
                };
                console.log(`[收集指标] name: ${item.name}, category: ${itemWithCategory.category}`);
                overallItems.push(itemWithCategory);
              });
            }
          });
        } else {
          // 班级模块使用三层结构（大项 -> 小项 -> 具体指标）
          overallCategories = moduleData.categories.map(cat => ({
            name: cat.name,
            subCategories: cat.subCategories || []
          }));
          
          // 收集所有指标（三层结构）
          moduleData.categories.forEach(cat => {
            if (cat.subCategories && Array.isArray(cat.subCategories)) {
              cat.subCategories.forEach(subCat => {
                if (subCat.indicators && Array.isArray(subCat.indicators)) {
                  subCat.indicators.forEach(item => {
                    overallItems.push({
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
        }
      }
      
      this.setData({ 
        overallCategories,
        overallItems 
      });
      console.log(`切换到${moduleKey}模块，共 ${overallCategories.length} 个大项，${overallItems.length} 项指标`);
    }
    
    // 学科模块加载对应年级的教研组数据
    if (module === 'SUBJECT' && this.data.selectedGrade) {
      this.loadSubjectsData(this.data.selectedGrade);
    }
    
    // 宿舍模块加载宿舍数据（楼栋、楼层、房间）
    if (module === 'DORM') {
      this.loadDormData();
    }
    
    this.updateTarget();
  },

  // 选择整体检查大项分类
  onOverallCategorySelect(e) {
    const categoryName = e.currentTarget.dataset.category;
    const { overallModule, overallCategories, overallItems, selectedOverallItems } = this.data;
    
    // 学科/宿舍模块使用二层结构，直接显示具体指标
    if (overallModule === 'SUBJECT' || overallModule === 'DORM') {
      const categoryData = overallCategories?.find(c => c.name === categoryName);
      // 从 overallItems 中获取完整数据（包含 category 字段），而不是从 categoryData.items
      // 使用 indicator_id 匹配，防止不同分类下有同名指标
      const overallDetailItems = (categoryData?.items || []).map(item => {
        // 从 overallItems 中查找对应的完整数据（使用 indicator_id 精确匹配）
        const fullItem = overallItems.find(oi => oi.indicator_id === item.indicator_id) || 
                         overallItems.find(oi => oi.name === item.name) || item;
        // 使用 indicator_id 作为选中标识，防止同名指标冲突
        const itemKey = fullItem.indicator_id || fullItem.name;
        return {
          ...fullItem,
          category: fullItem.category || categoryName,  // 确保有 category 字段
          isSelected: selectedOverallItems.includes(itemKey)
        };
      });
      
      this.setData({
        overallCategory: categoryName,
        overallSubCategory: '',
        overallSubItems: [],
        overallDetailItems
      });
      
      console.log(`选择大项: ${categoryName}（${overallModule === 'SUBJECT' ? '学科' : '宿舍'}模块二层结构），共 ${overallDetailItems.length} 项指标`);
    } else {
      // 班级模块使用三层结构，先显示小项
      const categoryData = overallCategories?.find(c => c.name === categoryName);
      const overallSubItems = categoryData?.subCategories?.map(s => ({
        name: s.name,
        count: s.indicators?.length || 0
      })) || [];
      
      this.setData({
        overallCategory: categoryName,
        overallSubCategory: '',
        overallSubItems,
        overallDetailItems: []
      });
      
      console.log(`选择大项: ${categoryName}（三层结构），共 ${overallSubItems.length} 个小项`);
    }
  },

  // 选择整体检查小项分类
  onOverallSubCategorySelect(e) {
    const subCategoryName = e.currentTarget.dataset.sub;
    
    // 从 overallItems 中筛选出当前大项+小项下的指标
    const overallDetailItems = this.data.overallItems
      .filter(item => item.category === this.data.overallCategory && item.subCategory === subCategoryName)
      .map(item => ({
        ...item,
        // 使用 indicator_id 或 name 判断选中状态
        isSelected: this.data.selectedOverallItems.includes(item.indicator_id) || 
                    this.data.selectedOverallItems.includes(item.name)
      }));
    
    this.setData({
      overallSubCategory: subCategoryName,
      overallDetailItems
    });
    
    console.log(`选择小项: ${subCategoryName}，共 ${overallDetailItems.length} 项指标`);
  },

  // 选择年级
  onGradeSelect(e) {
    const { id, name } = e.currentTarget.dataset;
    const grades = this.data.grades.map(g => ({
      ...g,
      isSelected: g.id === id || g.name === name
    }));

    this.setData({
      selectedGrade: name,
      selectedGradeId: id,
      grades,
      selectedClasses: [],
      selectedClassIds: [],
      // 清空已选择的教师
      selectedItems: [],
      selectedSubjects: []
    });
    
    if (id) {
      this.updateClassesForGrade(id);
    }
    
    this.updateTarget();
    
    // 德育检查重新加载座位表
    if (this.data.type === 'moral' && this.data.classes.length > 0 && this.data.classes[0].id) {
      this.loadSeatingChartForClass(this.data.classes[0].id);
    }
    
    // 教学检查重新加载该年级的教师数据
    if (this.data.type === 'teaching') {
      this.loadTeachersDataByGrade(name);
    }
    
    // 整体检查学科模块重新加载该年级的教研组数据
    if (this.data.type === 'overall' && this.data.overallModule === 'SUBJECT') {
      this.loadSubjectsData(name);
    }
  },

  // 加载指定年级的教师数据
  async loadTeachersDataByGrade(gradeName) {
    try {
      const grouped = await dataService.getTeachersBySubject(gradeName);
      
      const teachingMembers = Object.entries(grouped).map(([subject, teachers]) => {
        return [
          subject,
          teachers.map(t => ({
            name: t.name,
            id: `teacher-${t.id}`,
            teacher_id: t.id,
            isSelected: false
          }))
        ];
      });
      
      this.setData({ teachingMembers });
      console.log(`加载年级教师数据: ${gradeName}, 共 ${teachingMembers.length} 个教研组`);
    } catch (error) {
      console.error('加载年级教师数据失败:', error);
    }
  },

  // 切换班级选择
  onClassToggle(e) {
    const { id, name } = e.currentTarget.dataset;
    
    // 德育检查使用单选
    if (this.data.type === 'moral') {
      // 如果点击已选中的班级，则取消选择
      const isAlreadySelected = this.data.selectedClassIds.includes(id);
      
      const classes = this.data.classes.map(c => ({
        ...c,
        isSelected: isAlreadySelected ? false : (c.id === id || c.name === name)
      }));
      
      // 切换班级时清空已选择的学生，避免数据混乱
      this.setData({ 
        selectedClasses: isAlreadySelected ? [] : [name], 
        selectedClassIds: isAlreadySelected ? [] : (id ? [id] : []), 
        selectedItems: [],  // 清空已选择的学生
        classes 
      });
      this.updateTarget();
      this.updateItemClasses();  // 更新座位表选中状态
      
      // 加载座位表
      if (!isAlreadySelected && id) {
        this.loadSeatingChartForClass(id);
      }
    } else {
      // 其他类型保持多选
      const selectedClasses = [...this.data.selectedClasses];
      const selectedClassIds = [...this.data.selectedClassIds];
      
      const nameIndex = selectedClasses.indexOf(name);

      if (nameIndex === -1) {
        selectedClasses.push(name);
        if (id) selectedClassIds.push(id);
      } else {
        selectedClasses.splice(nameIndex, 1);
        if (id) selectedClassIds.splice(selectedClassIds.indexOf(id), 1);
      }

      const classes = this.data.classes.map(c => ({
        ...c,
        isSelected: selectedClasses.includes(c.name)
      }));

      this.setData({ selectedClasses, selectedClassIds, classes });
      this.updateTarget();
    }
  },

  // 切换学科选择
  onSubjectToggle(e) {
    const subjectName = e.currentTarget.dataset.subject;
    const selectedSubjects = [...this.data.selectedSubjects];
    const index = selectedSubjects.indexOf(subjectName);

    if (index === -1) {
      selectedSubjects.push(subjectName);
    } else {
      selectedSubjects.splice(index, 1);
    }

    // 更新 subjects 数组中的选中状态
    const subjects = this.data.subjects.map(item => ({
      ...item,
      isSelected: selectedSubjects.includes(item.name)
    }));

    this.setData({ selectedSubjects, subjects });
    this.updateTarget();
  },

  // 选择楼栋
  async onBuildingSelect(e) {
    const building = e.currentTarget.dataset.building;
    const buildings = this.data.buildings.map(b => ({
      ...b,
      isSelected: b.name === building
    }));

    this.setData({
      selectedBuilding: building,
      selectedRoom: '',
      selectedRooms: [],
      selectedItems: [],
      buildings
    });
    
    await this.loadDormFloors(building);
    this.updateTarget();
  },

  // 选择楼层
  async onFloorSelect(e) {
    const floor = e.currentTarget.dataset.floor;
    const floorValue = e.currentTarget.dataset.value || parseInt(floor);
    
    const floors = this.data.floors.map(f => ({
      ...f,
      isSelected: f.name === floor || f.value === floorValue
    }));

    this.setData({
      selectedFloor: floorValue,
      selectedRoom: '',
      selectedRooms: [],
      selectedItems: [],
      floors
    });
    
    if (this.data.selectedBuilding && floorValue) {
      await this.loadDormRooms(this.data.selectedBuilding, floorValue);
    }
    this.updateTarget();
  },

  // 选择房间（多选，整体检查宿舍模块使用）
  async onRoomToggle(e) {
    const roomName = e.currentTarget.dataset.room;
    const { type } = this.data;
    
    // 宿舍检查类型（type === 'dorm'）保持单选
    if (type === 'dorm') {
      const selectedRoom = roomName;

      // 如果点击已选中的房间，则取消选择
      if (this.data.selectedRoom === roomName) {
        this.setData({ 
          selectedRoom: '', 
          selectedItems: [], 
          rooms: this.data.rooms.map(r => ({ ...r, isSelected: false })),
          dormStudents: []
        });
        this.updateTarget();
        return;
      }

      const rooms = this.data.rooms.map(r => ({
        ...r,
        isSelected: r.name === roomName
      }));

      this.setData({ selectedRoom, selectedItems: [], rooms });
      
      // 加载房间学生
      if (this.data.selectedBuilding && this.data.selectedFloor) {
        await this.loadRoomStudents(this.data.selectedBuilding, this.data.selectedFloor, roomName);
      }
      
      this.updateTarget();
      return;
    }
    
    // 整体检查宿舍模块使用多选
    const selectedRooms = [...this.data.selectedRooms];
    const index = selectedRooms.indexOf(roomName);

    if (index === -1) {
      selectedRooms.push(roomName);
    } else {
      selectedRooms.splice(index, 1);
    }

    // 更新 rooms 数组中的选中状态
    const rooms = this.data.rooms.map(r => ({
      ...r,
      isSelected: selectedRooms.includes(r.name)
    }));

    this.setData({ selectedRooms, rooms });
    this.updateTarget();
  },

  // 加载房间学生
  async loadRoomStudents(building, floor, room) {
    try {
      const students = await dataService.getDormStudents(building, floor, room);
      console.log('加载房间学生 - 原始数据:', students);
      
      const dormStudents = students.map(s => ({
        name: s.name,
        id: s.id,
        bed_no: s.bed_no,
        class_id: s.class_id,
        class_name: s.class_name,
        grade_name: s.grade_name,
        isSelected: false
      }));
      console.log('加载房间学生 - 处理后:', dormStudents);
      this.setData({ dormStudents });
    } catch (error) {
      console.log('加载房间学生失败:', error);
    }
  },

  // 切换学生/教师/床位选择
  onItemToggle(e) {
    const { id, name, teacher_id, classId, className, gradeName, bedNo } = e.currentTarget.dataset;
    const selectedItems = [...this.data.selectedItems];
    const index = selectedItems.findIndex(item => item.id === id);

    if (index === -1) {
      // 保存完整的选中项信息（包括 teacher_id 和班级信息）
      const itemData = { id, name };
      if (teacher_id) {
        itemData.teacher_id = teacher_id;
      }
      // 保存班级信息（宿舍检查用）
      if (classId !== undefined) {
        itemData.class_id = classId;
      }
      if (className !== undefined) {
        itemData.class_name = className;
      }
      if (gradeName !== undefined) {
        itemData.grade_name = gradeName;
      }
      // 保存床位号（宿舍检查用）
      if (bedNo !== undefined) {
        itemData.bed_no = bedNo;
      }
      selectedItems.push(itemData);
    } else {
      selectedItems.splice(index, 1);
    }

    this.setData({ selectedItems });
    this.updateItemClasses();
    this.updateTarget();
  },

  // 更新项目选中状态
  updateItemClasses() {
    const { selectedItems } = this.data;

    const dormStudents = this.data.dormStudents.map(item => ({
      ...item,
      isSelected: selectedItems.some(s => s.id === item.id)
    }));

    const teachingMembers = this.data.teachingMembers.map(group => {
      const [groupName, members] = group;
      return [
        groupName,
        members.map(member => ({
          ...member,
          isSelected: selectedItems.some(s => s.id === member.id)
        }))
      ];
    });

    const studentsGrid = this.data.studentsGrid.map(row =>
      row.map(student => ({
        ...student,
        isSelected: selectedItems.some(s => s.id === student.id)
      }))
    );

    this.setData({ dormStudents, teachingMembers, studentsGrid });
  },

  // 选择德育大项
  onMoralCategorySelect(e) {
    const category = e.currentTarget.dataset.category;
    
    // 从moralData中找到对应的大项数据
    const categoryData = this.data.moralData?.find(c => c.name === category);
    const moralSubItems = categoryData?.subCategories?.map(s => s.name) || [];
    
    this.setData({
      category,
      subCategory: '',
      selectedMoralItems: [],
      moralSubItems,
      moralDetailItems: [],
      currentMoralCategoryData: categoryData
    });
  },

  // 选择德育小项
  onMoralSubCategorySelect(e) {
    const subCategory = e.currentTarget.dataset.sub;
    
    // 从当前大项数据中找到小项数据
    const subData = this.data.currentMoralCategoryData?.subCategories?.find(s => s.name === subCategory);
    const moralDetailItems = subData?.indicators?.map(ind => ({
      ...ind,
      isSelected: this.data.selectedMoralItems.includes(ind.name)
    })) || [];
    
    this.setData({
      subCategory,
      selectedMoralItems: [],
      moralDetailItems
    });
  },

  // 切换德育指标
  onMoralItemToggle(e) {
    const itemName = e.currentTarget.dataset.item;
    const selectedMoralItems = [...this.data.selectedMoralItems];
    const index = selectedMoralItems.indexOf(itemName);

    if (index === -1) {
      selectedMoralItems.push(itemName);
    } else {
      selectedMoralItems.splice(index, 1);
    }

    const moralDetailItems = this.data.moralDetailItems.map(item => ({
      ...item,
      isSelected: selectedMoralItems.includes(item.name)
    }));

    this.setData({ selectedMoralItems, moralDetailItems });
  },

  // 选择教学大项
  onTeachingCategorySelect(e) {
    const category = e.currentTarget.dataset.category;
    
    // 从teachingData中找到对应数据
    const categoryData = this.data.teachingData?.find(c => c.name === category);
    const teachingDetailItems = categoryData?.items?.map(item => ({
      ...item,
      isSelected: false
    })) || [];
    
    this.setData({
      category,
      selectedTeachingItems: [],
      teachingDetailItems
    });
  },

  // 切换教学指标
  onTeachingItemToggle(e) {
    const itemName = e.currentTarget.dataset.item;
    const selectedTeachingItems = [...this.data.selectedTeachingItems];
    const index = selectedTeachingItems.indexOf(itemName);

    if (index === -1) {
      selectedTeachingItems.push(itemName);
    } else {
      selectedTeachingItems.splice(index, 1);
    }

    const teachingDetailItems = this.data.teachingDetailItems.map(item => ({
      ...item,
      isSelected: selectedTeachingItems.includes(item.name)
    }));

    this.setData({ selectedTeachingItems, teachingDetailItems });
  },

  // 选择宿舍大项
  onDormCategorySelect(e) {
    const category = e.currentTarget.dataset.category;
    
    // 从dormData中找到对应数据
    const categoryData = this.data.dormData?.find(c => c.name === category);
    const dormDetailItems = categoryData?.items?.map(item => ({
      ...item,
      isSelected: false
    })) || [];
    
    this.setData({
      category,
      selectedDormItems: [],
      dormDetailItems
    });
  },

  // 切换宿舍指标
  onDormItemToggle(e) {
    const itemName = e.currentTarget.dataset.item;
    const selectedDormItems = [...this.data.selectedDormItems];
    const index = selectedDormItems.indexOf(itemName);

    if (index === -1) {
      selectedDormItems.push(itemName);
    } else {
      selectedDormItems.splice(index, 1);
    }

    const dormDetailItems = this.data.dormDetailItems.map(item => ({
      ...item,
      isSelected: selectedDormItems.includes(item.name)
    }));

    this.setData({ selectedDormItems, dormDetailItems });
  },

  // 切换整体检查指标
  onOverallItemToggle(e) {
    // 使用 indicator_id 作为唯一标识，防止不同分类下有同名指标
    const indicatorId = e.currentTarget.dataset.id;
    const itemName = e.currentTarget.dataset.name;
    const itemKey = indicatorId || itemName;  // 优先使用 indicator_id
    
    const selectedOverallItems = [...this.data.selectedOverallItems];
    const index = selectedOverallItems.indexOf(itemKey);

    if (index === -1) {
      selectedOverallItems.push(itemKey);
    } else {
      selectedOverallItems.splice(index, 1);
    }

    // 更新 overallItems 的选中状态（使用 indicator_id 或 name 匹配）
    const overallItems = this.data.overallItems.map(item => ({
      ...item,
      isSelected: selectedOverallItems.includes(item.indicator_id) || selectedOverallItems.includes(item.name)
    }));

    // 同时更新 overallDetailItems 的选中状态
    const overallDetailItems = this.data.overallDetailItems.map(item => ({
      ...item,
      isSelected: selectedOverallItems.includes(item.indicator_id) || selectedOverallItems.includes(item.name)
    }));

    this.setData({ selectedOverallItems, overallItems, overallDetailItems });
  },

  // 更新描述
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
  },

  // 更新分数
  onScoreInput(e) {
    this.setData({ score: parseInt(e.detail.value) || 0 });
  },

  // 调整分数
  onScoreAdjust(e) {
    const delta = parseInt(e.currentTarget.dataset.delta);
    this.setData({ score: Math.max(0, this.data.score + delta) });
  },

  // 获取当前选择的数据
  getSelectedData() {
    const { type, selectedMoralItems, selectedTeachingItems, 
            selectedDormItems, selectedOverallItems } = this.data;
    
    if (type === 'overall') return selectedOverallItems;
    if (type === 'moral') return selectedMoralItems;
    if (type === 'teaching') return selectedTeachingItems;
    if (type === 'dorm') return selectedDormItems;
    return [];
  },

  // 提交表单
  async onSubmit() {
    // 防止重复提交
    if (this.data.isSubmitting) {
      return;
    }

    const { type, target, category, subCategory, description, score, isOffline } = this.data;
    const selectedItems = this.getSelectedData();

    let finalItem = selectedItems.join(', ');

    if (!target || !category || !finalItem) {
      wx.showToast({ title: '请填写完整必填信息', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      let result;
      if (type === 'moral') {
        result = await this.submitMoralRecord({ target, category: `${category}-${subCategory}`, item: finalItem, description });
      } else if (type === 'teaching') {
        result = await this.submitTeachingRecord({ target, category, item: finalItem, description });
      } else if (type === 'dorm') {
        result = await this.submitDormRecord({ target, category, item: finalItem, description });
      } else if (type === 'overall') {
        result = await this.submitOverallRecord({ target, category, item: finalItem, description });
      }

      // 处理德育提交结果（可能部分成功）
      if (type === 'moral' && result) {
        if (result.count === 0) {
          // 全部失败
          const errorMessages = result.errors?.map(e => e.message).join('; ') || '学生不存在';
          throw new Error(`提交失败: ${errorMessages}`);
        } else if (result.error_count > 0) {
          // 部分成功
          wx.showToast({ 
            title: result.message || `成功${result.count}条，${result.error_count}条失败`, 
            icon: 'none', 
            duration: 3000 
          });
          this._submitTimer = setTimeout(() => {
            this.handleSubmitSuccess(type, target);
          }, 1500);
          return;
        }
      }

      this.handleSubmitSuccess(type, target);
    } catch (error) {
      console.error('提交失败:', error);
      
      if (isOffline || error.message?.includes('网络')) {
        this.saveAsDraft({ type: type.toUpperCase(), target, category, item: finalItem, description });
        wx.showToast({ title: '已保存为离线草稿', icon: 'none', duration: 2000 });
      } else {
        wx.showToast({ title: error.message || '提交失败', icon: 'none', duration: 3000 });
      }
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 提交德育记录
  async submitMoralRecord(data) {
    const userInfo = api.getUserInfo();
    if (!userInfo) throw new Error('请先登录');

    const { selectedItems, selectedClassIds, selectedMoralItems, moralDetailItems } = this.data;

    if (!selectedItems?.length) {
      throw new Error('请选择被检查的学生');
    }

    // 获取所有选中的指标数据
    const selectedItemDataList = moralDetailItems?.filter(item =>
      selectedMoralItems.includes(item.name)
    ) || [];

    // 为每个学生 × 每个选中指标创建记录
    const records = [];
    console.log('[DEBUG] 提交德育记录 - 班级ID:', selectedClassIds);
    console.log('[DEBUG] 提交德育记录 - 选中学生:', selectedItems);
    
    selectedItems.forEach((selectedItem, index) => {
      // 学生ID处理：检查是否为有效的学生ID（非临时ID）
      let studentId = null;
      const idStr = String(selectedItem.id || '');
      console.log(`[DEBUG] 处理选中项 [${index}]:`, selectedItem);
      console.log(`[DEBUG] ID字符串: "${idStr}", 长度: ${idStr.length}`);
      
      // 真实学生ID特征：是学号格式（数字字符串）且不以 student- 或 student_ 开头
      const isTempId = idStr.startsWith('student-') || 
                       idStr.startsWith('student_') ||
                       idStr.startsWith('seat-') ||
                       idStr.startsWith('temp_');
      
      console.log(`[DEBUG] 是否为临时ID: ${isTempId}`);
      
      if (idStr && !isTempId) {
        studentId = idStr;
        console.log(`[DEBUG] 使用真实学生ID: ${studentId}, 姓名: ${selectedItem.name}`);
      } else {
        // 使用临时标识：class_id + 座位号 + 学生姓名
        studentId = `temp_${selectedClassIds[0] || 0}_${selectedItem.coord || 'X-' + (index + 1)} ${selectedItem.name || 'unknown'}`;
        console.log(`[DEBUG] 使用临时学生ID: ${studentId}`);
      }
      const studentName = selectedItem.name || '';

      // 为每个选中的指标创建一条记录
      selectedItemDataList.forEach(itemData => {
        records.push({
          student_id: studentId,
          rule_id: itemData?.id || 1,
          class_id: selectedClassIds[0] || null,
          score_change: itemData?.default_score || -1,
          description: `目标: ${data.target}${studentName ? ` (${studentName})` : ''} | [${data.category}] ${itemData.name}${data.description ? ' | 备注: ' + data.description : ''}`,
          record_time: new Date().toISOString()
        });
      });
    });

    // 批量提交记录
    return await api.createMoralRecords(records);
  },

  // 提交教学记录
  async submitTeachingRecord(data) {
    const userInfo = api.getUserInfo();
    if (!userInfo) throw new Error('请先登录');

    const { selectedItems, selectedTeachingItems, teachingDetailItems } = this.data;
    if (!selectedItems?.length) throw new Error('请选择被检查的教师');

    // 获取所有选中的指标数据
    const selectedItemDataList = teachingDetailItems?.filter(item =>
      selectedTeachingItems.includes(item.name)
    ) || [];

    // 为每个教师 × 每个选中指标创建记录
    const records = [];
    selectedItems.forEach(selectedTeacher => {
      const teacherId = selectedTeacher.teacher_id || 1;

      selectedItemDataList.forEach(itemData => {
        records.push({
          teacher_id: teacherId,
          check_item: itemData.name,
          type: itemData?.type || 'deduction',
          score: itemData?.default_score || -1,
          content: `被检查教师: ${selectedTeacher.name}${data.description ? ' | ' + data.description : ''}`,
          major_category: data.category,
          description: `[${data.category}] ${itemData.name}`,
          indicator_id: itemData?.id || null,
          gps_lat: this.data.location?.latitude,
          gps_lng: this.data.location?.longitude,
          location_name: this.data.locationName,
          record_time: new Date().toISOString()
        });
      });
    });

    // 批量提交记录
    return await api.createTeachingRecords(records);
  },

  // 提交宿舍检查记录
  async submitDormRecord(data) {
    const userInfo = api.getUserInfo();
    if (!userInfo) throw new Error('请先登录');

    const { selectedItems, selectedBuilding, selectedFloor, selectedRoom, selectedDormItems, dormDetailItems, dormStudents, selectedGrade, selectedClasses } = this.data;

    console.log('宿舍检查提交 - 选中的床位:', selectedItems);
    console.log('宿舍检查提交 - 房间学生列表:', dormStudents);

    // 获取所有选中的指标数据
    const selectedItemDataList = dormDetailItems?.filter(item =>
      selectedDormItems.includes(item.name)
    ) || [];

    // 为每个学生/床位 × 每个选中指标创建记录
    const records = [];
    const targets = selectedItems?.length > 0 ? selectedItems : [{ id: null, name: '' }];

    // 如果没有选中床位，尝试从房间学生列表获取班级信息
    let defaultClassInfo = { class_id: null, class_name: null, grade_name: null };
    if (selectedItems?.length === 0 && dormStudents?.length > 0) {
      const firstStudent = dormStudents[0];
      defaultClassInfo = {
        class_id: firstStudent.class_id || null,
        class_name: firstStudent.class_name || null,
        grade_name: firstStudent.grade_name || null
      };
    }

    console.log('宿舍检查提交 - 默认班级信息:', defaultClassInfo);

    targets.forEach(target => {
      selectedItemDataList.forEach(itemData => {
        const record = {
          student_id: target.id || null,
          student_name: target.name || null,  // 学生姓名
          class_id: target.class_id || defaultClassInfo.class_id,  // 班级ID
          class_name: target.class_name || defaultClassInfo.class_name,  // 班级名称
          grade_name: target.grade_name || defaultClassInfo.grade_name,  // 年级名称
          building: selectedBuilding,
          floor: selectedFloor,
          room: selectedRoom || '',
          category: data.category,
          item: itemData.name,
          score_change: itemData?.default_score || -1,
          description: data.description,
          gps_lat: this.data.location?.latitude,
          gps_lng: this.data.location?.longitude,
          location_name: this.data.locationName,
          record_time: new Date().toISOString()
        };
        console.log('宿舍检查提交 - 单条记录:', record);
        records.push(record);
      });
    });

    console.log('宿舍检查提交 - 最终提交数据:', records);
    return await api.createDormRecords(records);
  },

  // 提交整体检查记录
  // 修复：多选项分别记录，每个目标创建独立的记录
  async submitOverallRecord(data) {
    const userInfo = api.getUserInfo();
    if (!userInfo) throw new Error('请先登录');

    const { overallModule, selectedClassIds, selectedClasses, selectedSubjects, selectedOverallItems, overallItems, selectedRooms, selectedBuilding, selectedFloor, selectedGrade } = this.data;

    // 获取所有选中的指标数据
    // 使用 Map 来去重，以 indicator_id 为 key（防止不同分类下有相同名称的指标）
    const selectedItemMap = new Map();
    overallItems?.forEach(item => {
      // 使用 indicator_id 或 name 来匹配选中的指标
      const itemKey = item.indicator_id || item.name;
      if (selectedOverallItems.includes(itemKey) || selectedOverallItems.includes(item.name)) {
        // 使用 indicator_id 或 name 作为 key 进行去重
        const key = item.indicator_id || item.name;
        if (!selectedItemMap.has(key)) {
          selectedItemMap.set(key, item);
        }
      }
    });
    const selectedItemDataList = Array.from(selectedItemMap.values());

    // 如果没有选中指标，使用传入的item作为默认
    if (selectedItemDataList.length === 0 && data.item) {
      selectedItemDataList.push({ name: data.item, default_score: -1 });
    }

    let checkType = 'CLASS';
    let targets = [];  // 多目标列表，每个目标创建独立记录

    if (overallModule === 'CLASS') {
      checkType = 'CLASS';
      // 为每个选中的班级创建独立目标
      if (selectedClassIds && selectedClassIds.length > 0) {
        selectedClassIds.forEach((classId, index) => {
          targets.push({
            target_id: classId,
            target_name: `${selectedGrade || ''}: ${selectedClasses[index] || ''}`
          });
        });
      }
    } else if (overallModule === 'SUBJECT') {
      checkType = 'SUBJECT';
      // 为每个选中的教研组创建独立目标
      if (selectedSubjects && selectedSubjects.length > 0) {
        selectedSubjects.forEach(subject => {
          targets.push({
            target_id: this.data.selectedGradeId || null,
            target_name: `${selectedGrade || ''}: ${subject}`,
            subject_group: subject  // 保存学科组信息
          });
        });
      }
    } else if (overallModule === 'DORM') {
      checkType = 'DORM';
      // 为每个选中的宿舍创建独立目标
      if (selectedRooms && selectedRooms.length > 0) {
        selectedRooms.forEach(room => {
          targets.push({
            target_id: null,
            target_name: `${selectedBuilding || ''}${selectedFloor || ''}层: ${room}`,
            room: room  // 单独保存房间号，方便后续使用
          });
        });
      }
    }

    // 如果没有选中任何目标，使用默认目标
    if (targets.length === 0) {
      targets.push({
        target_id: null,
        target_name: data.target
      });
    }

    // 为每个目标 × 每个选中指标创建独立记录
    const records = [];
    targets.forEach(target => {
      selectedItemDataList.forEach(itemData => {
        // 学科模块：category为选中的教研组，major_category为指标大项
        // 其他模块：category为指标大项
        let category = itemData.category || data.category;
        let majorCategory = itemData.category || '';  // 指标大项
        
        if (checkType === 'SUBJECT' && target.subject_group) {
          // 学科检查：category=学科(数学/语文), major_category=指标大项(习题组编等)
          // 注意：majorCategory 保持为 itemData.category（指标大项），不要修改
          category = target.subject_group;  // 学科（如数学、语文）
        }
        
        // 调试日志
        console.log(`[学科检查] itemData:`, itemData);
        console.log(`[学科检查] category: ${category}, majorCategory: ${majorCategory}`);
        
        records.push({
          check_type: checkType,
          target_id: target.target_id,
          target_name: target.target_name,  // 每个目标独立的名称
          category: category,
          major_category: majorCategory,
          sub_category: itemData.subCategory || '',
          item: itemData.name,
          indicator_id: itemData.indicator_id || itemData.id || null,
          score_change: itemData?.default_score || -1,
          description: data.description,
          // 宿舍检查需要额外保存宿舍信息
          building: checkType === 'DORM' ? selectedBuilding : null,
          floor: checkType === 'DORM' ? selectedFloor : null,
          room: checkType === 'DORM' ? (target.room || target.target_name?.split(': ')[1] || '') : null,
          gps_lat: this.data.location?.latitude,
          gps_lng: this.data.location?.longitude,
          location_name: this.data.locationName,
          record_time: new Date().toISOString()
        });
      });
    });

    console.log(`[整体检查] 提交 ${records.length} 条记录，目标数: ${targets.length}，指标数: ${selectedItemDataList.length}`);
    return await api.createOverallRecords(records);
  },

  // 保存为草稿
  saveAsDraft(data) {
    const draft = {
      id: `draft-${Date.now()}`,
      ...data,
      timestamp: Date.now(),
      status: 'draft'
    };

    const drafts = wx.getStorageSync('edu_inspect_drafts') || [];
    drafts.unshift(draft);
    wx.setStorageSync('edu_inspect_drafts', drafts);
  },

  // 处理提交成功
  handleSubmitSuccess(type, target) {
    this.setData({ isSuccess: true });
    // 提交成功后留在检查页继续下一个检查
    this._successTimer = setTimeout(() => {
      wx.redirectTo({
        url: `/pages/inspectForm/inspectForm?type=${type}`,
      });
    }, 1500);
  },

  // 返回
  onBack() {
    wx.navigateBack();
  },

  onUnload() {
    if (this._submitTimer) clearTimeout(this._submitTimer);
    if (this._successTimer) clearTimeout(this._successTimer);
  }
});
