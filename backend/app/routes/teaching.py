from typing import Any, List, Optional
from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, Column, Integer, String, BIGINT, VARCHAR, TEXT, DECIMAL, DateTime as SQLDateTime, ForeignKey, or_
from sqlalchemy.dialects.mysql import DATE, DATETIME
from app.database import get_db, Base
from app.models.moral import CfgTeachingIndicator, BizTeachingRecord
from app.models.user import SysUser
from app.models.org import SysOrg, BaseTeacher, BaseClassTeacher
from app.utils.deps import get_current_active_user, require_permission
from app.utils.data_scope import get_user_data_scope
from app.utils.log_helper import log_operation, MODULE_TEACHING, ACTION_CREATE

router = APIRouter()


def sort_major_categories(categories: List[str], db: Session = None) -> List[str]:
    """
    根据 cfg_teaching_indicator 数据表中的记录顺序对大项进行排序
    按照每个大项在表中第一次出现的最小id排序（id越小排序越靠前）
    """
    if not categories:
        return []
    
    # 去重并保持原始顺序
    unique_categories = []
    seen = set()
    for cat in categories:
        if cat not in seen:
            unique_categories.append(cat)
            seen.add(cat)
    
    # 如果提供了数据库会话，从表中查询大项的排序顺序
    if db is not None:
        try:
            # 查询每个大项的最小id（即首次出现的顺序）
            from app.models.moral import CfgTeachingIndicator
            
            category_orders = {}
            for category in unique_categories:
                # 查询该大项的最小id
                result = db.query(func.min(CfgTeachingIndicator.id)).filter(
                    CfgTeachingIndicator.major_category == category,
                    CfgTeachingIndicator.is_enabled == 1
                ).scalar()
                # 如果没有找到，给一个较大的默认值（排在后面）
                category_orders[category] = result if result else 999999
            
            print(f"[大项排序] 排序前: {unique_categories}")
            print(f"[大项排序] 各大项最小id: {category_orders}")
            
            # 按照最小id排序，id越小越靠前
            sorted_result = sorted(unique_categories, key=lambda c: (category_orders.get(c, 999999), c))
            print(f"[大项排序] 排序后: {sorted_result}")
            return sorted_result
        except Exception as e:
            print(f"[大项排序] 查询排序失败，回退到原始顺序: {e}")
            # 如果查询失败，返回原始顺序
            return unique_categories
    
    print(f"[大项排序] 无数据库会话，返回原始顺序: {unique_categories}")
    # 默认返回原始顺序
    return unique_categories


def _generate_grade_teaching_report_data(db: Session, grade_id: int, start_date: str, end_date: str):
    """
    生成年级教学报表数据的公共函数
    用于查询API和导出API，确保数据一致性
    """
    grade = db.query(SysOrg).filter(SysOrg.id == grade_id).first()
    if not grade:
        return None

    # Get all classes in this grade
    classes = db.query(SysOrg).filter(SysOrg.parent_id == grade_id).all()
    class_ids = [c.id for c in classes]
    
    # Get school_id from grade's parent
    school_id = grade.parent_id

    # Get teacher info from BaseTeacher table (教师管理页面)
    teacher_info = {}
    
    # 辅助函数：根据姓名和教研组查找已存在的教师ID
    def find_existing_teacher_id(name: str, group: str):
        for tid, tinfo in teacher_info.items():
            if tinfo["name"] == name and tinfo["group"] == group:
                return tid
        return None
    
    # 方法1: 从班级任课教师表获取
    if class_ids:
        class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id.in_(class_ids)
        ).all()
        
        for ct in class_teachers:
            if ct.teacher_id not in teacher_info:
                # 从 BaseTeacher 获取教师信息（teacher_id 直接关联 BaseTeacher.id）
                base_teacher = db.query(BaseTeacher).filter(
                    BaseTeacher.id == ct.teacher_id
                ).first()
                
                # 教师姓名
                if base_teacher and base_teacher.name:
                    teacher_name = base_teacher.name
                else:
                    teacher_name = f"教师{ct.teacher_id}"
                
                # 教研组：优先用 BaseTeacher.subject
                if base_teacher and base_teacher.subject:
                    teacher_group = base_teacher.subject
                else:
                    teacher_group = ct.subject or "其他"
                
                # 检查是否有同名同教研组的教师，如有则跳过（避免重复）
                existing_id = find_existing_teacher_id(teacher_name, teacher_group)
                if existing_id:
                    continue
                
                teacher_info[ct.teacher_id] = {
                    "id": ct.teacher_id,
                    "name": teacher_name,
                    "group": teacher_group,
                    "subject": base_teacher.subject if base_teacher else ct.subject
                }
    
    # 方法2: 直接从 BaseTeacher 表获取该学校该年级的教师（补充）
    if school_id:
        grade_name = grade.name
        # 查询任教年级包含该年级名称的教师
        grade_teachers = db.query(BaseTeacher).filter(
            BaseTeacher.school_id == school_id,
            BaseTeacher.grades.contains(grade_name)
        ).all()
        
        for bt in grade_teachers:
            # 检查是否有同名同教研组的教师，如有则跳过（避免重复）
            existing_id = find_existing_teacher_id(bt.name, bt.subject or "其他")
            if existing_id:
                continue
            
            # 使用 BaseTeacher.id 作为标识
            if bt.id not in teacher_info:
                teacher_info[bt.id] = {
                    "id": bt.id,
                    "name": bt.name,
                    "group": bt.subject or "其他",
                    "subject": bt.subject
                }
            elif bt.id not in [t.get("id") for t in teacher_info.values()]:
                # 使用 bt.id 作为标识
                teacher_info[f"base_{bt.id}"] = {
                    "id": bt.id,
                    "name": bt.name,
                    "group": bt.subject or "其他",
                    "subject": bt.subject
                }

    # Get all teaching records in this grade for the date range
    records_query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
    )

    if class_ids:
        records_query = records_query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) | (BizTeachingRecord.class_id.is_(None))
        )

    records = records_query.all()

    # 动态获取指标名称到大项的映射
    all_indicators = db.query(CfgTeachingIndicator).filter(
        CfgTeachingIndicator.is_enabled == 1
    ).all()
    
    indicator_to_category = {ind.name: ind.major_category for ind in all_indicators}
    indicator_by_id = {ind.id: ind for ind in all_indicators}
    
    # 从指标配置表中获取所有启用的大项（确保即使无记录也显示所有大项列）
    # 与校级/学区报表保持一致
    major_categories = list(set(ind.major_category for ind in all_indicators if ind.major_category))
    
    # 从实际记录中收集额外的大项（如果有记录使用了配置表外的大项）
    for record in records:
        if record.major_category and record.major_category not in major_categories:
            major_categories.append(record.major_category)

    # Initialize teacher scores
    teacher_scores = {}
    for tid, tinfo in teacher_info.items():
        teacher_scores[tid] = {
            "id": tid,
            "name": tinfo["name"],
            "group": tinfo["group"],
            "metrics": {}
        }

    # Group by teacher and calculate scores
    for record in records:
        tid = record.teacher_id
        
        if tid not in teacher_scores:
            # 直接从 BaseTeacher 获取，teacher_id 关联 BaseTeacher.id
            base_teacher = db.query(BaseTeacher).filter(BaseTeacher.id == tid).first()
            teacher_user = db.query(SysUser).filter(SysUser.id == tid).first()
            
            if base_teacher and base_teacher.name:
                teacher_name = base_teacher.name
            elif teacher_user:
                teacher_name = teacher_user.real_name
            else:
                teacher_name = f"教师{tid}"
            
            if base_teacher and base_teacher.subject:
                teacher_group = base_teacher.subject
            else:
                teacher_group = record.check_item or "其他"
            
            existing_tid = None
            for existing_id, existing_info in teacher_scores.items():
                if existing_info["name"] == teacher_name and existing_info["group"] == teacher_group:
                    existing_tid = existing_id
                    break
            
            if existing_tid:
                tid = existing_tid
            else:
                teacher_scores[tid] = {
                    "id": tid,
                    "name": teacher_name,
                    "group": teacher_group,
                    "metrics": {}
                }
        
        # 动态获取大项作为key，check_item 是指标名称不是大项分类
        key = None
        if record.major_category:
            key = record.major_category
        elif record.indicator_id and record.indicator_id in indicator_by_id:
            key = indicator_by_id[record.indicator_id].major_category
        
        # 如果没有找到大项，跳过这条记录
        if not key:
            continue
        
        if key not in teacher_scores[tid]["metrics"]:
            teacher_scores[tid]["metrics"][key] = 0
        teacher_scores[tid]["metrics"][key] += float(record.score)

    # Calculate total scores
    for tid in teacher_scores:
        teacher_scores[tid]["total_score"] = sum(teacher_scores[tid]["metrics"].values())

    # Sort and assign ranks
    sorted_teachers = sorted(teacher_scores.values(), key=lambda x: x["total_score"], reverse=True)
    current_rank = 1
    for i, teacher in enumerate(sorted_teachers):
        if i > 0 and teacher["total_score"] < sorted_teachers[i-1]["total_score"]:
            current_rank = current_rank + 1
        teacher["rank"] = current_rank

    # Calculate subject rank
    subject_groups = {}
    for teacher in sorted_teachers:
        group = teacher["group"]
        if group not in subject_groups:
            subject_groups[group] = []
        subject_groups[group].append(teacher)
    
    subject_totals = {}
    for group, teachers_in_group in subject_groups.items():
        subject_totals[group] = sum(t["total_score"] for t in teachers_in_group)
    
    sorted_subjects = sorted(subject_totals.items(), key=lambda x: x[1], reverse=True)
    subject_rank_map = {}
    current_subject_rank = 1
    for i, (group, total) in enumerate(sorted_subjects):
        if i > 0 and total < sorted_subjects[i-1][1]:
            current_subject_rank = current_subject_rank + 1
        subject_rank_map[group] = current_subject_rank
    
    for group, teachers_in_group in subject_groups.items():
        subject_total = subject_totals[group]
        subject_rank = subject_rank_map[group]
        for teacher in teachers_in_group:
            teacher["subject_total_score"] = subject_total
            teacher["subject_rank"] = subject_rank

    # Calculate summary
    grade_bonus_score = sum(r.score for r in records if r.type == 'bonus' or r.score > 0)
    grade_deduction_score = sum(abs(r.score) for r in records if r.type == 'deduction' or r.score < 0)
    grade_total_score = sum(r.score for r in records)
    grade_check_count = len(records)

    # 对大项列表进行统一排序
    major_categories = sort_major_categories(major_categories, db)

    return {
        "grade": grade,
        "grade_name": grade.name,
        "class_ids": class_ids,
        "major_categories": major_categories,
        "sorted_teachers": sorted_teachers,
        "records": records,
        "summary": {
            "bonus_score": float(grade_bonus_score),
            "deduction_score": float(grade_deduction_score),
            "total_score": float(grade_total_score),
            "check_count": grade_check_count
        }
    }


# Pydantic models for request body
class TeachingRecordCreate(BaseModel):
    teacher_id: int
    check_item: str
    type: str
    score: float
    content: Optional[str] = None
    major_category: Optional[str] = None
    indicator_id: Optional[int] = None
    description: Optional[str] = None
    evidence_imgs: Optional[List[str]] = None
    class_id: Optional[int] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    location_name: Optional[str] = None
    record_time: Optional[str] = None


@router.get("/indicators")
async def get_teaching_indicators(
    org_id: int = None,
    major_category: str = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get teaching indicators
    If org_id is provided, get indicators for that organization
    If major_category is provided, filter by major category
    """
    query = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.is_enabled == 1)

    if org_id is not None:
        # Get indicators for specific org or global indicators
        query = query.filter(
            (CfgTeachingIndicator.org_id == org_id) | (CfgTeachingIndicator.org_id.is_(None))
        )

    if major_category:
        query = query.filter(CfgTeachingIndicator.major_category == major_category)

    indicators = query.all()
    return [
        {
            "id": indicator.id,
            "name": indicator.name,
            "type": indicator.type,
            "default_score": float(indicator.default_score),
            "major_category": indicator.major_category,
            "org_id": indicator.org_id,
            "org_name": indicator.org.name if indicator.org else "全集团通用"
        }
        for indicator in indicators
    ]


@router.get("/major-categories")
async def get_major_categories(
    org_id: int = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get all unique major categories from teaching indicators
    Returns a list of distinct major_category values for dynamic report columns
    """
    query = db.query(CfgTeachingIndicator.major_category).filter(
        CfgTeachingIndicator.is_enabled == 1
    )
    
    if org_id is not None:
        query = query.filter(
            (CfgTeachingIndicator.org_id == org_id) | (CfgTeachingIndicator.org_id.is_(None))
        )
    
    # Get distinct major categories
    categories = query.distinct().all()
    return [cat[0] for cat in categories if cat[0]]


@router.get("/indicators/structure")
async def get_teaching_indicators_structure(
    org_id: int = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get teaching indicators structured for miniprogram display
    Returns indicators grouped by major category (大项) with items
    Similar to moral indicators report-structure API
    """
    query = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.is_enabled == 1)
    
    if org_id is not None:
        query = query.filter(
            (CfgTeachingIndicator.org_id == org_id) | (CfgTeachingIndicator.org_id.is_(None))
        )
    
    indicators = query.order_by(CfgTeachingIndicator.major_category, CfgTeachingIndicator.id).all()
    
    # Group by major category
    structure = {}
    for indicator in indicators:
        major = indicator.major_category or '其他'
        
        if major not in structure:
            structure[major] = {
                'name': major,
                'items': []
            }
        
        structure[major]['items'].append({
            'id': indicator.id,
            'name': indicator.name,
            'type': indicator.type,
            'default_score': float(indicator.default_score)
        })
    
    return {
        'categories': list(structure.values()),
        'totalItems': sum(len(cat['items']) for cat in structure.values())
    }


@router.post("/indicators")
async def create_teaching_indicator(
    name: str,
    type: str,
    default_score: float,
    major_category: str,
    org_id: int = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:teaching_indicator"))
) -> Any:
    """
    Create a new teaching indicator
    """
    indicator = CfgTeachingIndicator(
        name=name,
        type=type,
        default_score=default_score,
        major_category=major_category,
        org_id=org_id,
        is_enabled=1
    )

    db.add(indicator)
    db.commit()
    db.refresh(indicator)

    return {
        "id": indicator.id,
        "message": "Teaching indicator created successfully"
    }


@router.put("/indicators/{indicator_id}")
async def update_teaching_indicator(
    indicator_id: int,
    name: str = None,
    type: str = None,
    default_score: float = None,
    major_category: str = None,
    org_id: int = None,
    is_enabled: int = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:teaching_indicator"))
) -> Any:
    """
    Update a teaching indicator
    """
    indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Indicator not found")

    if name is not None:
        indicator.name = name
    if type is not None:
        indicator.type = type
    if default_score is not None:
        indicator.default_score = default_score
    if major_category is not None:
        indicator.major_category = major_category
    if org_id is not None:
        indicator.org_id = org_id
    if is_enabled is not None:
        indicator.is_enabled = is_enabled

    db.commit()

    return {"message": "Indicator updated successfully"}


@router.get("/records")
async def get_teaching_records(
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
    school_id: Optional[int] = None,
    recorder_id: int = Query(None, description="录入人ID，用于过滤只显示自己录入的记录"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get teaching evaluation records with pagination (filtered by user's data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    query = db.query(BizTeachingRecord)
    
    # 应用数据权限过滤
    if not scope.has_all:
        accessible_class_ids = list(scope.class_ids) if scope.class_ids else []
        accessible_school_ids = list(scope.school_ids) if scope.school_ids else []
        
        print(f"[DEBUG] Teaching records - User: {current_user.id}, accessible_class_ids: {accessible_class_ids}")
        print(f"[DEBUG] Teaching records - accessible_school_ids: {accessible_school_ids}")
        
        # 构建过滤条件：class_id 在可访问列表中，或者 class_id 为 NULL 但 teacher 属于该学校
        filters = []
        
        if accessible_class_ids:
            # 包含指定班级的记录
            filters.append(BizTeachingRecord.class_id.in_(accessible_class_ids))
            print(f"[DEBUG] Adding class_id filter: {accessible_class_ids}")
        
        # 获取可访问学校的所有教师ID，用于过滤 class_id 为 NULL 的记录
        school_teacher_id_list = []
        if accessible_school_ids:
            school_teacher_ids = db.query(SysUser.id).filter(
                SysUser.org_id.in_(accessible_school_ids),
                SysUser.status == 1
            ).all()
            school_teacher_id_list = [t[0] for t in school_teacher_ids]
            print(f"[DEBUG] School teacher IDs: {school_teacher_id_list}")
            
            if school_teacher_id_list:
                # 包含这些教师的记录（即使 class_id 为 NULL）
                filters.append(BizTeachingRecord.teacher_id.in_(school_teacher_id_list))
        
        # 始终添加当前用户的记录（作为录入人或教师）
        filters.append(BizTeachingRecord.recorder_id == current_user.id)
        print(f"[DEBUG] Adding recorder_id filter: {current_user.id}")
        
        # 如果没有其他过滤器，也添加教师ID过滤
        if not filters:
            filters.append(BizTeachingRecord.teacher_id == current_user.id)
            print(f"[DEBUG] Using current user filter: teacher_id = {current_user.id}")
        
        from sqlalchemy import or_
        query = query.filter(or_(*filters))
        
        # 先统计一下过滤前的总数
        total_before_filter = db.query(BizTeachingRecord).count()
        print(f"[DEBUG] Total records before filter: {total_before_filter}")

    # 按录入人过滤（小程序端使用）
    if recorder_id:
        query = query.filter(BizTeachingRecord.recorder_id == recorder_id)

    if teacher_id:
        query = query.filter(BizTeachingRecord.teacher_id == teacher_id)
    if class_id:
        # 验证用户是否有权限访问该班级
        if not scope.has_all and class_id not in scope.class_ids:
            return {
                "records": [],
                "total": 0,
                "page": page,
                "page_size": page_size,
                "total_pages": 0
            }
        query = query.filter(BizTeachingRecord.class_id == class_id)
    if start_date:
        query = query.filter(BizTeachingRecord.record_time >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(BizTeachingRecord.record_time <= datetime.fromisoformat(end_date))
    
    # 按学校筛选：通过 teacher_id 关联查询教师的 org_id
    if school_id:
        # 获取该学校下的所有教师ID
        teacher_ids = db.query(SysUser.id).filter(
            SysUser.org_id == school_id,
            SysUser.status == 1
        ).all()
        
        # 也要获取年级/班级下的教师（学校 -> 年级 -> 班级 -> 教师）
        grade_ids = db.query(SysOrg.id).filter(
            SysOrg.parent_id == school_id,
            SysOrg.type.in_(['grade', 'department'])
        ).all()
        grade_ids = [g[0] for g in grade_ids]
        
        if grade_ids:
            # 获取年级下的班级
            class_ids = db.query(SysOrg.id).filter(
                SysOrg.parent_id.in_(grade_ids),
                SysOrg.type == 'class'
            ).all()
            class_id_list = [c[0] for c in class_ids]
            
            if class_id_list:
                # 获取班级下的教师
                class_teacher_ids = db.query(SysUser.id).filter(
                    SysUser.org_id.in_(class_id_list),
                    SysUser.status == 1
                ).all()
                teacher_ids = list(teacher_ids) + list(class_teacher_ids)
        
        teacher_id_list = [t[0] for t in teacher_ids]
        if teacher_id_list:
            query = query.filter(BizTeachingRecord.teacher_id.in_(teacher_id_list))
        else:
            return {"total": 0, "page": page, "page_size": page_size, "records": []}

    total = query.count()
    print(f"[DEBUG] Total records after filter: {total}")
    
    records = query.order_by(BizTeachingRecord.record_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    print(f"[DEBUG] Records returned: {len(records)}")
    
    # 预加载所有相关教师信息
    teacher_ids = [record.teacher_id for record in records if record.teacher_id]
    teacher_info_map = {}
    
    if teacher_ids:
        # 从 BaseTeacher 表获取教师信息
        base_teachers = db.query(BaseTeacher).filter(BaseTeacher.id.in_(teacher_ids)).all()
        for bt in base_teachers:
            teacher_info_map[bt.id] = {
                "name": bt.name,
                "subject": bt.subject
            }
        
        # 从 SysUser 表获取剩余教师信息（BaseTeacher 中没有的）
        remaining_ids = [tid for tid in teacher_ids if tid not in teacher_info_map]
        if remaining_ids:
            sys_users = db.query(SysUser).filter(SysUser.id.in_(remaining_ids)).all()
            for user in sys_users:
                teacher_info_map[user.id] = {
                    "name": user.real_name or user.username,
                    "subject": None
                }
    
    # 预加载年级/班级信息
    class_ids = list(set([record.class_id for record in records if record.class_id]))
    grade_info_map = {}
    print(f"[DEBUG] 需要查询的 class_ids: {class_ids}")
    if class_ids:
        # 查询班级对应的年级信息
        classes = db.query(SysOrg).filter(SysOrg.id.in_(class_ids)).all()
        print(f"[DEBUG] 查询到的班级/年级信息: {[(c.id, c.name, c.type) for c in classes]}")
        for cls in classes:
            if cls.type == 'grade':
                # class_id 本身就是年级ID
                grade_info_map[cls.id] = cls.name
            elif cls.type == 'class' and cls.parent_id:
                # 查询年级
                grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
                if grade:
                    grade_info_map[cls.id] = grade.name
                else:
                    grade_info_map[cls.id] = cls.name
            else:
                grade_info_map[cls.id] = cls.name
        # 检查是否有未找到的 class_id
        missing_ids = [cid for cid in class_ids if cid not in grade_info_map]
        if missing_ids:
            print(f"[DEBUG] 未找到的 class_ids: {missing_ids}")
    
    # 打印每条记录的详细信息（用于调试）
    for record in records:
        print(f"[DEBUG] 记录 ID={record.id}, teacher_id={record.teacher_id}, category={record.category}, "
              f"major_category={record.major_category}, class_id={record.class_id}, source={record.source}")

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": [
            {
                "id": record.id,
                "teacher_id": record.teacher_id,
                "teacher_name": teacher_info_map.get(record.teacher_id, {}).get("name", "-" if not record.teacher_id else f"教师{record.teacher_id}"),
                "teacher_subject": teacher_info_map.get(record.teacher_id, {}).get("subject", record.major_category if not record.teacher_id else ""),
                "check_item": record.check_item,
                "content": record.content,
                "type": record.type,
                "score": float(record.score),
                "major_category": record.major_category,
                "category": record.category,  # 教研组/学科（整体检查使用）
                "class_id": record.class_id,
                "grade_name": grade_info_map.get(record.class_id, ""),  # 年级名称
                "description": record.description,
                "evidence_imgs": record.evidence_imgs,
                "record_time": record.record_time.isoformat(),
                "recorder_id": record.recorder_id,
                "location_name": record.location_name,
                "source": record.source  # 记录来源（miniprogram/overall）
            }
            for record in records
        ]
    }


@router.post("/records")
async def create_teaching_record(
    record_data: TeachingRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Create a new teaching evaluation record
    """
    record = BizTeachingRecord(
        teacher_id=record_data.teacher_id,
        check_item=record_data.check_item,
        content=record_data.content,
        type=record_data.type,
        score=record_data.score,
        major_category=record_data.major_category,
        indicator_id=record_data.indicator_id,
        description=record_data.description,
        evidence_imgs=record_data.evidence_imgs,
        class_id=record_data.class_id,
        gps_lat=record_data.gps_lat,
        gps_lng=record_data.gps_lng,
        location_name=record_data.location_name,
        record_time=datetime.now(timezone(timedelta(hours=8))),  # 始终使用服务器当前北京时间
        source='miniprogram',
        recorder_id=current_user.id
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_TEACHING,
        action=ACTION_CREATE,
        description=f"教学记录: 教师ID {record_data.teacher_id}, 检查项 {record_data.check_item}, 分数 {record_data.score}",
        status="成功",
        request=request
    )

    return {
        "id": record.id,
        "message": "Teaching record created successfully"
    }


@router.post("/records/batch")
async def create_teaching_records_batch(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Batch create teaching evaluation records
    """
    records_data = data.get("records", [])
    if not records_data:
        raise HTTPException(status_code=400, detail="No records provided")

    created_ids = []
    for record_data in records_data:
        record = BizTeachingRecord(
            teacher_id=record_data.get("teacher_id"),
            check_item=record_data.get("check_item"),
            content=record_data.get("content"),
            type=record_data.get("type", "deduction"),
            score=record_data.get("score", -1),
            major_category=record_data.get("major_category"),
            indicator_id=record_data.get("indicator_id"),
            description=record_data.get("description"),
            evidence_imgs=record_data.get("evidence_imgs"),
            class_id=record_data.get("class_id"),
            gps_lat=record_data.get("gps_lat"),
            gps_lng=record_data.get("gps_lng"),
            location_name=record_data.get("location_name"),
            record_time=datetime.now(timezone(timedelta(hours=8))),
            source='miniprogram',
            recorder_id=current_user.id
        )
        db.add(record)
        db.flush()  # 获取ID
        created_ids.append(record.id)

    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_TEACHING,
        action=ACTION_CREATE,
        description=f"批量创建教学记录: {len(created_ids)}条",
        status="成功",
        request=request
    )

    return {
        "ids": created_ids,
        "count": len(created_ids),
        "message": f"Successfully created {len(created_ids)} teaching records"
    }


@router.get("/reports/personal")
async def get_personal_teaching_report(
    teacher_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get personal teaching evaluation report
    Data source: biz_teaching_record table
    Teacher info: base_teacher table (teacher_id references base_teacher.id)
    """
    # Try to find teacher in base_teacher table first (since teacher_id references base_teacher)
    base_teacher = db.query(BaseTeacher).filter(BaseTeacher.id == teacher_id).first()
    
    if base_teacher:
        teacher_name = base_teacher.name
        teacher_group = base_teacher.subject or "未知教研组"
    else:
        # Fallback to SysUser table
        teacher = db.query(SysUser).filter(SysUser.id == teacher_id).first()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        teacher_name = teacher.real_name or teacher.username
        teacher_group = "未知教研组"

    # Set default date range if not provided
    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # Query records from biz_teaching_record
    query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.teacher_id == teacher_id,
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date)
    )

    records = query.order_by(BizTeachingRecord.record_time.desc()).all()

    # Calculate summary
    bonus_score = sum(r.score for r in records if r.type == 'bonus' or r.score > 0)
    deduction_score = sum(abs(r.score) for r in records if r.type == 'deduction' or r.score < 0)
    total_score = sum(r.score for r in records)

    # 动态获取指标名称到大项的映射
    all_indicators = db.query(CfgTeachingIndicator).filter(
        CfgTeachingIndicator.is_enabled == 1
    ).all()
    
    # 构建指标名称到大项的映射
    indicator_to_category = {ind.name: ind.major_category for ind in all_indicators}
    
    # 大项列表初始为空，只从当前教师的实际记录中收集
    major_categories = []
    
    # Group by major_category for metrics (使用大项名称作为key)
    metrics = {}
    for record in records:
        # 优先使用记录中的major_category，否则通过indicator_id查找
        # check_item 是指标名称，不是大项分类，不能直接作为key
        key = None
        if record.major_category:
            key = record.major_category
        elif record.indicator_id:
            indicator = next((ind for ind in all_indicators if ind.id == record.indicator_id), None)
            if indicator:
                key = indicator.major_category
        
        # 如果没有找到大项，跳过这条记录
        if not key:
            continue
        
        # 收集大项
        if key not in major_categories:
            major_categories.append(key)
        
        if key not in metrics:
            metrics[key] = 0
        metrics[key] += float(record.score)
    
    # 对大项列表进行统一排序
    major_categories = sort_major_categories(major_categories, db)
    
    # 确保所有大项都有初始值（在排序后）
    for category in major_categories:
        if category not in metrics:
            metrics[category] = 0

    # 预加载指标名称映射
    indicator_names = {}
    indicator_ids = [r.indicator_id for r in records if r.indicator_id]
    if indicator_ids:
        indicators = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id.in_(indicator_ids)).all()
        indicator_names = {ind.id: ind.name for ind in indicators}

    return {
        "teacher": {
            "id": teacher_id,
            "name": teacher_name,
            "group": teacher_group,
            "classes": []  # TODO: 从班级关联表获取
        },
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "summary": {
            "bonus_score": float(bonus_score),
            "deduction_score": float(deduction_score),
            "total_score": float(total_score),
            "check_count": len(records),
            "rank": 1  # TODO: 计算实际排名
        },
        "details": [
            {
                "id": record.id,
                "check_item": record.check_item,
                "content": indicator_names.get(record.indicator_id, record.content) or "",
                "type": "加分" if record.score > 0 else "减分",
                "score": abs(float(record.score)),
                "time": record.record_time.strftime('%Y-%m-%d %H:%M:%S'),
                "major_category": record.major_category,
                "indicator_id": record.indicator_id
            }
            for record in records[:100]
        ],
        "metrics": metrics,
        "major_categories": major_categories  # 动态大项列表
    }


@router.get("/reports/grade")
async def get_grade_teaching_report(
    grade_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:grade"))
) -> Any:
    """
    Get grade teaching evaluation report
    使用公共函数确保与导出API数据一致
    """
    # 数据权限验证
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and grade_id not in scope.grade_ids:
        raise HTTPException(status_code=403, detail="无权限访问该年级数据")

    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # 使用公共函数获取报表数据
    report_data = _generate_grade_teaching_report_data(db, grade_id, start_date, end_date)
    if not report_data:
        raise HTTPException(status_code=404, detail="Grade not found")

    grade = report_data["grade"]
    sorted_teachers = report_data["sorted_teachers"]
    major_categories = report_data["major_categories"]
    summary = report_data["summary"]

    # Calculate subject summary
    subject_scores = {}
    for teacher in sorted_teachers:
        group = teacher["group"]
        if group not in subject_scores:
            subject_scores[group] = {
                "subject": group,
                "total_score": 0,
                "teacher_count": 0
            }
        subject_scores[group]["total_score"] += teacher["total_score"]
        subject_scores[group]["teacher_count"] += 1

    subject_summary = sorted(subject_scores.values(), key=lambda x: x["total_score"], reverse=True)
    for rank, subj in enumerate(subject_summary, 1):
        subj["rank"] = rank

    return {
        "grade_name": report_data["grade_name"],
        "grade_id": grade_id,
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "summary": summary,
        "teachers": sorted_teachers,
        "subject_summary": subject_summary,
        "major_categories": major_categories
    }


@router.get("/reports/grade/details")
async def get_grade_teaching_report_details(
    grade_id: int,
    teacher_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:grade"))
) -> Any:
    """
    Get grade teaching evaluation report details (for detail view)
    """
    # 数据权限验证
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and grade_id not in scope.grade_ids:
        raise HTTPException(status_code=403, detail="无权限访问该年级数据")

    grade = db.query(SysOrg).filter(SysOrg.id == grade_id).first()
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")

    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # Get all classes in this grade
    classes = db.query(SysOrg).filter(SysOrg.parent_id == grade_id).all()
    class_ids = [c.id for c in classes]

    # Build query
    query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
    )

    if class_ids:
        # 查询 class_id 在年级班级列表中，或者 class_id 等于当前年级ID（整体学科检查），或者 class_id 为空的记录
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            (BizTeachingRecord.class_id == grade_id) |
            (BizTeachingRecord.class_id.is_(None))
        )
    
    if teacher_id:
        query = query.filter(BizTeachingRecord.teacher_id == teacher_id)

    # Get total count
    total = query.count()
    
    # Paginate
    records = query.order_by(BizTeachingRecord.record_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Get teacher info for each record
    details = []
    for record in records:
        # 教师信息：严格从 base_teacher 表读取
        # 首先尝试用 teacher_id 匹配 base_teacher.id
        base_teacher = db.query(BaseTeacher).filter(BaseTeacher.id == record.teacher_id).first()
        
        # 教师姓名：严格使用 BaseTeacher.name
        if base_teacher and base_teacher.name:
            teacher_name = base_teacher.name
        elif record.teacher_id:
            # 如果 base_teacher 找不到，尝试从 sys_user 获取
            teacher_user = db.query(SysUser).filter(SysUser.id == record.teacher_id).first()
            teacher_name = teacher_user.real_name if teacher_user else f"教师{record.teacher_id}"
        else:
            # 整体检查记录（teacher_id 为 null）
            teacher_name = "-"
        
        # 教研组：优先使用 category 字段（学科/教研组），其次使用 BaseTeacher.subject
        # 学科名称映射（英文转中文）
        subject_map = {
            'chinese': '语文', 'math': '数学', 'english': '英语',
            'physics': '物理', 'chemistry': '化学', 'biology': '生物',
            'politics': '政治', 'history': '历史', 'geography': '地理',
            'pe': '体育', 'music': '音乐', 'art': '美术', 'it': '信息技术',
            '语文': '语文', '数学': '数学', '英语': '英语',
            '物理': '物理', '化学': '化学', '生物': '生物',
            '政治': '政治', '历史': '历史', '地理': '地理',
            '体育': '体育', '音乐': '音乐', '美术': '美术', '信息技术': '信息技术'
        }
        # 优先使用 category 字段（学科/教研组）
        if record.category:
            teacher_group = record.category
        elif base_teacher and base_teacher.subject:
            raw_subject = base_teacher.subject
            teacher_group = subject_map.get(raw_subject.lower() if raw_subject else '', raw_subject)
        elif record.source == 'overall' or not record.teacher_id:
            # 整体检查记录：使用 major_category 作为备选
            teacher_group = record.major_category or "整体检查"
        else:
            teacher_group = "其他"
        
        # Get class info
        if record.class_id:
            if record.class_id == grade_id:
                # class_id 等于年级ID（整体学科检查），使用年级名称
                class_name = grade.name
            else:
                class_info = db.query(SysOrg).filter(SysOrg.id == record.class_id).first()
                class_name = class_info.name if class_info else f"班级{record.class_id}"
        else:
            # class_id 为空时，使用年级名称
            class_name = grade.name
        
        # 检查内容：从教学指标的指标名称读取
        indicator_name = ""
        if record.indicator_id:
            indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == record.indicator_id).first()
            if indicator:
                indicator_name = indicator.name
        
        details.append({
            "id": record.id,
            "teacher_id": record.teacher_id,
            "teacher": teacher_name,
            "group": teacher_group,  # 教研组（学科）
            "checkItem": record.check_item or "其他",
            "content": indicator_name or record.content or "",
            "type": "加分" if float(record.score) > 0 else "减分",
            "score": float(record.score),
            "time": record.record_time.strftime('%Y-%m-%d %H:%M') if record.record_time else "",
            "class_id": record.class_id,
            "class_name": class_name,
            "major_category": record.major_category or record.category  # 大项（指标大项）
        })

    return {
        "grade_name": grade.name,
        "grade_id": grade_id,
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "details": details,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/reports/grade/export")
async def export_grade_teaching_report(
    grade_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:export"))
) -> Any:
    """
    Export grade teaching evaluation report as XLSX data
    使用公共函数确保与查询API数据一致
    """
    # 数据权限验证
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all and grade_id not in scope.grade_ids:
        raise HTTPException(status_code=403, detail="无权限访问该年级数据")

    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    import io

    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # 使用公共函数获取报表数据
    report_data = _generate_grade_teaching_report_data(db, grade_id, start_date, end_date)
    if not report_data:
        raise HTTPException(status_code=404, detail="Grade not found")

    grade = report_data["grade"]
    major_categories = report_data["major_categories"]
    sorted_teachers = report_data["sorted_teachers"]

    # Generate XLSX with dynamic columns
    wb = Workbook()
    ws = wb.active
    ws.title = "教学量化报表"
    
    # 定义样式
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font_white = Font(bold=True, size=11, color="FFFFFF")
    center_alignment = Alignment(horizontal="center", vertical="center")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # 动态生成列头（添加学科排名）
    header = ["教研组", "姓名"] + major_categories + ["个人得分", "个人排名", "学科排名"]
    for col_idx, col_name in enumerate(header, 1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font_white
        cell.fill = header_fill
        cell.alignment = center_alignment
        cell.border = thin_border
    
    # Write data rows
    for row_idx, teacher in enumerate(sorted_teachers, 2):
        row_data = [teacher.get("group", ""), teacher.get("name", "")]
        # 动态获取每个大项的分数
        for category in major_categories:
            row_data.append(teacher.get("metrics", {}).get(category, 0))
        row_data.extend([teacher.get("total_score", 0), teacher.get("rank", 0), teacher.get("subject_rank", 0)])
        
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = center_alignment
            cell.border = thin_border
    
    # 自动调整列宽
    for col_idx, col_name in enumerate(header, 1):
        max_length = len(str(col_name))
        for row_idx in range(2, len(sorted_teachers) + 2):
            cell_value = ws.cell(row=row_idx, column=col_idx).value
            if cell_value:
                max_length = max(max_length, len(str(cell_value)))
        ws.column_dimensions[chr(64 + col_idx) if col_idx <= 26 else 'A' + chr(64 + col_idx - 26)].width = max_length + 4

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"{grade.name}_教学量化_{start_date}_{end_date}.xlsx"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# 保存评价的API - 使用已有的日志/备注机制或创建新表
class TeachingGradeEvaluation(Base):
    """年级教学评价表"""
    __tablename__ = "biz_teaching_grade_evaluation"
    
    id = Column(BIGINT, primary_key=True, autoincrement=True)
    grade_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)  # 评价内容
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/grade/evaluation")
async def save_grade_evaluation(
    grade_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:grade"))
) -> Any:
    """
    Save grade teaching evaluation
    """
    from sqlalchemy import and_
    
    # Check if evaluation exists for this period
    existing = db.query(TeachingGradeEvaluation).filter(
        and_(
            TeachingGradeEvaluation.grade_id == grade_id,
            TeachingGradeEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            TeachingGradeEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        # Update existing evaluation
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {
            "message": "评价已更新",
            "id": existing.id
        }
    else:
        # Create new evaluation
        new_evaluation = TeachingGradeEvaluation(
            grade_id=grade_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_evaluation)
        db.commit()
        return {
            "message": "评价已保存",
            "id": new_evaluation.id
        }


@router.get("/reports/grade/evaluation")
async def get_grade_evaluation(
    grade_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:grade"))
) -> Any:
    """
    Get grade teaching evaluation
    """
    from sqlalchemy import and_
    
    evaluation = db.query(TeachingGradeEvaluation).filter(
        and_(
            TeachingGradeEvaluation.grade_id == grade_id,
            TeachingGradeEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            TeachingGradeEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    else:
        return {
            "id": None,
            "evaluation": "",
            "created_at": None,
            "updated_at": None
        }


@router.get("/reports/school")
async def get_school_teaching_report(
    school_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:school"))
) -> Any:
    """
    Get school teaching evaluation report
    包含 class_id 为空的记录（通过 teacher_id 关联到年级）
    """
    school = db.query(SysOrg).filter(SysOrg.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # 动态获取指标名称到大项的映射
    all_indicators = db.query(CfgTeachingIndicator).filter(
        CfgTeachingIndicator.is_enabled == 1
    ).all()
    
    # 构建指标名称到大项的映射
    indicator_to_category = {ind.name: ind.major_category for ind in all_indicators}
    indicator_by_id = {ind.id: ind for ind in all_indicators}
    
    # 从指标配置表中获取所有启用的大项（确保即使无记录也显示所有大项列）
    major_categories = list(set(ind.major_category for ind in all_indicators if ind.major_category))
    
    # Get all grades in this school (仅获取类型为年级的组织)
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()
    grade_ids = [g.id for g in grades]
    
    # 调试日志
    print(f"[校级教学报表] 学校ID: {school_id}, 找到年级数: {len(grades)}")
    for g in grades:
        print(f"  - 年级: {g.name} (ID: {g.id})")
    
    # Get all classes in these grades
    classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids)).all()
    class_ids = [c.id for c in classes]
    
    print(f"[校级教学报表] 找到班级数: {len(classes)}")
    
    # 构建班级到年级的映射
    class_to_grade = {c.id: c.parent_id for c in classes}
    grade_name_map = {g.id: g.name for g in grades}
    
    # 获取该学校所有教师的ID列表（用于过滤 class_id 为空的记录）
    school_teacher_ids = set()
    # 通过班级教师表获取
    if class_ids:
        class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id.in_(class_ids)
        ).all()
        for ct in class_teachers:
            school_teacher_ids.add(ct.teacher_id)
    
    # 通过 BaseTeacher 表获取该学校的教师
    school_base_teachers = db.query(BaseTeacher).filter(
        BaseTeacher.school_id == school_id
    ).all()
    for bt in school_base_teachers:
        if bt.id:
            school_teacher_ids.add(bt.id)
    
    # 从当前学校的记录中收集实际使用的大项（仅从record.major_category获取）
    # 包含 class_id 在学校班级列表中的记录，以及 class_id 为空但 teacher_id 属于该学校的记录
    all_records_query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
    )
    
    if class_ids:
        all_records_query = all_records_query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) | 
            ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
        )
    else:
        all_records_query = all_records_query.filter(
            (BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids))
        )
    
    all_records = all_records_query.all()
    
    # 只从记录的 major_category 字段收集大项，不将 check_item 作为大项
    # check_item 是指标名称，不是大项分类
    for record in all_records:
        if record.major_category and record.major_category not in major_categories:
            major_categories.append(record.major_category)

    # 构建 teacher_id 到年级的映射（用于 class_id 为空的记录）
    teacher_to_grade = {}
    if class_ids:
        class_teachers_list = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id.in_(class_ids)
        ).all()
        for ct in class_teachers_list:
            grade_id = class_to_grade.get(ct.class_id)
            if grade_id:
                teacher_to_grade[ct.teacher_id] = grade_id
    
    # 通过 BaseTeacher 的 grades 字段获取教师年级关联
    for bt in school_base_teachers:
        if bt.id and bt.grades:
            # grades 可能是逗号分隔的年级名称，尝试匹配
            grade_names = [g.strip() for g in bt.grades.split(',') if g.strip()]
            for grade in grades:
                if grade.name in grade_names:
                    teacher_to_grade[bt.id] = grade.id
                    break

    grades_data = []
    for grade in grades:
        # Get all classes in this grade
        grade_classes = db.query(SysOrg).filter(SysOrg.parent_id == grade.id).all()
        grade_class_ids = [c.id for c in grade_classes]
        
        # 获取该年级的教师ID列表（用于 class_id 为空的记录）
        grade_teacher_ids = set()
        for tid, gid in teacher_to_grade.items():
            if gid == grade.id:
                grade_teacher_ids.add(tid)

        # Get records: 包含该年级班级的记录，以及 class_id 为空但教师属于该年级的记录
        records = []
        if grade_class_ids or grade_teacher_ids:
            records_query = db.query(BizTeachingRecord).filter(
                BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
                BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
            )
            
            if grade_class_ids and grade_teacher_ids:
                records_query = records_query.filter(
                    (BizTeachingRecord.class_id.in_(grade_class_ids)) |
                    ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(grade_teacher_ids)))
                )
            elif grade_class_ids:
                records_query = records_query.filter(BizTeachingRecord.class_id.in_(grade_class_ids))
            elif grade_teacher_ids:
                records_query = records_query.filter(
                    (BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(grade_teacher_ids))
                )
            
            records = records_query.all()
            print(f"[校级教学报表] 年级 {grade.name}: 找到 {len(records)} 条记录")
        else:
            print(f"[校级教学报表] 年级 {grade.name}: 无班级和教师，跳过记录查询")

        # Calculate metrics (使用大项名称作为key)
        metrics = {}
        for record in records:
            # 动态获取大项作为key，check_item 是指标名称不是大项分类
            key = None
            if record.major_category:
                key = record.major_category
            elif record.indicator_id and record.indicator_id in indicator_by_id:
                key = indicator_by_id[record.indicator_id].major_category
            
            # 如果没有找到大项，跳过这条记录
            if not key:
                continue
            
            if key not in metrics:
                metrics[key] = 0
            metrics[key] += float(record.score)
        
        # 确保所有大项都有初始值
        for category in major_categories:
            if category not in metrics:
                metrics[category] = 0
        
        # Calculate total score
        total_score = sum(metrics.values())

        grades_data.append({
            "grade_name": grade.name,
            "metrics": metrics,
            "total_score": total_score
        })

    # Sort and assign ranks (年级排名，支持并列)
    sorted_grades = sorted(grades_data, key=lambda x: x["total_score"], reverse=True)
    current_rank = 1
    for i, grade in enumerate(sorted_grades):
        if i > 0 and grade["total_score"] < sorted_grades[i-1]["total_score"]:
            current_rank = current_rank + 1
        grade["rank"] = current_rank

    # 对大项列表进行统一排序
    major_categories = sort_major_categories(major_categories, db)
    
    print(f"[校级教学报表] 返回数据: {len(sorted_grades)} 个年级, 大项: {major_categories}")
    
    return {
        "school_name": school.name,
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "grades": sorted_grades,
        "major_categories": major_categories  # 动态大项列表
    }


@router.get("/reports/school/details")
async def get_school_teaching_report_details(
    school_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:school"))
) -> Any:
    """
    Get school teaching evaluation report details (for detail view)
    """
    school = db.query(SysOrg).filter(SysOrg.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # Get all grades in this school (仅获取类型为年级的组织)
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id == school_id,
        SysOrg.type == 'grade'
    ).all()
    grade_ids = [g.id for g in grades]
    
    # Get all classes in these grades
    classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids)).all()
    class_ids = [c.id for c in classes]
    
    # 获取年级名称映射
    grade_name_map = {g.id: g.name for g in grades}
    class_to_grade = {c.id: c.parent_id for c in classes}

    # Build query (只查询当前学校的记录)
    query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
    )
    
    # 过滤班级ID（包含学校班级列表中的记录，或 class_id 为年级ID的记录，或 class_id 为空的记录）
    if class_ids and grade_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            (BizTeachingRecord.class_id.in_(grade_ids)) |
            (BizTeachingRecord.class_id.is_(None))
        )
    elif class_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            (BizTeachingRecord.class_id.is_(None))
        )
    elif grade_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(grade_ids)) |
            (BizTeachingRecord.class_id.is_(None))
        )
    else:
        # 如果学校没有班级和年级，只返回 class_id 为空的记录
        query = query.filter(BizTeachingRecord.class_id.is_(None))

    # Get total count
    total = query.count()
    
    # Paginate
    records = query.order_by(BizTeachingRecord.record_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Get teacher info for each record
    details = []
    for record in records:
        # 获取年级信息
        if record.class_id:
            # 首先尝试将class_id作为班级ID查找年级
            grade_id = class_to_grade.get(record.class_id)
            if grade_id:
                grade_name = grade_name_map.get(grade_id, '')
            else:
                # 如果没找到，尝试将class_id作为年级ID直接查找
                # 这种情况适用于整体学科检查（SUBJECT类型），target_id保存的是年级ID
                grade_name = grade_name_map.get(record.class_id, '')
                if not grade_name:
                    # 如果当前学校映射中没有，查询确认是否是年级ID
                    grade = db.query(SysOrg).filter(
                        SysOrg.id == record.class_id,
                        SysOrg.type == 'grade'
                    ).first()
                    if grade:
                        grade_name = grade.name
        else:
            # class_id 为空时，尝试通过教师ID关联班级教师表获取年级和教研组
            grade_name = ''
            teacher_group_from_ct = ''
            class_teacher = db.query(BaseClassTeacher).filter(
                BaseClassTeacher.teacher_id == record.teacher_id
            ).first()
            if class_teacher:
                # 尝试从当前学校映射获取年级
                grade_id = class_to_grade.get(class_teacher.class_id, 0)
                grade_name = grade_name_map.get(grade_id, '')
                # 如果不在当前学校映射中，查询班级所属年级
                if not grade_name:
                    cls = db.query(SysOrg).filter(SysOrg.id == class_teacher.class_id).first()
                    if cls:
                        grade = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first()
                        if grade:
                            grade_name = grade.name
                teacher_group_from_ct = class_teacher.subject or ''
        
        # 教师信息 - 直接从 BaseTeacher 获取
        base_teacher = db.query(BaseTeacher).filter(BaseTeacher.id == record.teacher_id).first()
        
        # 学科名称映射（英文转中文）
        subject_map = {
            'chinese': '语文', 'math': '数学', 'english': '英语',
            'physics': '物理', 'chemistry': '化学', 'biology': '生物',
            'politics': '政治', 'history': '历史', 'geography': '地理',
            'pe': '体育', 'music': '音乐', 'art': '美术', 'it': '信息技术',
            '语文': '语文', '数学': '数学', '英语': '英语',
            '物理': '物理', '化学': '化学', '生物': '生物',
            '政治': '政治', '历史': '历史', '地理': '地理',
            '体育': '体育', '音乐': '音乐', '美术': '美术', '信息技术': '信息技术'
        }
        
        if base_teacher and base_teacher.name:
            teacher_name = base_teacher.name
            # 优先使用班级教师表中的subject，其次使用BaseTeacher.subject
            raw_subject = teacher_group_from_ct or base_teacher.subject or '其他'
            teacher_group = subject_map.get(raw_subject.lower() if raw_subject else '', raw_subject)
        elif record.teacher_id:
            teacher_user = db.query(SysUser).filter(SysUser.id == record.teacher_id).first()
            teacher_name = teacher_user.real_name if teacher_user else f"教师{record.teacher_id}"
            # 优先使用班级教师表中的subject
            raw_subject = teacher_group_from_ct or record.check_item or '其他'
            teacher_group = subject_map.get(raw_subject.lower() if raw_subject else '', raw_subject)
        else:
            # 整体检查记录（teacher_id 为 null）
            teacher_name = "-"
            # 优先使用 category 字段（学科/教研组）
            teacher_group = record.category or record.major_category or "整体检查"
        
        # 检查内容
        indicator_name = ""
        if record.indicator_id:
            indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == record.indicator_id).first()
            if indicator:
                indicator_name = indicator.name
        
        details.append({
            "id": record.id,
            "grade": grade_name,
            "group": teacher_group,  # 教研组（学科）
            "teacher": teacher_name,
            "checkItem": record.check_item or "其他",
            "content": indicator_name or record.content or "",
            "type": "加分" if float(record.score) > 0 else "减分",
            "score": float(record.score),
            "time": record.record_time.strftime('%Y-%m-%d %H:%M') if record.record_time else "",
            "major_category": record.major_category or record.category  # 大项（指标大项）
        })

    return {
        "school_name": school.name,
        "school_id": school_id,
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "details": details,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


# 校级教学评价表
class TeachingSchoolEvaluation(Base):
    """校级教学评价表"""
    __tablename__ = "biz_teaching_school_evaluation"
    
    id = Column(BIGINT, primary_key=True, autoincrement=True)
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    start_date = Column(DATE, nullable=False)
    end_date = Column(DATE, nullable=False)
    evaluation = Column(TEXT)  # 评价内容
    created_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False)
    created_at = Column(DATETIME, default=datetime.now)
    updated_at = Column(DATETIME, default=datetime.now, onupdate=datetime.now)


@router.post("/reports/school/evaluation")
async def save_school_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    evaluation: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:school"))
) -> Any:
    """
    Save school teaching evaluation
    """
    from sqlalchemy import and_
    
    # Check if evaluation exists for this period
    existing = db.query(TeachingSchoolEvaluation).filter(
        and_(
            TeachingSchoolEvaluation.school_id == school_id,
            TeachingSchoolEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            TeachingSchoolEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if existing:
        # Update existing evaluation
        existing.evaluation = evaluation
        existing.updated_at = datetime.now()
        db.commit()
        return {
            "message": "评价已更新",
            "id": existing.id
        }
    else:
        # Create new evaluation
        new_evaluation = TeachingSchoolEvaluation(
            school_id=school_id,
            start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
            end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
            evaluation=evaluation,
            created_by=current_user.id
        )
        db.add(new_evaluation)
        db.commit()
        return {
            "message": "评价已保存",
            "id": new_evaluation.id
        }


@router.get("/reports/school/evaluation")
async def get_school_evaluation(
    school_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:school"))
) -> Any:
    """
    Get school teaching evaluation
    """
    from sqlalchemy import and_
    
    evaluation = db.query(TeachingSchoolEvaluation).filter(
        and_(
            TeachingSchoolEvaluation.school_id == school_id,
            TeachingSchoolEvaluation.start_date == datetime.strptime(start_date, '%Y-%m-%d').date(),
            TeachingSchoolEvaluation.end_date == datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    ).first()

    if evaluation:
        return {
            "id": evaluation.id,
            "evaluation": evaluation.evaluation,
            "created_at": evaluation.created_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.created_at else None,
            "updated_at": evaluation.updated_at.strftime('%Y-%m-%d %H:%M:%S') if evaluation.updated_at else None
        }
    else:
        return {
            "id": None,
            "evaluation": "",
            "created_at": None,
            "updated_at": None
        }


@router.get("/reports/provincial")
async def get_provincial_teaching_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    school_ids: Optional[str] = Query(None, description="学校ID列表，逗号分隔"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:provincial"))
) -> Any:
    """
    Get provincial teaching evaluation report
    添加数据权限过滤：用户只能查看其权限范围内的学校数据
    """
    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # 获取用户数据权限范围
    scope = get_user_data_scope(db, current_user)
    
    # 获取用户可访问的学校ID列表
    from app.utils.data_scope import get_user_school_ids
    user_school_ids = get_user_school_ids(db, current_user)
    
    # Parse school_ids parameter
    school_id_list = None
    if school_ids:
        try:
            school_id_list = [int(sid.strip()) for sid in school_ids.split(',') if sid.strip()]
        except ValueError:
            pass
    
    # 如果用户请求了特定学校，需要验证权限
    if school_id_list:
        # 过滤掉用户无权访问的学校
        if not scope.has_all:
            school_id_list = [sid for sid in school_id_list if sid in user_school_ids]
        if not school_id_list:
            # 用户无权访问任何请求的学校
            return {
                "report_period": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "major_categories": [],
                "schools": []
            }

    # Get schools (filtered by school_ids if provided, or by user's data scope)
    query = db.query(SysOrg).filter(SysOrg.type == "school")
    
    if school_id_list:
        # 使用请求的学校ID（已验证权限）
        query = query.filter(SysOrg.id.in_(school_id_list))
    elif not scope.has_all:
        # 使用用户权限范围内的学校
        if user_school_ids:
            query = query.filter(SysOrg.id.in_(user_school_ids))
        else:
            # 用户无权访问任何学校
            return {
                "report_period": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "major_categories": [],
                "schools": []
            }
    
    schools = query.all()

    # 动态获取所有启用的大项（从指标配置表，与年级/校级报表保持一致）
    all_indicators = db.query(CfgTeachingIndicator).filter(
        CfgTeachingIndicator.is_enabled == 1
    ).all()
    
    # 从指标配置表收集所有启用的大项（不依赖于是否有记录）
    major_categories = []
    for indicator in all_indicators:
        if indicator.major_category and indicator.major_category not in major_categories:
            major_categories.append(indicator.major_category)
    
    # 对大项列表进行统一排序
    major_categories = sort_major_categories(major_categories, db)

    schools_data = []
    for school in schools:
        # Get all records for this school
        grades = db.query(SysOrg).filter(SysOrg.parent_id == school.id).all()
        grade_ids = [g.id for g in grades]
        grade_name_map = {g.id: g.name for g in grades}

        classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids)).all()
        class_ids = [c.id for c in classes]
        class_to_grade = {c.id: c.parent_id for c in classes}

        # 获取该学校所有教师ID（用于过滤 class_id 为空的记录）
        school_teacher_ids = set()
        # 通过班级教师表获取
        if class_ids:
            class_teachers = db.query(BaseClassTeacher).filter(
                BaseClassTeacher.class_id.in_(class_ids)
            ).all()
            for ct in class_teachers:
                school_teacher_ids.add(ct.teacher_id)
        
        # 通过 BaseTeacher 表获取该学校的教师
        school_base_teachers = db.query(BaseTeacher).filter(
            BaseTeacher.school_id == school.id
        ).all()
        for bt in school_base_teachers:
            if bt.id:
                school_teacher_ids.add(bt.id)
        
        # 构建教师到年级的映射（用于 class_id 为空的记录）
        teacher_to_grade = {}
        if class_ids:
            class_teachers_list = db.query(BaseClassTeacher).filter(
                BaseClassTeacher.class_id.in_(class_ids)
            ).all()
            for ct in class_teachers_list:
                grade_id = class_to_grade.get(ct.class_id)
                if grade_id:
                    teacher_to_grade[ct.teacher_id] = grade_id
        
        # 通过 BaseTeacher 的 grades 字段获取教师年级关联
        for bt in school_base_teachers:
            if bt.id and bt.grades:
                grade_names = [g.strip() for g in bt.grades.split(',') if g.strip()]
                for grade in grades:
                    if grade.name in grade_names:
                        teacher_to_grade[bt.id] = grade.id
                        break

        # 查询记录：包含该学校班级/年级的记录，以及 class_id 为空但教师属于该学校的记录
        records_query = db.query(BizTeachingRecord).filter(
            BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
            BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
        )
        
        # 构建过滤条件（包含班级ID、年级ID）
        if class_ids and grade_ids and school_teacher_ids:
            records_query = records_query.filter(
                (BizTeachingRecord.class_id.in_(class_ids)) |
                (BizTeachingRecord.class_id.in_(grade_ids)) |
                ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
            )
        elif class_ids and grade_ids:
            records_query = records_query.filter(
                (BizTeachingRecord.class_id.in_(class_ids)) |
                (BizTeachingRecord.class_id.in_(grade_ids))
            )
        elif class_ids and school_teacher_ids:
            records_query = records_query.filter(
                (BizTeachingRecord.class_id.in_(class_ids)) |
                ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
            )
        elif grade_ids and school_teacher_ids:
            records_query = records_query.filter(
                (BizTeachingRecord.class_id.in_(grade_ids)) |
                ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
            )
        elif class_ids:
            records_query = records_query.filter(BizTeachingRecord.class_id.in_(class_ids))
        elif grade_ids:
            records_query = records_query.filter(BizTeachingRecord.class_id.in_(grade_ids))
        elif school_teacher_ids:
            records_query = records_query.filter(
                (BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids))
            )
        else:
            records = []
        
        if class_ids or grade_ids or school_teacher_ids:
            records = records_query.all()

        total_score = sum(float(r.score) for r in records)
        
        # Calculate metrics by major_category
        metrics = {}
        for record in records:
            category = record.major_category or "其他"
            if category not in metrics:
                metrics[category] = 0
            metrics[category] += float(record.score) if record.score else 0

        schools_data.append({
            "id": school.id,
            "school_name": school.name,
            "total_score": total_score,
            "metrics": metrics,
            "rank": 1  # TODO: 计算实际排名
        })

    # Sort and assign ranks (学校排名，支持并列)
    sorted_schools = sorted(schools_data, key=lambda x: x["total_score"], reverse=True)
    current_rank = 1
    for i, school in enumerate(sorted_schools):
        if i > 0 and school["total_score"] < sorted_schools[i-1]["total_score"]:
            current_rank = current_rank + 1
        school["rank"] = current_rank

    return {
        "report_period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "major_categories": major_categories,
        "schools": sorted_schools
    }


@router.get("/reports/provincial/details")
async def get_provincial_teaching_report_details(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    school_ids: Optional[str] = Query(None, description="学校ID列表，逗号分隔"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:provincial"))
) -> Any:
    """
    Get provincial teaching evaluation report details
    添加数据权限过滤：用户只能查看其权限范围内的学校数据
    """
    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # 获取用户数据权限范围
    scope = get_user_data_scope(db, current_user)
    
    # 获取用户可访问的学校ID列表
    from app.utils.data_scope import get_user_school_ids
    user_school_ids = get_user_school_ids(db, current_user)

    # Parse school_ids parameter
    school_id_list = None
    if school_ids:
        try:
            school_id_list = [int(sid.strip()) for sid in school_ids.split(',') if sid.strip()]
        except ValueError:
            pass
    
    # 如果用户请求了特定学校，需要验证权限
    if school_id_list:
        # 过滤掉用户无权访问的学校
        if not scope.has_all:
            school_id_list = [sid for sid in school_id_list if sid in user_school_ids]
        if not school_id_list:
            # 用户无权访问任何请求的学校
            return {
                "details": [],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": 0,
                    "total_pages": 0
                }
            }

    # Get schools (filtered by school_ids if provided, or by user's data scope)
    school_query = db.query(SysOrg).filter(SysOrg.type == "school")
    
    if school_id_list:
        # 使用请求的学校ID（已验证权限）
        school_query = school_query.filter(SysOrg.id.in_(school_id_list))
    elif not scope.has_all:
        # 使用用户权限范围内的学校
        if user_school_ids:
            school_query = school_query.filter(SysOrg.id.in_(user_school_ids))
        else:
            # 用户无权访问任何学校
            return {
                "details": [],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": 0,
                    "total_pages": 0
                }
            }
    
    schools = school_query.all()
    school_ids_filtered = [s.id for s in schools]
    
    # Get school name map
    school_name_map = {s.id: s.name for s in schools}

    # Get all grades in these schools
    grades = db.query(SysOrg).filter(
        SysOrg.parent_id.in_(school_ids_filtered),
        SysOrg.type == 'grade'
    ).all()
    grade_ids = [g.id for g in grades]
    grade_name_map = {g.id: g.name for g in grades}
    grade_to_school = {g.id: g.parent_id for g in grades}

    # Get all classes in these grades
    classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids)).all()
    class_ids = [c.id for c in classes]
    class_to_grade = {c.id: c.parent_id for c in classes}

    # 获取这些学校所有教师ID（用于过滤 class_id 为空的记录）
    school_teacher_ids = set()
    # 建立教师到学校和年级的映射（用于 class_id 为空的记录）
    teacher_to_school = {}
    teacher_to_grade = {}
    
    if class_ids:
        class_teachers = db.query(BaseClassTeacher).filter(
            BaseClassTeacher.class_id.in_(class_ids)
        ).all()
        for ct in class_teachers:
            school_teacher_ids.add(ct.teacher_id)
            # 通过班级获取年级和学校
            grade_id = class_to_grade.get(ct.class_id)
            school_id = grade_to_school.get(grade_id) if grade_id else None
            if school_id:
                teacher_to_school[ct.teacher_id] = school_id
            if grade_id:
                teacher_to_grade[ct.teacher_id] = grade_id
    
    # 通过 BaseTeacher 表获取教师
    base_teachers = db.query(BaseTeacher).filter(
        BaseTeacher.school_id.in_(school_ids_filtered)
    ).all()
    for bt in base_teachers:
        if bt.id:
            school_teacher_ids.add(bt.id)
            teacher_to_school[bt.id] = bt.school_id
            # 通过 grades 字段获取年级
            if bt.grades:
                grade_names = [g.strip() for g in bt.grades.split(',') if g.strip()]
                for grade in grades:
                    if grade.name in grade_names and grade.parent_id == bt.school_id:
                        teacher_to_grade[bt.id] = grade.id
                        break

    # Build query for records: 包含班级记录、年级记录和 class_id 为空但教师属于这些学校的记录
    query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
        BizTeachingRecord.record_time <= datetime.fromisoformat(end_date + " 23:59:59")
    )
    
    # 构建过滤条件
    if class_ids and grade_ids and school_teacher_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            (BizTeachingRecord.class_id.in_(grade_ids)) |
            ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
        )
    elif class_ids and grade_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            (BizTeachingRecord.class_id.in_(grade_ids))
        )
    elif class_ids and school_teacher_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(class_ids)) |
            ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
        )
    elif grade_ids and school_teacher_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.in_(grade_ids)) |
            ((BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids)))
        )
    elif class_ids:
        query = query.filter(BizTeachingRecord.class_id.in_(class_ids))
    elif grade_ids:
        query = query.filter(BizTeachingRecord.class_id.in_(grade_ids))
    elif school_teacher_ids:
        query = query.filter(
            (BizTeachingRecord.class_id.is_(None)) & (BizTeachingRecord.teacher_id.in_(school_teacher_ids))
        )

    # Get total count for pagination
    total = query.count()
    total_pages = (total + page_size - 1) // page_size

    # Get paginated records
    records = query.order_by(BizTeachingRecord.record_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 学科名称映射（英文转中文）
    subject_map = {
        'chinese': '语文', 'math': '数学', 'english': '英语',
        'physics': '物理', 'chemistry': '化学', 'biology': '生物',
        'politics': '政治', 'history': '历史', 'geography': '地理',
        'pe': '体育', 'music': '音乐', 'art': '美术', 'it': '信息技术',
        '语文': '语文', '数学': '数学', '英语': '英语',
        '物理': '物理', '化学': '化学', '生物': '生物',
        '政治': '政治', '历史': '历史', '地理': '地理',
        '体育': '体育', '音乐': '音乐', '美术': '美术', '信息技术': '信息技术'
    }

    # Build details list
    details = []
    for record in records:
        if record.class_id:
            # 有 class_id 的记录，通过班级关联获取学校和年级
            grade_id = class_to_grade.get(record.class_id)
            if grade_id:
                school_id = grade_to_school.get(grade_id)
            else:
                # 如果class_id不在班级映射中，尝试直接作为年级ID查找
                # 这种情况适用于整体学科检查（SUBJECT类型）
                grade_id = record.class_id
                school_id = grade_to_school.get(grade_id)
                if not school_id:
                    # 查询年级信息
                    grade = db.query(SysOrg).filter(
                        SysOrg.id == record.class_id,
                        SysOrg.type == 'grade'
                    ).first()
                    if grade:
                        school_id = grade.parent_id
        else:
            # class_id 为空的记录，通过 teacher_id 关联获取学校和年级
            school_id = teacher_to_school.get(record.teacher_id)
            grade_id = teacher_to_grade.get(record.teacher_id)
        
        # 获取教师名称和教研组（学科）
        teacher_name = ""
        teacher_group = ""
        if record.teacher_id:
            # 尝试从 BaseClassTeacher 获取学科
            class_teacher = db.query(BaseClassTeacher).filter(
                BaseClassTeacher.teacher_id == record.teacher_id
            ).first()
            if class_teacher and class_teacher.subject:
                teacher_group = subject_map.get(class_teacher.subject.lower(), class_teacher.subject)
            
            # 从 BaseTeacher 获取教师信息
            base_teacher = db.query(BaseTeacher).filter(
                BaseTeacher.id == record.teacher_id
            ).first()
            if base_teacher:
                teacher_name = base_teacher.name
                # 如果没有从 BaseClassTeacher 获取到学科，使用 BaseTeacher 的学科
                if not teacher_group and base_teacher.subject:
                    teacher_group = subject_map.get(base_teacher.subject.lower(), base_teacher.subject)
            else:
                # 尝试从 SysUser 获取
                teacher_user = db.query(SysUser).filter(SysUser.id == record.teacher_id).first()
                if teacher_user:
                    teacher_name = teacher_user.real_name or teacher_user.username
            
            # 如果还是没有学科，使用默认值
            if not teacher_group:
                teacher_group = "其他"
        else:
            # 整体检查记录（teacher_id 为 null）
            teacher_name = "-"
            # 优先使用 category 字段（学科/教研组）
            teacher_group = record.category or record.major_category or "整体检查"
        
        # 获取检查内容
        check_item = record.check_item or ""
        if not check_item and record.indicator_id:
            indicator = db.query(CfgTeachingIndicator).filter(CfgTeachingIndicator.id == record.indicator_id).first()
            if indicator:
                check_item = indicator.name
        
        details.append({
            "id": record.id,
            "school": school_name_map.get(school_id, ""),
            "grade": grade_name_map.get(grade_id, ""),
            "group": teacher_group,  # 教研组（学科）
            "teacher": teacher_name,
            "checkItem": check_item,
            "content": record.description or record.content or "",
            "type": "加分" if record.score and record.score > 0 else "减分",
            "score": record.score or 0,
            "time": record.record_time.strftime('%Y-%m-%d %H:%M') if record.record_time else "",
            "major_category": record.major_category or ""
        })

    return {
        "details": details,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages
        }
    }


@router.get("/stats/dashboard")
async def get_teaching_stats_dashboard(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("teaching:personal"))
) -> Any:
    """
    Get teaching statistics for dashboard
    """
    # Get total records count
    total_records = db.query(BizTeachingRecord).count()

    # Get this week's records
    from datetime import timedelta
    week_ago = datetime.now() - timedelta(days=7)
    week_records = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= week_ago
    ).all()

    week_avg_score = sum(float(r.score) for r in week_records) / len(week_records) if week_records else 0

    return {
        "total_records": total_records,
        "week_records": len(week_records),
        "week_avg_score": round(week_avg_score, 2)
    }
