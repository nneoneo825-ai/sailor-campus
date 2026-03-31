from typing import Any, Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import distinct
from app.database import get_db
from app.models.student import BaseStudent
from app.models.moral import CfgMoralIndicator, BizMoralRecord, BizOverallRecord
from app.models.user import SysUser
from app.models.org import SysOrg, BaseClassInfo, BaseTeacher
from app.utils.deps import get_current_active_user
from app.utils.log_helper import log_operation, ACTION_CREATE


router = APIRouter()


class DormRecordCreate(BaseModel):
    student_id: Optional[str] = None
    student_name: Optional[str] = None  # 学生姓名
    class_id: Optional[int] = None  # 班级ID
    class_name: Optional[str] = None  # 班级名称
    grade_name: Optional[str] = None  # 年级名称
    building: str
    floor: int
    room: str
    bed_no: Optional[int] = None
    category: str  # 检查类别
    item: str  # 检查项目
    score_change: float
    description: Optional[str] = None
    evidence_imgs: Optional[List[str]] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    location_name: Optional[str] = None
    record_time: Optional[datetime] = None


# ==================== 宿舍信息API ====================

@router.get("/buildings")
async def get_dorm_buildings(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取所有宿舍楼栋列表
    """
    buildings = db.query(distinct(BaseStudent.dorm_building)).filter(
        BaseStudent.dorm_building.isnot(None),
        BaseStudent.dorm_building != ''
    ).all()
    
    return {
        "buildings": [b[0] for b in buildings if b[0]]
    }


@router.get("/floors")
async def get_dorm_floors(
    building: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取指定楼栋的楼层列表
    """
    floors = db.query(distinct(BaseStudent.dorm_floor)).filter(
        BaseStudent.dorm_building == building,
        BaseStudent.dorm_floor.isnot(None)
    ).order_by(BaseStudent.dorm_floor).all()
    
    return {
        "floors": [f[0] for f in floors if f[0] is not None]
    }


@router.get("/rooms")
async def get_dorm_rooms(
    building: str,
    floor: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取指定楼栋楼层的房间列表
    """
    rooms = db.query(distinct(BaseStudent.dorm_room)).filter(
        BaseStudent.dorm_building == building,
        BaseStudent.dorm_floor == floor,
        BaseStudent.dorm_room.isnot(None),
        BaseStudent.dorm_room != ''
    ).all()
    
    return {
        "rooms": [r[0] for r in rooms if r[0]]
    }


@router.get("/students")
async def get_dorm_students(
    building: str,
    floor: int,
    room: str,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取指定房间的学生列表（含床位信息）
    """
    from app.models.org import SysOrg
    
    students = db.query(BaseStudent).filter(
        BaseStudent.dorm_building == building,
        BaseStudent.dorm_floor == floor,
        BaseStudent.dorm_room == room,
        BaseStudent.status == 1
    ).order_by(BaseStudent.bed_no).all()
    
    # 获取所有班级ID
    class_ids = [s.class_id for s in students if s.class_id]
    
    # 批量查询班级信息
    class_map = {}
    grade_map = {}
    if class_ids:
        classes = db.query(SysOrg).filter(SysOrg.id.in_(class_ids)).all()
        for cls in classes:
            class_map[cls.id] = cls.name
            # 获取年级信息（父级）
            if cls.parent_id:
                grade_map[cls.id] = cls.parent_id
    
    # 批量查询年级信息
    parent_ids = list(set(grade_map.values()))
    parent_map = {}
    if parent_ids:
        parents = db.query(SysOrg).filter(SysOrg.id.in_(parent_ids)).all()
        for p in parents:
            parent_map[p.id] = p.name
    
    return {
        "students": [
            {
                "id": student.id,
                "name": student.name,
                "gender": student.gender,
                "bed_no": student.bed_no,
                "class_id": student.class_id,
                "class_name": class_map.get(student.class_id, ''),
                "grade_name": parent_map.get(grade_map.get(student.class_id), '')
            }
            for student in students
        ]
    }


# ==================== 宿舍指标API ====================

# 宿舍检查允许的德育指标组合 (category, sub_category)
ALLOWED_DORM_COMBINATIONS = [
    ('德育', '午休晚休'),
    ('劳育', '寝室内务')
]

@router.get("/indicators")
async def get_dorm_indicators(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取宿舍检查指标列表（普通宿舍检查模块使用）
    仅从德育指标中读取：
    - 大项'德育' + 小项'午休晚休' 
    - 大项'劳育' + 小项'寝室内务'
    按小项(sub_category)分组
    
    注意：此接口用于普通宿舍检查模块，返回全部宿舍指标（不限制is_overall）
          整体检查模块的宿舍部分请使用 /api/overall/indicators
    """
    from sqlalchemy import or_, and_
    
    # 构建 OR 条件：(category='德育' AND sub_category='午休晚休') OR (category='劳育' AND sub_category='寝室内务')
    conditions = []
    for cat, sub_cat in ALLOWED_DORM_COMBINATIONS:
        conditions.append(
            and_(
                CfgMoralIndicator.category == cat,
                CfgMoralIndicator.sub_category == sub_cat
            )
        )
    
    # 获取指定的宿舍相关指标（普通宿舍检查获取全部，不限制is_overall）
    indicators = db.query(CfgMoralIndicator).filter(
        CfgMoralIndicator.is_enabled == 1,
        or_(*conditions)
    ).order_by(CfgMoralIndicator.category, CfgMoralIndicator.sub_category, CfgMoralIndicator.id).all()
    
    print(f"[宿舍指标] 查询到 {len(indicators)} 条宿舍检查指标")
    
    # 如果没有找到指标，返回空结构
    if not indicators:
        return {
            "categories": [],
            "totalItems": 0
        }
    
    # 按小项(sub_category)分组，但保持大项的区分
    categories = {}
    for indicator in indicators:
        # 使用大项+小项作为唯一键，确保不同大项下相同小项不会合并
        major_cat = indicator.category or '其他'
        sub_cat = indicator.sub_category or '其他'
        # 显示时使用小项名称，但需要知道属于哪个大项
        display_name = sub_cat
        
        if display_name not in categories:
            categories[display_name] = {
                'name': display_name,
                'major_category': major_cat,
                'items': []
            }
        
        categories[display_name]['items'].append({
            "id": indicator.id,
            "name": indicator.name,
            "type": indicator.type,
            "default_score": float(indicator.default_score)
        })
    
    return {
        "categories": list(categories.values()),
        "totalItems": sum(len(cat['items']) for cat in categories.values())
    }


# ==================== 宿舍记录API ====================

@router.post("/records")
async def create_dorm_record(
    record: DormRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    创建宿舍检查记录
    复用德育记录表，source='dorm'
    从德育指标的'午休晚休'(category='德育')和'寝室内务'(category='劳育')中查找规则
    """
    try:
        # 从德育指标中查找规则（sub_category为'午休晚休'或'寝室内务'）
        # record.category 应该是 sub_category 的值（午休晚休/寝室内务）
        # record.item 是具体的指标名称
        rule = db.query(CfgMoralIndicator).filter(
            CfgMoralIndicator.sub_category == record.category,
            CfgMoralIndicator.name == record.item,
            CfgMoralIndicator.is_enabled == 1
        ).first()
        
        if not rule:
            # 如果没有找到规则，尝试模糊匹配
            rule = db.query(CfgMoralIndicator).filter(
                CfgMoralIndicator.sub_category == record.category,
                CfgMoralIndicator.is_enabled == 1
            ).first()
        
        # 使用北京时间 (UTC+8)
        beijing_tz = timezone(timedelta(hours=8))
        # 始终使用服务器当前北京时间
        record_time = datetime.now(beijing_tz)
        
        # 构建描述信息
        description = f"[{record.category}] {record.item}"
        if record.building and record.floor and record.room:
            description += f" | {record.building}{record.floor}层{record.room}房间"
        if record.bed_no:
            description += f" {record.bed_no}号床"
        if record.description:
            description += f" | {record.description}"
        
        # 确定大项分类（德育-午休晚休 / 劳育-寝室内务）
        major_category = rule.category if rule else ('德育' if record.category == '午休晚休' else '劳育')
        
        # 创建德育记录（宿舍检查复用）
        dorm_record = BizMoralRecord(
            student_id=record.student_id or 'DORM_CHECK',
            student_name=record.student_name,  # 学生姓名快照
            class_id=record.class_id,  # 班级ID
            class_name=record.class_name,  # 班级名称快照
            grade_name=record.grade_name,  # 年级名称快照
            rule_id=rule.id if rule else 0,
            major_category=major_category,  # 大项分类（德育/劳育）
            minor_category=record.category,  # 小项分类（sub_category的值：午休晚休/寝室内务）
            rule_snapshot=record.item,  # 指标名称
            score_change=record.score_change,
            description=description,
            evidence_imgs=record.evidence_imgs,
            gps_lat=record.gps_lat,
            gps_lng=record.gps_lng,
            location_name=record.location_name,
            source='dorm',
            recorder_id=current_user.id,
            record_time=record_time
        )
        
        db.add(dorm_record)
        db.commit()
        db.refresh(dorm_record)

        # 记录操作日志
        log_operation(
            db=db,
            user=current_user,
            module="宿舍管理",
            action=ACTION_CREATE,
            description=f"宿舍检查: {record.building}{record.floor}层{record.room}房间 - {record.item}",
            status="成功",
            request=request
        )
        
        return {
            "id": dorm_record.id,
            "message": "宿舍检查记录创建成功"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建记录失败: {str(e)}")


@router.post("/records/batch")
async def create_dorm_records_batch(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    批量创建宿舍检查记录
    """
    records_data = data.get("records", [])
    if not records_data:
        raise HTTPException(status_code=400, detail="No records provided")

    beijing_tz = timezone(timedelta(hours=8))
    created_ids = []

    try:
        for record_data in records_data:
            # 调试日志
            print(f"[DEBUG] 宿舍检查记录数据: {record_data}")
            
            # 前端传递的 category 是小项名称（午休晚休/寝室内务）
            # 需要根据小项名称和指标名称查找正确的德育指标
            sub_category_name = record_data.get("category")  # 小项名称：午休晚休 或 寝室内务
            item_name = record_data.get("item")  # 指标名称
            
            # 查找已存在的指标：根据小项和指标名称
            # 午休晚休 -> category='德育', sub_category='午休晚休'
            # 寝室内务 -> category='劳育', sub_category='寝室内务'
            rule = db.query(CfgMoralIndicator).filter(
                CfgMoralIndicator.sub_category == sub_category_name,
                CfgMoralIndicator.name == item_name,
                CfgMoralIndicator.is_enabled == 1
            ).first()

            if not rule:
                # 如果找不到指标，根据小项名称确定大项分类
                category_mapping = {
                    '午休晚休': '德育',
                    '寝室内务': '劳育'
                }
                major_cat = category_mapping.get(sub_category_name, '德育')
                score_change = record_data.get("score_change", -1)
                
                rule = CfgMoralIndicator(
                    category=major_cat,
                    sub_category=sub_category_name,
                    name=item_name,
                    type='deduction' if score_change < 0 else 'bonus',
                    default_score=score_change,
                    is_enabled=1,
                    is_overall=0,
                    org_id=None
                )
                db.add(rule)
                db.flush()
                print(f"[DEBUG] 创建新指标: category={major_cat}, sub_category={sub_category_name}, name={item_name}")

            # 构建描述信息
            description = f"[{rule.sub_category}] {rule.name}"
            if record_data.get("building") and record_data.get("floor"):
                description += f" | {record_data.get('building')}{record_data.get('floor')}层{record_data.get('room', '')}房间"
            if record_data.get("description"):
                description += f" | {record_data.get('description')}"

            dorm_record = BizMoralRecord(
                student_id=record_data.get("student_id") or 'DORM_CHECK',
                student_name=record_data.get("student_name"),  # 学生姓名快照
                class_id=record_data.get("class_id"),  # 班级ID
                class_name=record_data.get("class_name"),  # 班级名称快照
                grade_name=record_data.get("grade_name"),  # 年级名称快照
                rule_id=rule.id,
                major_category=rule.category,  # 使用指标真实的大项分类（德育/劳育）
                minor_category=rule.sub_category,  # 使用指标真实的小项分类（午休晚休/寝室内务）
                rule_snapshot=rule.name,  # 指标名称
                score_change=record_data.get("score_change", -1),
                description=description,
                gps_lat=record_data.get("gps_lat"),
                gps_lng=record_data.get("gps_lng"),
                location_name=record_data.get("location_name"),
                source='dorm',
                recorder_id=current_user.id,
                record_time=datetime.now(beijing_tz)
            )

            db.add(dorm_record)
            db.flush()
            created_ids.append(dorm_record.id)
            
            # 调试日志
            print(f"[DEBUG] 已创建宿舍检查记录: id={dorm_record.id}, major_category={rule.category}, minor_category={rule.sub_category}")

        db.commit()

        log_operation(
            db=db,
            user=current_user,
            module="宿舍管理",
            action=ACTION_CREATE,
            description=f"批量创建宿舍检查记录: {len(created_ids)}条",
            status="成功",
            request=request
        )

        return {
            "ids": created_ids,
            "count": len(created_ids),
            "message": f"成功创建 {len(created_ids)} 条宿舍检查记录"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"批量创建记录失败: {str(e)}")


@router.get("/records")
async def get_dorm_records(
    school_id: Optional[int] = Query(None, description="学校ID"),
    grade: Optional[str] = Query(None, description="年级名称"),
    class_name: Optional[str] = Query(None, description="班级名称"),
    recorder_id: int = Query(None, description="录入人ID，用于过滤只显示自己录入的记录"),
    building: Optional[str] = None,
    floor: Optional[int] = None,
    room: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取宿舍检查记录列表
    数据来源：
    1. source='dorm' - 普通宿舍检查记录
    2. source='overall' 且 minor_category IN ['午休晚休', '寝室内务'] - 整体检查宿舍模块记录
    """
    # 查询条件：包含普通宿舍检查和整体检查宿舍模块记录
    query = db.query(BizMoralRecord).filter(
        BizMoralRecord.source.in_(['dorm', 'overall']),
        # 整体检查记录需要过滤宿舍相关小项
        BizMoralRecord.minor_category.in_(['午休晚休', '寝室内务']) | (BizMoralRecord.source == 'dorm')
    )

    # 按录入人过滤（小程序端使用）
    if recorder_id:
        query = query.filter(BizMoralRecord.recorder_id == recorder_id)

    # 按学校ID筛选
    if school_id:
        # 获取该学校下的所有班级ID
        grades = db.query(SysOrg).filter(SysOrg.parent_id == school_id, SysOrg.type == 'grade').all()
        grade_ids = [g.id for g in grades]
        if grade_ids:
            classes = db.query(SysOrg).filter(SysOrg.parent_id.in_(grade_ids), SysOrg.type == 'class').all()
            class_ids = [c.id for c in classes]
            if class_ids:
                query = query.filter(BizMoralRecord.class_id.in_(class_ids))
    
    # 按年级筛选
    if grade and school_id:
        grade_org = db.query(SysOrg).filter(
            SysOrg.name == grade,
            SysOrg.type == 'grade',
            SysOrg.parent_id == school_id
        ).first()
        if grade_org:
            grade_classes = db.query(SysOrg).filter(
                SysOrg.parent_id == grade_org.id,
                SysOrg.type == 'class'
            ).all()
            grade_class_ids = [c.id for c in grade_classes]
            if grade_class_ids:
                query = query.filter(BizMoralRecord.class_id.in_(grade_class_ids))
    
    # 按班级名称筛选
    if class_name:
        query = query.filter(BizMoralRecord.class_name == class_name)
    
    # 按房间筛选（通过description字段匹配）
    if building:
        query = query.filter(BizMoralRecord.description.contains(building))
    if floor is not None:
        query = query.filter(BizMoralRecord.description.contains(f"{floor}层"))
    if room:
        query = query.filter(BizMoralRecord.description.contains(room))
    
    if start_date:
        query = query.filter(BizMoralRecord.record_time >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(BizMoralRecord.record_time <= datetime.fromisoformat(end_date))
    
    total = query.count()
    records = query.order_by(BizMoralRecord.record_time.desc())\
        .offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": [
            {
                "id": r.id,
                "student_id": r.student_id,
                "student_name": r.student_name,
                "class_id": r.class_id,  # 添加班级ID，用于前端获取班主任信息
                "grade_name": r.grade_name,
                "class_name": r.class_name,
                "major_category": r.major_category,
                "minor_category": r.minor_category,
                "rule_snapshot": r.rule_snapshot,
                "score_change": float(r.score_change),
                "description": r.description,
                "evidence_imgs": r.evidence_imgs,
                "location_name": r.location_name,
                "record_time": r.record_time.isoformat(),
                "recorder_id": r.recorder_id,
                "source": r.source  # 添加来源字段，区分普通检查和整体检查
            }
            for r in records
        ]
    }


# ==================== 宿舍报表API ====================

@router.get("/report")
async def get_dorm_report(
    school_id: int,
    start_date: str = Query(..., description="开始日期 YYYY-MM-DD"),
    end_date: str = Query(..., description="结束日期 YYYY-MM-DD"),
    grade: Optional[str] = Query(None, description="年级名称"),
    class_name: Optional[str] = Query(None, description="班级名称"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    获取宿舍量化报表数据
    按班级统计寝室内务和午休晚休的扣分情况，区分男生女生
    数据来源：
    1. biz_moral_record 表 (source='dorm') - 普通宿舍检查记录
    2. biz_overall_record 表 (check_type='DORM') - 整体检查宿舍模块记录
    """
    from app.models.student import BaseStudent
    
    # 转换日期字符串为datetime
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    
    # 查询条件：宿舍检查记录 (包括普通宿舍检查和整体检查宿舍模块)
    # source='dorm': 普通宿舍检查记录
    # source='overall': 整体检查宿舍模块记录（已同步到德育记录表）
    dorm_records_query = db.query(BizMoralRecord).filter(
        BizMoralRecord.source.in_(['dorm', 'overall']),
        BizMoralRecord.minor_category.in_(['午休晚休', '寝室内务']),  # 只统计宿舍相关小项
        BizMoralRecord.record_time >= start_dt,
        BizMoralRecord.record_time <= end_dt,
        BizMoralRecord.class_id.isnot(None)
    )
    
    # 查询整体检查宿舍模块记录 (biz_overall_record)
    # check_type='DORM' 表示整体检查宿舍模块
    overall_records_query = db.query(BizOverallRecord).filter(
        BizOverallRecord.check_type == 'DORM',
        BizOverallRecord.target_id.isnot(None),
        BizOverallRecord.record_time >= start_dt,
        BizOverallRecord.record_time <= end_dt
    )
    
    # 获取所有班级列表
    classes_query = db.query(SysOrg).filter(
        SysOrg.type == 'class'
    )
    if school_id:
        # 获取该学校下的所有班级
        school = db.query(SysOrg).filter(SysOrg.id == school_id).first()
        if school:
            # 获取该学校下的年级
            grades = db.query(SysOrg).filter(SysOrg.parent_id == school_id, SysOrg.type == 'grade').all()
            grade_ids = [g.id for g in grades]
            if grade_ids:
                classes_query = classes_query.filter(SysOrg.parent_id.in_(grade_ids))
    
    if grade:
        # 根据年级名称过滤，必须同时限定学校范围
        grade_org = db.query(SysOrg).filter(
            SysOrg.name == grade,
            SysOrg.type == 'grade',
            SysOrg.parent_id == school_id
        ).first()
        if grade_org:
            classes_query = classes_query.filter(SysOrg.parent_id == grade_org.id)
    
    if class_name:
        classes_query = classes_query.filter(SysOrg.name == class_name)
    
    classes = classes_query.all()
    
    # 构建报表数据
    report_data = []
    
    for cls in classes:
        # 获取班级信息
        grade_org = db.query(SysOrg).filter(SysOrg.id == cls.parent_id).first() if cls.parent_id else None
        grade_name = grade_org.name if grade_org else ''
        
        # 获取班主任信息
        biz_class = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == cls.id).first()
        head_teacher_name = ''
        if biz_class and biz_class.head_teacher_id:
            # head_teacher_id 存储 sys_user.id，通过 base_teacher.user_id 关联查询
            teacher = db.query(BaseTeacher).filter(BaseTeacher.user_id == biz_class.head_teacher_id).first()
            if teacher:
                head_teacher_name = teacher.name
        
        # 获取班级学生列表
        students = db.query(BaseStudent).filter(
            BaseStudent.class_id == cls.id,
            BaseStudent.status == 1
        ).all()
        
        # 统计男生女生人数
        male_count = sum(1 for s in students if s.gender == 'M')
        female_count = sum(1 for s in students if s.gender == 'F')
        
        # 初始化统计数据
        m_content = 0  # 男生寝室内务扣分
        f_content = 0  # 女生寝室内务扣分
        m_nap = 0      # 男生午休晚休扣分
        f_nap = 0      # 女生午休晚休扣分
        
        # === 数据来源1：普通宿舍检查记录 (biz_moral_record) ===
        class_dorm_records = dorm_records_query.filter(BizMoralRecord.class_id == cls.id).all()
        
        for record in class_dorm_records:
            # 判断是寝室内务还是午休晚休
            minor_category = record.minor_category or ''
            
            # 获取学生性别
            student = db.query(BaseStudent).filter(BaseStudent.id == record.student_id).first()
            is_male = student.gender == 'M' if student else True
            
            score_change = float(record.score_change)  # 直接读取检查记录的分数（负值）
            
            if minor_category == '寝室内务':
                if is_male:
                    m_content += score_change
                else:
                    f_content += score_change
            elif minor_category == '午休晚休':
                if is_male:
                    m_nap += score_change
                else:
                    f_nap += score_change
        
        # === 数据来源2：整体检查宿舍模块记录 (biz_overall_record) ===
        # target_id 是班级ID，category 是小项分类（午休晚休/寝室内务）
        class_overall_records = overall_records_query.filter(BizOverallRecord.target_id == cls.id).all()
        
        for record in class_overall_records:
            # 整体检查中：category = 小项分类（午休晚休/寝室内务）
            minor_category = record.category or ''
            score_change = float(record.score_change)
            
            # 整体检查无法区分男女，统一计入男生（或按比例分配）
            # 这里按男生人数占比分配
            total_students = male_count + female_count
            if total_students > 0:
                male_ratio = male_count / total_students
                female_ratio = female_count / total_students
            else:
                male_ratio = 1.0
                female_ratio = 0.0
            
            if minor_category == '寝室内务':
                m_content += score_change * male_ratio
                f_content += score_change * female_ratio
            elif minor_category == '午休晚休':
                m_nap += score_change * male_ratio
                f_nap += score_change * female_ratio
        
        # 计算总分
        content = m_content + f_content  # 寝室内务总分
        nap = m_nap + f_nap              # 午休晚休总分
        total_ded = content + nap        # 总扣分
        
        # 计算人均扣分
        student_count = male_count + female_count
        per_capita = total_ded / student_count if student_count > 0 else 0
        
        report_data.append({
            'class_id': cls.id,
            'grade': grade_name,
            'class': cls.name,
            'headTeacher': head_teacher_name,
            'student_count': student_count,
            'male_count': male_count,
            'female_count': female_count,
            'mContent': m_content,      # 男生寝室内务扣分
            'fContent': f_content,      # 女生寝室内务扣分
            'content': content,         # 寝室内务总分
            'mNap': m_nap,              # 男生午休晚休扣分
            'fNap': f_nap,              # 女生午休晚休扣分
            'nap': nap,                 # 午休晚休总分
            'totalDed': total_ded,      # 总扣分
            'perCapita': round(per_capita, 2)  # 人均扣分
        })
    
    # 排序：先按年级顺序，再按班级名称排序
    grade_order = {'初一': 1, '初二': 2, '初三': 3, '高一': 4, '高二': 5, '高三': 6}
    
    def extract_class_num(class_name):
        """提取班级名称中的数字用于排序"""
        import re
        match = re.search(r'(\d+)', class_name)
        return int(match.group(1)) if match else 999
    
    report_data.sort(key=lambda x: (grade_order.get(x['grade'], 99), extract_class_num(x['class'])))
    
    # 先计算年级统计数据
    grade_data = {}
    for item in report_data:
        grade = item['grade']
        if grade not in grade_data:
            grade_data[grade] = {'total_ded': 0, 'total_count': 0, 'classes': []}
        grade_data[grade]['total_ded'] += item['totalDed']
        grade_data[grade]['total_count'] += item['student_count']
        grade_data[grade]['classes'].append(item)
    
    # 计算每个年级的年级人均扣分
    for grade, data in grade_data.items():
        grade_per_capita = data['total_ded'] / data['total_count'] if data['total_count'] > 0 else 0
        data['grade_per_capita'] = round(grade_per_capita, 2)
    
    # 计算年级排名（按年级人均扣分降序排序，扣分越多排名越靠前，支持并列）
    sorted_grades = sorted(grade_data.items(), key=lambda x: x[1]['grade_per_capita'], reverse=True)
    grade_rank_map = {}
    current_rank = 1
    prev_per_capita = None
    for grade, data in sorted_grades:
        if prev_per_capita is not None and data['grade_per_capita'] != prev_per_capita:
            current_rank += 1
        grade_rank_map[grade] = current_rank
        prev_per_capita = data['grade_per_capita']
    
    # 计算班级在年级内的排名（rank）
    for grade, data in grade_data.items():
        # 按班级人均扣分降序排列（扣分越多越靠前）
        sorted_classes = sorted(data['classes'], key=lambda x: x['perCapita'], reverse=True)
        
        # 使用密集排名（并列排名）
        class_rank = 1
        prev_per_capita = None
        for item in sorted_classes:
            if prev_per_capita is not None and item['perCapita'] != prev_per_capita:
                class_rank += 1
            item['rank'] = class_rank  # 班级在年级内的排名
            item['gradeRank'] = grade_rank_map[grade]  # 年级排名（基于年级人均扣分）
            item['gradePerCapita'] = data['grade_per_capita']
            prev_per_capita = item['perCapita']
    
    # 添加综合得分（按排名计分：排名1=100分，排名2=95分，每降一名减5分）
    for item in report_data:
        rank = item.get('rank', 1)
        # 公式：分数 = 105 - 排名 * 5，最低45分
        item['score'] = max(45, 105 - rank * 5)
    
    return {
        'data': report_data,
        'total': len(report_data)
    }
