from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.org import SysOrg, BaseClassInfo
from app.models.user import SysUser
from app.models.student import BaseStudent
from app.utils.deps import get_current_active_user
from app.utils.data_scope import get_user_data_scope, DataScope
from app.utils.log_helper import log_operation, MODULE_ORG, ACTION_CREATE, ACTION_UPDATE, ACTION_DELETE

router = APIRouter()


def update_school_stages(db: Session, school_id: int) -> None:
    """
    根据学校下的年级名称更新学校的学段字段
    """
    # 获取学校
    school = db.query(SysOrg).filter(SysOrg.id == school_id, SysOrg.type == 'school').first()
    if not school:
        return

    # 获取学校下的所有年级
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()

    if not grades:
        school.stages = None
        db.commit()
        return

    # 根据年级名称推断学段
    stages_set = set()
    for grade in grades:
        grade_name = grade.name
        if '高' in grade_name:
            stages_set.add('高中')
        elif '初' in grade_name:
            stages_set.add('初中')
        elif '小' in grade_name:
            stages_set.add('小学')

    if not stages_set:
        school.stages = None
        db.commit()
        return

    # 按标准顺序组合学段
    stages_list = []
    if '小学' in stages_set:
        stages_list.append('小学')
    if '初中' in stages_set:
        stages_list.append('初中')
    if '高中' in stages_set:
        stages_list.append('高中')

    school.stages = ','.join(stages_list)
    db.commit()


def get_school_id_by_org(db: Session, org_id: int) -> Optional[int]:
    """
    获取组织节点所属的学校ID
    """
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        return None

    # 如果是学校，直接返回
    if org.type == 'school':
        return org.id

    # 如果是年级，父级就是学校
    if org.type == 'grade':
        return org.parent_id

    # 如果是班级，需要向上查两级
    if org.type == 'class':
        grade = db.query(SysOrg).filter(SysOrg.id == org.parent_id).first()
        if grade:
            return grade.parent_id

    return None


# Pydantic models for request/response
class OrgCreate(BaseModel):
    name: str
    type: str  # group, school, department, grade, class
    parent_id: int = 0
    sort_order: int = 0


class OrgUpdate(BaseModel):
    name: str = None
    type: str = None
    parent_id: int = None
    sort_order: int = None


def build_org_tree(org_id: int = 0, db: Session = None, level: int = 0):
    """
    Recursively build organization tree
    """
    query = db.query(SysOrg).filter(SysOrg.parent_id == org_id)
    if level == 0:
        # Only get group level at root
        query = query.filter(SysOrg.type == "group")

    orgs = query.order_by(SysOrg.sort_order).all()

    # 定义年级排序映射表
    grade_order_map = {
        # 小学
        '小一': 1, '小学一年级': 1, '一年级': 101,
        '小二': 2, '小学二年级': 2, '二年级': 102,
        '小三': 3, '小学三年级': 3, '三年级': 103,
        '小四': 4, '小学四年级': 4, '四年级': 104,
        '小五': 5, '小学五年级': 5, '五年级': 105,
        '小六': 6, '小学六年级': 6, '六年级': 106,
        # 初中
        '初一': 10, '七年级': 10, '初中一年级': 10,
        '初二': 11, '八年级': 11, '初中二年级': 11,
        '初三': 12, '九年级': 12, '初中三年级': 12,
        # 高中
        '高一': 20, '高中一年级': 20,
        '高二': 21, '高中二年级': 21,
        '高三': 22, '高中三年级': 22
    }

    # 定义组织排序函数
    def smart_sort(orgs: list) -> list:
        """根据节点类型进行智能排序"""
        if not orgs:
            return orgs

        # 按类型分组
        groups = {}
        grades = []
        classes = []
        departments = []
        schools = []

        for org in orgs:
            if org.type == 'grade':
                grades.append(org)
            elif org.type == 'class':
                classes.append(org)
            elif org.type == 'department':
                departments.append(org)
            elif org.type == 'school':
                schools.append(org)
            else:
                groups.setdefault(org.type, []).append(org)

        # 对年级按语义排序
        if grades:
            grades.sort(key=lambda x: (grade_order_map.get(x.name, 999), x.sort_order, x.name))

        # 对班级按名称数字排序（如：1班、2班、10班）
        if classes:
            def extract_class_number(name):
                """从班级名称中提取数字，如：'1班' -> 1, '10班' -> 10"""
                import re
                # 提取开头的数字
                match = re.search(r'^(\d+)', name)
                if match:
                    return int(match.group(1))
                return 999

            classes.sort(key=lambda x: (extract_class_number(x.name), x.sort_order, x.name))

        # 其他类型按 sort_order 排序
        if departments:
            departments.sort(key=lambda x: (x.sort_order, x.name))
        if schools:
            schools.sort(key=lambda x: (x.sort_order, x.name))

        for org_list in groups.values():
            org_list.sort(key=lambda x: (x.sort_order, x.name))

        # 合并结果：部门 -> 学校 -> 年级 -> 班级 -> 其他
        result = []
        result.extend(departments)
        result.extend(schools)
        result.extend(grades)
        result.extend(classes)
        for org_list in groups.values():
            result.extend(org_list)

        return result

    # 对当前层级的节点进行排序
    orgs = smart_sort(orgs)

    result = []
    for org in orgs:
        org_data = {
            "id": org.id,
            "name": org.name,
            "type": org.type,
            "parent_id": org.parent_id,
            "sort_order": org.sort_order or 0,
            "tree_path": org.tree_path or f"/{org.name}"
        }

        # Add head teacher if it's a class
        if org.type == "class":
            class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == org.id).first()
            if class_info and class_info.head_teacher_id:
                head_teacher = db.query(SysUser).filter(SysUser.id == class_info.head_teacher_id).first()
                if head_teacher:
                    org_data["head_teacher"] = head_teacher.real_name
            if class_info and class_info.seating_chart:
                org_data["seating_chart"] = class_info.seating_chart

        # Recursively get children
        children = build_org_tree(org.id, db, level + 1)
        if children:
            org_data["children"] = children

        result.append(org_data)

    return result


@router.get("/tree")
async def get_org_tree(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get organization tree structure (filtered by user's data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 如果有全部权限，返回完整树
    if scope.has_all:
        tree = build_org_tree(db=db)
        return tree
    
    # 否则只返回用户可访问的组织节点
    accessible_org_ids = set()
    accessible_org_ids.update(scope.school_ids)
    accessible_org_ids.update(scope.grade_ids)
    accessible_org_ids.update(scope.class_ids)
    
    if not accessible_org_ids:
        return []
    
    # 获取可访问的组织节点
    orgs = db.query(SysOrg).filter(SysOrg.id.in_(accessible_org_ids)).all()
    
    if not orgs:
        return []
    
    # 收集所有祖先节点ID，以便构建完整的树路径
    all_related_ids = set(accessible_org_ids)
    for org in orgs:
        # 向上追溯祖先节点
        current_org = org
        while current_org and current_org.parent_id and current_org.parent_id not in all_related_ids:
            parent = db.query(SysOrg).filter(SysOrg.id == current_org.parent_id).first()
            if parent:
                all_related_ids.add(parent.id)
                current_org = parent
            else:
                break
    
    # 获取已授权节点的子节点（包括部门、教研组等）
    # 注意：只获取accessible_org_ids的子节点，而不是所有祖先节点的子节点
    # 这样可以避免获取到其他平级组织的节点
    children_orgs = db.query(SysOrg).filter(
        SysOrg.parent_id.in_(accessible_org_ids)
    ).all()
    for child in children_orgs:
        all_related_ids.add(child.id)
    
    # 重新获取包含祖先节点和已授权节点子节点的组织
    all_orgs = db.query(SysOrg).filter(SysOrg.id.in_(all_related_ids)).all()
    
    # 构建树形结构
    def build_limited_tree(parent_id=0):
        nodes = []
        for org in all_orgs:
            if org.parent_id == parent_id:
                node = {
                    "id": org.id,
                    "name": org.name,
                    "type": org.type,
                    "parent_id": org.parent_id,
                    "sort_order": org.sort_order or 0,
                    "tree_path": org.tree_path or f"/{org.name}",
                    "children": build_limited_tree(org.id)
                }
                nodes.append(node)
        return nodes
    
    return build_limited_tree()


@router.get("/{org_id}/classes")
async def get_classes_by_org(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get classes under an organization (school or grade, requires access to the organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    # Check if org exists
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # 检查是否有权限访问该组织
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        
        if org_id not in accessible_org_ids:
            raise HTTPException(status_code=403, detail="无权限访问该组织")

    # Get all classes
    if org.type == "school":
        # Get all grades under this school, then get classes
        grades = db.query(SysOrg).filter(SysOrg.parent_id == org_id).all()
        grade_ids = [g.id for g in grades]
        classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids)).all()
    elif org.type == "grade":
        # Get classes directly under this grade
        classes = db.query(SysOrg).filter(SysOrg.parent_id == org_id).all()
    elif org.type == "class":
        # Return just this class
        classes = [org]
    else:
        # For group or other types, search recursively
        all_org_ids = [org_id]

        def collect_org_ids(parent_id: int):
            children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
            for child in children:
                all_org_ids.append(child.id)
                if child.type in ["school", "grade"]:
                    collect_org_ids(child.id)

        collect_org_ids(org_id)
        classes = db.query(SysOrg).filter(
            SysOrg.id.in_(all_org_ids),
            SysOrg.type == "class"
        ).all()

    # 应用数据权限过滤班级
    if not scope.has_all and scope.class_ids:
        classes = [c for c in classes if c.id in scope.class_ids]

    # 获取班级详细信息（包括班主任）
    result = []
    for cls in classes:
        class_data = {
            "id": cls.id,
            "name": cls.name,
            "type": cls.type,
            "parent_id": cls.parent_id
        }
        
        # 获取班级详细信息（班主任等）
        class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == cls.id).first()
        if class_info:
            if class_info.head_teacher_id:
                head_teacher = db.query(SysUser).filter(SysUser.id == class_info.head_teacher_id).first()
                if head_teacher:
                    class_data["head_teacher"] = head_teacher.real_name
            class_data["student_count"] = class_info.student_count
        
        result.append(class_data)
    
    return result


@router.get("/{org_id}/students")
async def get_students_by_class(
    org_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get students in a class with pagination
    应用数据权限过滤：用户只能查看有权限的班级学生
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # Check if org exists
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # If not a class, get all classes under this org
    if org.type != "class":
        classes_response = await get_classes_by_org(org_id, db, current_user)
        class_ids = [cls["id"] for cls in classes_response]
    else:
        class_ids = [org_id]
    
    # 应用数据权限过滤班级
    if not scope.has_all:
        if scope.class_ids:
            # 只保留用户有权限访问的班级
            class_ids = [cid for cid in class_ids if cid in scope.class_ids]
        else:
            class_ids = []
    
    if not class_ids:
        return {
            "total": 0,
            "page": page,
            "page_size": page_size,
            "students": []
        }

    # Query students
    query = db.query(BaseStudent).filter(BaseStudent.class_id.in_(class_ids), BaseStudent.status == 1)

    total = query.count()
    students = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "students": [
            {
                "id": student.id,
                "name": student.name,
                "gender": student.gender,
                "class_id": student.class_id,
                "status": student.status
            }
            for student in students
        ]
    }


@router.get("/{org_id}/teachers")
async def get_teachers_by_org(
    org_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get teachers under an organization
    应用数据权限过滤
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # Check if org exists
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # 检查是否有权限访问该组织
    # 1. 全部数据权限
    # 2. 用户自己的组织
    # 3. 组织在可访问范围内
    if not scope.has_all:
        # 用户可以访问自己所属的组织
        if current_user.org_id != org_id:
            accessible_org_ids = set()
            accessible_org_ids.update(scope.school_ids)
            accessible_org_ids.update(scope.grade_ids)
            accessible_org_ids.update(scope.class_ids)
            accessible_org_ids.update(scope.teaching_group_ids)
            accessible_org_ids.update(scope.department_ids)
            
            if org_id not in accessible_org_ids:
                raise HTTPException(status_code=403, detail="无权限访问该组织")

    # Get all teachers with this org_id or under this org
    query = db.query(SysUser).filter(
        SysUser.status == 1,
        SysUser.org_id == org_id
    )

    total = query.count()
    teachers = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "teachers": [
            {
                "id": teacher.id,
                "username": teacher.username,
                "real_name": teacher.real_name,
                "avatar_url": teacher.avatar_url,
                "org_id": teacher.org_id,
                "last_login_time": teacher.last_login_time.isoformat() if teacher.last_login_time else None
            }
            for teacher in teachers
        ]
    }


@router.get("/{org_id}/users")
async def get_users_by_org(
    org_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get users associated with an organization (including user's role info)
    应用数据权限过滤
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # Check if org exists
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # 检查是否有权限访问该组织
    if not scope.has_all:
        # 用户可以访问自己所属的组织
        if current_user.org_id != org_id:
            accessible_org_ids = set()
            accessible_org_ids.update(scope.school_ids)
            accessible_org_ids.update(scope.grade_ids)
            accessible_org_ids.update(scope.class_ids)
            accessible_org_ids.update(scope.teaching_group_ids)
            accessible_org_ids.update(scope.department_ids)
            
            if org_id not in accessible_org_ids:
                raise HTTPException(status_code=403, detail="无权限访问该组织")

    # Get users with this org_id
    query = db.query(SysUser).filter(
        SysUser.org_id == org_id
    )

    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()

    # Build response with role info
    result_users = []
    for user in users:
        # Get user's roles
        role_names = []
        for role in user.roles:
            role_names.append(role.name)

        result_users.append({
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "avatar_url": user.avatar_url,
            "org_id": user.org_id,
            "status": user.status,
            "last_login_time": user.last_login_time.isoformat() if user.last_login_time else None,
            "roles": role_names
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "org_name": org.name,
        "users": result_users
    }


@router.get("/{org_id}/detail")
async def get_org_detail(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get organization detail information
    """
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_data = {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "parent_id": org.parent_id,
        "sort_order": org.sort_order,
        "tree_path": org.tree_path
    }

    # Add class-specific info
    if org.type == "class":
        class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == org.id).first()
        if class_info:
            org_data["class_info"] = {
                "head_teacher_id": class_info.head_teacher_id,
                "grade_year": class_info.grade_year,
                "graduation_status": class_info.graduation_status,
                "seating_chart": class_info.seating_chart
            }
            if class_info.head_teacher_id:
                head_teacher = db.query(SysUser).filter(SysUser.id == class_info.head_teacher_id).first()
                if head_teacher:
                    org_data["class_info"]["head_teacher_name"] = head_teacher.real_name

        # Get student count
        student_count = db.query(BaseStudent).filter(
            BaseStudent.class_id == org.id,
            BaseStudent.status == 1
        ).count()
        org_data["student_count"] = student_count

    # Get child count
    child_count = db.query(SysOrg).filter(SysOrg.parent_id == org.id).count()
    org_data["child_count"] = child_count

    return org_data


@router.get("/class/{class_id}/seating-chart")
async def get_seating_chart(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get class seating chart
    返回数据库中保存的座位表数据，为空时返回空数据（与Web端保持一致）
    """
    try:
        # Check if class exists
        org = db.query(SysOrg).filter(SysOrg.id == class_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Class not found")

        if org.type != "class":
            raise HTTPException(status_code=400, detail="Organization is not a class")

        # Get class info
        class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == class_id).first()
        
        # Get students in this class
        students_data = []
        try:
            students = db.query(BaseStudent).filter(
                BaseStudent.class_id == class_id,
                BaseStudent.status == 1  # 只获取在读学生
            ).all()
            students_data = [
                {
                    "id": student.id,
                    "name": student.name,
                    "gender": student.gender
                }
                for student in students
            ]
        except Exception as e:
            print(f"Warning: Could not fetch students: {e}")
            students_data = []
        
        # 直接返回数据库中保存的座位表数据，不做自动生成
        seating_chart = class_info.seating_chart if class_info else None
        
        # 获取保存的行数，默认为8
        saved_row_count = seating_chart.get("rowCount", 8) if seating_chart else 8
        
        return {
            "class_id": class_id,
            "class_name": org.name,
            "seating_chart": seating_chart,
            "students": students_data,
            "rowCount": saved_row_count,
            "rows": saved_row_count,
            "cols": 8,
            "total_students": len(students_data)
        }
    except Exception as e:
        import traceback
        print(f"Error in get_seating_chart: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/class/{class_id}/seating-chart")
async def update_seating_chart(
    class_id: int,
    seating_chart: dict,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update class seating chart
    """
    print(f"[DEBUG] update_seating_chart called for class {class_id}")
    print(f"[DEBUG] received seating_chart: {seating_chart}")
    
    # Check if class exists
    org = db.query(SysOrg).filter(SysOrg.id == class_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Class not found")

    if org.type != "class":
        raise HTTPException(status_code=400, detail="Organization is not a class")

    # Get or create class info
    class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == class_id).first()
    if not class_info:
        from datetime import datetime
        class_info = BaseClassInfo(
            org_id=class_id,
            grade_year=datetime.now().year,
            graduation_status=0
        )
        db.add(class_info)

    class_info.seating_chart = seating_chart
    db.commit()
    
    print(f"[DEBUG] saved seating_chart: {class_info.seating_chart}")

    return {
        "message": "Seating chart updated successfully"
    }


@router.get("/teachers/all")
async def get_all_teachers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all teachers with pagination (filtered by user's data scope)
    教师档案独立于系统用户，直接从 BaseTeacher 表获取
    """
    from app.models.org import BaseTeacher
    
    scope = get_user_data_scope(db, current_user)
    
    # 直接从 BaseTeacher 表查询
    query = db.query(BaseTeacher)
    
    # 应用数据权限过滤
    if not scope.has_all:
        if scope.school_ids:
            query = query.filter(BaseTeacher.school_id.in_(scope.school_ids))
        else:
            # 没有任何可访问学校，返回空结果
            return {
                "total": 0,
                "page": page,
                "page_size": page_size,
                "teachers": []
            }
    
    # 按年级筛选
    if grade:
        query = query.filter(BaseTeacher.grades.contains(grade))

    total = query.count()
    teachers = query.offset((page - 1) * page_size).limit(page_size).all()

    # 构建响应
    result_teachers = []
    for teacher in teachers:
        # 获取学校名称
        school_name = ""
        if teacher.school_id:
            school = db.query(SysOrg).filter(SysOrg.id == teacher.school_id).first()
            if school:
                school_name = school.name
        
        result_teachers.append({
            "id": teacher.id,
            "name": teacher.name,
            "gender": "男" if teacher.gender == "M" else "女" if teacher.gender == "F" else "",
            "phone": teacher.phone or "",
            "school_id": teacher.school_id,
            "school_name": school_name,
            "subject": teacher.subject or "其他",
            "grades": teacher.grades or ""
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "teachers": result_teachers
    }


@router.post("/")
async def create_org(
    org_data: OrgCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new organization node (requires access to parent organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 系统管理员或校区管理员可创建组织
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限创建组织")
    
    # Validate type
    valid_types = ["group", "school", "department", "grade", "class", "teaching_group"]
    if org_data.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    # Check parent exists
    if org_data.parent_id > 0:
        parent = db.query(SysOrg).filter(SysOrg.id == org_data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent organization not found")

    # Check for duplicate name in same level
    existing = db.query(SysOrg).filter(
        SysOrg.parent_id == org_data.parent_id,
        SysOrg.name == org_data.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Organization with same name already exists at this level")

    # Auto-calculate sort_order if not provided (0 means auto)
    sort_order = org_data.sort_order
    if sort_order == 0:
        # Get the maximum sort_order in the same level
        max_sort_order = db.query(SysOrg).filter(
            SysOrg.parent_id == org_data.parent_id
        ).count()
        sort_order = max_sort_order + 1

    # Build tree path
    if org_data.parent_id > 0:
        parent = db.query(SysOrg).filter(SysOrg.id == org_data.parent_id).first()
        tree_path = f"{parent.tree_path}/{org_data.name}"
    else:
        tree_path = f"/{org_data.name}"

    # Create organization
    db_org = SysOrg(
        name=org_data.name,
        type=org_data.type,
        parent_id=org_data.parent_id,
        sort_order=sort_order,
        tree_path=tree_path
    )
    db.add(db_org)
    db.commit()
    db.refresh(db_org)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_ORG,
        action=ACTION_CREATE,
        description=f"新增组织: {org_data.name}({org_data.type})",
        status="成功",
        request=request
    )

    # If it's a class, create class info record
    if org_data.type == "class":
        from datetime import datetime
        class_info = BaseClassInfo(
            org_id=db_org.id,
            grade_year=datetime.now().year,  # 默认使用当前年份
            stage="",  # 默认为空，后续可根据年级推断
            graduation_status=0
        )
        db.add(class_info)
        db.commit()

    # If it's a grade, update school's stages
    if org_data.type == "grade":
        school_id = get_school_id_by_org(db, db_org.id)
        if school_id:
            update_school_stages(db, school_id)

    return {
        "id": db_org.id,
        "name": db_org.name,
        "type": db_org.type,
        "parent_id": db_org.parent_id,
        "tree_path": db_org.tree_path,
        "message": "Organization created successfully"
    }


@router.put("/{org_id}")
async def update_org(
    org_id: int,
    org_data: OrgUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update organization node (requires access to the organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # 检查是否有权限修改该组织（系统管理员或校区管理员）
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限修改组织")

    # Validate type if provided
    if org_data.type:
        valid_types = ["group", "school", "department", "grade", "class", "teaching_group"]
        if org_data.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    # Check parent exists if provided
    if org_data.parent_id is not None:
        if org_data.parent_id > 0:
            parent = db.query(SysOrg).filter(SysOrg.id == org_data.parent_id).first()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent organization not found")

        # Cannot set self as parent
        if org_data.parent_id == org_id:
            raise HTTPException(status_code=400, detail="Cannot set self as parent")

        # Check for duplicate name in new level if name or parent changed
        if org_data.name is not None or org_data.parent_id is not None:
            new_name = org_data.name if org_data.name is not None else org.name
            new_parent = org_data.parent_id if org_data.parent_id is not None else org.parent_id

            if new_parent != org.parent_id or new_name != org.name:
                existing = db.query(SysOrg).filter(
                    SysOrg.parent_id == new_parent,
                    SysOrg.name == new_name,
                    SysOrg.id != org_id
                ).first()
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail="Organization with same name already exists at this level"
                    )

    # Update fields
    if org_data.name is not None:
        org.name = org_data.name
    if org_data.type is not None:
        org.type = org_data.type
    if org_data.parent_id is not None:
        org.parent_id = org_data.parent_id
        # Update tree path
        if org.parent_id > 0:
            parent = db.query(SysOrg).filter(SysOrg.id == org.parent_id).first()
            org.tree_path = f"{parent.tree_path}/{org.name}"
        else:
            org.tree_path = f"/{org.name}"

        # Update children tree paths recursively
        def update_children_tree_path(parent_id: int, parent_path: str):
            children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
            for child in children:
                child.tree_path = f"{parent_path}/{child.name}"
                db.flush()
                update_children_tree_path(child.id, child.tree_path)

        update_children_tree_path(org.id, org.tree_path)

    if org_data.sort_order is not None:
        org.sort_order = org_data.sort_order

    db.commit()
    db.refresh(org)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_ORG,
        action=ACTION_UPDATE,
        description=f"更新组织: {org.name}({org.type})",
        status="成功",
        request=request
    )

    # If it's a grade, update school's stages
    if org.type == "grade":
        school_id = get_school_id_by_org(db, org.id)
        if school_id:
            update_school_stages(db, school_id)

    return {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "parent_id": org.parent_id,
        "tree_path": org.tree_path,
        "message": "Organization updated successfully"
    }


@router.delete("/{org_id}")
async def delete_org(
    org_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Delete organization node (requires access to the organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # 检查是否有权限删除该组织（系统管理员或校区管理员）
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限删除组织")

    # Check if has children
    children_count = db.query(SysOrg).filter(SysOrg.parent_id == org_id).count()
    if children_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete organization with {children_count} children. Please delete children first."
        )

    # Check if has students (for class)
    if org.type == "class":
        student_count = db.query(BaseStudent).filter(
            BaseStudent.class_id == org_id,
            BaseStudent.status == 1
        ).count()
        if student_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete class with {student_count} students. Please reassign students first."
            )

        # Delete class info
        class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == org_id).first()
        if class_info:
            db.delete(class_info)

    # Check if has users
    user_count = db.query(SysUser).filter(SysUser.org_id == org_id).count()
    if user_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete organization with {user_count} users. Please reassign users first."
        )

    # If it's a grade, get school_id before deletion
    school_id = None
    if org.type == "grade":
        school_id = org.parent_id

    # 保存组织信息用于日志
    org_info = f"{org.name}({org.type})"

    # Delete organization
    db.delete(org)
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_ORG,
        action=ACTION_DELETE,
        description=f"删除组织: {org_info}",
        status="成功",
        request=request
    )

    # If it was a grade, update school's stages
    if school_id:
        update_school_stages(db, school_id)

    return {"message": "Organization deleted successfully"}


# ============= 组织架构优化功能 =============

# 年级模板定义
GRADE_TEMPLATES = {
    "小学": ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
    "初中": ["初一", "初二", "初三"],
    "高中": ["高一", "高二", "高三"],
    "九年一贯制": ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三"],
    "十二年一贯制": ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三", "高一", "高二", "高三"]
}


class GradeTemplateResponse(BaseModel):
    name: str
    grades: List[str]


class SchoolWithStructureCreate(BaseModel):
    """学校创建向导 - 请求数据"""
    name: str
    school_type: str = None  # 公办/民办
    address: str = None
    principal_name: str = None
    contact_phone: str = None
    stages: List[str] = []  # 办学学段: ["小学", "初中", "高中"]
    create_grades: bool = True  # 是否自动创建年级
    parent_id: int = None  # 上级组织ID，不指定则自动查找集团节点
    admin_username: str = None  # 管理员账号（可选）
    admin_password: str = None
    admin_real_name: str = None


class BatchClassesCreate(BaseModel):
    """批量创建班级 - 请求数据"""
    grade_id: int  # 年级ID
    count: int  # 创建数量
    naming_pattern: str = "numeric"  # numeric: 1班、2班...; chinese: 一班、二班...
    prefix: str = ""  # 前缀，如 "七年级"
    start_number: int = 1  # 起始编号
    head_teacher_ids: List[int] = []  # 班主任ID列表（可选）


@router.get("/grade-templates")
async def get_grade_templates(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取年级结构模板列表
    """
    templates = [
        {"name": name, "grades": grades, "stage": name}
        for name, grades in GRADE_TEMPLATES.items()
    ]
    return {"templates": templates}


@router.post("/school-with-structure")
async def create_school_with_structure(
    data: SchoolWithStructureCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    学校创建向导 - 创建学校并自动生成年级结构
    """
    scope = get_user_data_scope(db, current_user)
    # 系统管理员或校区管理员可创建学校
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限创建学校")

    # 确定上级组织
    parent_org = None
    if data.parent_id:
        # 指定了上级组织
        parent_org = db.query(SysOrg).filter(SysOrg.id == data.parent_id).first()
        if not parent_org:
            raise HTTPException(status_code=400, detail="指定的上级组织不存在")
    else:
        # 自动查找集团节点
        # 先尝试查找 type=group 且 parent_id=0 的节点
        parent_org = db.query(SysOrg).filter(SysOrg.type == "group", SysOrg.parent_id == 0).first()
        if not parent_org:
            # 再尝试查找任意 type=group 的节点
            parent_org = db.query(SysOrg).filter(SysOrg.type == "group").first()
        if not parent_org:
            # 最后尝试查找任意根节点（parent_id=0 或 parent_id is null）
            parent_org = db.query(SysOrg).filter(
                (SysOrg.parent_id == 0) | (SysOrg.parent_id.is_(None))
            ).first()
        if not parent_org:
            raise HTTPException(status_code=400, detail="未找到上级组织，请先创建集团节点或在创建时指定上级组织ID")

    parent_id = parent_org.id
    parent_tree_path = parent_org.tree_path or f"/{parent_org.name}"

    # 检查学校名称是否重复（同一上级下）
    existing = db.query(SysOrg).filter(
        SysOrg.name == data.name,
        SysOrg.parent_id == parent_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"该上级组织下已存在名称为 '{data.name}' 的组织")

    # 计算sort_order
    max_sort = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).count()

    # 创建学校节点
    school = SysOrg(
        name=data.name,
        type="school",
        parent_id=parent_id,
        sort_order=max_sort + 1,
        tree_path=f"{parent_tree_path}/{data.name}",
        school_type=data.school_type,
        address=data.address,
        principal_name=data.principal_name,
        contact_phone=data.contact_phone,
        stages=",".join(data.stages) if data.stages else None
    )
    db.add(school)
    db.flush()

    created_grades = []
    created_admin = None

    try:
        # 自动创建年级
        if data.create_grades and data.stages:
            for stage in data.stages:
                if stage in GRADE_TEMPLATES:
                    grades = GRADE_TEMPLATES[stage]
                    for idx, grade_name in enumerate(grades):
                        grade = SysOrg(
                            name=grade_name,
                            type="grade",
                            parent_id=school.id,
                            sort_order=idx + 1,
                            tree_path=f"{school.tree_path}/{grade_name}"
                        )
                        db.add(grade)
                        created_grades.append(grade_name)

        # 创建学校管理员账号
        if data.admin_username and data.admin_password:
            from app.utils.auth import get_password_hash
            from app.models.role import SysRole

            # 检查用户名是否已存在
            existing_user = db.query(SysUser).filter(SysUser.username == data.admin_username).first()
            if existing_user:
                raise HTTPException(status_code=400, detail=f"用户名 '{data.admin_username}' 已存在")

            admin = SysUser(
                username=data.admin_username,
                password=get_password_hash(data.admin_password),
                real_name=data.admin_real_name or data.admin_username,
                org_id=school.id,
                status=1
            )
            db.add(admin)
            db.flush()

            # 分配学校管理员角色（假设角色ID为2，实际应根据角色名称查询）
            admin_role = db.query(SysRole).filter(SysRole.name == "学校管理员").first()
            if admin_role:
                from app.models.role import sys_user_role
                db.execute(
                    sys_user_role.insert().values(user_id=admin.id, role_id=admin_role.id)
                )

            created_admin = {
                "id": admin.id,
                "username": admin.username,
                "real_name": admin.real_name
            }

        db.commit()

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module=MODULE_ORG,
            action=ACTION_CREATE,
            description=f"创建学校: {data.name}，包含 {len(created_grades)} 个年级" +
                       (f"，管理员: {data.admin_username}" if created_admin else ""),
            status="成功",
            request=request
        )

        return {
            "id": school.id,
            "name": school.name,
            "type": school.type,
            "stages": school.stages,
            "created_grades": created_grades,
            "created_admin": created_admin,
            "message": "学校创建成功"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建学校失败: {str(e)}")


@router.post("/batch-classes")
async def batch_create_classes(
    data: BatchClassesCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    批量创建班级
    """
    scope = get_user_data_scope(db, current_user)
    # 系统管理员或校区管理员可创建班级
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限创建班级")

    # 验证年级存在
    grade = db.query(SysOrg).filter(SysOrg.id == data.grade_id, SysOrg.type == "grade").first()
    if not grade:
        raise HTTPException(status_code=404, detail="年级不存在")

    # 获取学校ID
    school_id = grade.parent_id
    if not school_id:
        raise HTTPException(status_code=400, detail="年级节点缺少父级学校信息")

    # 中文数字映射
    chinese_nums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
                    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"]

    created_classes = []
    errors = []

    # 获取当前年级下已有的班级数量
    existing_count = db.query(SysOrg).filter(SysOrg.parent_id == data.grade_id).count()

    # 获取年级的 tree_path
    grade_tree_path = grade.tree_path or f"/{grade.name}"

    try:
        for i in range(data.count):
            num = data.start_number + i
            if data.naming_pattern == "chinese" and num <= 20:
                class_name = f"{data.prefix}{chinese_nums[num-1]}班" if data.prefix else f"{chinese_nums[num-1]}班"
            else:
                class_name = f"{data.prefix}{num}班" if data.prefix else f"{num}班"

            # 检查班级名称是否已存在
            existing = db.query(SysOrg).filter(
                SysOrg.parent_id == data.grade_id,
                SysOrg.name == class_name
            ).first()
            if existing:
                errors.append({"name": class_name, "error": "班级名称已存在"})
                continue

            # 创建班级
            cls = SysOrg(
                name=class_name,
                type="class",
                parent_id=data.grade_id,
                sort_order=existing_count + i + 1,
                tree_path=f"{grade_tree_path}/{class_name}"
            )
            db.add(cls)
            db.flush()

            # 创建班级扩展信息
            from datetime import datetime
            class_info = BaseClassInfo(
                org_id=cls.id,
                school_id=school_id,
                grade_name=grade.name,
                grade_year=datetime.now().year,  # 默认使用当前年份
                stage=determine_stage(grade.name),
                graduation_status=0
            )
            # 设置班主任
            if data.head_teacher_ids and i < len(data.head_teacher_ids):
                class_info.head_teacher_id = data.head_teacher_ids[i]

            db.add(class_info)
            created_classes.append({"id": cls.id, "name": class_name})

        db.commit()

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module=MODULE_ORG,
            action=ACTION_CREATE,
            description=f"批量创建班级: {grade.name} 下创建 {len(created_classes)} 个班级",
            status="成功",
            request=request
        )

        return {
            "total": data.count,
            "created": len(created_classes),
            "failed": len(errors),
            "classes": created_classes,
            "errors": errors,
            "message": f"成功创建 {len(created_classes)} 个班级"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"批量创建班级失败: {str(e)}")


def determine_stage(grade_name: str) -> str:
    """根据年级名称判断学段"""
    if "高" in grade_name:
        return "高中"
    elif "初" in grade_name or "七" in grade_name or "八" in grade_name or "九" in grade_name:
        return "初中"
    else:
        return "小学"


# 默认教研组列表
DEFAULT_TEACHING_GROUPS = [
    "语文组", "数学组", "英语组", "政治组", "历史组",
    "地理组", "物理组", "化学组", "生物组"
]


class BatchTeachingGroupsCreate(BaseModel):
    """批量创建教研组 - 请求数据"""
    grade_ids: List[int] = []  # 年级ID列表，为空则为所有年级
    group_names: List[str] = []  # 教研组名称列表，为空则使用默认


@router.post("/batch-teaching-groups")
async def batch_create_teaching_groups(
    data: BatchTeachingGroupsCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    批量创建教研组（按年级创建）
    """
    scope = get_user_data_scope(db, current_user)
    # 系统管理员或校区管理员可创建教研组
    if not scope.has_all and len(scope.school_ids) == 0:
        raise HTTPException(status_code=403, detail="无权限创建教研组")

    # 确定要创建的年级
    if data.grade_ids:
        grades = db.query(SysOrg).filter(
            SysOrg.id.in_(data.grade_ids),
            SysOrg.type == "grade"
        ).all()
    else:
        # 获取用户有权限的所有年级
        if scope.has_all:
            grades = db.query(SysOrg).filter(SysOrg.type == "grade").all()
        else:
            grades = db.query(SysOrg).filter(
                SysOrg.id.in_(scope.grade_ids),
                SysOrg.type == "grade"
            ).all()

    if not grades:
        raise HTTPException(status_code=400, detail="未找到年级节点")

    # 确定教研组名称
    group_names = data.group_names if data.group_names else DEFAULT_TEACHING_GROUPS

    created_groups = []
    skipped_groups = []
    errors = []

    try:
        for grade in grades:
            # 获取该年级已有的教研组
            existing_names = set(
                g.name for g in db.query(SysOrg).filter(
                    SysOrg.parent_id == grade.id,
                    SysOrg.type == "teaching_group"
                ).all()
            )

            # 获取当前最大排序值
            max_sort = db.query(SysOrg).filter(SysOrg.parent_id == grade.id).count()

            for idx, group_name in enumerate(group_names):
                if group_name in existing_names:
                    skipped_groups.append({
                        "grade_id": grade.id,
                        "grade_name": grade.name,
                        "group_name": group_name,
                        "reason": "已存在"
                    })
                    continue

                # 创建教研组
                group = SysOrg(
                    name=group_name,
                    type="teaching_group",
                    parent_id=grade.id,
                    sort_order=max_sort + idx + 1,
                    tree_path=f"{grade.tree_path}/{group_name}"
                )
                db.add(group)
                db.flush()
                created_groups.append({
                    "id": group.id,
                    "grade_id": grade.id,
                    "grade_name": grade.name,
                    "group_name": group_name
                })

        db.commit()

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module=MODULE_ORG,
            action=ACTION_CREATE,
            description=f"批量创建教研组: 为 {len(grades)} 个年级创建 {len(created_groups)} 个教研组",
            status="成功",
            request=request
        )

        return {
            "total_grades": len(grades),
            "total_groups_per_grade": len(group_names),
            "created": len(created_groups),
            "skipped": len(skipped_groups),
            "created_groups": created_groups,
            "skipped_groups": skipped_groups,
            "errors": errors,
            "message": f"成功创建 {len(created_groups)} 个教研组，跳过 {len(skipped_groups)} 个已存在的教研组"
        }

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"批量创建教研组失败: {str(e)}")


@router.get("/teaching-group-templates")
async def get_teaching_group_templates(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取教研组模板列表
    """
    return {
        "default_groups": DEFAULT_TEACHING_GROUPS,
        "message": "可自定义教研组名称列表"
    }
