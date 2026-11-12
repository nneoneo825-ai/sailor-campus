# 新增班级功能修复

## 问题描述

用户反馈：班级管理页面，"新增班级"功能无法实现。

## 问题分析

### 前端问题

1. **executeAddClass 函数只更新本地状态**：
   - 原始实现只是在 React 本地状态中添加班级对象
   - 没有调用后端API来持久化数据
   - 这导致添加的班级在页面刷新后丢失

```typescript
const executeAddClass = () => {
    // ... 验证 ...
    const newClass: ClassInfo = {
        id: Date.now().toString(),
        // ...
    };
    setClasses([...classes, newClass]);  // 只更新本地状态
    // ...
};
```

2. **未区分API模式和Mock模式**：
   - 函数没有检查 `useApiData` 状态
   - 导致在API模式下也使用Mock数据的处理方式

### 后端问题

1. **缺少创建班级的专用API**：
   - 虽然存在通用的组织机构创建API (`/api/org` POST)
   - 但没有专门的班级创建API，无法直接创建班级并设置班主任

2. **缺少更新班级信息的API**：
   - 更新组织机构的API (`/api/org/{id}` PUT) 只更新 `SysOrg` 表的字段
   - 无法更新 `BaseClassInfo` 表中的 `head_teacher_id` 字段

## 解决方案

### 1. 后端添加专用API

#### 添加 Pydantic 模型

```python
class ClassCreate(BaseModel):
    name: str
    grade_id: int
    head_teacher: Optional[str] = None


class ClassUpdate(BaseModel):
    head_teacher: Optional[str] = None
```

#### 创建班级API

**端点**：`POST /api/schools/{school_id}/classes`

**功能**：
- 验证学校存在
- 验证年级存在且属于该学校
- 检查同年级下是否有重名班级
- 创建 `SysOrg` 记录（班级组织）
- 创建 `BaseClassInfo` 记录（班级信息）
- 如果提供了班主任，查找并关联到班级
- 根据年级名称自动设置学段（初中、高中、小学）
- 记录操作日志

**代码**：
```python
@router.post("/{school_id}/classes")
async def create_class(
    school_id: int,
    class_data: ClassCreate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    # 验证学校存在
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 验证年级存在且属于该学校
    grade = db.query(SysOrg).filter(
        SysOrg.id == class_data.grade_id,
        SysOrg.parent_id == school_id,
        SysOrg.type == "grade"
    ).first()
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found or does not belong to this school")

    # 检查重名
    existing = db.query(SysOrg).filter(
        SysOrg.parent_id == class_data.grade_id,
        SysOrg.name == class_data.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class with this name already exists under this grade")

    # 创建班级组织
    db_class = SysOrg(
        name=class_data.name,
        type="class",
        parent_id=class_data.grade_id,
        tree_path=f"{grade.tree_path}/{class_data.name}"
    )
    db.add(db_class)
    db.flush()

    # 创建班级信息
    class_info = BaseClassInfo(
        org_id=db_class.id,
        grade_year=datetime.now().year,
        stage=""
    )

    # 根据年级名称设置学段
    if "初" in grade.name:
        class_info.stage = "初中"
    elif "高" in grade.name:
        class_info.stage = "高中"
    elif "小" in grade.name:
        class_info.stage = "小学"

    db.add(class_info)
    db.commit()
    db.refresh(db_class)

    # 设置班主任
    if class_data.head_teacher:
        teacher = db.query(SysUser).filter(
            SysUser.real_name == class_data.head_teacher
        ).first()
        if teacher:
            class_info.head_teacher_id = teacher.id
            db.commit()

    # 记录操作日志
    # ...

    return {
        "id": db_class.id,
        "name": db_class.name,
        "message": "Class created successfully"
    }
```

#### 更新班级信息API

**端点**：`PUT /api/schools/{school_id}/classes/{class_id}`

**功能**：
- 验证学校存在
- 验证班级存在且属于该学校
- 更新 `BaseClassInfo` 中的班主任信息
- 如果找不到指定的班主任，则清空班主任关联
- 记录操作日志

**代码**：
```python
@router.put("/{school_id}/classes/{class_id}")
async def update_class(
    school_id: int,
    class_id: int,
    class_data: ClassUpdate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    # 验证学校存在
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 验证班级存在且属于该学校
    db_class = db.query(SysOrg).filter(
        SysOrg.id == class_id,
        SysOrg.type == "class"
    ).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")

    grade = db.query(SysOrg).filter(SysOrg.id == db_class.parent_id).first()
    if not grade or grade.parent_id != school_id:
        raise HTTPException(status_code=400, detail="Class does not belong to this school")

    # 获取或创建班级信息
    class_info = db.query(BaseClassInfo).filter(
        BaseClassInfo.org_id == class_id
    ).first()
    if not class_info:
        class_info = BaseClassInfo(org_id=class_id)
        db.add(class_info)

    # 更新班主任
    if class_data.head_teacher is not None:
        if class_data.head_teacher:
            teacher = db.query(SysUser).filter(
                SysUser.real_name == class_data.head_teacher
            ).first()
            if teacher:
                class_info.head_teacher_id = teacher.id
            else:
                class_info.head_teacher_id = None
        else:
            class_info.head_teacher_id = None

    db.commit()

    # 记录操作日志
    # ...

    return {
        "id": class_id,
        "message": "Class updated successfully"
    }
```

### 2. 前端修改

#### 修改 executeAddClass 函数

```typescript
const executeAddClass = async () => {
    if (!addFormData.name.trim()) {
        alert('请输入班级名称');
        return;
    }

    try {
        // API模式：调用后端API
        if (useApiData && currentSchoolId) {
            // 根据年级名称找到年级ID
            const selectedGrade = grades.find(g => g.name === addFormData.grade);
            if (!selectedGrade) {
                alert('请选择有效的年级');
                return;
            }

            // 调用后端API创建班级
            await api.post(`/api/schools/${currentSchoolId}/classes`, {
                name: addFormData.name,
                grade_id: selectedGrade.id,
                head_teacher: addFormData.headTeacher || undefined
            });

            alert('班级添加成功！');

            // 重新加载班级列表
            await loadClassesForSchool(currentSchoolId, addFormData.school);
        } else {
            // Mock模式：直接添加到本地状态
            const newClass: ClassInfo = {
                id: Date.now().toString(),
                name: addFormData.name,
                grade: addFormData.grade,
                stage: addFormData.stage,
                school: addFormData.school,
                headTeacher: addFormData.headTeacher,
                teachers: {},
                allStudents: [],
                seatingGroups: []
            };

            setClasses([...classes, newClass]);
            alert('班级添加成功！');
        }

        // 关闭弹窗并重置表单
        setIsAddModalOpen(false);
        setAddFormData({
            school: '长水实验中学杨凌校区',
            stage: '初中',
            grade: '初一',
            name: '',
            headTeacher: ''
        });
    } catch (err: any) {
        console.error('添加班级失败:', err);
        const errorMsg = err.response?.data?.detail || err.message || '添加班级失败';
        alert(`添加失败: ${errorMsg}`);
    }
};
```

## 修改的文件

### 后端
- `backend/app/routes/schools.py`
  - 添加 `ClassCreate` Pydantic 模型
  - 添加 `ClassUpdate` Pydantic 模型
  - 添加 `create_class` API (`POST /api/schools/{school_id}/classes`)
  - 添加 `update_class` API (`PUT /api/schools/{school_id}/classes/{class_id}`)

### 前端
- `components/SchoolManagement.tsx`
  - 修改 `executeAddClass` 函数，使其调用后端API

## 功能特性

1. **数据持久化**：新增的班级会保存到数据库，刷新页面后不会丢失
2. **重名检查**：自动检查同年级下是否已存在同名班级，避免重复
3. **班主任关联**：可以指定班主任姓名，系统会自动查找并关联到班级
4. **学段自动识别**：根据年级名称自动设置学段（初中、高中、小学）
5. **操作日志**：记录新增班级的操作日志，便于审计
6. **错误处理**：完善的错误提示，包括必填项检查、重名检查、权限检查等
7. **双模式支持**：同时支持API模式和Mock模式

## 测试建议

1. 测试API模式下新增班级功能
2. 测试班级名称必填项验证
3. 测试同年级下重名班级的检测
4. 测试班主任的关联和查找
5. 测试新增班级后列表的刷新
6. 测试Mock模式下的新增班级功能
7. 测试各种错误情况的提示信息

## 注意事项

1. 班主任需要先在系统中注册（在 `sys_user` 表中），否则无法关联
2. 年级必须先存在，才能在该年级下创建班级
3. 班级名称在同一年级下必须唯一
4. 创建班级后，会自动创建对应的 `BaseClassInfo` 记录
5. 如果找不到指定的班主任，系统会清空班主任关联（设置为空）
