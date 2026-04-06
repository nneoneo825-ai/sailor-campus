from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.student import BaseStudent
from app.utils.deps import get_current_active_user, require_permission
from app.utils.data_scope import DataScope, filter_query_by_scope
from app.models.user import SysUser

router = APIRouter()


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    class_id: Optional[int] = None
    dorm_building: Optional[str] = None
    dorm_floor: Optional[int] = None
    dorm_room: Optional[str] = None
    bed_no: Optional[int] = None
    status: Optional[int] = None


class StudentCreate(BaseModel):
    id: str  # 学号
    name: str
    gender: str  # 'M' or 'F'
    school_id: Optional[int] = None
    class_id: Optional[int] = None
    dorm_building: Optional[str] = None
    dorm_floor: Optional[int] = None
    dorm_room: Optional[str] = None
    bed_no: Optional[int] = None


@router.get("/", response_model=List[dict])
async def get_students(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:view"))
) -> Any:
    """
    Get all students (filtered by user's data scope)
    """
    scope = DataScope()
    from app.utils.data_scope import get_user_data_scope
    scope = get_user_data_scope(db, current_user)
    
    query = db.query(BaseStudent)
    # 应用数据权限过滤
    query = filter_query_by_scope(query, BaseStudent, scope, class_id_field='class_id')
    
    students = query.offset(skip).limit(limit).all()
    return [
        {
            "id": student.id,
            "name": student.name,
            "gender": student.gender,
            "class_id": student.class_id,
            "dorm_building": student.dorm_building,
            "dorm_room": student.dorm_room,
            "bed_no": student.bed_no,
            "status": student.status
        }
        for student in students
    ]


@router.post("/")
async def create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:edit"))
) -> Any:
    """
    Create a new student (requires access to the target class)
    """
    from app.utils.data_scope import get_user_data_scope
    
    # 检查用户是否有权限向该班级添加学生
    if student_data.class_id:
        scope = get_user_data_scope(db, current_user)
        if not scope.has_all and student_data.class_id not in scope.class_ids:
            raise HTTPException(status_code=403, detail="无权限向该班级添加学生")
    
    # Check if student with same ID already exists
    existing_student = db.query(BaseStudent).filter(BaseStudent.id == student_data.id).first()
    if existing_student:
        raise HTTPException(status_code=400, detail="该学号已存在")

    # Create new student
    new_student = BaseStudent(
        id=student_data.id,
        name=student_data.name,
        gender=student_data.gender,
        school_id=student_data.school_id,
        class_id=student_data.class_id,
        dorm_building=student_data.dorm_building,
        dorm_floor=student_data.dorm_floor,
        dorm_room=student_data.dorm_room,
        bed_no=student_data.bed_no,
        status=1  # Default status: active
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return {
        "id": new_student.id,
        "name": new_student.name,
        "gender": new_student.gender,
        "class_id": new_student.class_id,
        "dorm_building": new_student.dorm_building,
        "dorm_room": new_student.dorm_room,
        "bed_no": new_student.bed_no,
        "status": new_student.status,
        "message": "Student created successfully"
    }


@router.get("/{student_id}")
async def get_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:view"))
) -> Any:
    """
    Get student by ID (requires access to student's class)
    """
    from app.utils.data_scope import get_user_data_scope
    
    student = db.query(BaseStudent).filter(BaseStudent.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # 检查用户是否有权限访问该学生所在班级
    if student.class_id:
        scope = get_user_data_scope(db, current_user)
        if not scope.has_all and student.class_id not in scope.class_ids:
            raise HTTPException(status_code=403, detail="无权限访问该学生信息")

    return {
        "id": student.id,
        "name": student.name,
        "gender": student.gender,
        "class_id": student.class_id,
        "dorm_building": student.dorm_building,
        "dorm_room": student.dorm_room,
        "bed_no": student.bed_no,
        "status": student.status
    }


@router.get("/class/{class_id}")
async def get_students_by_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:view"))
) -> Any:
    """
    Get students by class ID (requires access to the class)
    """
    from app.utils.data_scope import get_user_data_scope
    
    # 检查用户是否有权限访问该班级
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and class_id not in scope.class_ids:
        raise HTTPException(status_code=403, detail="无权限访问该班级学生")
    
    students = db.query(BaseStudent).filter(BaseStudent.class_id == class_id).all()
    return [
        {
            "id": student.id,
            "name": student.name,
            "gender": student.gender,
            "class_id": student.class_id,
            "dorm_building": student.dorm_building,
            "dorm_room": student.dorm_room,
            "bed_no": student.bed_no,
            "status": student.status
        }
        for student in students
    ]


@router.put("/{student_id}")
async def update_student(
    student_id: str,
    student_data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:edit"))
) -> Any:
    """
    Update student information (requires access to student's class)
    """
    from app.utils.data_scope import get_user_data_scope
    
    student = db.query(BaseStudent).filter(BaseStudent.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    scope = get_user_data_scope(db, current_user)
    
    # 检查用户是否有权限修改该学生
    if student.class_id and not scope.has_all and student.class_id not in scope.class_ids:
        raise HTTPException(status_code=403, detail="无权限修改该学生信息")
    
    # 如果要修改班级，检查用户是否有权限将学生移动到新班级
    if student_data.class_id is not None and student_data.class_id != student.class_id:
        if not scope.has_all and student_data.class_id not in scope.class_ids:
            raise HTTPException(status_code=403, detail="无权限将学生移动到该班级")

    # Update fields if provided
    update_data = student_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    db.commit()
    db.refresh(student)

    return {
        "id": student.id,
        "name": student.name,
        "gender": student.gender,
        "class_id": student.class_id,
        "dorm_building": student.dorm_building,
        "dorm_room": student.dorm_room,
        "bed_no": student.bed_no,
        "status": student.status,
        "message": "Student updated successfully"
    }


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("student:delete"))
) -> Any:
    """
    Delete student (requires access to student's class)
    student_id is the database primary key ID (not student_no)
    """
    from app.utils.data_scope import get_user_data_scope
    
    student = db.query(BaseStudent).filter(BaseStudent.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    scope = get_user_data_scope(db, current_user)
    
    # 检查用户是否有权限删除该学生
    if student.class_id and not scope.has_all and student.class_id not in scope.class_ids:
        raise HTTPException(status_code=403, detail="无权限删除该学生信息")
    
    # 保存学生信息用于日志
    student_info = f"{student.name}({student.id})"
    
    # 删除学生记录
    db.delete(student)
    db.commit()
    
    return {
        "message": f"学生 {student_info} 删除成功"
    }
