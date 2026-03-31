from typing import Any, Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, cast, Date, Column, BIGINT, TEXT, ForeignKey, and_
from sqlalchemy.dialects.mysql import DATE, DATETIME
from pydantic import BaseModel
from app.database import get_db, Base
from app.models.moral import CfgMoralIndicator, CfgTeachingIndicator, BizMoralRecord
from app.models.org import SysOrg
from app.models.student import BaseStudent as Student
from app.models.org import BaseClassInfo
from app.utils.deps import get_current_active_user
from app.models.user import SysUser
from app.utils.data_scope import get_user_data_scope
from app.utils.log_helper import log_operation, MODULE_MORAL, ACTION_CREATE, ACTION_UPDATE, ACTION_DELETE

# 为年级表创建别名
GradeOrg = aliased(SysOrg)


class MoralRecordCreate(BaseModel):
    student_id: str
    rule_id: int
    score_change: float
    description: Optional[str] = None
    class_id: Optional[int] = None
    record_time: Optional[datetime] = None


class MoralRecordsBatchCreate(BaseModel):
    records: List[MoralRecordCreate]


class MoralIndicatorCreate(BaseModel):
    category: str
    sub_category: str
    name: str
    type: str
    default_score: float
    org_id: Optional[int] = None
    is_overall: Optional[int] = 0


class MoralIndicatorUpdate(BaseModel):
    category: Optional[str] = None
    sub_category: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    default_score: Optional[float] = None
    org_id: Optional[int] = None
    is_enabled: Optional[int] = None
    is_overall: Optional[int] = None


class TeachingIndicatorCreate(BaseModel):
    major_category: str
    name: str
    type: str
    default_score: float
    org_id: Optional[int] = None
    is_overall: Optional[int] = 0


class TeachingIndicatorUpdate(BaseModel):
    major_category: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    default_score: Optional[float] = None
    org_id: Optional[int] = None
    is_enabled: Optional[int] = None
    is_overall: Optional[int] = None

router = APIRouter()


@router.get("/indicators")
async def get_moral_indicators(
    org_id: Optional[int] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get moral education indicators with pagination and filters
    If org_id is provided, get indicators for that organization
    If org_id is null, get all indicators
    """
    query = db.query(CfgMoralIndicator)

    # Filter by organization - show global and specific org indicators
    if org_id is not None:
        query = query.filter(
            (CfgMoralIndicator.org_id == org_id) | (CfgMoralIndicator.org_id.is_(None))
        )

    # Filter by category
    if category:
        query = query.filter(CfgMoralIndicator.category == category)

    # Search by name
    if search:
        query = query.filter(CfgMoralIndicator.name.contains(search))

    total = query.count()
    indicators = query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category, CfgMoralIndicator.id)\
                       .offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "indicators": [
            {
                "id": indicator.id,
                "category": indicator.category,
                "sub_category": indicator.sub_category,
                "name": indicator.name,
                "type": indicator.type,
                "default_score": float(indicator.default_score),
                "is_enabled": indicator.is_enabled,
                "is_overall": indicator.is_overall if hasattr(indicator, 'is_overall') else 0,
                "org_id": indicator.org_id,
                "org_name": indicator.org.name if indicator.org else "全集团通用"
            }
            for indicator in indicators
        ]
    }


@router.get("/indicators/categories")
async def get_moral_categories(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all unique categories for moral indicators
    """
    categories = db.query(CfgMoralIndicator.category).distinct().all()
    return [c[0] for c in categories if c[0]]


@router.get("/indicators/report-structure")
async def get_moral_indicators_report_structure(
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get moral indicators structured for report display
    Returns indicators grouped by major category (大项) with sub-categories (小项)
    """
    query = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.is_enabled == 1)
    
    # Filter by organization - show global and specific org indicators
    if org_id is not None:
        query = query.filter(
            (CfgMoralIndicator.org_id == org_id) | (CfgMoralIndicator.org_id.is_(None))
        )
    
    indicators = query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category, CfgMoralIndicator.id).all()
    
    # Group by major category (大项)
    structure = {}
    for indicator in indicators:
        major = indicator.category or '其他'
        sub = indicator.sub_category or '其他'
        
        if major not in structure:
            structure[major] = {
                'name': major,
                'subCategories': []
            }
        
        # Check if sub-category already exists
        existing_sub = next((s for s in structure[major]['subCategories'] if s['name'] == sub), None)
        if not existing_sub:
            structure[major]['subCategories'].append({
                'name': sub,
                'fieldKey': f"{major}_{sub}",  # Unique field key for data mapping
                'indicators': []
            })
            existing_sub = structure[major]['subCategories'][-1]
        
        existing_sub['indicators'].append({
            'id': indicator.id,
            'name': indicator.name,
            'type': indicator.type,
            'default_score': float(indicator.default_score)
        })
    
    # Define the standard order of five education categories (五育)
    standard_order = ['德育', '智育', '体育', '美育', '劳育']
    
    # Sort according to standard order, with others at the end
    ordered_structure = []
    for cat in standard_order:
        if cat in structure:
            ordered_structure.append(structure[cat])
    
    # Add any other categories not in standard order
    for cat in structure:
        if cat not in standard_order:
            ordered_structure.append(structure[cat])
    
    return {
        'categories': ordered_structure,
        'totalSubCategories': sum(len(cat['subCategories']) for cat in ordered_structure)
    }


@router.post("/indicators")
async def create_moral_indicator(
    data: MoralIndicatorCreate = Body(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new moral education indicator
    """
    indicator = CfgMoralIndicator(
        name=data.name,
        category=data.category,
        sub_category=data.sub_category,
        type=data.type,
        default_score=data.default_score,
        org_id=data.org_id,
        is_enabled=1,
        is_overall=data.is_overall or 0
    )

    db.add(indicator)
    db.commit()
    db.refresh(indicator)

    return {
        "id": indicator.id,
        "message": "Indicator created successfully"
    }


@router.put("/indicators/{indicator_id}")
async def update_moral_indicator(
    indicator_id: int,
    data: MoralIndicatorUpdate = Body(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update a moral education indicator
    """
    indicator = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Indicator not found")

    if data.name is not None:
        indicator.name = data.name
    if data.category is not None:
        indicator.category = data.category
    if data.sub_category is not None:
        indicator.sub_category = data.sub_category
    if data.type is not None:
        indicator.type = data.type
    if data.default_score is not None:
        indicator.default_score = data.default_score
    if data.org_id is not None:
        indicator.org_id = data.org_id
    if data.is_enabled is not None:
        indicator.is_enabled = data.is_enabled
    if data.is_overall is not None:
        indicator.is_overall = data.is_overall

    db.commit()

    return {"message": "Indicator updated successfully"}


@router.delete("/indicators/{indicator_id}")
async def delete_moral_indicator(
    indicator_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Delete a moral education indicator
    """
    indicator = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Indicator not found")

    db.delete(indicator)
    db.commit()

    return {"message": "Indicator deleted successfully"}


@router.post("/records")
async def create_moral_record(
    record: MoralRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a moral education record
    """
    try:
        # Get rule details (optional - if rule_id provided but not found, use default)
        rule = None
        if record.rule_id:
            rule = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.id == record.rule_id).first()
        
        # If no rule found, try to get first available rule
        if not rule:
            rule = db.query(CfgMoralIndicator).first()
        
        # If still no rule, create a default one
        if not rule:
            # Create a default indicator
            rule = CfgMoralIndicator(
                category="未分类",
                sub_category="其他",
                name="默认指标",
                type="deduction",
                default_score=-1,
                is_enabled=1,
                org_id=None
            )
            db.add(rule)
            db.commit()
            db.refresh(rule)
        
        # 获取学生信息，如果是临时ID则自动创建学生记录
        student_name = None
        class_name = None
        grade_name = None
        actual_student_id = record.student_id
        
        if record.student_id:
            # 检查是否为临时ID格式: temp_{class_id}_{seat} {name}
            if record.student_id.startswith('temp_'):
                # 解析临时ID: temp_4_X-1 A-1 王五 -> 提取姓名和班级
                parts = record.student_id.split(' ')
                if len(parts) >= 1:
                    # 最后一个部分是学生姓名
                    extracted_name = parts[-1]
                    
                    # 从临时ID中提取班级ID
                    id_parts = record.student_id.split('_')
                    if len(id_parts) >= 2:
                        try:
                            extracted_class_id = int(id_parts[1])
                        except (ValueError, IndexError):
                            extracted_class_id = record.class_id
                    else:
                        extracted_class_id = record.class_id
                    
                    # 检查学生是否已存在（按姓名和班级）
                    existing_student = db.query(Student).filter(
                        Student.name == extracted_name,
                        Student.class_id == extracted_class_id,
                        Student.status == 1
                    ).first()
                    
                    if existing_student:
                        # 使用已有学生ID
                        actual_student_id = existing_student.id
                        student_name = existing_student.name
                        print(f"[INFO] 找到已存在学生: {existing_student.name} (ID: {existing_student.id})")
                    else:
                        # 创建新学生记录
                        # 生成学生ID: 班级ID + 序号
                        class_student_count = db.query(Student).filter(
                            Student.class_id == extracted_class_id
                        ).count()
                        
                        new_student_id = f"{extracted_class_id}{class_student_count + 1:02d}"
                        
                        # 确保ID唯一
                        while db.query(Student).filter(Student.id == new_student_id).first():
                            class_student_count += 1
                            new_student_id = f"{extracted_class_id}{class_student_count + 1:02d}"
                        
                        new_student = Student(
                            id=new_student_id,
                            name=extracted_name,
                            gender='M',  # 默认性别
                            class_id=extracted_class_id,
                            status=1,
                            score=100
                        )
                        db.add(new_student)
                        db.flush()  # 获取ID但不提交
                        
                        actual_student_id = new_student_id
                        student_name = extracted_name
                        print(f"[INFO] 创建新学生: {extracted_name} (ID: {new_student_id}, class_id: {extracted_class_id})")
            else:
                # 真实学生ID，直接查询
                student = db.query(Student).filter(Student.id == record.student_id).first()
                if student:
                    student_name = student.name
        
        # 获取班级和年级信息
        if record.class_id:
            class_org = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
            if class_org:
                class_name = class_org.name
                # 查找年级
                grade_org = db.query(GradeOrg).filter(GradeOrg.id == class_org.parent_id).first()
                if grade_org:
                    grade_name = grade_org.name
        
        # 使用北京时间 (UTC+8)
        beijing_tz = timezone(timedelta(hours=8))
        # 始终使用服务器当前北京时间，忽略前端传递的时间
        record_time = datetime.now(beijing_tz)

        moral_record = BizMoralRecord(
            student_id=actual_student_id,  # 使用处理后的学生ID
            student_name=student_name,
            class_id=record.class_id,
            class_name=class_name,
            grade_name=grade_name,
            rule_id=rule.id,
            major_category=rule.category,
            minor_category=rule.sub_category,
            rule_snapshot=rule.name,
            score_change=record.score_change or rule.default_score,
            description=record.description,
            source="miniprogram",
            recorder_id=current_user.id,
            record_time=record_time
        )

        db.add(moral_record)
        db.commit()
        db.refresh(moral_record)

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module=MODULE_MORAL,
            action=ACTION_CREATE,
            description=f"德育记录: 学生ID {record.student_id}, 指标 {rule.name}, 分数 {record.score_change}",
            status="成功",
            request=request
        )

        return {
            "id": moral_record.id,
            "message": "Record created successfully"
        }
    except Exception as e:
        db.rollback()
        import traceback
        print(f"Error creating moral record: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/records/batch")
async def create_moral_records_batch(
    batch_data: MoralRecordsBatchCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Batch create moral education records for multiple students
    """
    try:
        if not batch_data.records:
            raise HTTPException(status_code=400, detail="No records provided")

        beijing_tz = timezone(timedelta(hours=8))
        created_ids = []
        errors = []  # 记录处理过程中的错误

        # 预加载所有需要的规则（优化性能）
        rule_ids = list(set(r.rule_id for r in batch_data.records if r.rule_id))
        rule_map = {}
        if rule_ids:
            rules = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.id.in_(rule_ids)).all()
            for rule in rules:
                rule_map[rule.id] = rule

        # 预加载班级信息（优化性能）
        class_ids = [r.class_id for r in batch_data.records if r.class_id]
        class_info_map = {}
        grade_info_map = {}
        class_orgs = []
        if class_ids:
            class_orgs = db.query(SysOrg).filter(SysOrg.id.in_(set(class_ids))).all()
            for cls in class_orgs:
                class_info_map[cls.id] = cls.name
            # 获取年级信息
            parent_ids = [cls.parent_id for cls in class_orgs if cls.parent_id]
            if parent_ids:
                grade_orgs = db.query(GradeOrg).filter(GradeOrg.id.in_(set(parent_ids))).all()
                for grade in grade_orgs:
                    grade_info_map[grade.id] = grade.name

        # 预加载学生信息（真实学生ID）
        # 注意：前端传递的 student_id 是字符串类型，数据库中可能是整数或字符串
        # 统一转换为字符串进行匹配
        real_student_ids = [r.student_id for r in batch_data.records if r.student_id and not r.student_id.startswith('temp_')]
        student_info_map = {}
        if real_student_ids:
            # 查询时支持整数和字符串类型的ID
            # 将字符串ID转换为整数进行查询（如果可能的话）
            int_ids = []
            str_ids = []
            for sid in set(real_student_ids):
                try:
                    int_ids.append(int(sid))
                except (ValueError, TypeError):
                    str_ids.append(sid)
            
            students = db.query(Student).filter(
                (Student.id.in_(int_ids)) | (Student.id.in_(str_ids))
            ).all() if int_ids and str_ids else db.query(Student).filter(
                Student.id.in_(int_ids + str_ids)
            ).all()
            
            for s in students:
                # 使用字符串 key 以匹配前端传递的格式
                student_info_map[str(s.id)] = {"name": s.name, "id": s.id}

        def process_student_id(student_id, class_id, class_orgs):
            """
            处理学生ID，仅查找已存在的学生
            学生创建的唯一入口是学生管理页面，此处不再自动创建学生
            返回: (student_id, student_name, error_message)
            """
            if not student_id:
                return None, None, None
            
            # 如果是真实学生ID
            if not student_id.startswith('temp_'):
                info = student_info_map.get(student_id)
                if info:
                    return student_id, info["name"], None
                else:
                    return None, None, f"学生ID {student_id} 不存在，请先在学生管理页面创建学生"
            
            # 解析临时ID: temp_4_X-1 A-1 王五
            parts = student_id.split(' ')
            if len(parts) < 1:
                return None, None, f"无效的学生ID格式: {student_id}"
            
            extracted_name = parts[-1]
            
            # 提取班级ID
            id_parts = student_id.split('_')
            try:
                extracted_class_id = int(id_parts[1]) if len(id_parts) >= 2 else class_id
            except (ValueError, IndexError):
                extracted_class_id = class_id
            
            # 检查学生是否已存在
            existing = db.query(Student).filter(
                Student.name == extracted_name,
                Student.class_id == extracted_class_id,
                Student.status == 1
            ).first()
            
            if existing:
                return existing.id, existing.name, None
            
            # 学生不存在，返回错误信息
            # 查找班级名称用于错误提示
            class_name = class_info_map.get(extracted_class_id, f"班级{extracted_class_id}")
            return None, None, f"学生「{extracted_name}」在{class_name}中不存在，请先在学生管理页面创建该学生"

        for record_data in batch_data.records:
            # 始终使用服务器当前北京时间
            record_time = datetime.now(beijing_tz)
            
            # 处理学生ID（不再自动创建学生，需要先在学生管理页面创建）
            actual_student_id, student_name, student_error = process_student_id(
                record_data.student_id, 
                record_data.class_id,
                class_orgs
            )
            
            # 如果学生不存在，跳过该记录并记录错误
            if student_error:
                print(f"[WARN] 跳过记录: {student_error}")
                errors.append({
                    "student_id": record_data.student_id,
                    "class_id": record_data.class_id,
                    "message": student_error
                })
                continue

            # 获取班级和年级名称
            class_name = class_info_map.get(record_data.class_id)
            grade_name = None
            if record_data.class_id:
                class_org = next((cls for cls in class_orgs if cls.id == record_data.class_id), None)
                if class_org and class_org.parent_id:
                    grade_name = grade_info_map.get(class_org.parent_id)

            # 获取当前记录对应的规则
            rule = rule_map.get(record_data.rule_id) if record_data.rule_id else None
            if not rule:
                # 如果没有找到规则，使用默认值
                rule = CfgMoralIndicator(
                    id=record_data.rule_id or 0,
                    category="未分类",
                    sub_category="其他",
                    name="默认指标",
                    type="deduction",
                    default_score=-1
                )

            moral_record = BizMoralRecord(
                student_id=actual_student_id,  # 使用处理后的学生ID
                student_name=student_name,
                class_id=record_data.class_id,
                class_name=class_name,
                grade_name=grade_name,
                rule_id=rule.id,
                major_category=rule.category,
                minor_category=rule.sub_category,
                rule_snapshot=rule.name,
                score_change=record_data.score_change or rule.default_score,
                description=record_data.description,
                source="miniprogram",
                recorder_id=current_user.id,
                record_time=record_time
            )
            db.add(moral_record)
            db.flush()  # 获取 ID 但不提交
            created_ids.append(moral_record.id)

        db.commit()

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module=MODULE_MORAL,
            action=ACTION_CREATE,
            description=f"批量创建德育记录: {len(created_ids)} 条",
            status="成功",
            request=request
        )

        return {
            "ids": created_ids,
            "count": len(created_ids),
            "errors": errors,
            "error_count": len(errors),
            "message": f"成功创建 {len(created_ids)} 条记录" + (f"，{len(errors)} 条记录因学生不存在被跳过" if errors else "")
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"Error batch creating moral records: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/records")
async def get_moral_records(
    student_id: str = None,
    class_id: int = None,
    school_id: int = None,
    recorder_id: int = Query(None, description="录入人ID，用于过滤只显示自己录入的记录"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get moral education records (filtered by user's data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 使用 join 查询获取关联信息
    # 排除宿舍检查记录（source='dorm'）
    query = db.query(
        BizMoralRecord,
        CfgMoralIndicator.category.label('major_category'),
        CfgMoralIndicator.sub_category.label('minor_category'),
        Student.name.label('student_name'),
        SysOrg.name.label('class_name'),
        GradeOrg.name.label('grade_name')
    ).filter(
        (BizMoralRecord.source != 'dorm') | (BizMoralRecord.source.is_(None))
    ).outerjoin(
        CfgMoralIndicator,
        BizMoralRecord.rule_snapshot == CfgMoralIndicator.name
    ).outerjoin(
        Student,
        BizMoralRecord.student_id == Student.id
    ).outerjoin(
        SysOrg,
        BizMoralRecord.class_id == SysOrg.id
    ).outerjoin(
        GradeOrg,
        SysOrg.parent_id == GradeOrg.id
    )
    
    # 应用数据权限过滤
    if not scope.has_all:
        # 获取用户可访问的班级ID
        accessible_class_ids = list(scope.class_ids) if scope.class_ids else []
        print(f"[DEBUG] Moral records - User: {current_user.id}, accessible_class_ids: {accessible_class_ids}")
        
        if not accessible_class_ids:
            # 用户没有任何班级权限，但仍允许查看自己录入的记录
            query = query.filter(BizMoralRecord.recorder_id == current_user.id)
            print(f"[DEBUG] Moral records - Using recorder_id filter: {current_user.id}")
        else:
            # 有班级权限时，包含班级记录和自己录入的记录
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    BizMoralRecord.class_id.in_(accessible_class_ids),
                    BizMoralRecord.recorder_id == current_user.id
                )
            )
            print(f"[DEBUG] Moral records - Using combined filter: class_ids + recorder_id")

    # 按录入人过滤（小程序端使用）
    if recorder_id:
        query = query.filter(BizMoralRecord.recorder_id == recorder_id)

    if student_id:
        query = query.filter(BizMoralRecord.student_id == student_id)
    if class_id:
        # 验证用户是否有权限访问该班级
        if not scope.has_all and class_id not in scope.class_ids:
            return {"records": [], "total": 0}
        query = query.filter(BizMoralRecord.class_id == class_id)
    
    # 按学校筛选：通过 class_id 关联查询学校
    if school_id:
        # 获取该学校下的所有班级ID
        school_class_ids = db.query(SysOrg.id).filter(
            SysOrg.parent_id == school_id,
            SysOrg.type == 'class'
        ).all()
        
        # 也要获取年级下的班级（学校 -> 年级 -> 班级）
        grade_ids = db.query(SysOrg.id).filter(
            SysOrg.parent_id == school_id,
            SysOrg.type.in_(['grade', 'department'])
        ).all()
        grade_ids = [g[0] for g in grade_ids]
        
        if grade_ids:
            grade_class_ids = db.query(SysOrg.id).filter(
                SysOrg.parent_id.in_(grade_ids),
                SysOrg.type == 'class'
            ).all()
            school_class_ids = list(school_class_ids) + list(grade_class_ids)
        
        class_id_list = [c[0] for c in school_class_ids]
        if class_id_list:
            query = query.filter(BizMoralRecord.class_id.in_(class_id_list))
        else:
            # 没有班级则返回空
            return {"records": [], "total": 0}

    total = query.count()
    results = query.order_by(BizMoralRecord.record_time.desc()).offset(skip).limit(limit).all()

    records = []
    for result in results:
        record = result[0]
        major_category = result[1]
        minor_category = result[2]
        student_name = result[3]
        class_name = result[4]
        grade_name = result[5]
        
        # 从 student_id 中提取姓名（格式: temp_40_A-1 安安）
        name_from_id = record.student_id.split()[-1] if record.student_id and ' ' in record.student_id else None
        student_display = student_name or name_from_id or record.student_id
        
        records.append({
            "id": record.id,
            "student_id": record.student_id,
            "student_name": student_display,
            "class_id": record.class_id,
            "class_name": class_name or '未知班级',
            "grade_name": grade_name or '未知年级',
            "rule_id": record.rule_id,
            "rule_snapshot": record.rule_snapshot,
            "major_category": major_category or '其他',
            "minor_category": minor_category or '其他',
            "content": record.rule_snapshot,  # 检查内容
            "score_change": float(record.score_change),
            "description": record.description,
            "record_time": record.record_time.isoformat(),
            "recorder_id": record.recorder_id
        })

    return {
        "records": records,
        "total": total
    }


@router.get("/stats/dashboard")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get dashboard statistics for moral education
    """
    # Mock data for now - in production, this would calculate from actual records
    return {
        "total_students": 3240,
        "total_teachers": 218,
        "weekly_moral_avg_score": 96.5,
        "weekly_teaching_avg_score": 95.2,
        "five_education_scores": {
            "moral": 100,
            "intellect": 85,
            "physical": 90,
            "artistic": 70,
            "labor": 88
        },
        "weekly_trend": [
            {"day": "周一", "moral_score": 98, "teaching_score": 95},
            {"day": "周二", "moral_score": 96, "teaching_score": 93},
            {"day": "周三", "moral_score": 94, "teaching_score": 96},
            {"day": "周四", "moral_score": 97, "teaching_score": 94},
            {"day": "周五", "moral_score": 99, "teaching_score": 97}
        ]
    }


# Teaching Indicators API

@router.get("/teaching-indicators")
async def get_teaching_indicators(
    org_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get teaching indicators with pagination and filters
    If org_id is provided, get indicators for that organization
    """
    query = db.query(CfgTeachingIndicator)

    # Filter by organization - show global and specific org indicators
    if org_id is not None:
        query = query.filter(
            (CfgTeachingIndicator.org_id == org_id) | (CfgTeachingIndicator.org_id.is_(None))
        )

    # Search by name or category
    if search:
        query = query.filter(
            (CfgTeachingIndicator.name.contains(search)) | 
            (CfgTeachingIndicator.major_category.contains(search))
        )

    total = query.count()
    indicators = query.order_by(CfgTeachingIndicator.major_category, CfgTeachingIndicator.id)\
                       .offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "indicators": [
            {
                "id": indicator.id,
                "major_category": indicator.major_category,
                "name": indicator.name,
                "type": indicator.type,
                "default_score": float(indicator.default_score),
                "is_enabled": indicator.is_enabled,
                "is_overall": indicator.is_overall if hasattr(indicator, 'is_overall') else 0,
                "org_id": indicator.org_id,
                "org_name": indicator.org.name if indicator.org else "全集团通用"
            }
            for indicator in indicators
        ]
    }


@router.get("/teaching-indicators/categories")
async def get_teaching_categories(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all unique categories for teaching indicators
    """
    categories = db.query(CfgTeachingIndicator.major_category).distinct().all()
    return [c[0] for c in categories if c[0]]


@router.get("/teaching-indicators/all")
async def get_all_teaching_indicators(
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get all enabled teaching indicators (no pagination)
    Used for grade report table columns
    """
    query = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.is_enabled == 1)
    
    # Filter by organization - show global and specific org indicators
    if org_id is not None:
        query = query.filter(
            (CfgTeachingIndicator.org_id == org_id) | (CfgTeachingIndicator.org_id.is_(None))
        )
    
    indicators = query.order_by(CfgTeachingIndicator.major_category, CfgTeachingIndicator.id).all()
    
    return {
        "indicators": [
            {
                "id": indicator.id,
                "major_category": indicator.major_category,
                "name": indicator.name,
                "type": indicator.type,
                "default_score": float(indicator.default_score),
                "is_enabled": indicator.is_enabled,
                "org_id": indicator.org_id,
                "org_name": indicator.org.name if indicator.org else "全集团通用"
            }
            for indicator in indicators
        ]
    }


@router.post("/teaching-indicators")
async def create_teaching_indicator(
    data: TeachingIndicatorCreate = Body(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new teaching indicator
    """
    indicator = CfgTeachingIndicator(
        major_category=data.major_category,
        name=data.name,
        type=data.type,
        default_score=data.default_score,
        org_id=data.org_id,
        is_enabled=1,
        is_overall=data.is_overall or 0
    )

    db.add(indicator)
    db.commit()
    db.refresh(indicator)

    return {
        "id": indicator.id,
        "message": "Teaching indicator created successfully"
    }


@router.put("/teaching-indicators/{indicator_id}")
async def update_teaching_indicator(
    indicator_id: int,
    data: TeachingIndicatorUpdate = Body(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update a teaching indicator
    """
    indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Teaching indicator not found")

    if data.major_category is not None:
        indicator.major_category = data.major_category
    if data.name is not None:
        indicator.name = data.name
    if data.type is not None:
        indicator.type = data.type
    if data.default_score is not None:
        indicator.default_score = data.default_score
    if data.org_id is not None:
        indicator.org_id = data.org_id
    if data.is_enabled is not None:
        indicator.is_enabled = data.is_enabled
    if data.is_overall is not None:
        indicator.is_overall = data.is_overall

    db.commit()

    return {"message": "Teaching indicator updated successfully"}


@router.delete("/teaching-indicators/{indicator_id}")
async def delete_teaching_indicator(
    indicator_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Delete a teaching indicator
    """
    indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Teaching indicator not found")

    db.delete(indicator)
    db.commit()

    return {"message": "Teaching indicator deleted successfully"}


# 班级报表 API

@router.get("/class-report")
async def get_class_report(
    class_id: int = Query(..., description="班级ID"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    category: Optional[str] = Query(None, description="筛选类别: moral, intellect, physical, artistic, labor"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取班级德育量化报表数据
    """
    import logging
    logging.info(f"[班级报表API] 接收参数: class_id={class_id}, start_date={start_date}, end_date={end_date}, category={category}")

    # 默认查询最近30天
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    logging.info(f"[班级报表API] 使用日期范围: {start_date} ~ {end_date}")
    
    # 获取班级信息
    class_info = db.query(SysOrg).filter(SysOrg.id == class_id).first()
    if not class_info:
        logging.warning(f"[班级报表API] 班级不存在: class_id={class_id}")
        raise HTTPException(status_code=404, detail="班级不存在")
    
    logging.info(f"[班级报表API] 班级信息: {class_info.name}")
    
    # 获取班主任信息
    class_info_record = db.query(BaseClassInfo).filter(
        BaseClassInfo.org_id == class_id
    ).first()
    
    head_teacher = None
    if class_info_record and class_info_record.head_teacher_id:
        head_teacher = db.query(SysUser).filter(
            SysUser.id == class_info_record.head_teacher_id
        ).first()
    
    # 获取学生人数
    student_count = db.query(func.count(Student.id)).filter(
        Student.class_id == class_id,
        Student.status == 1
    ).scalar()
    
    # 构建查询条件
    query = db.query(BizMoralRecord).filter(
        BizMoralRecord.class_id == class_id,
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )
    
    # 获取所有记录
    records = query.all()

    # 调试日志：检查记录的日期范围
    if records:
        print(f"[校级报表] 查询参数: start_date={start_date}, end_date={end_date}")
        print(f"[校级报表] 第一条记录时间: {records[0].record_time}")
        print(f"[校级报表] 最后一条记录时间: {records[-1].record_time}")
        # 检查是否有超出日期范围的记录
        if end_date:
            try:
                from datetime import datetime as dt_module
                end_dt = dt_module.strptime(end_date, '%Y-%m-%d')
                out_of_range = [r for r in records if r.record_time.date() > end_dt.date()]
                if out_of_range:
                    print(f"[校级报表] 警告：发现 {len(out_of_range)} 条超出结束日期的记录")
                    for r in out_of_range[:5]:  # 只打印前5条
                        print(f"  - 记录ID: {r.id}, 时间: {r.record_time}, 班级ID: {r.class_id}")
            except Exception as e:
                print(f"[校级报表] 日期解析错误: {e}")
    
    # 调试日志
    import logging
    logging.info(f"[班级报表基础查询] class_id={class_id}, 日期范围={start_date}~{end_date}, 查询到{len(records)}条记录")
    
    # 如果没有记录，尝试不带日期过滤查询
    if len(records) == 0:
        query_no_date = db.query(BizMoralRecord).filter(
            BizMoralRecord.class_id == class_id
        )
        records_no_date = query_no_date.all()
        logging.info(f"[班级报表不带日期查询] class_id={class_id}, 查询到{len(records_no_date)}条记录")
        if len(records_no_date) > 0:
            logging.info(f"[班级报表] 记录的日期范围: {records_no_date[0].record_time} ~ {records_no_date[-1].record_time}")
    
    # 计算统计数据
    total_score = sum(float(r.score_change) for r in records)
    bonus_records = [r for r in records if float(r.score_change) > 0]
    deduction_records = [r for r in records if float(r.score_change) < 0]
    bonus_score = sum(float(r.score_change) for r in bonus_records)
    deduction_score = sum(float(r.score_change) for r in deduction_records)
    
    # 五育分数统计（基于指标分类）
    category_scores = {
        '德育': {'score': 100, 'deduction': 0},
        '智育': {'score': 100, 'deduction': 0},
        '体育': {'score': 100, 'deduction': 0},
        '美育': {'score': 100, 'deduction': 0},
        '劳育': {'score': 100, 'deduction': 0},
    }
    
    for record in records:
        # 从 rule_snapshot 或关联的指标获取分类
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == record.rule_snapshot
        ).first()
        
        if indicator:
            cat = indicator.category
            if cat in category_scores:
                category_scores[cat]['deduction'] += abs(float(record.score_change))
    
    # 计算最终五育分数
    five_education = [
        {'category': cat, 'score': max(0, data['score'] - data['deduction']), 'fullMark': 100}
        for cat, data in category_scores.items()
    ]
    
    # 获取详细记录列表
    details_query = db.query(
        BizMoralRecord,
        CfgMoralIndicator.category.label('major_category'),
        CfgMoralIndicator.sub_category.label('minor_category'),
        Student.name.label('student_name')
    ).outerjoin(
        CfgMoralIndicator, 
        BizMoralRecord.rule_snapshot == CfgMoralIndicator.name
    ).outerjoin(
        Student,
        BizMoralRecord.student_id == Student.id
    ).filter(
        BizMoralRecord.class_id == class_id,
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )
    
    if category:
        category_map = {
            'moral': '德育',
            'intellect': '智育',
            'physical': '体育',
            'artistic': '美育',
            'labor': '劳育'
        }
        if category in category_map:
            details_query = details_query.filter(
                CfgMoralIndicator.category == category_map[category]
            )
    
    details_result = details_query.order_by(BizMoralRecord.record_time.desc()).all()
    
    # 调试日志
    import logging
    logging.info(f"[班级报表详细查询] class_id={class_id}, 日期范围={start_date}~{end_date}, 查询到{len(details_result)}条记录")

    # 输出第一条记录的详细信息
    if len(details_result) > 0:
        record, major_cat, minor_cat, student_name = details_result[0]
        logging.info(f"[班级报表] 第一条记录: student_id={record.student_id}, rule_snapshot={record.rule_snapshot}, score_change={record.score_change}")

    details = []
    for idx, (record, major_cat, minor_cat, student_name) in enumerate(details_result, 1):
        # 从 student_id 中提取姓名（格式: temp_40_A-1 安安）
        name_from_id = record.student_id.split()[-1] if record.student_id and ' ' in record.student_id else None
        student_display = student_name or name_from_id or f'学生{record.student_id}'
        details.append({
            'id': idx,
            'item': record.rule_snapshot,
            'content': record.rule_snapshot,  # 检查内容只返回指标名称
            'score': float(record.score_change),
            'reason': student_display,  # 学生列显示学生姓名
            'majorCategory': major_cat or '其他',
            'minorCategory': minor_cat or '其他',
            'student': student_display,
            'type': '加分' if float(record.score_change) > 0 else '减分',
            'time': record.record_time.strftime('%Y-%m-%d %H:%M:%S') if record.record_time else '-',
            'source': record.source,
            'description': record.description
        })
    
    # 计算趋势数据（按天汇总）
    trend_query = db.query(
        cast(BizMoralRecord.record_time, Date).label('date'),
        func.sum(BizMoralRecord.score_change).label('daily_score')
    ).filter(
        BizMoralRecord.class_id == class_id,
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    ).group_by(
        cast(BizMoralRecord.record_time, Date)
    ).order_by('date').all()
    
    trend = []
    cumulative_score = 0
    for date_row in trend_query:
        cumulative_score += float(date_row.daily_score)
        trend.append({
            'date': date_row.date.strftime('%m-%d'),
            'score': round(cumulative_score, 1)
        })
    
    # 计算班级排名（简化版本，实际应该与年级内其他班级比较）
    rank = 1  # 需要从其他数据计算
    
    return {
        'classInfo': {
            'id': class_id,
            'name': class_info.name,
            'headTeacher': head_teacher.real_name if head_teacher else '未分配',
            'studentCount': student_count or 0
        },
        'summary': {
            'totalScore': round(total_score, 1),
            'bonusScore': round(bonus_score, 1),
            'deductionScore': round(deduction_score, 1),
            'checkItems': len(records),
            'rank': rank,
            'trend': -2  # 与上期比较，需要从历史数据计算
        },
        'fiveEducation': five_education,
        'details': details[:10],  # 只返回前10条
        'records': details,
        'trend': trend if trend else [{'date': datetime.now().strftime('%m-%d'), 'score': 0}]
    }


# 年级报表 API

@router.get("/grade-report")
async def get_grade_report(
    grade_id: int = Query(..., description="年级ID"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    category: Optional[str] = Query(None, description="筛选类别: moral, intellect, physical, artistic, labor"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取年级德育量化报表数据 - 支持动态指标
    """
    # 数据权限验证
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and grade_id not in scope.grade_ids:
        raise HTTPException(status_code=403, detail="无权限访问该年级数据")

    # 默认查询最近30天
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    # 获取年级信息
    grade_info = db.query(SysOrg).filter(SysOrg.id == grade_id).first()
    if not grade_info:
        raise HTTPException(status_code=404, detail="年级不存在")
    
    # 获取年级下的所有班级
    classes = db.query(SysOrg).filter(
        SysOrg.parent_id == grade_id,
        SysOrg.type == 'class'
    ).all()
    
    if not classes:
        raise HTTPException(status_code=404, detail="该年级下没有班级")
    
    class_ids = [c.id for c in classes]
    
    # 获取动态指标结构
    indicators_query = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.is_enabled == 1)
    indicators = indicators_query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category).all()
    
    # 构建指标映射: (category, sub_category) -> field_key
    indicator_map = {}
    category_structure = {}
    for ind in indicators:
        cat = ind.category or '其他'
        sub = ind.sub_category or '其他'
        key = f"{cat}_{sub}"
        indicator_map[(cat, sub)] = key
        
        if cat not in category_structure:
            category_structure[cat] = {
                'name': cat,
                'subCategories': []
            }
        
        existing_subs = [s['name'] for s in category_structure[cat]['subCategories']]
        if sub not in existing_subs:
            category_structure[cat]['subCategories'].append({
                'name': sub,
                'fieldKey': key
            })
    
    # 定义标准五育顺序
    standard_order = ['德育', '智育', '体育', '美育', '劳育']
    ordered_categories = []
    for cat in standard_order:
        if cat in category_structure:
            ordered_categories.append(category_structure[cat])
    for cat in category_structure:
        if cat not in standard_order:
            ordered_categories.append(category_structure[cat])
    
    # 构建查询条件
    query = db.query(BizMoralRecord).filter(
        BizMoralRecord.class_id.in_(class_ids),
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )
    
    # 类别筛选
    if category:
        category_map = {
            'moral': '德育',
            'intellect': '智育',
            'physical': '体育',
            'artistic': '美育',
            'labor': '劳育'
        }
        if category in category_map:
            indicator_names = db.query(CfgMoralIndicator.name).filter(
                CfgMoralIndicator.category == category_map[category]
            ).all()
            indicator_names_list = [n[0] for n in indicator_names]
            query = query.filter(BizMoralRecord.rule_snapshot.in_(indicator_names_list))
    
    # 获取所有记录
    records = query.all()
    
    # 预加载班级信息
    class_teacher_map = {}
    class_student_count_map = {}
    
    class_info_records = db.query(BaseClassInfo).filter(
        BaseClassInfo.org_id.in_(class_ids)
    ).all()
    
    for ci in class_info_records:
        if ci.head_teacher_id:
            teacher = db.query(SysUser).filter(SysUser.id == ci.head_teacher_id).first()
            if teacher:
                class_teacher_map[ci.org_id] = teacher.real_name
        
        student_count = db.query(func.count(Student.id)).filter(
            Student.class_id == ci.org_id,
            Student.status == 1
        ).scalar()
        class_student_count_map[ci.org_id] = student_count or 0
    
    # 初始化班级统计数据（使用动态字段）
    class_stats = {}
    for cls in classes:
        stats = {
            'class': cls.name,
            'headTeacher': class_teacher_map.get(cls.id, '未分配'),
            'totalDed': 0,
            'perCapita': 0,
            'rank': 0
        }
        # 初始化所有动态指标字段为0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                stats[sub['fieldKey']] = 0
        class_stats[cls.id] = stats
    
    # 按动态指标统计
    for record in records:
        cls_id = record.class_id
        if cls_id not in class_stats:
            continue
            
        score = float(record.score_change)
        rule_name = record.rule_snapshot
        
        # 获取指标的分类信息
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == rule_name
        ).first()
        
        if indicator:
            cat = indicator.category or '其他'
            sub = indicator.sub_category or '其他'
            key = indicator_map.get((cat, sub))
            if key:
                class_stats[cls_id][key] += score
    
    # 计算每个班级的总扣分、人均扣分和排名
    class_rankings = []
    for cls_id, stats in class_stats.items():
        # 计算总扣分（所有动态字段的和）
        total_ded = 0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                total_ded += stats.get(sub['fieldKey'], 0)
        
        stats['totalDed'] = total_ded
        
        # 计算人均扣分
        student_count = class_student_count_map.get(cls_id, 1)
        stats['perCapita'] = round(total_ded / student_count, 2) if student_count > 0 else 0
        
        class_rankings.append((cls_id, total_ded))
    
    # 排序并分配排名（扣分越少排名越靠前，支持并列）
    # 扣分是负数，按降序排列（绝对值小的在前）
    class_rankings.sort(key=lambda x: x[1], reverse=True)
    current_rank = 1
    for i, (cls_id, score) in enumerate(class_rankings):
        if i > 0 and score < class_rankings[i-1][1]:
            current_rank = current_rank + 1
        class_stats[cls_id]['rank'] = current_rank
    
    # 构建详细记录列表
    detail_records = []
    print(f"[年级报表] 查询到 {len(records)} 条记录，准备构建详细记录")
    for idx, record in enumerate(records[:100], 1):  # 限制返回100条
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == record.rule_snapshot
        ).first()

        cls = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
        class_name = cls.name if cls else '未知班级'

        # 获取学生姓名：优先从学生表，否则从 student_id 中提取（格式: temp_40_A-1 安安）
        student = db.query(Student).filter(Student.id == record.student_id).first()
        name_from_id = record.student_id.split()[-1] if record.student_id and ' ' in record.student_id else record.student_id
        student_name = student.name if student else name_from_id

        detail_records.append({
            'id': idx,
            'class': class_name,
            'majorCategory': indicator.category if indicator else '其他',
            'minorCategory': indicator.sub_category if indicator else '其他',
            'reason': record.rule_snapshot or '-',
            'content': record.rule_snapshot or '-',  # 检查内容只返回指标名称
            'student': student_name,
            'type': '加分' if float(record.score_change) > 0 else '减分',
            'score': float(record.score_change),
            'time': record.record_time.strftime('%Y-%m-%d %H:%M:%S') if record.record_time else '-',
            'source': record.source,
            'description': record.description
        })

    print(f"[年级报表] 构建了 {len(detail_records)} 条详细记录")
    
    return {
        'gradeName': grade_info.name,
        'classes': list(class_stats.values()),
        'records': detail_records,
        'reportPeriod': {
            'startDate': start_date,
            'endDate': end_date
        },
        'indicatorStructure': ordered_categories  # 添加动态指标结构
    }


# 校级报表 API

@router.get("/school-report")
async def get_school_report(
    school_id: int = Query(..., description="学校ID"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    category: Optional[str] = Query(None, description="筛选类别: moral, intellect, physical, artistic, labor"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取学校德育量化报表数据 - 汇总各年级的五育数据
    """

    # 默认查询最近30天
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    print(f"[校级报表] 接收查询参数: start_date={start_date}, end_date={end_date}")

    # 获取学校信息
    school_info = db.query(SysOrg).filter(SysOrg.id == school_id).first()
    if not school_info:
        raise HTTPException(status_code=404, detail="学校不存在")

    # 获取学校下的所有年级
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()

    if not grades:
        raise HTTPException(status_code=404, detail="该学校下没有年级")

    # 获取所有年级下的所有班级
    grade_ids = [g.id for g in grades]
    classes = db.query(SysOrg).filter(
        SysOrg.parent_id.in_(grade_ids),
        SysOrg.type == 'class'
    ).all()

    if not classes:
        raise HTTPException(status_code=404, detail="该学校下没有班级")

    class_ids = [c.id for c in classes]

    # 构建查询条件
    query = db.query(BizMoralRecord).filter(
        BizMoralRecord.class_id.in_(class_ids),
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )

    # 类别筛选
    if category:
        category_map = {
            'moral': '德育',
            'intellect': '智育',
            'physical': '体育',
            'artistic': '美育',
            'labor': '劳育'
        }
        if category in category_map:
            indicator_names = db.query(CfgMoralIndicator.name).filter(
                CfgMoralIndicator.category == category_map[category]
            ).all()
            indicator_names_list = [n[0] for n in indicator_names]
            query = query.filter(BizMoralRecord.rule_snapshot.in_(indicator_names_list))

    # 获取动态指标结构
    indicators_query = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.is_enabled == 1)
    indicators = indicators_query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category).all()
    
    # 构建指标映射: (category, sub_category) -> field_key
    indicator_map = {}
    category_structure = {}
    for ind in indicators:
        cat = ind.category or '其他'
        sub = ind.sub_category or '其他'
        key = f"{cat}_{sub}"
        indicator_map[(cat, sub)] = key
        
        if cat not in category_structure:
            category_structure[cat] = {
                'name': cat,
                'subCategories': []
            }
        
        existing_subs = [s['name'] for s in category_structure[cat]['subCategories']]
        if sub not in existing_subs:
            category_structure[cat]['subCategories'].append({
                'name': sub,
                'fieldKey': key
            })
    
    # 定义标准五育顺序
    standard_order = ['德育', '智育', '体育', '美育', '劳育']
    ordered_categories = []
    for cat in standard_order:
        if cat in category_structure:
            ordered_categories.append(category_structure[cat])
    for cat in category_structure:
        if cat not in standard_order:
            ordered_categories.append(category_structure[cat])
    
    # 获取所有记录
    records = query.all()

    # 调试日志：检查记录的日期范围
    if records:
        print(f"[校级报表] 查询到 {len(records)} 条记录")
        print(f"[校级报表] 第一条记录时间: {records[0].record_time}")
        print(f"[校级报表] 最后一条记录时间: {records[-1].record_time}")
        # 检查是否有超出日期范围的记录
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                out_of_range = [r for r in records if r.record_time.date() > end_dt.date()]
                if out_of_range:
                    print(f"[校级报表] 警告：发现 {len(out_of_range)} 条超出结束日期的记录")
                    for r in out_of_range[:5]:  # 只打印前5条
                        print(f"  - 记录ID: {r.id}, 时间: {r.record_time}, 班级ID: {r.class_id}")
            except Exception as e:
                print(f"[校级报表] 日期解析错误: {e}")
    
    # 按年级统计
    grade_stats = {}
    class_to_grade_map = {}
    
    # 建立班级到年级的映射
    for cls in classes:
        class_to_grade_map[cls.id] = cls.parent_id
    
    # 初始化年级统计数据（使用动态字段）
    for grade in grades:
        stats = {
            'grade': grade.name,
            'totalDed': 0,
            'perCapita': 0,
            'rank': 0,
            'studentCount': 0
        }
        # 初始化所有动态指标字段为0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                stats[sub['fieldKey']] = 0
        grade_stats[grade.id] = stats
    
    # 获取每个年级的学生人数
    for grade in grades:
        grade_classes = [c for c in classes if c.parent_id == grade.id]
        grade_class_ids = [c.id for c in grade_classes]
        student_count = db.query(func.count(Student.id)).filter(
            Student.class_id.in_(grade_class_ids),
            Student.status == 1
        ).scalar()
        grade_stats[grade.id]['studentCount'] = student_count or 0
    
    # 统计各年级数据
    for record in records:
        cls_id = record.class_id
        grade_id = class_to_grade_map.get(cls_id)
        if not grade_id or grade_id not in grade_stats:
            continue
            
        score = float(record.score_change)
        rule_name = record.rule_snapshot
        
        # 获取指标的分类信息
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == rule_name
        ).first()
        
        if indicator:
            cat = indicator.category or '其他'
            sub = indicator.sub_category or '其他'
            key = indicator_map.get((cat, sub))
            if key:
                grade_stats[grade_id][key] += score
    
    # 计算每个年级的总扣分、人均扣分和排名
    grade_rankings = []
    for grade_id, stats in grade_stats.items():
        # 计算总扣分（所有动态字段的和）
        total_ded = 0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                total_ded += stats.get(sub['fieldKey'], 0)
        
        stats['totalDed'] = total_ded
        
        # 计算人均扣分
        student_count = stats['studentCount']
        stats['perCapita'] = round(total_ded / student_count, 2) if student_count > 0 else 0
        
        grade_rankings.append((grade_id, total_ded))
    
    # 排序并分配排名（扣分越少排名越靠前，支持并列）
    # 扣分是负数，按降序排列（绝对值小的在前）
    grade_rankings.sort(key=lambda x: x[1], reverse=True)
    current_rank = 1
    for i, (grade_id, score) in enumerate(grade_rankings):
        if i > 0 and score < grade_rankings[i-1][1]:
            current_rank = current_rank + 1
        grade_stats[grade_id]['rank'] = current_rank
    
    # 构建详细记录列表（用于详情页）
    detail_records = []
    print(f"[校级报表] 查询到 {len(records)} 条记录，准备构建详细记录")
    for idx, record in enumerate(records[:200], 1):  # 限制返回200条
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == record.rule_snapshot
        ).first()

        cls = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
        class_name = cls.name if cls else '未知班级'
        grade_id = class_to_grade_map.get(record.class_id, 0)
        grade = db.query(SysOrg).filter(SysOrg.id == grade_id).first()
        grade_name = grade.name if grade else '未知年级'

        # 获取学生姓名：优先从学生表，否则从 student_id 中提取（格式: temp_40_A-1 安安）
        student = db.query(Student).filter(Student.id == record.student_id).first()
        name_from_id = record.student_id.split()[-1] if record.student_id and ' ' in record.student_id else record.student_id
        student_name = student.name if student else name_from_id

        detail_records.append({
            'id': idx,
            'grade': grade_name,
            'class': class_name,
            'student': student_name,
            'majorCategory': indicator.category if indicator else '其他',
            'minorCategory': indicator.sub_category if indicator else '其他',
            'reason': record.rule_snapshot or '-',
            'content': record.rule_snapshot or '-',  # 检查内容只返回指标名称
            'type': '加分' if float(record.score_change) > 0 else '减分',
            'score': float(record.score_change),
            'time': record.record_time.strftime('%Y-%m-%d %H:%M:%S') if record.record_time else '-',
            'source': record.source,
            'description': record.description
        })

    print(f"[校级报表] 构建了 {len(detail_records)} 条详细记录")
    
    return {
        'schoolName': school_info.name,
        'grades': list(grade_stats.values()),
        'records': detail_records,
        'reportPeriod': {
            'startDate': start_date,
            'endDate': end_date
        },
        'indicatorStructure': ordered_categories  # 添加动态指标结构
    }


# 学区报表 API

@router.get("/district-report")
async def get_district_report(
    group_id: Optional[int] = Query(None, description="集团ID（不指定则返回所有集团）"),
    school_ids: Optional[str] = Query(None, description="学校ID列表，逗号分隔（不指定则返回所有学校）"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取学区德育量化报表数据 - 汇总各学校的五育数据
    """

    # 默认查询最近30天
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    # 解析学校ID列表
    school_id_list = None
    if school_ids:
        try:
            school_id_list = [int(sid.strip()) for sid in school_ids.split(',') if sid.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="学校ID格式错误")

    print(f"[学区报表] 接收查询参数: group_id={group_id}, school_ids={school_ids}, parsed={school_id_list}, count={len(school_id_list) if school_id_list else 0}, start_date={start_date}, end_date={end_date}")

    # 如果指定了学校列表，只返回这些学校的数据
    if school_id_list:
        # 获取所有指定的学校信息
        schools_info = db.query(SysOrg).filter(SysOrg.id.in_(school_id_list)).all()
        if not schools_info:
            raise HTTPException(status_code=404, detail="指定的学校不存在")

        # 获取父级组织（用于学区名称）
        parent_org = None
        if schools_info[0].parent_id:
            parent_org = db.query(SysOrg).filter(SysOrg.id == schools_info[0].parent_id).first()

        # 获取动态指标结构
        indicators_query = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.is_enabled == 1)
        indicators = indicators_query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category).all()

        # 构建指标映射: (category, sub_category) -> field_key
        indicator_map = {}
        category_structure = {}
        for ind in indicators:
            cat = ind.category or '其他'
            sub = ind.sub_category or '其他'
            key = f"{cat}_{sub}"
            indicator_map[(cat, sub)] = key

            if cat not in category_structure:
                category_structure[cat] = {
                    'name': cat,
                    'subCategories': []
                }

            existing_subs = [s['name'] for s in category_structure[cat]['subCategories']]
            if sub not in existing_subs:
                category_structure[cat]['subCategories'].append({
                    'name': sub,
                    'fieldKey': key
                })

        # 定义标准五育顺序
        standard_order = ['德育', '智育', '体育', '美育', '劳育']
        ordered_categories = []
        for cat in standard_order:
            if cat in category_structure:
                ordered_categories.append(category_structure[cat])
        for cat in category_structure:
            if cat not in standard_order:
                ordered_categories.append(category_structure[cat])

        # 获取所有学校下所有年级和班级
        all_school_ids = [s.id for s in schools_info]
        print(f"[学区报表-指定学校] 查询学校IDs: {all_school_ids}")
        
        grades = db.query(SysOrg).filter(
            SysOrg.parent_id.in_(all_school_ids),
            SysOrg.type == 'grade'
        ).all()
        print(f"[学区报表-指定学校] 查询到 {len(grades)} 个年级: {[(g.id, g.name, g.parent_id) for g in grades[:5]]}")

        grade_ids = [g.id for g in grades]
        classes = db.query(SysOrg).filter(
            SysOrg.parent_id.in_(grade_ids),
            SysOrg.type == 'class'
        ).all()
        print(f"[学区报表-指定学校] 查询到 {len(classes)} 个班级")

        class_ids = [c.id for c in classes]

        # 查询这些学校的所有记录
        query = db.query(BizMoralRecord).filter(
            BizMoralRecord.class_id.in_(class_ids),
            func.date(BizMoralRecord.record_time) >= start_date,
            func.date(BizMoralRecord.record_time) <= end_date
        )

        records = query.all()
        print(f"[学区报表-指定学校] 查询到 {len(records)} 条记录")

        # 建立班级到学校的映射
        class_to_school_map = {}
        for cls in classes:
            grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
            if grade:
                school = db.query(SysOrg).filter(SysOrg.id == grade.parent_id).first()
                if school:
                    class_to_school_map[cls.id] = school.id

        # 初始化每个学校的统计数据
        schools_stats = {}
        for school_info in schools_info:
            stats = {
                'schoolName': school_info.name,
                'totalDed': 0,
                'perCapita': 0,
                'rank': 1,
                'studentCount': 0
            }
            # 初始化所有动态指标字段为0
            for cat_data in ordered_categories:
                for sub in cat_data['subCategories']:
                    stats[sub['fieldKey']] = 0
            schools_stats[school_info.id] = stats

        # 统计每个学校的学生人数
        print(f"[学区报表-指定学校] 开始统计学生人数，学校数量: {len(schools_info)}")
        for school_info in schools_info:
            school_grades = [g for g in grades if g.parent_id == school_info.id]
            print(f"[学区报表-指定学校] 学校 {school_info.name}(ID:{school_info.id}) 有 {len(school_grades)} 个年级")
            if not school_grades:
                print(f"[学区报表-指定学校] 学校 {school_info.name} 没有年级，跳过学生统计")
                continue
            school_grade_ids = [g.id for g in school_grades]
            school_classes = [c for c in classes if c.parent_id in school_grade_ids]
            school_class_ids = [c.id for c in school_classes]
            print(f"[学区报表-指定学校] 学校 {school_info.name} 有 {len(school_classes)} 个班级")

            student_count = db.query(func.count(Student.id)).filter(
                Student.class_id.in_(school_class_ids),
                Student.status == 1
            ).scalar()
            schools_stats[school_info.id]['studentCount'] = student_count or 0
            print(f"[学区报表-指定学校] 学校 {school_info.name} 学生人数: {student_count}")

        # 按动态指标统计
        for record in records:
            cls_id = record.class_id
            school_id = class_to_school_map.get(cls_id)
            if not school_id or school_id not in schools_stats:
                continue

            score = float(record.score_change)
            rule_name = record.rule_snapshot

            # 获取指标的分类信息
            indicator = db.query(CfgMoralIndicator).filter(
                CfgMoralIndicator.name == rule_name
            ).first()

            if indicator:
                cat = indicator.category or '其他'
                sub = indicator.sub_category or '其他'
                key = indicator_map.get((cat, sub))
                if key:
                    schools_stats[school_id][key] += score

        # 计算每个学校的总扣分、人均扣分和排名
        school_rankings = []
        for school_id, stats in schools_stats.items():
            # 计算总扣分（所有动态字段的和）
            total_ded = 0
            for cat_data in ordered_categories:
                for sub in cat_data['subCategories']:
                    total_ded += stats.get(sub['fieldKey'], 0)

            stats['totalDed'] = total_ded

            # 计算人均扣分
            student_count = stats['studentCount']
            stats['perCapita'] = round(total_ded / student_count, 2) if student_count > 0 else 0

            school_rankings.append((school_id, total_ded))

        # 排序并分配排名（扣分越少排名越靠前，支持并列）
        # 扣分是负数，按降序排列（绝对值小的在前）
        school_rankings.sort(key=lambda x: x[1], reverse=True)
        current_rank = 1
        for i, (school_id, score) in enumerate(school_rankings):
            if i > 0 and score < school_rankings[i-1][1]:
                current_rank = current_rank + 1
            schools_stats[school_id]['rank'] = current_rank

        result_schools = list(schools_stats.values())
        print(f"[学区报表-指定学校] 返回 {len(result_schools)} 所学校数据: {[s['schoolName'] for s in result_schools]}")

        return {
            'districtName': parent_org.name if parent_org else schools_info[0].name,
            'schools': result_schools,
            'indicatorStructure': ordered_categories
        }

    # 如果未指定学校，返回所有学校的数据
    # 获取所有学校（type='school'）
    schools_query = db.query(SysOrg).filter(SysOrg.type == 'school')
    
    # 如果指定了集团，只获取该集团下的学校
    if group_id:
        # 获取该集团下的所有组织ID（包括集团本身和所有子组织）
        org_ids = [group_id]
        
        # 获取该集团下的所有子组织（递归获取）
        def get_all_child_orgs(parent_id: int):
            children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
            for child in children:
                org_ids.append(child.id)
                get_all_child_orgs(child.id)
        
        get_all_child_orgs(group_id)
        
        # 从这些组织中筛选出学校
        schools_query = schools_query.filter(SysOrg.id.in_(org_ids))
    
    schools = schools_query.all()

    if not schools:
        raise HTTPException(status_code=404, detail="没有学校数据")

    # 获取动态指标结构
    indicators_query = db.query(CfgMoralIndicator).filter(CfgMoralIndicator.is_enabled == 1)
    indicators = indicators_query.order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category).all()
    
    # 构建指标映射: (category, sub_category) -> field_key
    indicator_map = {}
    category_structure = {}
    for ind in indicators:
        cat = ind.category or '其他'
        sub = ind.sub_category or '其他'
        key = f"{cat}_{sub}"
        indicator_map[(cat, sub)] = key
        
        if cat not in category_structure:
            category_structure[cat] = {
                'name': cat,
                'subCategories': []
            }
        
        existing_subs = [s['name'] for s in category_structure[cat]['subCategories']]
        if sub not in existing_subs:
            category_structure[cat]['subCategories'].append({
                'name': sub,
                'fieldKey': key
            })
    
    # 定义标准五育顺序
    standard_order = ['德育', '智育', '体育', '美育', '劳育']
    ordered_categories = []
    for cat in standard_order:
        if cat in category_structure:
            ordered_categories.append(category_structure[cat])
    for cat in category_structure:
        if cat not in standard_order:
            ordered_categories.append(category_structure[cat])

    # 构建查询条件 - 获取所有学校下所有班级的记录
    classes = db.query(SysOrg).filter(SysOrg.type == 'class').all()

    query = db.query(BizMoralRecord).filter(
        BizMoralRecord.class_id.in_([c.id for c in classes]),
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )

    # 获取所有记录
    records = query.all()
    print(f"[学区报表] 查询到 {len(records)} 条记录")

    # 建立班级到学校的映射
    class_to_school_map = {}
    for cls in classes:
        # 获取父年级
        grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
        if grade:
            # 获取父学校
            school = db.query(SysOrg).filter(SysOrg.id == grade.parent_id).first()
            if school:
                class_to_school_map[cls.id] = school.id

    # 初始化学校统计数据
    school_stats = {}
    for school in schools:
        stats = {
            'schoolName': school.name,
            'totalDed': 0,
            'perCapita': 0,
            'rank': 0,
            'studentCount': 0
        }
        # 初始化所有动态指标字段为0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                stats[sub['fieldKey']] = 0
        school_stats[school.id] = stats

    # 获取每个学校的学生人数
    for school in schools:
        # 获取学校下所有年级
        school_grades = db.query(SysOrg).filter(
            SysOrg.parent_id == school.id,
            SysOrg.type == 'grade'
        ).all()
        
        if not school_grades:
            continue
            
        grade_ids = [g.id for g in school_grades]
        
        # 获取这些年级下的所有班级
        school_classes = db.query(SysOrg).filter(
            SysOrg.parent_id.in_(grade_ids),
            SysOrg.type == 'class'
        ).all()
        
        school_class_ids = [c.id for c in school_classes]
        
        # 统计学生人数
        student_count = db.query(func.count(Student.id)).filter(
            Student.class_id.in_(school_class_ids),
            Student.status == 1
        ).scalar()
        
        school_stats[school.id]['studentCount'] = student_count or 0

    # 按动态指标统计
    for record in records:
        cls_id = record.class_id
        school_id = class_to_school_map.get(cls_id)
        if not school_id or school_id not in school_stats:
            continue
            
        score = float(record.score_change)
        rule_name = record.rule_snapshot
        
        # 获取指标的分类信息
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == rule_name
        ).first()
        
        if indicator:
            cat = indicator.category or '其他'
            sub = indicator.sub_category or '其他'
            key = indicator_map.get((cat, sub))
            if key:
                school_stats[school_id][key] += score

    # 计算每个学校的总扣分、人均扣分和排名
    school_rankings = []
    for school_id, stats in school_stats.items():
        # 计算总扣分（所有动态字段的和）
        total_ded = 0
        for cat_data in ordered_categories:
            for sub in cat_data['subCategories']:
                total_ded += stats.get(sub['fieldKey'], 0)
        
        stats['totalDed'] = total_ded
        
        # 计算人均扣分
        student_count = stats['studentCount']
        stats['perCapita'] = round(total_ded / student_count, 2) if student_count > 0 else 0
        
        school_rankings.append((school_id, total_ded))
    
    # 排序并分配排名（扣分越少排名越靠前，支持并列）
    # 扣分是负数，按降序排列（绝对值小的在前）
    school_rankings.sort(key=lambda x: x[1], reverse=True)
    current_rank = 1
    for i, (school_id, score) in enumerate(school_rankings):
        if i > 0 and score < school_rankings[i-1][1]:
            current_rank = current_rank + 1
        school_stats[school_id]['rank'] = current_rank

    return {
        'districtName': '学区',
        'schools': list(school_stats.values()),
        'indicatorStructure': ordered_categories
    }


@router.get("/district-detail")
async def get_district_detail(
    group_id: Optional[int] = Query(None, description="集团ID（不指定则返回所有集团）"),
    school_ids: Optional[str] = Query(None, description="学校ID列表，逗号分隔（不指定则返回所有学校）"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取学区德育量化详情 - 返回详细的扣分记录
    """

    # 默认查询最近30天
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    # 解析学校ID列表
    school_id_list = None
    if school_ids:
        try:
            school_id_list = [int(sid.strip()) for sid in school_ids.split(',') if sid.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="学校ID格式错误")

    print(f"[学区详情] 接收查询参数: group_id={group_id}, school_ids={school_ids}, parsed={school_id_list}, start_date={start_date}, end_date={end_date}")

    # 构建查询条件
    query = db.query(BizMoralRecord).filter(
        func.date(BizMoralRecord.record_time) >= start_date,
        func.date(BizMoralRecord.record_time) <= end_date
    )

    # 如果指定了学校列表，只查询这些学校的数据
    if school_id_list:
        # 获取所有指定的学校
        schools_info = db.query(SysOrg).filter(SysOrg.id.in_(school_id_list)).all()
        print(f"[学区详情] 查询到 {len(schools_info)} 所学校: {[s.name for s in schools_info]}")
        if not schools_info:
            raise HTTPException(status_code=404, detail="指定的学校不存在")

        # 获取所有学校下的年级和班级
        school_ids_list = [s.id for s in schools_info]
        grades = db.query(SysOrg).filter(
            SysOrg.parent_id.in_(school_ids_list),
            SysOrg.type == 'grade'
        ).all()
        print(f"[学区详情] 查询到 {len(grades)} 个年级: {[(g.name, g.parent_id) for g in grades]}")

        if grades:
            grade_ids = [g.id for g in grades]

            # 获取这些年级下的所有班级
            classes = db.query(SysOrg).filter(
                SysOrg.parent_id.in_(grade_ids),
                SysOrg.type == 'class'
            ).all()
            print(f"[学区详情] 查询到 {len(classes)} 个班级")

            class_ids = [c.id for c in classes]
            print(f"[学区详情] 班级ID范围: {class_ids[:10]}... 共{len(class_ids)}个")
            query = query.filter(BizMoralRecord.class_id.in_(class_ids))
    # 如果指定了集团，只查询该集团的数据
    elif group_id:
        # 获取该集团下的所有组织ID（包括集团本身和所有子组织）
        org_ids = [group_id]

        # 获取该集团下的所有子组织（递归获取）
        def get_all_child_orgs(parent_id: int):
            children = db.query(SysOrg).filter(SysOrg.parent_id == parent_id).all()
            for child in children:
                org_ids.append(child.id)
                get_all_child_orgs(child.id)

        get_all_child_orgs(group_id)

        # 获取这些组织下的所有班级
        classes_in_group = db.query(SysOrg).filter(
            SysOrg.id.in_(org_ids),
            SysOrg.type == 'class'
        ).all()

        class_ids = [c.id for c in classes_in_group]
        query = query.filter(BizMoralRecord.class_id.in_(class_ids))

    # 获取所有记录（移除1000条限制）
    records = query.order_by(BizMoralRecord.record_time.desc()).all()
    print(f"[学区详情] 查询到 {len(records)} 条记录")

    # 统计各学校记录数量
    school_record_count = {}
    for record in records:
        cls = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
        if cls and cls.parent_id:
            grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
            if grade and grade.parent_id:
                school = db.query(SysOrg).filter(SysOrg.id == grade.parent_id).first()
                if school:
                    school_record_count[school.name] = school_record_count.get(school.name, 0) + 1
    print(f"[学区详情] 各学校记录分布: {school_record_count}")

    # 构建详细记录列表
    detail_records = []
    for idx, record in enumerate(records, 1):
        indicator = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.name == record.rule_snapshot
        ).first()

        cls = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
        class_name = cls.name if cls else '未知班级'

        # 获取学校名称
        school_name = '未知学校'
        if cls and cls.parent_id:
            grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
            if grade and grade.parent_id:
                school = db.query(SysOrg).filter(SysOrg.id == grade.parent_id).first()
                if school:
                    school_name = school.name

        # 获取年级名称
        grade_name = '未知年级'
        if cls and cls.parent_id:
            grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
            if grade:
                grade_name = grade.name

        # 获取学生姓名：优先从学生表，否则从 student_id 中提取（格式: temp_40_A-1 安安）
        student = db.query(Student).filter(Student.id == record.student_id).first()
        name_from_id = record.student_id.split()[-1] if record.student_id and ' ' in record.student_id else record.student_id
        student_name = student.name if student else name_from_id

        detail_records.append({
            'id': idx,
            'school': school_name,
            'grade': grade_name,
            'class': class_name,
            'majorCategory': indicator.category if indicator else '其他',
            'minorCategory': indicator.sub_category if indicator else '其他',
            'reason': record.rule_snapshot or '-',
            'content': record.rule_snapshot or '-',  # 检查内容只返回指标名称
            'student': student_name,
            'type': '加分' if float(record.score_change) > 0 else '减分',
            'score': float(record.score_change),
            'time': record.record_time.strftime('%Y-%m-%d %H:%M:%S') if record.record_time else '-',
            'source': record.source,
            'description': record.description
        })

    print(f"[学区详情] 构建了 {len(detail_records)} 条详细记录")

    return {
        'records': detail_records,
        'total': len(detail_records)
    }


# ==================== 德育评价保存 API ====================

class MoralGradeEvaluation(Base):
    """年级德育评价表"""
    __tablename__ = "biz_moral_grade_evaluation"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    grade_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/grade/evaluation")
async def save_moral_grade_evaluation(
    grade_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """保存年级德育评价"""
    existing = db.query(MoralGradeEvaluation).filter(
        and_(
            MoralGradeEvaluation.grade_id == grade_id,
            MoralGradeEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralGradeEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {"message": "评价已更新", "id": existing.id}
    else:
        new_eval = MoralGradeEvaluation(
            grade_id=grade_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_eval)
        db.commit()
        return {"message": "评价已保存", "id": new_eval.id}


@router.get("/reports/grade/evaluation")
async def get_moral_grade_evaluation(
    grade_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """获取年级德育评价"""
    evaluation = db.query(MoralGradeEvaluation).filter(
        and_(
            MoralGradeEvaluation.grade_id == grade_id,
            MoralGradeEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralGradeEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    return {"id": None, "evaluation": "", "created_at": None, "updated_at": None}


class MoralSchoolEvaluation(Base):
    """校级德育评价表"""
    __tablename__ = "biz_moral_school_evaluation"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/school/evaluation")
async def save_moral_school_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """保存校级德育评价"""
    existing = db.query(MoralSchoolEvaluation).filter(
        and_(
            MoralSchoolEvaluation.school_id == school_id,
            MoralSchoolEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralSchoolEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {"message": "评价已更新", "id": existing.id}
    else:
        new_eval = MoralSchoolEvaluation(
            school_id=school_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_eval)
        db.commit()
        return {"message": "评价已保存", "id": new_eval.id}


@router.get("/reports/school/evaluation")
async def get_moral_school_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """获取校级德育评价"""
    evaluation = db.query(MoralSchoolEvaluation).filter(
        and_(
            MoralSchoolEvaluation.school_id == school_id,
            MoralSchoolEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralSchoolEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    return {"id": None, "evaluation": "", "created_at": None, "updated_at": None}


class MoralDormEvaluation(Base):
    """宿舍德育评价表"""
    __tablename__ = "biz_moral_dorm_evaluation"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/dorm/evaluation")
async def save_moral_dorm_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """保存宿舍德育评价"""
    existing = db.query(MoralDormEvaluation).filter(
        and_(
            MoralDormEvaluation.school_id == school_id,
            MoralDormEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralDormEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {"message": "评价已更新", "id": existing.id}
    else:
        new_eval = MoralDormEvaluation(
            school_id=school_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_eval)
        db.commit()
        return {"message": "评价已保存", "id": new_eval.id}


@router.get("/reports/dorm/evaluation")
async def get_moral_dorm_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """获取宿舍德育评价"""
    evaluation = db.query(MoralDormEvaluation).filter(
        and_(
            MoralDormEvaluation.school_id == school_id,
            MoralDormEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralDormEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    return {"id": None, "evaluation": "", "created_at": None, "updated_at": None}


class MoralDistrictEvaluation(Base):
    """学区德育评价表"""
    __tablename__ = "biz_moral_district_evaluation"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    group_id = Column(BIGINT, nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/district/evaluation")
async def save_moral_district_evaluation(
    group_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """保存学区德育评价"""
    existing = db.query(MoralDistrictEvaluation).filter(
        and_(
            MoralDistrictEvaluation.group_id == group_id,
            MoralDistrictEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralDistrictEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {"message": "评价已更新", "id": existing.id}
    else:
        new_eval = MoralDistrictEvaluation(
            group_id=group_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_eval)
        db.commit()
        return {"message": "评价已保存", "id": new_eval.id}


@router.get("/reports/district/evaluation")
async def get_moral_district_evaluation(
    group_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """获取学区德育评价"""
    evaluation = db.query(MoralDistrictEvaluation).filter(
        and_(
            MoralDistrictEvaluation.group_id == group_id,
            MoralDistrictEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            MoralDistrictEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    return {"id": None, "evaluation": "", "created_at": None, "updated_at": None}
