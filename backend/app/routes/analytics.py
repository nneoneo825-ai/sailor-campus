from typing import Any, Optional
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
import logging
from app.database import get_db
from app.models.moral import BizMoralRecord, BizTeachingRecord
from app.models.user import SysUser
from app.models.org import SysOrg
from app.models.student import BaseStudent
from app.models.task import ScheduleTask
from app.utils.deps import get_current_active_user
from app.utils.data_scope import get_user_data_scope

# 导入整体检查记录模型
try:
    from app.routes.overall import BizOverallRecord
except ImportError:
    BizOverallRecord = None

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard_data(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get dashboard statistics (filtered by user's data scope)
    """
    # 获取用户数据权限
    scope = get_user_data_scope(db, current_user)
    
    # 统计学生数量（应用数据权限过滤）
    student_query = db.query(BaseStudent).filter(BaseStudent.status == 1)  # 只统计在读学生
    if not scope.has_all:
        if scope.class_ids:
            student_query = student_query.filter(BaseStudent.class_id.in_(scope.class_ids))
        elif scope.school_ids:
            student_query = student_query.filter(BaseStudent.school_id.in_(scope.school_ids))
        else:
            # 没有任何权限，返回空
            student_query = student_query.filter(BaseStudent.id == -1)
    total_students = student_query.count()
    
    # 统计教师数量（应用数据权限过滤）
    # 使用 BaseTeacher 表而不是 SysUser，因为教师档案才有学校关联
    from app.models.org import BaseTeacher
    teacher_query = db.query(BaseTeacher)
    if not scope.has_all:
        if scope.school_ids:
            teacher_query = teacher_query.filter(BaseTeacher.school_id.in_(scope.school_ids))
        else:
            # 没有任何权限，返回空
            teacher_query = teacher_query.filter(BaseTeacher.id == -1)
    total_teachers = teacher_query.count()

    # Weekly moral average score（应用数据权限过滤）
    week_ago = datetime.now() - timedelta(days=7)
    moral_query = db.query(BizMoralRecord).filter(
        BizMoralRecord.record_time >= week_ago
    )
    if not scope.has_all:
        if scope.class_ids:
            moral_query = moral_query.filter(BizMoralRecord.class_id.in_(scope.class_ids))
        elif scope.school_ids:
            # 通过班级关联学校过滤
            from app.models.org import SysOrg
            class_ids_subquery = db.query(SysOrg.id).filter(SysOrg.parent_id.in_(
                db.query(SysOrg.id).filter(SysOrg.parent_id.in_(scope.school_ids))
            ))
            moral_query = moral_query.filter(BizMoralRecord.class_id.in_(class_ids_subquery))
    week_moral_records = moral_query.all()
    weekly_moral_avg_score = sum(float(r.score_change) for r in week_moral_records) / len(week_moral_records) if week_moral_records else 0

    # Weekly teaching average score（应用数据权限过滤）
    teaching_query = db.query(BizTeachingRecord).filter(
        BizTeachingRecord.record_time >= week_ago
    )
    if not scope.has_all:
        if scope.class_ids:
            teaching_query = teaching_query.filter(BizTeachingRecord.class_id.in_(scope.class_ids))
        elif scope.school_ids:
            # 通过班级关联学校过滤
            from app.models.org import SysOrg
            class_ids_subquery = db.query(SysOrg.id).filter(SysOrg.parent_id.in_(
                db.query(SysOrg.id).filter(SysOrg.parent_id.in_(scope.school_ids))
            ))
            teaching_query = teaching_query.filter(BizTeachingRecord.class_id.in_(class_ids_subquery))
    week_teaching_records = teaching_query.all()
    weekly_teaching_avg_score = sum(float(r.score) for r in week_teaching_records) / len(week_teaching_records) if week_teaching_records else 0

    # Five education scores (simplified - using base scores)
    five_education_scores = {
        "moral": 85,
        "intellect": 78,
        "physical": 90,
        "artistic": 70,
        "labor": 88
    }

    # Weekly trend (本周周一到周日)
    # 中文星期映射
    weekday_names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    weekly_trend = []
    
    # 计算本周的周一日期
    today = datetime.now()
    # weekday() 返回 0=周一, 6=周日
    monday_of_week = today - timedelta(days=today.weekday())
    
    # 预先获取可访问的班级ID列表（用于数据权限过滤）
    accessible_class_ids = None
    if not scope.has_all:
        if scope.class_ids:
            accessible_class_ids = list(scope.class_ids)
        elif scope.school_ids:
            # 通过学校获取班级
            from app.models.org import SysOrg
            grade_ids = db.query(SysOrg.id).filter(SysOrg.parent_id.in_(scope.school_ids)).all()
            grade_ids = [g[0] for g in grade_ids]
            if grade_ids:
                class_ids = db.query(SysOrg.id).filter(SysOrg.parent_id.in_(grade_ids)).all()
                accessible_class_ids = [c[0] for c in class_ids]
    
    for i in range(7):
        # 从周一开始，依次查询每一天
        day_date = monday_of_week + timedelta(days=i)
        day_str = weekday_names[i]

        # 德育记录查询（应用数据权限过滤）
        day_moral_query = db.query(BizMoralRecord).filter(
            func.date(BizMoralRecord.record_time) == day_date.date()
        )
        if accessible_class_ids is not None:
            day_moral_query = day_moral_query.filter(BizMoralRecord.class_id.in_(accessible_class_ids))
        day_moral_records = day_moral_query.all()
        
        # 教学记录查询（应用数据权限过滤）
        day_teaching_query = db.query(BizTeachingRecord).filter(
            func.date(BizTeachingRecord.record_time) == day_date.date()
        )
        if accessible_class_ids is not None:
            day_teaching_query = day_teaching_query.filter(BizTeachingRecord.class_id.in_(accessible_class_ids))
        day_teaching_records = day_teaching_query.all()

        moral_score = sum(float(r.score_change) for r in day_moral_records) / len(day_moral_records) if day_moral_records else 0
        teaching_score = sum(float(r.score) for r in day_teaching_records) / len(day_teaching_records) if day_teaching_records else 0

        weekly_trend.append({
            "day": day_str,
            "moral_score": round(moral_score, 1),
            "teaching_score": round(teaching_score, 1)
        })

    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "weekly_moral_avg_score": round(weekly_moral_avg_score, 2),
        "weekly_teaching_avg_score": round(weekly_teaching_avg_score, 2),
        "five_education_scores": five_education_scores,
        "weekly_trend": weekly_trend
    }


@router.get("/five-education")
async def get_five_education_evaluation(
    class_id: Optional[int] = None,
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get five-education comprehensive evaluation
    """
    query_date = date.fromisoformat(date) if date else date.today()

    # Get school average (all students)
    all_students = db.query(BaseStudent).all()

    school_avg = {
        "moral": 85,
        "intellect": 78,
        "physical": 90,
        "artistic": 70,
        "labor": 88
    }

    # Get class average if class_id is provided
    class_avg = None
    if class_id:
        class_students = db.query(BaseStudent).filter(BaseStudent.class_id == class_id).all()

        # Calculate class average based on moral records
        class_moral_records = db.query(BizMoralRecord).filter(
            BizMoralRecord.class_id == class_id,
            func.date(BizMoralRecord.record_time) == query_date
        ).all()

        if class_moral_records:
            avg_moral = sum(float(r.score_change) for r in class_moral_records) / len(class_moral_records)
        else:
            avg_moral = school_avg["moral"]

        class_info = db.query(SysOrg).filter(SysOrg.id == class_id).first()
        class_avg = {
            "id": class_id,
            "name": class_info.name if class_info else f"班级{class_id}",
            "moral": round(avg_moral, 1),
            "intellect": 80,
            "physical": 92,
            "artistic": 72,
            "labor": 85
        }

    # Get top students
    # Calculate total scores for all students
    student_scores = []
    for student in all_students[:50]:  # Limit to first 50 for performance
        moral_records = db.query(BizMoralRecord).filter(
            BizMoralRecord.student_id == student.id,
            func.date(BizMoralRecord.record_time) == query_date
        ).all()

        total_score = sum(float(r.score_change) for r in moral_records)
        student_scores.append({
            "id": student.id,
            "name": student.name,
            "total_score": total_score
        })

    # Sort and get top 10
    top_students = sorted(student_scores, key=lambda x: x["total_score"], reverse=True)[:10]

    return {
        "date": query_date.isoformat(),
        "school_avg": school_avg,
        "class_avg": class_avg,
        "top_students": top_students
    }


@router.get("/moral-trend")
async def get_moral_trend(
    student_id: Optional[str] = None,
    class_id: Optional[int] = None,
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get moral education trend
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    query = db.query(
        func.date(BizMoralRecord.record_time).label('date'),
        func.avg(BizMoralRecord.score_change).label('avg_score'),
        func.count(BizMoralRecord.id).label('count')
    ).filter(
        BizMoralRecord.record_time >= start_date,
        BizMoralRecord.record_time <= end_date
    )

    if student_id:
        query = query.filter(BizMoralRecord.student_id == student_id)
    if class_id:
        query = query.filter(BizMoralRecord.class_id == class_id)

    results = query.group_by(func.date(BizMoralRecord.record_time)).all()

    trend_data = []
    for result in results:
        trend_data.append({
            "date": result.date.isoformat(),
            "avg_score": round(float(result.avg_score), 2) if result.avg_score else 0,
            "count": result.count
        })

    return {
        "period": {
            "start_date": start_date.date().isoformat(),
            "end_date": end_date.date().isoformat()
        },
        "trend": trend_data
    }


@router.get("/teaching-trend")
async def get_teaching_trend(
    teacher_id: Optional[int] = None,
    class_id: Optional[int] = None,
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get teaching evaluation trend
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    query = db.query(
        func.date(BizTeachingRecord.record_time).label('date'),
        func.avg(BizTeachingRecord.score).label('avg_score'),
        func.count(BizTeachingRecord.id).label('count')
    ).filter(
        BizTeachingRecord.record_time >= start_date,
        BizTeachingRecord.record_time <= end_date
    )

    if teacher_id:
        query = query.filter(BizTeachingRecord.teacher_id == teacher_id)
    if class_id:
        query = query.filter(BizTeachingRecord.class_id == class_id)

    results = query.group_by(func.date(BizTeachingRecord.record_time)).all()

    trend_data = []
    for result in results:
        trend_data.append({
            "date": result.date.isoformat(),
            "avg_score": round(float(result.avg_score), 2) if result.avg_score else 0,
            "count": result.count
        })

    return {
        "period": {
            "start_date": start_date.date().isoformat(),
            "end_date": end_date.date().isoformat()
        },
        "trend": trend_data
    }


@router.get("/class-rank")
async def get_class_rank(
    school_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get class ranking based on moral and teaching scores
    """
    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # Get classes to rank
    classes_query = db.query(SysOrg).filter(SysOrg.type == "class")

    if school_id:
        # Get grades in this school first
        grades = db.query(SysOrg).filter(SysOrg.parent_id == school_id).all()
        grade_ids = [g.id for g in grades]
        classes_query = classes_query.filter(SysOrg.parent_id.in_(grade_ids))

    classes = classes_query.all()

    class_scores = []
    for cls in classes:
        # Get moral records
        moral_records = db.query(BizMoralRecord).filter(
            BizMoralRecord.class_id == cls.id,
            BizMoralRecord.record_time >= datetime.fromisoformat(start_date),
            BizMoralRecord.record_time <= datetime.fromisoformat(end_date)
        ).all()
        moral_score = sum(float(r.score_change) for r in moral_records)

        # Get teaching records
        teaching_records = db.query(BizTeachingRecord).filter(
            BizTeachingRecord.class_id == cls.id,
            BizTeachingRecord.record_time >= datetime.fromisoformat(start_date),
            BizTeachingRecord.record_time <= datetime.fromisoformat(end_date)
        ).all()
        teaching_score = sum(float(r.score) for r in teaching_records)

        class_scores.append({
            "id": cls.id,
            "name": cls.name,
            "moral_score": moral_score,
            "teaching_score": teaching_score,
            "total_score": moral_score + teaching_score
        })

    # Sort by total score
    sorted_classes = sorted(class_scores, key=lambda x: x["total_score"], reverse=True)
    for rank, cls in enumerate(sorted_classes, 1):
        cls["rank"] = rank

    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "classes": sorted_classes
    }


@router.get("/student-rank")
async def get_student_rank(
    class_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get student ranking based on moral scores
    """
    if not start_date:
        start_date = date.today().replace(day=1).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    # Get students to rank
    students_query = db.query(BaseStudent)

    if class_id:
        students_query = students_query.filter(BaseStudent.class_id == class_id)

    students = students_query.all()

    student_scores = []
    for student in students:
        # Get moral records
        moral_records = db.query(BizMoralRecord).filter(
            BizMoralRecord.student_id == student.id,
            BizMoralRecord.record_time >= datetime.fromisoformat(start_date),
            BizMoralRecord.record_time <= datetime.fromisoformat(end_date)
        ).all()
        moral_score = sum(float(r.score_change) for r in moral_records)
        record_count = len(moral_records)

        student_scores.append({
            "id": student.id,
            "name": student.name,
            "class_id": student.class_id,
            "moral_score": moral_score,
            "record_count": record_count
        })

    # Sort by moral score
    sorted_students = sorted(student_scores, key=lambda x: x["moral_score"], reverse=True)
    for rank, student in enumerate(sorted_students, 1):
        student["rank"] = rank

    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "students": sorted_students[:100]  # Limit to top 100
    }


@router.get("/miniprogram/stats")
async def get_miniprogram_stats(
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    小程序统计页面数据（按用户数据权限过滤）
    返回记录总数、按类型统计、周统计、月统计、今日统计等
    """
    scope = get_user_data_scope(db, current_user)
    
    # 验证school_id权限
    if school_id is not None:
        if not scope.has_all and school_id not in scope.school_ids:
            # 用户无权访问该学校的数据
            return {
                "totalRecords": 0,
                "totalTasks": 0,
                "completedTasks": 0,
                "taskCompletionRate": 0,
                "typeStats": [],
                "weeklyStats": [0] * 7,
                "weeklyMaxCount": 0,
                "currentWeek": [],
                "monthlyStats": [],
                "monthlyMaxCount": 0,
                "deptStats": [],
                "todayStats": {"records": 0, "moral": 0, "teaching": 0, "dorm": 0, "overall": 0}
            }
    
    # 如果用户没有全部权限且没有指定school_id，使用用户的学校ID
    if school_id is None and not scope.has_all:
        if scope.school_ids:
            school_id = list(scope.school_ids)[0]  # 使用用户的第一个学校
        else:
            # 用户没有任何学校权限
            return {
                "totalRecords": 0,
                "totalTasks": 0,
                "completedTasks": 0,
                "taskCompletionRate": 0,
                "typeStats": [],
                "weeklyStats": [0] * 7,
                "weeklyMaxCount": 0,
                "currentWeek": [],
                "monthlyStats": [],
                "monthlyMaxCount": 0,
                "deptStats": [],
                "todayStats": {"records": 0, "moral": 0, "teaching": 0, "dorm": 0, "overall": 0}
            }
    
    now = datetime.now()
    today = now.date()
    
    # 为年级表创建别名
    GradeOrg = aliased(SysOrg)
    
    # 获取用户可访问的班级ID列表（用于过滤记录）
    accessible_class_ids = list(scope.class_ids) if not scope.has_all else None
    accessible_school_ids = list(scope.school_ids) if not scope.has_all else None
    
    # 辅助函数：安全查询整体检查记录
    def safe_count_overall(query_filter=None):
        if BizOverallRecord is None:
            return 0
        try:
            query = db.query(BizOverallRecord)
            # 应用学校过滤
            if school_id is not None:
                query = query.filter(BizOverallRecord.school_id == school_id)
            elif accessible_school_ids:
                query = query.filter(BizOverallRecord.school_id.in_(accessible_school_ids))
            if query_filter:
                query = query.filter(query_filter)
            return query.count()
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to count {record_type} records: {e}")
            return 0
    
    # ========== 1. 基础统计 ==========
    # 德育记录（排除宿舍检查）
    moral_query = db.query(BizMoralRecord).filter(
        (BizMoralRecord.source == None) | (BizMoralRecord.source != 'dorm')
    )
    # 教学记录
    teaching_query = db.query(BizTeachingRecord)
    # 宿舍检查记录
    dorm_query = db.query(BizMoralRecord).filter(BizMoralRecord.source == 'dorm')
    
    # 构建班级ID列表用于过滤
    filter_class_ids = None
    if school_id:
        # 获取该学校下的所有班级ID
        grades = db.query(SysOrg.id).filter(SysOrg.parent_id == school_id, SysOrg.type == 'grade').all()
        grade_ids = [g.id for g in grades]
        classes = db.query(SysOrg.id).filter(SysOrg.parent_id.in_(grade_ids), SysOrg.type == 'class').all()
        filter_class_ids = [c.id for c in classes]
    elif not scope.has_all and accessible_class_ids:
        # 使用用户的班级权限
        filter_class_ids = accessible_class_ids
    
    # 教学记录需要特殊处理（class_id 可能为 NULL）
    # 先保存原始查询，因为 teaching 记录的 class_id 可能为 NULL
    original_teaching_query = teaching_query
    
    # 应用班级过滤（教学记录除外，后面单独处理）
    if filter_class_ids:
        moral_query = moral_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
        dorm_query = dorm_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
    
    # 计算总数
    moral_count = moral_query.count()
    dorm_count = dorm_query.count()
    overall_count = safe_count_overall()
    
    # 教学记录统计：包含指定班级的记录，以及 class_id 为 NULL 但 teacher 属于该学校的记录
    teaching_count = 0
    if filter_class_ids:
        # 有班级过滤条件时，包含这些班级的记录和 class_id 为 NULL 的记录
        teaching_count = original_teaching_query.filter(
            (BizTeachingRecord.class_id.in_(filter_class_ids)) | 
            (BizTeachingRecord.class_id.is_(None))
        ).count()
    elif scope.has_all:
        # 全部权限，统计所有教学记录
        teaching_count = original_teaching_query.count()
    elif accessible_school_ids:
        # 获取学校的所有教师ID
        school_teacher_ids = db.query(SysUser.id).filter(
            SysUser.org_id.in_(accessible_school_ids),
            SysUser.status == 1
        ).all()
        school_teacher_id_list = [t[0] for t in school_teacher_ids]
        if school_teacher_id_list:
            teaching_count = original_teaching_query.filter(
                (BizTeachingRecord.class_id.in_(accessible_class_ids if accessible_class_ids else [])) |
                (BizTeachingRecord.teacher_id.in_(school_teacher_id_list)) |
                (BizTeachingRecord.recorder_id == current_user.id)
            ).count()
    
    total_records = moral_count + teaching_count + dorm_count + overall_count
    
    # ========== 2. 按类型统计 ==========
    type_stats = [
        {"type": "MORAL", "label": "德育检查", "count": moral_count, "color": "#3b82f6"},
        {"type": "TEACHING", "label": "教学评价", "count": teaching_count, "color": "#10b981"},
        {"type": "DORM", "label": "宿舍检查", "count": dorm_count, "color": "#8b5cf6"},
        {"type": "GENERAL", "label": "整体检查", "count": overall_count, "color": "#f59e0b"}
    ]
    
    # ========== 3. 周统计（最近7天） ==========
    weekly_stats = [0] * 7
    weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    current_week = []
    
    for i in range(6, -1, -1):
        day_date = today - timedelta(days=i)
        # weekday() 返回 0=周一, 6=周日, 需要转换为周日=0
        weekday_idx = (day_date.weekday() + 1) % 7
        current_week.append({
            "day": weekdays[weekday_idx],
            "date": f"{day_date.month}/{day_date.day}"
        })
        
        # 统计当天记录数
        day_moral_query = db.query(BizMoralRecord).filter(
            func.date(BizMoralRecord.record_time) == day_date,
            (BizMoralRecord.source == None) | (BizMoralRecord.source != 'dorm')
        )
        day_dorm_query = db.query(BizMoralRecord).filter(
            BizMoralRecord.source == 'dorm',
            func.date(BizMoralRecord.record_time) == day_date
        )
        
        # 应用班级过滤
        if filter_class_ids:
            day_moral_query = day_moral_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
            day_dorm_query = day_dorm_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
        
        day_moral = day_moral_query.count()
        day_dorm = day_dorm_query.count()
        
        # 教学记录统计（支持 class_id 为 NULL 的情况）
        day_teaching_query = db.query(BizTeachingRecord).filter(
            func.date(BizTeachingRecord.record_time) == day_date
        )
        if filter_class_ids:
            day_teaching_query = day_teaching_query.filter(
                (BizTeachingRecord.class_id.in_(filter_class_ids)) |
                (BizTeachingRecord.class_id.is_(None))
            )
        day_teaching = day_teaching_query.count()
        
        day_overall = safe_count_overall(func.date(BizOverallRecord.record_time) == day_date)
        
        weekly_stats[6 - i] = day_moral + day_teaching + day_dorm + day_overall
    
    weekly_max_count = max(weekly_stats) if weekly_stats else 0
    
    # ========== 4. 月度统计（最近6个月） ==========
    monthly_stats = []
    for i in range(5, -1, -1):
        month_date = now.replace(day=1) - timedelta(days=i * 30)
        month_date = month_date.replace(day=1)
        month_start = month_date
        if month_date.month == 12:
            month_end = month_date.replace(year=month_date.year + 1, month=1) - timedelta(days=1)
        else:
            month_end = month_date.replace(month=month_date.month + 1) - timedelta(days=1)
        
        # 统计当月记录数
        month_moral_query = db.query(BizMoralRecord).filter(
            BizMoralRecord.record_time >= month_start,
            BizMoralRecord.record_time <= month_end,
            (BizMoralRecord.source == None) | (BizMoralRecord.source != 'dorm')
        )
        month_dorm_query = db.query(BizMoralRecord).filter(
            BizMoralRecord.source == 'dorm',
            BizMoralRecord.record_time >= month_start,
            BizMoralRecord.record_time <= month_end
        )
        
        # 应用班级过滤
        if filter_class_ids:
            month_moral_query = month_moral_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
            month_dorm_query = month_dorm_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
        
        month_moral = month_moral_query.count()
        month_dorm = month_dorm_query.count()
        
        # 教学记录统计（支持 class_id 为 NULL 的情况）
        month_teaching_query = db.query(BizTeachingRecord).filter(
            BizTeachingRecord.record_time >= month_start,
            BizTeachingRecord.record_time <= month_end
        )
        if filter_class_ids:
            month_teaching_query = month_teaching_query.filter(
                (BizTeachingRecord.class_id.in_(filter_class_ids)) |
                (BizTeachingRecord.class_id.is_(None))
            )
        month_teaching = month_teaching_query.count()
        month_overall = safe_count_overall(
            (BizOverallRecord.record_time >= month_start) & (BizOverallRecord.record_time <= month_end)
        )
        
        monthly_stats.append({
            "month": f"{month_date.month}月",
            "count": month_moral + month_teaching + month_dorm + month_overall
        })
    
    monthly_max_count = max(m['count'] for m in monthly_stats) if monthly_stats else 0
    
    # ========== 5. 今日统计 ==========
    today_moral_query = db.query(BizMoralRecord).filter(
        func.date(BizMoralRecord.record_time) == today,
        (BizMoralRecord.source == None) | (BizMoralRecord.source != 'dorm')
    )
    today_dorm_query = db.query(BizMoralRecord).filter(
        BizMoralRecord.source == 'dorm',
        func.date(BizMoralRecord.record_time) == today
    )
    
    # 应用班级过滤
    if filter_class_ids:
        today_moral_query = today_moral_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
        today_dorm_query = today_dorm_query.filter(BizMoralRecord.class_id.in_(filter_class_ids))
    
    today_moral = today_moral_query.count()
    today_dorm = today_dorm_query.count()
    
    # 教学记录统计（支持 class_id 为 NULL 的情况）
    today_teaching_query = db.query(BizTeachingRecord).filter(
        func.date(BizTeachingRecord.record_time) == today
    )
    if filter_class_ids:
        today_teaching_query = today_teaching_query.filter(
            (BizTeachingRecord.class_id.in_(filter_class_ids)) |
            (BizTeachingRecord.class_id.is_(None))
        )
    today_teaching = today_teaching_query.count()
    today_overall = safe_count_overall(func.date(BizOverallRecord.record_time) == today)
    
    today_stats = {
        "records": today_moral + today_teaching + today_dorm + today_overall,
        "moral": today_moral,
        "teaching": today_teaching,
        "dorm": today_dorm,
        "overall": today_overall
    }
    
    # ========== 6. 部门统计（按学校） ==========
    # 联表查询获取学校名称
    dept_query = db.query(
        SysOrg.name.label('school_name'),
        func.count(BizMoralRecord.id).label('count')
    ).join(
        GradeOrg, GradeOrg.id == BizMoralRecord.class_id
    ).join(
        SysOrg, SysOrg.id == GradeOrg.parent_id
    ).filter(
        SysOrg.type == 'school'
    )
    
    # 应用学校权限过滤
    if accessible_school_ids:
        dept_query = dept_query.filter(SysOrg.id.in_(accessible_school_ids))
    
    dept_query = dept_query.group_by(SysOrg.id, SysOrg.name).order_by(func.count(BizMoralRecord.id).desc()).limit(5).all()
    
    dept_stats = [
        {"dept": r.school_name, "count": r.count, "color": "#3b82f6"}
        for r in dept_query
    ]
    
    # ========== 5. 任务统计 ==========
    # 查询任务数据（应用数据权限过滤）
    task_query = db.query(ScheduleTask).filter(ScheduleTask.deleted_at.is_(None))
    
    # 应用学校权限过滤
    if accessible_school_ids:
        task_query = task_query.filter(ScheduleTask.school_id.in_(accessible_school_ids))
    elif not scope.has_all:
        # 如果没有学校权限，只能看到自己的任务
        task_query = task_query.filter(ScheduleTask.creator_id == current_user.id)
    
    # 统计总任务数
    total_tasks = task_query.count()
    
    # 统计已完成任务数
    completed_tasks = task_query.filter(ScheduleTask.status == 'completed').count()
    
    # 计算完成率
    task_completion_rate = round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0
    
    # 今日任务统计
    from datetime import time as dt_time
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)
    
    today_task_query = db.query(ScheduleTask).filter(
        ScheduleTask.deleted_at.is_(None),
        ScheduleTask.task_date >= today_start,
        ScheduleTask.task_date <= today_end
    )
    
    # 应用权限过滤
    if accessible_school_ids:
        today_task_query = today_task_query.filter(ScheduleTask.school_id.in_(accessible_school_ids))
    elif not scope.has_all:
        today_task_query = today_task_query.filter(ScheduleTask.creator_id == current_user.id)
    
    today_tasks = today_task_query.count()
    today_completed = today_task_query.filter(ScheduleTask.status == 'completed').count()
    
    # 更新今日统计数据
    today_stats["tasks"] = today_tasks
    today_stats["completed"] = today_completed
    
    return {
        "totalRecords": total_records,
        "totalTasks": total_tasks,
        "completedTasks": completed_tasks,
        "taskCompletionRate": task_completion_rate,
        "typeStats": type_stats,
        "weeklyStats": weekly_stats,
        "weeklyMaxCount": weekly_max_count,
        "currentWeek": current_week,
        "monthlyStats": monthly_stats,
        "monthlyMaxCount": monthly_max_count,
        "deptStats": dept_stats,
        "todayStats": today_stats
    }
