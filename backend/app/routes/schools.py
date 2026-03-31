from typing import Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from io import BytesIO
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from urllib.parse import quote
import random
from pypinyin import lazy_pinyin
from app.database import get_db
from app.models.org import SysOrg, BaseClassInfo, BaseTeacher, BaseClassTeacher
from app.models.user import SysUser
from app.models.role import SysRole
from app.models.student import BaseStudent
from app.utils.deps import get_current_active_user
from app.utils.data_scope import get_user_data_scope
from app.utils.auth import get_password_hash

router = APIRouter()


def sync_teacher_grades(db: Session, teacher_id: int):
    """
    根据教师的任课班级同步更新 BaseTeacher.grades 字段
    从 base_class_teacher 表中提取年级信息
    """
    # 先刷新会话，确保能看到最新的数据库状态
    db.flush()
    
    # 获取该教师所有任课班级
    class_teachers = db.query(BaseClassTeacher).filter(
        BaseClassTeacher.teacher_id == teacher_id,
        BaseClassTeacher.status == 1
    ).all()
    
    # 收集年级名称
    grade_names = set()
    for ct in class_teachers:
        class_org = db.query(SysOrg).filter(SysOrg.id == ct.class_id).first()
        if class_org:
            grade_org = db.query(SysOrg).filter(SysOrg.id == class_org.parent_id).first()
            if grade_org:
                grade_names.add(grade_org.name)
    
    # 更新教师的 grades 字段
    teacher = db.query(BaseTeacher).filter(BaseTeacher.id == teacher_id).first()
    if teacher:
        teacher.grades = ",".join(sorted(grade_names)) if grade_names else None
        db.add(teacher)
        print(f"[DEBUG] 同步教师 {teacher_id}({teacher.name}) 的年级: {teacher.grades}")


def generate_username(db: Session, name: str, phone: str = None) -> str:
    """
    生成唯一的用户名
    使用姓名拼音全拼，如果重名则在后面加数字区分
    """
    # 将中文姓名转为拼音全拼（小写，无空格）
    pinyin_list = lazy_pinyin(name)
    base_username = ''.join(pinyin_list).lower()
    
    # 移除可能存在的特殊字符（只保留字母和数字）
    base_username = ''.join(c for c in base_username if c.isalnum())
    
    if not base_username:
        base_username = 'user'
    
    # 检查是否存在同名用户
    existing = db.query(SysUser).filter(SysUser.username == base_username).first()
    if not existing:
        return base_username
    
    # 如果重名，在后面加数字区分
    for i in range(1, 1000):
        username = f"{base_username}{i}"
        if not db.query(SysUser).filter(SysUser.username == username).first():
            return username
    
    # 极端情况：使用时间戳
    return f"{base_username}{int(datetime.now().timestamp()) % 10000000}"


def create_user_for_teacher(db: Session, teacher: BaseTeacher, school_id: int) -> SysUser:
    """
    为教师创建对应的系统用户账号
    
    Args:
        db: 数据库会话
        teacher: 教师对象
        school_id: 学校ID
        
    Returns:
        创建的SysUser对象
    """
    # 生成用户名
    username = generate_username(db, teacher.name, teacher.phone)
    
    # 检查用户是否已存在（通过姓名和学校）
    existing_user = db.query(SysUser).filter(
        SysUser.real_name == teacher.name,
        SysUser.org_id == school_id
    ).first()
    
    if existing_user:
        # 用户已存在，直接关联
        teacher.user_id = existing_user.id
        db.add(teacher)
        return existing_user
    
    # 创建新用户
    default_password = "111111"
    hashed_password = get_password_hash(default_password)
    
    db_user = SysUser(
        username=username,
        password=hashed_password,
        real_name=teacher.name,
        org_id=school_id,
        status=1,
        password_changed=False
    )
    db.add(db_user)
    db.flush()  # 获取 user.id
    
    # 分配教师角色 (ROLE_TEACHER, id=3)
    teacher_role = db.query(SysRole).filter(SysRole.code == "ROLE_TEACHER").first()
    if teacher_role:
        db.execute(
            "INSERT INTO sys_user_role (user_id, role_id) VALUES (:user_id, :role_id)",
            {"user_id": db_user.id, "role_id": teacher_role.id}
        )
    
    # 关联到教师档案
    teacher.user_id = db_user.id
    db.add(teacher)
    
    return db_user


def infer_stages_from_grades(db: Session, school_id: int) -> Optional[str]:
    """
    根据学校下的年级名称推断学段
    返回: '小学' | '初中' | '高中' | '小学,初中' | '初中,高中' | '小学,初中,高中' | None
    """
    # 获取学校下的所有年级
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()

    if not grades:
        return None

    # 根据年级名称推断学段
    stages_set = set()
    for grade in grades:
        grade_name = grade.name
        # 按优先级检查：高中 > 初中 > 小学
        if '高' in grade_name:
            stages_set.add('高中')
        elif '初' in grade_name:
            stages_set.add('初中')
        elif '小' in grade_name:
            stages_set.add('小学')

    if not stages_set:
        return None

    # 按标准顺序返回学段：小学,初中,高中
    stages_list = []
    if '小学' in stages_set:
        stages_list.append('小学')
    if '初中' in stages_set:
        stages_list.append('初中')
    if '高中' in stages_set:
        stages_list.append('高中')

    stages_value = ','.join(stages_list)

    # 如果stages字段为空，自动更新到数据库
    school = db.query(SysOrg).filter(SysOrg.id == school_id).first()
    if school and not school.stages:
        school.stages = stages_value
        db.commit()
        db.refresh(school)

    return stages_value


# Pydantic models for request/response
class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    school_type: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    principal_name: Optional[str] = None
    contact_phone: Optional[str] = None
    stages: Optional[str] = None


class SchoolResponse(BaseModel):
    id: int
    name: str
    school_type: Optional[str]
    province: Optional[str]
    city: Optional[str]
    district: Optional[str]
    address: Optional[str]
    principal_name: Optional[str]
    contact_phone: Optional[str]
    stages: Optional[str]
    student_count: int = 0
    teacher_count: int = 0
    grade_count: int = 0
    class_count: int = 0

    class Config:
        from_attributes = True


class ClassTeacherCreate(BaseModel):
    teacher_id: int
    subject: str
    is_head_teacher: bool = False


@router.get("/list")
async def get_schools_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get list of schools with statistics (filtered by user's data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    try:
        # Get schools filtered by data scope
        query = db.query(SysOrg).filter(SysOrg.type == "school")
        
        # 应用数据权限过滤
        if not scope.has_all:
            if scope.school_ids:
                query = query.filter(SysOrg.id.in_(scope.school_ids))
            else:
                # 没有学校权限，返回空列表
                return {
                    "total": 0,
                    "page": page,
                    "page_size": page_size,
                    "schools": []
                }
        
        total = query.count()
        schools = query.offset((page - 1) * page_size).limit(page_size).all()
        
        result = []
        for school in schools:
            try:
                # Count grades under this school
                grades = db.query(SysOrg).filter(
                    SysOrg.parent_id == school.id,
                    SysOrg.type == 'grade'
                ).all()
                grade_count = len(grades)
                
                # Count classes
                grade_ids = [g.id for g in grades]
                class_count = 0
                if grade_ids:
                    class_count = db.query(SysOrg).filter(
                        SysOrg.parent_id.in_(grade_ids)
                    ).count()
                
                # Count students (through class_id -> class -> grade -> school)
                # Get all class IDs under this school
                class_ids = []
                for grade_id in grade_ids:
                    classes = db.query(SysOrg).filter(
                        SysOrg.parent_id == grade_id,
                        SysOrg.type == "class"
                    ).all()
                    class_ids.extend([c.id for c in classes])
                
                student_count = 0
                if class_ids:
                    student_count = db.query(BaseStudent).filter(
                        BaseStudent.class_id.in_(class_ids),
                        BaseStudent.status == 1
                    ).count()
                
                # Count teachers (from base_teacher table with school_id)
                teacher_count = db.query(BaseTeacher).filter(
                    BaseTeacher.school_id == school.id
                ).count()
                
                # Parse address to extract province/city/district
                address = school.address or ""
                province = ""
                city = ""
                district = ""
                detail_address = address
                
                # Simple address parsing for Chinese addresses
                if address:
                    # Extract province (省、自治区、直辖市)
                    if "省" in address:
                        idx = address.index("省")
                        province = address[:idx+1]
                        remaining = address[idx+1:]
                    elif "自治区" in address:
                        idx = address.index("自治区") + 3
                        province = address[:idx]
                        remaining = address[idx:]
                    elif address.startswith("北京") or address.startswith("天津") or \
                         address.startswith("上海") or address.startswith("重庆"):
                        province = address[:2] + "市"
                        remaining = address[2:]
                    else:
                        remaining = address
                    
                    # Extract city (市)
                    if "市" in remaining:
                        idx = remaining.index("市")
                        city = remaining[:idx+1]
                        remaining = remaining[idx+1:]
                    
                    # Extract district (区、县)
                    if "区" in remaining:
                        idx = remaining.index("区")
                        district = remaining[:idx+1]
                        detail_address = remaining[idx+1:]
                    elif "县" in remaining:
                        idx = remaining.index("县")
                        district = remaining[:idx+1]
                        detail_address = remaining[idx+1:]

                # 自动计算学段（如果为空）
                stages = school.stages
                if not stages:
                    stages = infer_stages_from_grades(db, school.id)

                result.append({
                    "id": school.id,
                    "name": school.name,
                    "type": school.school_type or "",
                    "province": province,
                    "city": city,
                    "district": district,
                    "address": detail_address,
                    "principal": school.principal_name or "",
                    "contact": school.contact_phone or "",
                    "stages": stages or "",
                    "studentCount": student_count,
                    "teacherCount": teacher_count,
                    "gradeCount": grade_count,
                    "classCount": class_count
                })
            except Exception as e:
                import traceback
                print(f"Error processing school {school.id}: {str(e)}")
                print(traceback.format_exc())
                raise
        
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "schools": result
        }
    except Exception as e:
        import traceback
        print(f"Error in get_schools_list: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{school_id}/detail")
async def get_school_detail(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get detailed information of a specific school (requires access to the school)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限访问该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校信息")
    
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # Count statistics
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school.id,
        SysOrg.type == 'grade'
    ).all()
    grade_count = len(grades)
    
    grade_ids = [g.id for g in grades]
    class_count = 0
    if grade_ids:
        class_count = db.query(SysOrg).filter(
            SysOrg.parent_id.in_(grade_ids)
        ).count()
    
    # Get all class IDs under this school
    class_ids = []
    for grade_id in grade_ids:
        classes = db.query(SysOrg).filter(
            SysOrg.parent_id == grade_id,
            SysOrg.type == "class"
        ).all()
        class_ids.extend([c.id for c in classes])
    
    student_count = 0
    if class_ids:
        student_count = db.query(BaseStudent).filter(
            BaseStudent.class_id.in_(class_ids),
            BaseStudent.status == 1
        ).count()
    
    teacher_count = db.query(BaseTeacher).filter(
        BaseTeacher.school_id == school.id
    ).count()

    # Parse address to extract province/city/district
    address = school.address or ""
    province = ""
    city = ""
    district = ""
    detail_address = address
    
    # Simple address parsing for Chinese addresses
    if address:
        # Extract province (省、自治区、直辖市)
        if "省" in address:
            idx = address.index("省")
            province = address[:idx+1]
            remaining = address[idx+1:]
        elif "自治区" in address:
            idx = address.index("自治区") + 3
            province = address[:idx]
            remaining = address[idx:]
        elif address.startswith("北京") or address.startswith("天津") or \
             address.startswith("上海") or address.startswith("重庆"):
            province = address[:2] + "市"
            remaining = address[2:]
        else:
            remaining = address
        
        # Extract city (市)
        if "市" in remaining:
            idx = remaining.index("市")
            city = remaining[:idx+1]
            remaining = remaining[idx+1:]
        
        # Extract district (区、县)
        if "区" in remaining:
            idx = remaining.index("区")
            district = remaining[:idx+1]
            detail_address = remaining[idx+1:]
        elif "县" in remaining:
            idx = remaining.index("县")
            district = remaining[:idx+1]
            detail_address = remaining[idx+1:]

    # 自动计算学段（如果为空）
    stages = school.stages
    if not stages:
        stages = infer_stages_from_grades(db, school.id)

    return {
        "id": school.id,
        "name": school.name,
        "type": school.school_type or "",
        "province": province,
        "city": city,
        "district": district,
        "address": detail_address,
        "principal": school.principal_name or "",
        "contact": school.contact_phone or "",
        "stages": stages or "",
        "studentCount": student_count,
        "teacherCount": teacher_count,
        "gradeCount": grade_count,
        "classCount": class_count
    }

@router.put("/{school_id}")
async def update_school(
    school_id: int,
    school_data: SchoolUpdate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update school information (requires access to the school)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限修改该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限修改该学校信息")
    
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # Update fields
    if school_data.name is not None:
        school.name = school_data.name
    if school_data.school_type is not None:
        school.school_type = school_data.school_type
    if school_data.address is not None:
        # Combine province/city/district with address
        full_address = ""
        if school_data.province:
            full_address += school_data.province
        if school_data.city:
            full_address += school_data.city
        if school_data.district:
            full_address += school_data.district
        if school_data.address:
            full_address += school_data.address
        school.address = full_address
    if school_data.principal_name is not None:
        school.principal_name = school_data.principal_name
    if school_data.contact_phone is not None:
        school.contact_phone = school_data.contact_phone
    if school_data.stages is not None:
        school.stages = school_data.stages
    
    db.commit()
    db.refresh(school)
    
    return {
        "id": school.id,
        "name": school.name,
        "message": "School updated successfully"
    }

@router.get("/{school_id}/classes")
async def get_school_classes(
    school_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    grade_id: Optional[int] = Query(None, description="年级ID筛选"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get classes under a school with pagination
    支持多层组织结构：学校下的年级可能在直接子节点，也可能在更深层级
    应用数据权限过滤：年级主任只能看到本年级的班级
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限访问该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校数据")
    
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 方式1：直接查询 parent_id == school_id 的年级
    direct_grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()
    
    # 方式2：通过 tree_path 查询属于该学校的所有年级（支持多层嵌套）
    school_name = school.name
    all_orgs_with_path = db.query(SysOrg).filter(
        SysOrg.tree_path.like(f'%/{school_name}/%'),
        SysOrg.type == 'grade'
    ).all()
    
    # 合并两种查询结果（去重）
    grade_ids = set()
    all_grades = []
    for g in direct_grades:
        if g.id not in grade_ids:
            grade_ids.add(g.id)
            all_grades.append(g)
    for g in all_orgs_with_path:
        if g.id not in grade_ids:
            grade_ids.add(g.id)
            all_grades.append(g)
    
    # 方式3：递归查找所有子节点中的年级（兜底方案）
    def find_grades_recursively(parent_id: int, visited: set = None) -> list:
        if visited is None:
            visited = set()
        if parent_id in visited:
            return []
        visited.add(parent_id)
        
        grades_found = []
        children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
        print(f"[DEBUG] find_grades_recursively: parent_id={parent_id}, found {len(children)} children")
        for child in children:
            print(f"[DEBUG]   Child: id={child.id}, name={child.name}, type={child.type}")
            if child.type == 'grade' and child.id not in grade_ids:
                grades_found.append(child)
                grade_ids.add(child.id)
                print(f"[DEBUG]     -> Added grade: {child.name}")
            elif child.type in ['dept', 'campus', 'department']:  # 可能包含年级的中间层级
                print(f"[DEBUG]     -> Recursing into {child.name}")
                grades_found.extend(find_grades_recursively(child.id, visited))
        return grades_found
    
    recursive_grades = find_grades_recursively(school_id)
    print(f"[DEBUG] Recursive grades found: {len(recursive_grades)}")
    all_grades.extend(recursive_grades)
    
    grades = all_grades
    print(f"[DEBUG] get_school_classes - school_id: {school_id}, found {len(grades)} grades")
    for g in grades:
        print(f"[DEBUG] Grade: id={g.id}, name={g.name}, parent_id={g.parent_id}, type={g.type}, tree_path={g.tree_path}")
    
    # 直接查询学校下的所有班级（调试用）
    all_school_classes = db.query(SysOrg).filter(
        SysOrg.type == "class"
    ).all()
    print(f"[DEBUG] Total classes in database: {len(all_school_classes)}")
    for cls in all_school_classes[:20]:  # 只打印前20个避免日志过多
        parent = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
        parent_name = parent.name if parent else "N/A"
        parent_type = parent.type if parent else "N/A"
        print(f"[DEBUG] Class: id={cls.id}, name={cls.name}, parent_id={cls.parent_id}, parent_name={parent_name}, parent_type={parent_type}, tree_path={cls.tree_path}")

    # Build grade sort order mapping
    def get_grade_sort_value(grade_name: str) -> int:
        """提取年级名称中的数字作为排序值"""
        import re
        # 匹配中文数字：一、二、三... 十、十一...
        cn_numbers = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '十一': 11, '十二': 12
        }
        # 先检查高中：21-23
        if '高' in grade_name:
            match = re.search(r'高([一二三])', grade_name)
            if match:
                cn_num = match.group(1)
                return 20 + cn_numbers.get(cn_num, 99)
            return 99

        # 再检查初中：11-13
        elif '初' in grade_name:
            match = re.search(r'初([一二三])', grade_name)
            if match:
                cn_num = match.group(1)
                return 10 + cn_numbers.get(cn_num, 99)
            return 99

        # 最后检查小学：1-6
        elif '小' in grade_name or grade_name.startswith('小'):
            match = re.search(r'[小]?十[一二]?|[一二三四五六]', grade_name)
            if match:
                cn_num = match.group()
                return cn_numbers.get(cn_num, 99)
            match = re.search(r'\d+', grade_name)
            if match:
                num = int(match.group())
                if 1 <= num <= 6:
                    return num
            return 99
        else:
            # 检查简单的"一年级"、"二年级"等格式
            match = re.search(r'([一二三四五六])年级?', grade_name)
            if match:
                cn_num = match.group(1)
                return cn_numbers.get(cn_num, 99)

        # 其他情况：尝试提取任意数字
        match = re.search(r'\d+', grade_name)
        if match:
            return int(match.group())
        return 999

    def get_class_sort_value(class_name: str) -> int:
        """提取班级名称中的数字作为排序值"""
        import re
        # 提取阿拉伯数字
        match = re.search(r'\d+', class_name)
        if match:
            return int(match.group())
        # 尝试提取中文数字
        cn_numbers = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
        }
        for cn_num, value in cn_numbers.items():
            if cn_num in class_name:
                return value
        return 999

    # 对年级进行排序
    sorted_grades = sorted(grades, key=lambda g: get_grade_sort_value(g.name))
    
    # 应用数据权限过滤年级（非全部权限用户只能看到有权限的年级）
    if not scope.has_all:
        # 过滤出用户有权限访问的年级
        if scope.grade_ids:
            sorted_grades = [g for g in sorted_grades if g.id in scope.grade_ids]
        else:
            # 如果没有年级权限，但可能有班级权限，需要保留包含这些班级的年级
            if scope.class_ids:
                # 查找这些班级所属的年级
                class_grades = set()
                for class_id in scope.class_ids:
                    cls = db.query(SysOrg).filter(SysOrg.id == class_id).first()
                    if cls and cls.parent_id:
                        class_grades.add(cls.parent_id)
                sorted_grades = [g for g in sorted_grades if g.id in class_grades]
            else:
                sorted_grades = []

    # 获取班级数据
    all_classes_data = []

    for grade in sorted_grades:
        # 检查年级筛选
        if grade_id and grade.id != grade_id:
            continue

        # Get all classes under this grade
        # 方式1：直接查询 parent_id == grade.id 的班级
        direct_classes = db.query(SysOrg).filter(
            SysOrg.parent_id == grade.id,
            SysOrg.type == "class"
        ).all()
        
        # 方式2：递归查找该年级下的所有班级（兜底方案）
        def find_classes_recursively(parent_id: int, visited: set = None) -> list:
            if visited is None:
                visited = set()
            if parent_id in visited:
                return []
            visited.add(parent_id)
            
            classes_found = []
            children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
            for child in children:
                if child.type == "class":
                    classes_found.append(child)
                elif child.type in ['dept', 'campus', 'department', 'grade']:
                    classes_found.extend(find_classes_recursively(child.id, visited))
            return classes_found
        
        recursive_classes = find_classes_recursively(grade.id)
        
        # 合并两种查询结果（去重）- 移除tree_path查询，避免跨学校匹配
        class_ids = set()
        grade_classes = []
        print(f"[DEBUG] Grade {grade.name} (ID: {grade.id}) - Direct classes: {[c.name for c in direct_classes]}")
        print(f"[DEBUG] Grade {grade.name} (ID: {grade.id}) - Recursive classes: {[c.name for c in recursive_classes]}")
        for cls in direct_classes:
            if cls.id not in class_ids:
                class_ids.add(cls.id)
                grade_classes.append(cls)
        for cls in recursive_classes:
            if cls.id not in class_ids:
                class_ids.add(cls.id)
                grade_classes.append(cls)
        
        print(f"[DEBUG] Grade {grade.name} (ID: {grade.id}) - Total unique classes: {len(grade_classes)} : {[c.name for c in grade_classes]}")

        # 对班级进行排序
        sorted_classes = sorted(grade_classes, key=lambda c: get_class_sort_value(c.name))
        
        # 应用数据权限过滤班级（非全部权限用户只能看到有权限的班级）
        if not scope.has_all:
            if scope.class_ids:
                sorted_classes = [c for c in sorted_classes if c.id in scope.class_ids]

        # 应用关键词搜索
        if keyword:
            sorted_classes = [c for c in sorted_classes if keyword in c.name]

        # 构建班级数据
        for cls in sorted_classes:
            # Get class info
            class_info = db.query(BaseClassInfo).filter(
                BaseClassInfo.org_id == cls.id
            ).first()

            # Get head teacher name - 直接通过 SysUser.id 查询
            head_teacher_name = ""
            if class_info and class_info.head_teacher_id:
                from app.models.user import SysUser
                sys_user = db.query(SysUser).filter(
                    SysUser.id == class_info.head_teacher_id
                ).first()
                if sys_user:
                    head_teacher_name = sys_user.real_name

            # Get subject teachers from base_class_teacher table
            # teacher_id 直接关联 BaseTeacher.id
            # 学科名称映射（中文转英文键名，与前端的 ClassInfo 接口保持一致）
            subject_key_map = {
                '语文': 'chinese',
                '数学': 'math',
                '英语': 'english',
                '物理': 'physics',
                '化学': 'chemistry',
                '生物': 'biology',
                '地理': 'geography',
                '政治': 'politics',
                '历史': 'history',
                '道德与法治': 'morality',
                '信息技术': 'it',
                '体育': 'pe',
                '音乐': 'music',
                # 也支持英文输入
                'chinese': 'chinese',
                'math': 'math',
                'english': 'english',
                'physics': 'physics',
                'chemistry': 'chemistry',
                'biology': 'biology',
                'geography': 'geography',
                'politics': 'politics',
                'history': 'history',
                'morality': 'morality',
                'it': 'it',
                'pe': 'pe',
                'music': 'music',
            }
            teachers_data = {}
            class_teachers = db.query(BaseClassTeacher).filter(
                BaseClassTeacher.class_id == cls.id
            ).all()
            for ct in class_teachers:
                teacher = db.query(BaseTeacher).filter(
                    BaseTeacher.id == ct.teacher_id
                ).first()
                if teacher and teacher.name:
                    # 将中文 subject 转换为英文键名
                    subject_key = subject_key_map.get(ct.subject, ct.subject)
                    teachers_data[subject_key] = teacher.name

            # Get stage from grade name or class_info
            stage = ""
            if class_info and class_info.stage:
                stage = class_info.stage
            elif grade:
                # Extract stage from grade name (e.g., "初一年级" -> "初中")
                if "初" in grade.name:
                    stage = "初中"
                elif "高" in grade.name:
                    stage = "高中"
                elif "小" in grade.name:
                    stage = "小学"

            all_classes_data.append({
                "id": cls.id,
                "name": cls.name,
                "grade": grade.name,
                "stage": stage,
                "school": school.name,
                "headTeacher": head_teacher_name,
                "teachers": teachers_data,
                "seatingGroups": class_info.seating_chart.get("groups", []) if class_info and class_info.seating_chart else [],
                "seatingRowCount": class_info.seating_chart.get("rowCount", 8) if class_info and class_info.seating_chart else 8,
                "allStudents": class_info.all_students if class_info and class_info.all_students else [],
                "grade_sort": get_grade_sort_value(grade.name),
                "class_sort": get_class_sort_value(cls.name)
            })
            
            # Debug log
            print(f"[DEBUG] Added class to response: {cls.name} (ID: {cls.id}), total now: {len(all_classes_data)}")

    # Get total count
    total = len(all_classes_data)

    # Apply pagination
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paginated_classes = all_classes_data[start_index:end_index]

    # Remove sort values from response
    for class_data in paginated_classes:
        class_data.pop('grade_sort', None)
        class_data.pop('class_sort', None)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "classes": paginated_classes
    }

class BatchUpgradeRequest(BaseModel):
    class_ids: list[int]
    target_grade_id: int
    settings: Optional[dict] = None  # 升级设置


class UpgradeSettings(BaseModel):
    autoArchiveGraduates: bool = False
    clearSeatingChart: bool = True
    resetMoralScore: bool = True
    backupData: bool = True


@router.post("/{school_id}/upgrade-settings")
async def save_upgrade_settings(
    school_id: int,
    settings: UpgradeSettings,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Save upgrade settings for a school
    """
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 记录操作日志
    from app.models.log import SysOperationLog
    log = SysOperationLog(
        user_id=current_user.id,
        username=current_user.username,
        action="保存升级设置",
        module="班级管理",
        description=f"autoArchiveGraduates={settings.autoArchiveGraduates}",
        status="成功",
        ip_address=current_user.last_login_ip or "127.0.0.1",
        request_method="POST",
        request_path=f"/api/schools/{school_id}/upgrade-settings",
        request_params=f"autoArchiveGraduates={settings.autoArchiveGraduates}",
        response_code=200
    )
    db.add(log)
    db.commit()
    
    return {
        "message": "升级设置已保存",
        "settings": settings.dict()
    }

@router.get("/{school_id}/upgrade-settings")
async def get_upgrade_settings(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get upgrade settings for a school
    """
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # 返回默认设置
    return {
        "autoArchiveGraduates": True,
        "clearSeatingChart": True,
        "resetMoralScore": True,
        "backupData": True
    }

@router.post("/{school_id}/classes/batch-upgrade")
async def batch_upgrade_classes(
    school_id: int,
    upgrade_data: BatchUpgradeRequest,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Batch upgrade classes to a new grade
    """
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # Verify target grade exists and belongs to this school
    target_grade = db.query(SysOrg).filter(
        SysOrg.id == upgrade_data.target_grade_id,
        SysOrg.parent_id == school_id,
        SysOrg.type == "grade"
    ).first()
    
    if not target_grade:
        raise HTTPException(status_code=404, detail="Target grade not found")
    
    # 获取升级设置
    settings = upgrade_data.settings or {}
    auto_archive_graduates = settings.get("autoArchiveGraduates", False)
    clear_seating_chart = settings.get("clearSeatingChart", True)
    reset_moral_score = settings.get("resetMoralScore", True)
    backup_data = settings.get("backupData", True)
    
    # 检查是否为毕业年级
    is_graduation = target_grade.name == "已毕业"
    
    upgraded_count = 0
    graduated_count = 0
    
    for class_id in upgrade_data.class_ids:
        # Verify class exists and belongs to this school
        cls = db.query(SysOrg).filter(
            SysOrg.id == class_id,
            SysOrg.type == "class"
        ).first()
        
        if not cls:
            continue
        
        # Verify class's current grade belongs to this school
        current_grade = db.query(SysOrg).filter(
            SysOrg.id == cls.parent_id,
            SysOrg.parent_id == school_id,
            SysOrg.type == "grade"
        ).first()
        
        if not current_grade:
            continue
        
        # Get class info
        class_info = db.query(BaseClassInfo).filter(
            BaseClassInfo.org_id == class_id
        ).first()
        
        if is_graduation:
            # 毕业班级处理
            graduated_count += 1
            
            if class_info:
                # 设置毕业状态
                class_info.graduation_status = 1
                
                # 如果启用归档，将班级移至归档状态
                if auto_archive_graduates:
                    # 将班级的 parent_id 设为 0 或特定的归档年级
                    cls.parent_id = 0
                    cls.name = f"{cls.name}（已毕业）"
                    
                    # 更新班级下所有学生的状态
                    db.query(BaseStudent).filter(
                        BaseStudent.class_id == class_id,
                        BaseStudent.status == 1
                    ).update({"status": 3})  # 3: 毕业

                    # 记录归档操作日志
                    from app.models.log import SysOperationLog
                    log = SysOperationLog(
                        user_id=current_user.id,
                        username=current_user.username,
                        action="班级毕业归档",
                        module="班级管理",
                        description=f"班级ID: {class_id}",
                        status="成功",
                        ip_address=current_user.last_login_ip or "127.0.0.1",
                        request_method="POST",
                        request_path=f"/api/schools/{school_id}/classes/batch-upgrade",
                        request_params=f"班级ID: {class_id}",
                        response_code=200
                    )
                    db.add(log)
        else:
            # 正常升级处理
            upgraded_count += 1
            
            # Update class parent to new grade
            cls.parent_id = upgrade_data.target_grade_id
            
            if class_info:
                # Extract stage from target grade name
                if "初" in target_grade.name:
                    class_info.stage = "初中"
                elif "高" in target_grade.name:
                    class_info.stage = "高中"
                elif "小" in target_grade.name:
                    class_info.stage = "小学"
                
                # 清理座位表
                if clear_seating_chart and class_info.seating_chart:
                    class_info.seating_chart = {}
                
                # 重置德育评分（记录操作日志）
                if reset_moral_score:
                    from app.models.log import SysOperationLog
                    log = SysOperationLog(
                        user_id=current_user.id,
                        username=current_user.username,
                        action="重置德育评分",
                        module="班级管理",
                        description=f"班级ID: {class_id}",
                        status="成功",
                        ip_address=current_user.last_login_ip or "127.0.0.1",
                        request_method="POST",
                        request_path=f"/api/schools/{school_id}/classes/batch-upgrade",
                        request_params=f"班级ID: {class_id}",
                        response_code=200
                    )
                    db.add(log)
                
                # 备份数据（记录操作日志）
                if backup_data:
                    from app.models.log import SysOperationLog
                    log = SysOperationLog(
                        user_id=current_user.id,
                        username=current_user.username,
                        action="备份数据",
                        module="班级管理",
                        description=f"班级ID: {class_id}",
                        status="成功",
                        ip_address=current_user.last_login_ip or "127.0.0.1",
                        request_method="POST",
                        request_path=f"/api/schools/{school_id}/classes/batch-upgrade",
                        request_params=f"班级ID: {class_id}",
                        response_code=200
                    )
                    db.add(log)
    
    db.commit()
    
    return {
        "message": f"成功处理 {upgraded_count + graduated_count} 个班级",
        "upgraded_count": upgraded_count,
        "graduated_count": graduated_count
    }

@router.get("/{school_id}/grades")
async def get_school_grades(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all grades under a school (based on org hierarchy)
    支持多层组织结构：学校下的年级可能在直接子节点，也可能在更深层级
    """
    from app.utils.data_scope import get_user_data_scope
    
    # 数据权限验证
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校数据")

    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 方式1：直接查询 parent_id == school_id 的年级
    direct_grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == "grade"
    ).all()
    
    # 方式2：通过 tree_path 查询属于该学校的所有年级（支持多层嵌套）
    school_name = school.name
    all_orgs_with_path = db.query(SysOrg).filter(
        SysOrg.tree_path.like(f'%/{school_name}/%'),
        SysOrg.type == 'grade'
    ).all()
    
    # 合并两种查询结果（去重）
    grade_ids = set()
    all_grades = []
    for g in direct_grades:
        if g.id not in grade_ids:
            grade_ids.add(g.id)
            all_grades.append(g)
    for g in all_orgs_with_path:
        if g.id not in grade_ids:
            grade_ids.add(g.id)
            all_grades.append(g)
    
    # 方式3：递归查找所有子节点中的年级（兜底方案）
    def find_grades_recursively(parent_id: int, visited: set = None) -> list:
        if visited is None:
            visited = set()
        if parent_id in visited:
            return []
        visited.add(parent_id)
        
        grades_found = []
        children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
        print(f"[DEBUG] find_grades_recursively: parent_id={parent_id}, found {len(children)} children")
        for child in children:
            print(f"[DEBUG]   Child: id={child.id}, name={child.name}, type={child.type}")
            if child.type == 'grade' and child.id not in grade_ids:
                grades_found.append(child)
                grade_ids.add(child.id)
                print(f"[DEBUG]     -> Added grade: {child.name}")
            elif child.type in ['dept', 'campus', 'department']:  # 可能包含年级的中间层级
                print(f"[DEBUG]     -> Recursing into {child.name}")
                grades_found.extend(find_grades_recursively(child.id, visited))
        return grades_found
    
    recursive_grades = find_grades_recursively(school_id)
    print(f"[DEBUG] Recursive grades found: {len(recursive_grades)}")
    all_grades.extend(recursive_grades)
    
    grades = all_grades
    print(f"[DEBUG] get_school_grades - school_id: {school_id}, found {len(grades)} grades")

    # 提取年级名称中的数字作为排序值
    import re
    cn_numbers = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '十一': 11, '十二': 12
    }

    def get_grade_sort_value(grade_name: str) -> int:
        """提取年级名称中的数字作为排序值"""
        # 先检查高中：21-23
        if '高' in grade_name:
            match = re.search(r'高([一二三])', grade_name)
            if match:
                cn_num = match.group(1)
                return 20 + cn_numbers.get(cn_num, 99)
            return 99

        # 再检查初中：11-13
        elif '初' in grade_name:
            match = re.search(r'初([一二三])', grade_name)
            if match:
                cn_num = match.group(1)
                return 10 + cn_numbers.get(cn_num, 99)
            return 99

        # 最后检查小学：1-6
        elif '小' in grade_name or grade_name.startswith('小'):
            match = re.search(r'[小]?十[一二]?|[一二三四五六]', grade_name)
            if match:
                cn_num = match.group()
                return cn_numbers.get(cn_num, 99)
            match = re.search(r'\d+', grade_name)
            if match:
                num = int(match.group())
                if 1 <= num <= 6:
                    return num
            return 99
        else:
            # 检查简单的"一年级"、"二年级"等格式
            match = re.search(r'([一二三四五六])年级?', grade_name)
            if match:
                cn_num = match.group(1)
                return cn_numbers.get(cn_num, 99)

        # 其他情况：尝试提取任意数字
        match = re.search(r'\d+', grade_name)
        if match:
            return int(match.group())
        return 999

    # 对年级进行排序
    sorted_grades = sorted(grades, key=lambda g: get_grade_sort_value(g.name))
    
    # 应用数据权限过滤年级
    if not scope.has_all:
        if scope.grade_ids:
            sorted_grades = [g for g in sorted_grades if g.id in scope.grade_ids]
        elif scope.class_ids:
            # 如果没有年级权限但有班级权限，从班级反推年级
            class_grades = set()
            for class_id in scope.class_ids:
                cls = db.query(SysOrg).filter(SysOrg.id == class_id).first()
                if cls and cls.parent_id:
                    class_grades.add(cls.parent_id)
            sorted_grades = [g for g in sorted_grades if g.id in class_grades]
        else:
            sorted_grades = []

    result = []
    for grade in sorted_grades:

        # Get stage from grade name
        stage = ""
        if "初" in grade.name:
            stage = "初中"
        elif "高" in grade.name:
            stage = "高中"
        elif "小" in grade.name:
            stage = "小学"

        # Count classes under this grade
        class_count = db.query(SysOrg).filter(
            SysOrg.parent_id == grade.id,
            SysOrg.type == "class"
        ).count()

        result.append({
            "id": grade.id,
            "name": grade.name,
            "stage": stage,
            "classCount": class_count
        })

    return result


@router.get("/{school_id}/grades/{grade_id}/classes")
async def get_grade_classes(
    school_id: int,
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all classes under a specific grade (based on org hierarchy)
    支持多层组织结构：年级不一定直接属于学校
    应用数据权限过滤：年级主任只能看到本年级的班级
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限访问该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校数据")
    
    # 检查是否有权限访问该年级
    if not scope.has_all and scope.grade_ids and grade_id not in scope.grade_ids:
        raise HTTPException(status_code=403, detail="无权限访问该年级数据")
    
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # 方式1：直接验证年级属于该学校（parent_id == school_id）
    grade = db.query(SysOrg).filter(
        SysOrg.id == grade_id,
        SysOrg.parent_id == school_id,
        SysOrg.type == "grade"
    ).first()
    
    # 方式2：如果方式1没找到，通过 tree_path 验证年级属于该学校
    if not grade:
        school_name = school.name
        grade = db.query(SysOrg).filter(
            SysOrg.id == grade_id,
            SysOrg.tree_path.like(f'%/{school_name}/%'),
            SysOrg.type == "grade"
        ).first()
    
    # 方式3：递归向上查找，确认年级属于该学校
    if not grade:
        grade_candidate = db.query(SysOrg).filter(
            SysOrg.id == grade_id,
            SysOrg.type == "grade"
        ).first()
        
        if grade_candidate:
            # 向上遍历，确认是否属于该学校
            def is_under_school(org_id: int, target_school_id: int, visited: set = None) -> bool:
                if visited is None:
                    visited = set()
                if org_id in visited:
                    return False
                visited.add(org_id)
                
                org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
                if not org:
                    return False
                if org.id == target_school_id:
                    return True
                if org.parent_id == 0 or org.parent_id is None:
                    return False
                return is_under_school(org.parent_id, target_school_id, visited)
            
            if is_under_school(grade_candidate.parent_id, school_id):
                grade = grade_candidate
    
    if not grade:
        print(f"[DEBUG] Grade not found - grade_id: {grade_id}, school_id: {school_id}")
        raise HTTPException(status_code=404, detail="Grade not found or does not belong to this school")

    print(f"[DEBUG] Found grade - id: {grade.id}, name: {grade.name}, parent_id: {grade.parent_id}")

    # Get all classes under this grade
    classes = db.query(SysOrg).filter(
        SysOrg.parent_id == grade_id,
        SysOrg.type == "class"
    ).all()
    
    print(f"[DEBUG] Found {len(classes)} classes under grade {grade.name}")

    # 提取班级名称中的数字作为排序值
    import re
    cn_numbers = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    }

    def get_class_sort_value(class_name: str) -> int:
        """提取班级名称中的数字作为排序值"""
        # 提取阿拉伯数字
        match = re.search(r'\d+', class_name)
        if match:
            return int(match.group())
        # 尝试提取中文数字
        for cn_num, value in cn_numbers.items():
            if cn_num in class_name:
                return value
        return 999

    # 对班级进行排序
    sorted_classes = sorted(classes, key=lambda c: get_class_sort_value(c.name))
    
    # 应用数据权限过滤班级
    if not scope.has_all:
        if scope.class_ids:
            sorted_classes = [c for c in sorted_classes if c.id in scope.class_ids]

    result = []
    for cls in sorted_classes:
        # Get class info
        class_info = db.query(BaseClassInfo).filter(
            BaseClassInfo.org_id == cls.id
        ).first()

        # Get head teacher name - 直接通过 SysUser.id 查询
        head_teacher_name = ""
        if class_info and class_info.head_teacher_id:
            from app.models.user import SysUser
            sys_user = db.query(SysUser).filter(
                SysUser.id == class_info.head_teacher_id
            ).first()
            if sys_user:
                head_teacher_name = sys_user.real_name

        # Get subject teachers from base_class_teacher table
        # teacher_id 直接关联 BaseTeacher.id
        # 学科名称映射（中文转英文键名，与前端的 ClassInfo 接口保持一致）
        subject_key_map = {
            '语文': 'chinese',
            '数学': 'math',
            '英语': 'english',
            '物理': 'physics',
            '化学': 'chemistry',
            '生物': 'biology',
            '地理': 'geography',
            '政治': 'politics',
            '历史': 'history',
            '道德与法治': 'morality',
            '信息技术': 'it',
            '体育': 'pe',
            '音乐': 'music',
            # 也支持英文输入
            'chinese': 'chinese',
            'math': 'math',
            'english': 'english',
            'physics': 'physics',
            'chemistry': 'chemistry',
            'biology': 'biology',
            'geography': 'geography',
            'politics': 'politics',
            'history': 'history',
            'morality': 'morality',
            'it': 'it',
            'pe': 'pe',
            'music': 'music',
        }
        teachers_data = {}
        class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id == cls.id
        ).all()
        for ct in class_teachers:
            teacher = db.query(BaseTeacher).filter(
                BaseTeacher.id == ct.teacher_id
            ).first()
            if teacher:
                # 将中文 subject 转换为英文键名
                subject_key = subject_key_map.get(ct.subject, ct.subject)
                teachers_data[subject_key] = teacher.name

        # Get stage from grade name
        stage = ""
        if "初" in grade.name:
            stage = "初中"
        elif "高" in grade.name:
            stage = "高中"
        elif "小" in grade.name:
            stage = "小学"

        result.append({
            "id": cls.id,
            "name": cls.name,
            "grade": grade.name,
            "stage": stage,
            "school": school.name,
            "headTeacher": head_teacher_name,
            "teachers": teachers_data,
            "seatingGroups": class_info.seating_chart.get("groups", []) if class_info and class_info.seating_chart else [],
            "seatingRowCount": class_info.seating_chart.get("rowCount", 8) if class_info and class_info.seating_chart else 8,
            "allStudents": class_info.all_students if class_info and class_info.all_students else []
        })

    return result


# IMPORTANT: /teachers/all must be defined before /{school_id}/teachers
# to avoid being intercepted by the path parameter
@router.get("/teachers/all")
async def get_all_teachers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    school_id: Optional[int] = Query(None, description="Filter by school"),
    subject: Optional[str] = Query(None, description="Filter by subject"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    keyword: Optional[str] = Query(None, description="Search by name or phone"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all teachers (filtered by user's data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    query = db.query(BaseTeacher).filter(BaseTeacher.deleted_at.is_(None))
    
    # 应用数据权限过滤
    if not scope.has_all:
        if scope.school_ids:
            query = query.filter(BaseTeacher.school_id.in_(scope.school_ids))
        else:
            # 没有学校权限，返回空列表
            return {
                "total": 0,
                "page": page,
                "page_size": page_size,
                "teachers": []
            }

    # Apply filters
    if school_id:
        # 验证用户是否有权限访问该学校
        if not scope.has_all and school_id not in scope.school_ids:
            raise HTTPException(status_code=403, detail="无权限访问该学校的教师")
        query = query.filter(BaseTeacher.school_id == school_id)
    if subject:
        query = query.filter(BaseTeacher.subject == subject)
    if grade:
        query = query.filter(BaseTeacher.grades.contains(grade))
    if keyword:
        query = query.filter(
            (BaseTeacher.name.contains(keyword)) |
            (BaseTeacher.phone.contains(keyword))
        )

    total = query.count()
    teachers = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for teacher in teachers:
        # Get school name
        school_name = ""
        if teacher.school_id:
            school = db.query(SysOrg).filter(SysOrg.id == teacher.school_id).first()
            if school:
                school_name = school.name

        result.append({
            "id": str(teacher.id),
            "name": teacher.name,
            "gender": "男" if teacher.gender == "M" else "女" if teacher.gender == "F" else "",
            "school": school_name,
            "grades": teacher.grades or "",
            "positions": teacher.positions or "",
            "subject": teacher.subject or "",
            "phone": teacher.phone or ""
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "teachers": result
    }


@router.get("/{school_id}/teachers")
async def get_school_teachers(
    school_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    subject: Optional[str] = Query(None, description="Filter by subject"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    keyword: Optional[str] = Query(None, description="Search by name or phone"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all teachers under a school from base_teacher table (requires access to the school)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限访问该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校的教师")
    
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # Query base_teacher table (排除已删除的)
    query = db.query(BaseTeacher).filter(
        BaseTeacher.school_id == school_id,
        BaseTeacher.deleted_at.is_(None)
    )

    # Apply filters
    if subject:
        query = query.filter(BaseTeacher.subject == subject)
    if grade:
        query = query.filter(BaseTeacher.grades.contains(grade))
    if keyword:
        query = query.filter(
            (BaseTeacher.name.contains(keyword)) |
            (BaseTeacher.phone.contains(keyword))
        )

    total = query.count()
    teachers = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for teacher in teachers:
        # Get teaching classes from base_class_teacher table
        # teacher_id 直接关联 BaseTeacher.id
        teaching_classes = []
        class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.teacher_id == teacher.id
        ).all()

        for ct in class_teachers:
            class_org = db.query(SysOrg).filter(SysOrg.id == ct.class_id).first()
            if class_org:
                grade_org = db.query(SysOrg).filter(SysOrg.id == class_org.parent_id).first()
                grade_name = grade_org.name if grade_org else ""
                teaching_classes.append({
                    "class_id": ct.class_id,
                    "class_name": class_org.name,
                    "grade_name": grade_name,
                    "subject": ct.subject,
                    "is_head_teacher": ct.is_head_teacher == 1
                })

        result.append({
            "id": str(teacher.id),
            "name": teacher.name,
            "gender": "男" if teacher.gender == "M" else "女" if teacher.gender == "F" else "",
            "school": school.name,
            "grades": teacher.grades or "",
            "positions": teacher.positions or "",
            "subject": teacher.subject or "",
            "phone": teacher.phone or "",
            "teaching_classes": teaching_classes
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "teachers": result
    }

class ClassCreate(BaseModel):
    name: str
    grade_id: int
    head_teacher: Optional[str] = None


class ClassTeacherUpdate(BaseModel):
    teacher_id: int
    subject: str


class ClassUpdate(BaseModel):
    head_teacher: Optional[str] = None  # 班主任姓名
    teachers: Optional[dict] = None  # {subject: teacher_name} or {subject: {"name": teacher_name, "user_id": teacher_user_id}}


@router.post("/{school_id}/classes")
async def create_class(
    school_id: int,
    class_data: ClassCreate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new class under a school
    """
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # Verify grade exists and belongs to this school
    grade = db.query(SysOrg).filter(
        SysOrg.id == class_data.grade_id,
        SysOrg.parent_id == school_id,
        SysOrg.type == "grade"
    ).first()

    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found or does not belong to this school")

    # Check for duplicate class name under this grade
    existing = db.query(SysOrg).filter(
        SysOrg.parent_id == class_data.grade_id,
        SysOrg.name == class_data.name
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Class with this name already exists under this grade")

    # Create class organization
    from datetime import datetime
    db_class = SysOrg(
        name=class_data.name,
        type="class",
        parent_id=class_data.grade_id,
        tree_path=f"{grade.tree_path}/{class_data.name}"
    )

    db.add(db_class)
    db.flush()  # Get the ID without committing

    # Create class info
    class_info = BaseClassInfo(
        org_id=db_class.id,
        grade_year=datetime.now().year,
        stage="",  # Will be updated below if possible
        graduation_status=0
    )

    # Determine stage from grade name
    if "初" in grade.name:
        class_info.stage = "初中"
    elif "高" in grade.name:
        class_info.stage = "高中"
    elif "小" in grade.name:
        class_info.stage = "小学"

    db.add(class_info)
    db.commit()
    db.refresh(db_class)

    # If head teacher is provided, try to find and assign
    if class_data.head_teacher:
        # 从 BaseTeacher 表查找班主任
        teacher = db.query(BaseTeacher).filter(
            BaseTeacher.name == class_data.head_teacher,
            BaseTeacher.school_id == school_id
        ).first()

        if teacher and teacher.user_id:
            class_info.head_teacher_id = teacher.user_id  # 使用 sys_user.id
            db.commit()

    # 记录操作日志
    from app.models.log import SysOperationLog
    log = SysOperationLog(
        user_id=current_user.id,
        username=current_user.username,
        action="新增班级",
        module="班级管理",
        description=f"班级名称: {class_data.name}, 年级ID: {class_data.grade_id}",
        status="成功",
        ip_address=current_user.last_login_ip or "127.0.0.1",
        request_method="POST",
        request_path=f"/api/schools/{school_id}/classes",
        request_params=f"班级名称: {class_data.name}, 年级ID: {class_data.grade_id}",
        response_code=200
    )
    db.add(log)
    db.commit()

    return {
        "id": db_class.id,
        "name": db_class.name,
        "message": "Class created successfully"
    }

@router.put("/{school_id}/classes/{class_id}")
async def update_class(
    school_id: int,
    class_id: int,
    class_data: ClassUpdate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update class information (head teacher)
    """
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # Verify class exists and belongs to this school
    db_class = db.query(SysOrg).filter(
        SysOrg.id == class_id,
        SysOrg.type == "class"
    ).first()

    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")

    # Verify class belongs to this school
    grade = db.query(SysOrg).filter(SysOrg.id == db_class.parent_id).first()
    if not grade or grade.parent_id != school_id:
        raise HTTPException(status_code=400, detail="Class does not belong to this school")

    # Get or create class info
    class_info = db.query(BaseClassInfo).filter(
        BaseClassInfo.org_id == class_id
    ).first()

    if not class_info:
        from datetime import datetime
        class_info = BaseClassInfo(
            org_id=class_id,
            grade_year=datetime.now().year,
            graduation_status=0
        )
        db.add(class_info)

    # Update subject teachers first (before handling head teacher)
    # teacher_id 直接关联 BaseTeacher.id
    affected_teacher_ids = set()  # 记录受影响的教师ID用于同步
    
    # 处理班主任信息（从 teachers 中提取）
    head_teacher_from_teachers = None
    if class_data.teachers and "班主任" in class_data.teachers:
        ht_info = class_data.teachers["班主任"]
        if isinstance(ht_info, str):
            head_teacher_from_teachers = ht_info
        elif isinstance(ht_info, dict):
            head_teacher_from_teachers = ht_info.get("name")
    
    # 优先使用 head_teacher 字段，如果没有则使用 teachers 中的班主任
    effective_head_teacher = class_data.head_teacher if class_data.head_teacher is not None else head_teacher_from_teachers
    
    if class_data.teachers is not None:
        # 先获取现有任课教师（用于后续同步）
        existing_class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id == class_id
        ).all()
        for ct in existing_class_teachers:
            affected_teacher_ids.add(ct.teacher_id)
        
        # Delete existing class teacher records
        db.query(BaseClassTeacher).filter(BaseClassTeacher.class_id == class_id).delete()
        
        # 立即刷新，确保删除操作生效
        db.flush()

        # Add new teacher records (excluding head teacher which will be handled separately)
        for subject, teacher_info in class_data.teachers.items():
            # 跳过班主任科目，单独处理
            if subject == "班主任":
                continue
                
            teacher_name = None
            if isinstance(teacher_info, str):
                teacher_name = teacher_info
            elif isinstance(teacher_info, dict):
                teacher_name = teacher_info.get("name")

            if teacher_name:
                # 直接从 BaseTeacher 查找
                teacher = db.query(BaseTeacher).filter(
                    BaseTeacher.name == teacher_name,
                    BaseTeacher.school_id == school_id
                ).first()
                
                if teacher:
                    class_teacher = BaseClassTeacher(
                        class_id=class_id,
                        teacher_id=teacher.id,
                        subject=subject,
                        status=1
                    )
                    db.add(class_teacher)
                    affected_teacher_ids.add(teacher.id)
                    print(f"[DEBUG] 为班级 {class_id} 添加教师 {teacher.id}({teacher.name}) 任教 {subject}")
    else:
        print(f"[DEBUG] No teachers data provided for class {class_id}")

    # Update head teacher if provided (by name only)
    # head_teacher_id 存储 sys_user.id，通过 base_teacher.user_id 关联
    if effective_head_teacher is not None:
        if effective_head_teacher:
            # 直接从 BaseTeacher 查找
            teacher = db.query(BaseTeacher).filter(
                BaseTeacher.name == effective_head_teacher,
                BaseTeacher.school_id == school_id
            ).first()

            if teacher and teacher.user_id:
                # 使用 teacher.user_id (sys_user.id) 以满足外键约束
                class_info.head_teacher_id = teacher.user_id
                
                # 同步更新 base_class_teacher 表中的 is_head_teacher
                class_teacher_record = db.query(BaseClassTeacher).filter(
                    BaseClassTeacher.class_id == class_id,
                    BaseClassTeacher.teacher_id == teacher.user_id
                ).first()
                
                if class_teacher_record:
                    class_teacher_record.is_head_teacher = 1
                    db.add(class_teacher_record)
                    print(f"[DEBUG] 设置教师 {teacher.id}({teacher.name}) 为班级 {class_id} 的班主任")
                else:
                    # 先删除该班级现有的班主任记录（唯一键冲突处理）
                    deleted = db.query(BaseClassTeacher).filter(
                        BaseClassTeacher.class_id == class_id,
                        BaseClassTeacher.subject == "班主任"
                    ).delete(synchronize_session=False)
                    print(f"[DEBUG] 删除班级 {class_id} 的现有班主任记录: {deleted} 条")
                    db.flush()  # 确保删除操作立即生效
                    
                    # 如果该教师不是该班的任课教师，添加一条班主任记录
                    new_class_teacher = BaseClassTeacher(
                        class_id=class_id,
                        teacher_id=teacher.user_id,  # 使用 sys_user.id
                        subject="班主任",
                        is_head_teacher=1,
                        status=1
                    )
                    db.add(new_class_teacher)
                    affected_teacher_ids.add(teacher.id)
                    print(f"[DEBUG] 为班级 {class_id} 添加班主任教师 {teacher.id}({teacher.name})")
            else:
                # Teacher not found or no user_id, clear the assignment
                class_info.head_teacher_id = None
        else:
            # 清除班主任设置
            class_info.head_teacher_id = None
            # 清除 base_class_teacher 表中该班所有班主任标记
            db.query(BaseClassTeacher).filter(
                BaseClassTeacher.class_id == class_id,
                BaseClassTeacher.is_head_teacher == 1
            ).update({"is_head_teacher": 0})
            print(f"[DEBUG] 清除班级 {class_id} 的班主任设置")

    db.commit()
    
    print(f"[DEBUG] 班级更新完成，需要同步的教师ID: {affected_teacher_ids}")
    
    # 同步更新所有受影响教师的任教年级
    for teacher_id in affected_teacher_ids:
        sync_teacher_grades(db, teacher_id)
    if affected_teacher_ids:
        db.commit()
        print(f"[DEBUG] 已同步 {len(affected_teacher_ids)} 位教师的年级信息")
    db.refresh(class_info)

    # 记录操作日志
    from app.models.log import SysOperationLog
    log = SysOperationLog(
        user_id=current_user.id,
        username=current_user.username,
        action="更新班级信息",
        module="班级管理",
        description=f"班级ID: {class_id}",
        status="成功",
        ip_address=current_user.last_login_ip or "127.0.0.1",
        request_method="PUT",
        request_path=f"/api/schools/{school_id}/classes/{class_id}",
        request_params=f"班级ID: {class_id}",
        response_code=200
    )
    db.add(log)
    db.commit()

    return {
        "id": class_id,
        "message": "Class updated successfully"
    }


@router.get("/{school_id}/students")
async def get_school_students(
    school_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all students under a school
    应用数据权限过滤：用户只能查看有权限的年级/班级的学生
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限访问该学校
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限访问该学校数据")
    
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # Get all class IDs under this school for filtering students
    all_grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()
    all_grade_ids = [g.id for g in all_grades]
    
    # 应用数据权限过滤年级
    if not scope.has_all:
        if scope.grade_ids:
            all_grade_ids = [gid for gid in all_grade_ids if gid in scope.grade_ids]
        elif scope.class_ids:
            # 如果没有年级权限但有班级权限，从班级反推年级
            class_grade_ids = set()
            for class_id in scope.class_ids:
                cls = db.query(SysOrg).filter(SysOrg.id == class_id).first()
                if cls and cls.parent_id:
                    class_grade_ids.add(cls.parent_id)
            all_grade_ids = [gid for gid in all_grade_ids if gid in class_grade_ids]
        else:
            all_grade_ids = []
    
    all_class_ids = []
    for grade_id in all_grade_ids:
        classes = db.query(SysOrg).filter(
            SysOrg.parent_id == grade_id,
            SysOrg.type == "class"
        ).all()
        all_class_ids.extend([c.id for c in classes])
    
    # 应用数据权限过滤班级
    if not scope.has_all and scope.class_ids:
        all_class_ids = [cid for cid in all_class_ids if cid in scope.class_ids]

    # Query students: either they belong to a class in this school, or they have school_id but no class
    if all_class_ids:
        query = db.query(BaseStudent).filter(
            or_(
                BaseStudent.class_id.in_(all_class_ids),
                and_(
                    BaseStudent.school_id == school_id,
                    BaseStudent.class_id.is_(None)
                )
            ),
            BaseStudent.status == 1
        )
    else:
        # 如果学校下没有班级，只查询无班级的学生
        query = db.query(BaseStudent).filter(
            BaseStudent.school_id == school_id,
            BaseStudent.class_id.is_(None),
            BaseStudent.status == 1
        )
    
    total = query.count()
    students = query.offset((page - 1) * page_size).limit(page_size).all()
    
    result = []
    for student in students:
        # Get class name
        class_name = ""
        if student.class_id:
            cls = db.query(SysOrg).filter(SysOrg.id == student.class_id).first()
            if cls:
                class_name = cls.name
        
        # Get grade name
        grade_name = ""
        if student.class_id:
            cls = db.query(SysOrg).filter(SysOrg.id == student.class_id).first()
            if cls:
                grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
                if grade:
                    grade_name = grade.name
        
        result.append({
            "id": student.student_no or str(student.id),  # 学号优先，若无学号则使用主键ID
            "studentId": student.id,  # 数据库主键ID
            "name": student.name,
            "gender": "男" if student.gender == "M" else "女" if student.gender == "F" else "",
            "school": school.name,
            "grade": grade_name,
            "class": class_name,
            "building": student.dorm_building or "",
            "floor": student.dorm_floor or 0,
            "dorm": student.dorm_room or "",
            "bedNo": student.bed_no or 0,
            "score": student.score or 100,
            "createTime": student.created_at.strftime("%Y-%m-%d") if student.created_at else ""
        })
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "students": result
    }

@router.post("/{school_id}/classes/{class_id}/seating-chart")
async def update_class_seating_chart(
    school_id: int,
    class_id: int,
    seating_data: dict,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update class seating chart
    """
    # Verify school exists
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()
    
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    
    # Verify class exists and belongs to this school
    cls = db.query(SysOrg).filter(
        SysOrg.id == class_id,
        SysOrg.type == "class"
    ).first()
    
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check if class is under this school
    grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
    if not grade or grade.parent_id != school_id:
        raise HTTPException(status_code=400, detail="Class does not belong to this school")
    
    # Get or create class info
    class_info = db.query(BaseClassInfo).filter(
        BaseClassInfo.org_id == class_id
    ).first()
    
    if not class_info:
        class_info = BaseClassInfo(
            org_id=class_id,
            grade_year=datetime.now().year,
            graduation_status=0
        )
        db.add(class_info)
    
    # Update seating chart
    class_info.seating_chart = seating_data
    db.commit()

    return {"message": "Seating chart updated successfully"}


# ============== Teacher Import/Export Endpoints ==============

@router.get("/teachers/import-template")
async def download_teacher_import_template(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    下载教师批量导入模板
    """
    # 获取学校列表
    schools = db.query(SysOrg).filter(SysOrg.type == "school").order_by(SysOrg.id).all()
    school_list = [(s.id, s.name) for s in schools]
    
    # 创建工作簿
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "教师导入模板"
    
    # 设置表头
    headers = ["姓名*", "性别", "手机号", "所属学校*", "任教学科", "岗位"]
    header_fills = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fills
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # 添加示例数据
    sample_data = [
        ["张三", "男", "13800138001", school_list[0][1] if school_list else "", "语文", "教师"],
        ["李四", "女", "13800138002", school_list[0][1] if school_list else "", "数学", "班主任"],
    ]
    for row_idx, row_data in enumerate(sample_data, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)
    
    # 添加说明sheet
    ws_info = wb.create_sheet("填写说明")
    instructions = [
        ["字段说明"],
        ["姓名*: 必填，教师姓名"],
        ["性别: 男/女"],
        ["手机号: 联系电话，不可重复"],
        ["所属学校*: 必填，学校名称，请参考【学校列表】sheet"],
        ["任教学科: 如语文、数学、英语等"],
        ["岗位: 如教师、班主任、年级主任等"],
        [""],
        ["注意: 填写学校名称时，请确保名称与列表中完全一致"],
    ]
    for row_idx, row_data in enumerate(instructions, 1):
        ws_info.cell(row=row_idx, column=1, value=row_data[0] if row_data else "")
    
    # 添加学校列表sheet
    ws_school = wb.create_sheet("学校列表")
    ws_school.cell(row=1, column=1, value="学校ID")
    ws_school.cell(row=1, column=2, value="学校名称")
    ws_school.cell(row=1, column=1).font = Font(bold=True)
    ws_school.cell(row=1, column=2).font = Font(bold=True)
    for idx, (school_id, school_name) in enumerate(school_list, 2):
        ws_school.cell(row=idx, column=1, value=school_id)
        ws_school.cell(row=idx, column=2, value=school_name)
    ws_school.column_dimensions['A'].width = 10
    ws_school.column_dimensions['B'].width = 40
    
    # 调整列宽
    ws.column_dimensions['A'].width = 12
    ws.column_dimensions['B'].width = 8
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 25
    ws.column_dimensions['E'].width = 25
    ws.column_dimensions['F'].width = 12
    ws.column_dimensions['G'].width = 12
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 12
    ws.column_dimensions['J'].width = 10
    ws.column_dimensions['K'].width = 10
    ws.column_dimensions['L'].width = 10
    ws.column_dimensions['M'].width = 10
    
    # 调整说明sheet列宽
    ws_info.column_dimensions['A'].width = 60
    
    # 保存到内存
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    from fastapi.responses import StreamingResponse
    
    # 使用 iter 参数返回 BytesIO 内容
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=teacher_import_template.xlsx",
            "Content-Length": str(len(output.getvalue()))
        }
    )


@router.post("/teachers/import")
async def import_teachers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    批量导入教师
    支持Excel(.xlsx, .xls)和CSV格式
    """
    scope = get_user_data_scope(db, current_user)
    
    # 读取文件内容
    content = await file.read()
    filename = file.filename.lower()
    
    # 解析文件
    teachers_data = []
    if filename.endswith('.csv'):
        # 解析CSV
        content_str = content.decode('utf-8-sig')
        reader = csv.reader(content_str.splitlines())
        rows = list(reader)
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="文件内容为空或格式错误")
        headers = [h.strip() for h in rows[0]]
        for row in rows[1:]:
            if row and any(cell.strip() for cell in row):
                teachers_data.append(dict(zip(headers, row)))
    else:
        # 解析Excel
        wb = openpyxl.load_workbook(BytesIO(content))
        ws = wb.active
        headers = [cell.value for cell in ws[1] if cell.value]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and any(cell for cell in row):
                teachers_data.append(dict(zip(headers, row)))
    
    if not teachers_data:
        raise HTTPException(status_code=400, detail="未找到有效的教师数据")
    
    # 校验和导入
    success_count = 0
    errors = []
    imported_teachers = []
    
    for row_idx, teacher_data in enumerate(teachers_data, start=2):
        try:
            # 获取必填字段
            name = str(teacher_data.get('姓名*', '') or teacher_data.get('name', '')).strip()
            school_value = teacher_data.get('所属学校*') or teacher_data.get('所属学校') or teacher_data.get('school_id') or teacher_data.get('school_name')
            
            if not name:
                errors.append({"row": row_idx, "message": "姓名为必填项"})
                continue
            
            if not school_value:
                errors.append({"row": row_idx, "message": "所属学校为必填项"})
                continue
            
            # 获取学校ID
            school_id = None
            school_value = str(school_value).strip()
            school = db.query(SysOrg).filter(
                SysOrg.name == school_value,
                SysOrg.type == "school"
            ).first()
            if school:
                school_id = school.id
            else:
                try:
                    school_id = int(school_value)
                    school = db.query(SysOrg).filter(
                        SysOrg.id == school_id,
                        SysOrg.type == "school"
                    ).first()
                    if not school:
                        errors.append({"row": row_idx, "message": f"学校 '{school_value}' 不存在"})
                        continue
                except ValueError:
                    errors.append({"row": row_idx, "message": f"学校 '{school_value}' 不存在"})
                    continue
            
            # 检查权限
            if not scope.has_all and school_id not in scope.school_ids:
                errors.append({"row": row_idx, "message": f"无权限在学校 '{school_value}' 下创建教师"})
                continue
            
            # 获取其他字段
            gender_str = str(teacher_data.get('性别', '') or teacher_data.get('gender', '')).strip()
            gender = None
            if gender_str:
                if gender_str in ['男', 'M', 'm']:
                    gender = 'M'
                elif gender_str in ['女', 'F', 'f']:
                    gender = 'F'
            
            phone = str(teacher_data.get('手机号', '') or teacher_data.get('phone', '')).strip() or None
            subject = str(teacher_data.get('任教学科', '') or teacher_data.get('subject', '')).strip() or None
            positions = str(teacher_data.get('岗位', '') or teacher_data.get('positions', '')).strip() or None
            
            # 检查手机号是否重复
            if phone:
                existing = db.query(BaseTeacher).filter(
                    BaseTeacher.phone == phone
                ).first()
                if existing:
                    errors.append({"row": row_idx, "message": f"手机号 '{phone}' 已存在"})
                    continue
            
            # 创建教师
            db_teacher = BaseTeacher(
                name=name,
                gender=gender,
                phone=phone,
                school_id=school_id,
                subject=subject,
                positions=positions
            )
            db.add(db_teacher)
            db.flush()
            
            # 自动创建系统用户账号
            db_user = create_user_for_teacher(db, db_teacher, school_id)
            
            imported_teachers.append({
                "id": db_teacher.id,
                "name": name,
                "school": school.name,
                "username": db_user.username if db_user else None
            })
            success_count += 1
            
        except Exception as e:
            errors.append({"row": row_idx, "message": str(e)})
    
    db.commit()
    
    return {
        "total": len(teachers_data),
        "success": success_count,
        "failed": len(errors),
        "errors": errors,
        "imported_teachers": imported_teachers
    }


# ============== Teacher CRUD Endpoints ==============

class TeacherCreate(BaseModel):
    name: str
    gender: Optional[str] = None  # M or F
    phone: Optional[str] = None
    school_id: int
    grades: Optional[str] = None
    positions: Optional[str] = None
    subject: Optional[str] = None


class TeachingClassUpdate(BaseModel):
    class_id: int
    subject: str
    is_head_teacher: bool = False


class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    school_id: Optional[int] = None
    grades: Optional[str] = None
    positions: Optional[str] = None
    subject: Optional[str] = None
    teaching_classes: Optional[list] = None  # 任课班级列表，支持更新


@router.post("/teachers")
async def create_teacher(
    teacher_data: TeacherCreate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new teacher record and automatically create a system user account
    """
    # Check if school exists
    school = None
    if teacher_data.school_id:
        school = db.query(SysOrg).filter(
            SysOrg.id == teacher_data.school_id,
            SysOrg.type == "school"
        ).first()
        if not school:
            raise HTTPException(status_code=404, detail="School not found")

    # Check for duplicate phone
    if teacher_data.phone:
        existing = db.query(BaseTeacher).filter(
            BaseTeacher.phone == teacher_data.phone
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already exists")

    # Create teacher
    db_teacher = BaseTeacher(
        name=teacher_data.name,
        gender=teacher_data.gender,
        phone=teacher_data.phone,
        school_id=teacher_data.school_id,
        grades=teacher_data.grades,
        positions=teacher_data.positions,
        subject=teacher_data.subject
    )

    db.add(db_teacher)
    db.flush()  # 获取 teacher.id
    
    # 自动创建系统用户账号
    db_user = create_user_for_teacher(db, db_teacher, teacher_data.school_id)
    
    db.commit()
    db.refresh(db_teacher)

    return {
        "id": db_teacher.id,
        "name": db_teacher.name,
        "user_id": db_teacher.user_id,
        "username": db_user.username if db_user else None,
        "message": "Teacher created successfully with user account"
    }

@router.get("/teachers/{teacher_id}")
async def get_teacher_detail(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get detailed information of a specific teacher, including teaching classes
    """
    teacher = db.query(BaseTeacher).filter(BaseTeacher.id == teacher_id).first()

    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Get school name
    school_name = ""
    if teacher.school_id:
        school = db.query(SysOrg).filter(SysOrg.id == teacher.school_id).first()
        if school:
            school_name = school.name

    # Get teaching classes from base_class_teacher table
    # teacher_id 直接关联 BaseTeacher.id
    teaching_classes = []
    class_teachers = db.query(BaseClassTeacher).filter(
        BaseClassTeacher.teacher_id == teacher.id
    ).all()
    
    for ct in class_teachers:
        # Get class info
        class_org = db.query(SysOrg).filter(SysOrg.id == ct.class_id).first()
        if class_org:
            # Get grade info
            grade_org = db.query(SysOrg).filter(SysOrg.id == class_org.parent_id).first()
            grade_name = grade_org.name if grade_org else ""
            
            teaching_classes.append({
                "class_id": ct.class_id,
                "class_name": class_org.name,
                "grade_name": grade_name,
                "subject": ct.subject,
                "is_head_teacher": ct.is_head_teacher == 1
            })

    return {
        "id": teacher.id,
        "name": teacher.name,
        "gender": "男" if teacher.gender == "M" else "女" if teacher.gender == "F" else "",
        "phone": teacher.phone or "",
        "school_id": teacher.school_id,
        "school_name": school_name,
        "grades": teacher.grades or "",
        "positions": teacher.positions or "",
        "subject": teacher.subject or "",
        "created_at": teacher.created_at.isoformat() if teacher.created_at else None,
        "updated_at": teacher.updated_at.isoformat() if teacher.updated_at else None,
        "teaching_classes": teaching_classes
    }

@router.put("/teachers/{teacher_id}")
async def update_teacher(
    teacher_id: int,
    teacher_data: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update teacher information
    """
    teacher = db.query(BaseTeacher).filter(BaseTeacher.id == teacher_id).first()

    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Check school if provided
    if teacher_data.school_id:
        school = db.query(SysOrg).filter(
            SysOrg.id == teacher_data.school_id,
            SysOrg.type == "school"
        ).first()
        if not school:
            raise HTTPException(status_code=404, detail="School not found")

    # Update fields
    if teacher_data.name is not None:
        teacher.name = teacher_data.name
    if teacher_data.gender is not None:
        teacher.gender = teacher_data.gender
    if teacher_data.phone is not None:
        teacher.phone = teacher_data.phone
    if teacher_data.school_id is not None:
        teacher.school_id = teacher_data.school_id
    if teacher_data.grades is not None:
        teacher.grades = teacher_data.grades
    if teacher_data.positions is not None:
        teacher.positions = teacher_data.positions
    if teacher_data.subject is not None:
        teacher.subject = teacher_data.subject
    
    # 记录用户是否手动提交了grades字段
    user_provided_grades = teacher_data.grades is not None
    
    # 记录班主任变更信息，用于后续同步 base_class_info
    head_teacher_changes = []  # [(class_id, teacher_id, is_head_teacher), ...]
    
    # Update teaching classes if provided
    if teacher_data.teaching_classes is not None:
        # 先获取该教师现有的班主任班级（用于清除旧的班主任标记）
        existing_head_classes = db.query(BaseClassTeacher.class_id).filter(
            BaseClassTeacher.teacher_id == teacher.id,
            BaseClassTeacher.is_head_teacher == 1
        ).all()
        existing_head_class_ids = {c.class_id for c in existing_head_classes}
        
        # 删除该教师现有的所有任课班级记录
        # teacher_id 直接关联 BaseTeacher.id
        db.query(BaseClassTeacher).filter(
            BaseClassTeacher.teacher_id == teacher.id
        ).delete()
        
        # 添加新的任课班级记录
        new_head_class_ids = set()
        for tc in teacher_data.teaching_classes:
            # 支持字典或对象访问
            if isinstance(tc, dict):
                class_id = tc.get('class_id')
                subject = tc.get('subject')
                is_head_teacher = tc.get('is_head_teacher', False)
            else:
                # Pydantic 模型对象
                class_id = getattr(tc, 'class_id', None)
                subject = getattr(tc, 'subject', None)
                is_head_teacher = getattr(tc, 'is_head_teacher', False)
            
            if class_id and subject:
                # 验证班级是否存在
                class_org = db.query(SysOrg).filter(
                    SysOrg.id == class_id,
                    SysOrg.type == "class"
                ).first()
                
                if class_org:
                    # 删除其他教师在该班级的相同科目记录（唯一键冲突处理）
                    deleted = db.query(BaseClassTeacher).filter(
                        BaseClassTeacher.class_id == class_id,
                        BaseClassTeacher.subject == subject,
                        BaseClassTeacher.teacher_id != teacher.user_id
                    ).delete(synchronize_session=False)
                    print(f"[DEBUG] 删除班级 {class_id} 科目 {subject} 的其他教师记录: {deleted} 条")
                    
                    new_class_teacher = BaseClassTeacher(
                        class_id=class_id,
                        teacher_id=teacher.user_id,  # 使用 sys_user.id 以满足外键约束
                        subject=subject,
                        is_head_teacher=1 if is_head_teacher else 0,
                        status=1
                    )
                    db.add(new_class_teacher)
                    
                    if is_head_teacher:
                        new_head_class_ids.add(class_id)
                        head_teacher_changes.append((class_id, teacher.user_id, True))  # 使用 sys_user.id
        
        # 找出被取消班主任身份的班级
        cancelled_head_classes = existing_head_class_ids - new_head_class_ids
        for class_id in cancelled_head_classes:
            head_teacher_changes.append((class_id, teacher.user_id, False))  # 使用 sys_user.id
        
        # 同步更新教师的任教年级（仅当用户未手动提交grades时）
        if not user_provided_grades:
            sync_teacher_grades(db, teacher.id)

    db.commit()
    
    # 同步更新 base_class_info 的 head_teacher_id
    for class_id, teacher_id, is_head in head_teacher_changes:
        class_info = db.query(BaseClassInfo).filter(
            BaseClassInfo.org_id == class_id
        ).first()
        
        if class_info:
            if is_head:
                # 设置为班主任
                class_info.head_teacher_id = teacher_id
                db.add(class_info)
                print(f"[DEBUG] 教师管理：设置班级 {class_id} 的班主任为教师 {teacher_id}")
            else:
                # 取消班主任，但只有在当前班主任是该教师时才清除
                if class_info.head_teacher_id == teacher_id:
                    class_info.head_teacher_id = None
                    db.add(class_info)
                    print(f"[DEBUG] 教师管理：清除班级 {class_id} 的班主任（原班主任是教师 {teacher_id}）")
    
    if head_teacher_changes:
        db.commit()
    db.refresh(teacher)

    return {
        "id": teacher.id,
        "name": teacher.name,
        "message": "Teacher updated successfully"
    }

@router.delete("/teachers/{teacher_id}")
async def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Delete a teacher (soft delete by setting deleted_at, requires access to teacher's school)
    Also deletes the associated user account
    """
    scope = get_user_data_scope(db, current_user)
    
    teacher = db.query(BaseTeacher).filter(BaseTeacher.id == teacher_id).first()

    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # 检查是否有权限删除该教师
    if teacher.school_id and not scope.has_all and teacher.school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限删除该教师")

    # 删除关联的系统用户
    if teacher.user_id:
        user = db.query(SysUser).filter(SysUser.id == teacher.user_id).first()
        if user:
            # 删除用户角色关联
            db.execute("DELETE FROM sys_user_role WHERE user_id = :user_id", {"user_id": user.id})
            # 删除用户
            db.delete(user)

    # 删除教师的任课班级关联
    db.query(BaseClassTeacher).filter(BaseClassTeacher.teacher_id == teacher_id).delete()

    # 删除教师档案（硬删除，因为用户要求教师管理页面删除）
    db.delete(teacher)
    db.commit()

    return {"message": "Teacher deleted successfully"}


@router.get("/{school_id}/filter-options")
async def get_teacher_filter_options(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get filter options for teachers (positions and subjects)
    """
    school = db.query(SysOrg).filter(
        SysOrg.id == school_id,
        SysOrg.type == "school"
    ).first()

    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    # Get unique positions from teachers
    positions_query = db.query(BaseTeacher.positions).filter(
        BaseTeacher.school_id == school_id,
        BaseTeacher.positions.isnot(None),
        BaseTeacher.positions != ""
    ).distinct().all()

    positions = []
    for (pos,) in positions_query:
        if pos:
            # Split by comma if multiple positions
            for p in pos.split(","):
                p = p.strip()
                if p and p not in positions:
                    positions.append(p)

    # Get unique subjects from teachers
    subjects_query = db.query(BaseTeacher.subject).filter(
        BaseTeacher.school_id == school_id,
        BaseTeacher.subject.isnot(None),
        BaseTeacher.subject != ""
    ).distinct().all()

    subjects = [subject for (subject,) in subjects_query if subject]

    return {
        "positions": sorted(positions),
        "subjects": sorted(subjects)
    }


# ============== Student Import/Export Endpoints ==============

class StudentBatchImport(BaseModel):
    """批量导入学生请求数据"""
    class_id: int  # 班级ID
    students: list  # 学生列表 [{"name": "张三", "gender": "M", "student_no": "001", 
                  #         "dorm_building": "男生宿舍楼", "dorm_floor": 3, "dorm_room": "305", "bed_no": 1}, ...]


@router.post("/students/import")
async def import_students_batch(
    data: StudentBatchImport,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    批量导入学生到指定班级
    """
    scope = get_user_data_scope(db, current_user)
    
    # 验证班级是否存在
    class_org = db.query(SysOrg).filter(
        SysOrg.id == data.class_id,
        SysOrg.type == "class"
    ).first()
    
    if not class_org:
        raise HTTPException(status_code=404, detail="班级不存在")
    
    # 获取班级所属学校
    grade_org = db.query(SysOrg).filter(SysOrg.id == class_org.parent_id).first()
    if not grade_org:
        raise HTTPException(status_code=400, detail="班级缺少年级信息")
    
    school_id = grade_org.parent_id
    
    # 检查权限
    if not scope.has_all and school_id not in scope.school_ids:
        raise HTTPException(status_code=403, detail="无权限在该班级导入学生")
    
    if not data.students:
        raise HTTPException(status_code=400, detail="学生列表不能为空")
    
    # 导入学生
    success_count = 0
    errors = []
    imported_students = []
    
    # 获取现有学生姓名（用于去重）
    existing_students = db.query(BaseStudent).filter(
        BaseStudent.class_id == data.class_id,
        BaseStudent.status == 1
    ).all()
    existing_names = {s.name for s in existing_students}
    existing_student_nos = {s.student_no for s in existing_students if s.student_no}
    
    for idx, student_data in enumerate(data.students):
        try:
            name = str(student_data.get('name', '') or student_data.get('姓名', '')).strip()
            
            if not name:
                errors.append({"index": idx, "message": "姓名不能为空"})
                continue
            
            # 检查是否已存在
            if name in existing_names:
                # 跳过已存在的学生，不报错
                continue
            
            gender = None
            gender_str = str(student_data.get('gender', '') or student_data.get('性别', '')).strip()
            if gender_str:
                if gender_str in ['男', 'M', 'm']:
                    gender = 'M'
                elif gender_str in ['女', 'F', 'f']:
                    gender = 'F'
            
            student_no = str(student_data.get('student_no', '') or student_data.get('学号', '')).strip() or None
            
            # 检查学号是否重复
            if student_no and student_no in existing_student_nos:
                errors.append({"index": idx, "name": name, "message": f"学号 '{student_no}' 已存在"})
                continue
            
            # 解析宿舍信息
            dorm_building = str(student_data.get('dorm_building', '') or student_data.get('楼栋', '') or '').strip() or None
            dorm_floor = None
            floor_val = student_data.get('dorm_floor') or student_data.get('楼层')
            if floor_val:
                try:
                    dorm_floor = int(floor_val)
                except (ValueError, TypeError):
                    pass
            dorm_room = str(student_data.get('dorm_room', '') or student_data.get('宿舍号', '') or '').strip() or None
            bed_no = None
            bed_val = student_data.get('bed_no') or student_data.get('床位号')
            if bed_val:
                try:
                    bed_no = int(bed_val)
                except (ValueError, TypeError):
                    pass
            
            # 创建学生记录
            new_student = BaseStudent(
                name=name,
                gender=gender,
                student_no=student_no,
                school_id=school_id,
                class_id=data.class_id,
                grade_name=grade_org.name,
                dorm_building=dorm_building,
                dorm_floor=dorm_floor,
                dorm_room=dorm_room,
                bed_no=bed_no,
                status=1,
                score=100
            )
            db.add(new_student)
            db.flush()
            
            # 更新已存在列表
            existing_names.add(name)
            if student_no:
                existing_student_nos.add(student_no)
            
            imported_students.append({
                "id": new_student.id,
                "name": name
            })
            success_count += 1
            
        except Exception as e:
            errors.append({"index": idx, "message": str(e)})
    
    # 更新班级学生数量
    if success_count > 0:
        class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == data.class_id).first()
        if class_info:
            class_info.student_count = (class_info.student_count or 0) + success_count
            db.add(class_info)
    
    db.commit()
    
    return {
        "total": len(data.students),
        "success": success_count,
        "skipped": len(data.students) - success_count - len(errors),
        "failed": len(errors),
        "errors": errors,
        "imported_students": imported_students
    }


@router.get("/students/import-template")
async def download_student_import_template(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    下载学生批量导入模板
    """
    # 创建工作簿
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "学生导入模板"
    
    # 设置表头 - 与学生管理页面字段保持一致
    headers = ["姓名*", "性别", "学号", "学校*", "年级*", "班级*", "楼栋", "楼层", "宿舍号", "床位号"]
    header_fills = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fills
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # 添加示例数据
    sample_data = [
        ["张三", "男", "2023001", "长水实验中学杨凌校区", "初一", "37班", "男生宿舍楼", "3", "305", "1"],
        ["李四", "女", "2023002", "长水实验中学杨凌校区", "初二", "1班", "女生宿舍楼", "2", "201", "2"],
        ["王五", "男", "2023003", "长水实验中学杨凌校区", "初一", "37班", "男生宿舍楼", "4", "402", "3"],
    ]
    for row_idx, row_data in enumerate(sample_data, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)
    
    # 添加说明sheet
    ws_info = wb.create_sheet("填写说明")
    instructions = [
        ["字段说明"],
        ["姓名*: 必填，学生姓名"],
        ["性别: 男/女"],
        ["学号: 学生学号，不可重复"],
        ["学校*: 必填，学生所属学校名称"],
        ["年级*: 必填，如：初一、初二、高一 等"],
        ["班级*: 必填，如：1班、2班、37班 等"],
        ["楼栋: 宿舍楼/教学楼楼栋名称，如：男生宿舍楼"],
        ["楼层: 楼层数字，如：1、2、3"],
        ["宿舍号: 宿舍房间号，如：305、402"],
        ["床位号: 床位编号，如：1、2、3"],
        [""],
        ["注意: 同一班级内姓名相同的学生会被跳过，不会重复添加"],
    ]
    for row_idx, row_data in enumerate(instructions, 1):
        ws_info.cell(row=row_idx, column=1, value=row_data[0] if row_data else "")
    
    # 调整列宽
    ws.column_dimensions['A'].width = 12  # 姓名
    ws.column_dimensions['B'].width = 8   # 性别
    ws.column_dimensions['C'].width = 12  # 学号
    ws.column_dimensions['D'].width = 25  # 学校
    ws.column_dimensions['E'].width = 10  # 年级
    ws.column_dimensions['F'].width = 10  # 班级
    ws.column_dimensions['G'].width = 15  # 楼栋
    ws.column_dimensions['H'].width = 8   # 楼层
    ws.column_dimensions['I'].width = 10  # 宿舍号
    ws.column_dimensions['J'].width = 10  # 床位号
    ws_info.column_dimensions['A'].width = 55
    
    # 保存到内存
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    from fastapi.responses import StreamingResponse
    
    # 使用 iter 参数返回 BytesIO 内容
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=student_import_template.xlsx",
            "Content-Length": str(len(output.getvalue()))
        }
    )


