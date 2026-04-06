from typing import Any, Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db, Base
from app.models.user import SysUser
from app.models.org import SysOrg
from app.models.moral import CfgMoralIndicator, CfgTeachingIndicator, BizMoralRecord, BizTeachingRecord, BizOverallRecord
from app.utils.deps import get_current_active_user, require_permission


# ==================== Pydantic模型 ====================

class OverallRecordCreate(BaseModel):
    check_type: str  # CLASS, SUBJECT, DORM
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    category: str  # 学科模块为教研组，其他为大项
    major_category: Optional[str] = None  # 指标大项（用于报表显示）
    sub_category: Optional[str] = None  # 小项分类
    item: str
    indicator_id: Optional[int] = None  # 指标ID
    score_change: float
    description: Optional[str] = None
    evidence_imgs: Optional[List[str]] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    location_name: Optional[str] = None
    record_time: Optional[datetime] = None


router = APIRouter()


# ==================== 辅助函数 ====================

def get_grade_name_by_class_id(db: Session, class_id: int) -> str:
    """根据班级ID获取年级名称"""
    if not class_id:
        return ''
    # 查询班级组织
    cls_org = db.query(SysOrg).filter(SysOrg.id == class_id, SysOrg.type == 'class').first()
    if cls_org and cls_org.parent_id:
        # 查询年级组织
        grade_org = db.query(SysOrg).filter(SysOrg.id == cls_org.parent_id, SysOrg.type == 'grade').first()
        if grade_org:
            return grade_org.name
    return ''


# ==================== 整体检查指标API ====================

@router.get("/indicators")
async def get_overall_indicators(
    check_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    获取整体检查指标
    从德育指标和教学指标表中获取 is_overall=1 的项目
    返回按检查类型分组的指标列表
    """
    # 初始化指标结构
    indicators = {
        "CLASS": {
            "name": "班级检查",
            "categories": []
        },
        "SUBJECT": {
            "name": "学科检查",
            "categories": []
        },
        "DORM": {
            "name": "宿舍检查",
            "categories": []
        }
    }
    
    # 从德育指标中获取整体检查项
    moral_indicators = db.query(CfgMoralIndicator).filter(
        CfgMoralIndicator.is_enabled == 1,
        CfgMoralIndicator.is_overall == 1
    ).all()
    
    # 按大项-小项分类组织德育指标（三层结构）
    moral_categories = {}
    for ind in moral_indicators:
        cat_name = ind.category or '其他'
        sub_cat_name = ind.sub_category or '其他'
        
        if cat_name not in moral_categories:
            moral_categories[cat_name] = {}
        if sub_cat_name not in moral_categories[cat_name]:
            moral_categories[cat_name][sub_cat_name] = []
        
        moral_categories[cat_name][sub_cat_name].append({
            "name": ind.name,
            "default_score": float(ind.default_score),
            "type": ind.type,
            "indicator_id": ind.id
        })
    
    # 将德育指标分配到班级检查（全部德育指标）
    for cat_name, sub_categories in moral_categories.items():
        # 构建小项列表
        sub_category_list = []
        for sub_cat_name, items in sub_categories.items():
            sub_category_list.append({
                "name": sub_cat_name,
                "indicators": items
            })
        
        indicators["CLASS"]["categories"].append({
            "name": cat_name,
            "subCategories": sub_category_list
        })
    
    # 宿舍检查只获取特定小项：德育-午休晚休、劳育-寝室内务
    # 使用与小程序期望一致的二层结构（与dorm.py保持一致）
    dorm_items_map = {}
    print(f"[整体检查-DORM] moral_categories keys: {list(moral_categories.keys())}")
    for cat_name, sub_categories in moral_categories.items():
        print(f"[整体检查-DORM] 检查大项: {cat_name}, 小项: {list(sub_categories.keys())}")
        # 从德育中获取"午休晚休"
        if cat_name == '德育' and '午休晚休' in sub_categories:
            dorm_items_map['午休晚休'] = sub_categories['午休晚休']
            print(f"[整体检查-DORM] 找到德育-午休晚休，共 {len(sub_categories['午休晚休'])} 个指标: {[i['name'] for i in sub_categories['午休晚休']]}")
        # 从劳育中获取"寝室内务"
        if cat_name == '劳育' and '寝室内务' in sub_categories:
            dorm_items_map['寝室内务'] = sub_categories['寝室内务']
            print(f"[整体检查-DORM] 找到劳育-寝室内务，共 {len(sub_categories['寝室内务'])} 个指标: {[i['name'] for i in sub_categories['寝室内务']]}")
    
    # 将宿舍检查指标添加到DORM（二层结构：小项名称 -> items）
    for sub_cat_name, items in dorm_items_map.items():
        indicators["DORM"]["categories"].append({
            "name": sub_cat_name,
            "items": items
        })
    
    print(f"[整体检查-DORM] 最终返回 {len(indicators['DORM']['categories'])} 个分类")
    
    # 从教学指标中获取整体检查项
    teaching_indicators = db.query(CfgTeachingIndicator).filter(
        CfgTeachingIndicator.is_enabled == 1,
        CfgTeachingIndicator.is_overall == 1
    ).all()
    
    # 按大项分类组织教学指标
    teaching_categories = {}
    for ind in teaching_indicators:
        cat_name = ind.major_category or '其他'
        if cat_name not in teaching_categories:
            teaching_categories[cat_name] = []
        teaching_categories[cat_name].append({
            "name": ind.name,
            "default_score": float(ind.default_score),
            "type": ind.type,
            "indicator_id": ind.id
        })
    
    # 将教学指标分配到学科检查
    for cat_name, items in teaching_categories.items():
        indicators["SUBJECT"]["categories"].append({
            "name": cat_name,
            "items": items
        })
    
    # 如果没有任何整体检查项，使用默认指标（兜底）
    if not moral_indicators and not teaching_indicators:
        indicators = {
            "CLASS": {
                "name": "班级检查",
                "categories": [
                    {
                        "name": "班级检查",
                        "items": [
                            {"name": "教室布置不规范", "default_score": -1},
                            {"name": "班级公物损坏", "default_score": -2},
                            {"name": "课间操整体纪律", "default_score": -1},
                            {"name": "包干区大面积垃圾", "default_score": -1}
                        ]
                    }
                ]
            },
            "SUBJECT": {
                "name": "学科检查",
                "categories": [
                    {
                        "name": "学科检查",
                        "items": [
                            {"name": "集体备课未记录", "default_score": -1},
                            {"name": "办公区域脏乱", "default_score": -1},
                            {"name": "教学进度严重滞后", "default_score": -2},
                            {"name": "教研活动缺席", "default_score": -1}
                        ]
                    }
                ]
            },
            "DORM": {
                "name": "宿舍检查",
                "categories": [
                    {
                        "name": "宿舍检查",
                        "items": [
                            {"name": "大寝室违章用电", "default_score": -3},
                            {"name": "寝室楼层卫生差", "default_score": -1},
                            {"name": "熄灯后集体喧哗", "default_score": -1},
                            {"name": "宿舍公共设施报修", "default_score": 0}
                        ]
                    }
                ]
            }
        }
    
    if check_type:
        return {
            "indicators": {check_type: indicators.get(check_type, {})}
        }
    
    return {"indicators": indicators}


# ==================== 整体检查记录API ====================

@router.post("/records")
async def create_overall_record(
    record: OverallRecordCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    创建整体检查记录
    同时同步到德育/教学记录表以支持报表汇总
    """
    try:
        # 使用北京时间 (UTC+8)
        beijing_tz = timezone(timedelta(hours=8))
        # 始终使用服务器当前北京时间
        record_time = datetime.now(beijing_tz)
        
        # 1. 保存到整体检查记录表
        # 学科检查特殊处理：category=学科，sub_category=指标大项
        db_category = record.category
        db_sub_category = record.sub_category
        if record.check_type == 'SUBJECT':
            # 对于学科检查：
            # category = 学科（数学、语文等）
            # sub_category = 指标大项（习题组编、教学设计等）
            db_sub_category = record.major_category or record.sub_category or ''
        
        overall_record = BizOverallRecord(
            check_type=record.check_type,
            target_id=record.target_id,
            target_name=record.target_name,
            category=db_category,
            sub_category=db_sub_category,
            item=record.item,
            indicator_id=record.indicator_id,
            score_change=record.score_change,
            description=record.description,
            evidence_imgs=record.evidence_imgs,
            gps_lat=record.gps_lat,
            gps_lng=record.gps_lng,
            location_name=record.location_name,
            source='miniprogram',
            recorder_id=current_user.id,
            record_time=record_time
        )
        
        db.add(overall_record)
        db.flush()  # 先flush获取ID
        
        # 2. 根据检查类型同步到对应的记录表
        if record.check_type == 'CLASS':
            # 班级检查同步到德育记录表
            moral_record = BizMoralRecord(
                student_id=None,  # 整体检查不针对具体学生
                student_name=None,
                class_id=record.target_id,
                class_name=record.target_name,
                rule_id=record.indicator_id or 1,  # 指标ID
                major_category=record.category,
                minor_category=record.sub_category or '',
                rule_snapshot=record.item,
                score_change=record.score_change,
                description=record.description,
                evidence_imgs=record.evidence_imgs,
                gps_lat=record.gps_lat,
                gps_lng=record.gps_lng,
                location_name=record.location_name,
                source='overall',  # 标记来源为整体检查
                recorder_id=current_user.id,
                recorder_name=current_user.real_name,
                record_time=record_time
            )
            db.add(moral_record)
            
        elif record.check_type == 'DORM':
            # 宿舍检查同步到德育记录表
            # 宿舍检查的category是小项名称（午休晚休/寝室内务）
            # major_category根据小项确定：午休晚休→德育，寝室内务→劳育
            dorm_minor_category = record.category  # 小项：午休晚休/寝室内务
            dorm_major_category = '德育' if record.category == '午休晚休' else ('劳育' if record.category == '寝室内务' else record.category)
            
            # 获取班级和年级信息
            dorm_class_name = record.target_name or ''
            dorm_grade_name = ''
            if record.target_id:
                cls_org = db.query(SysOrg).filter(SysOrg.id == record.target_id).first()
                if cls_org:
                    dorm_class_name = cls_org.name
                    dorm_grade_name = get_grade_name_by_class_id(db, record.target_id)
            
            moral_record = BizMoralRecord(
                student_id=None,
                student_name=None,
                class_id=record.target_id,
                class_name=dorm_class_name,
                grade_name=dorm_grade_name,
                rule_id=record.indicator_id or 1,
                major_category=dorm_major_category,
                minor_category=dorm_minor_category,
                rule_snapshot=record.item,
                score_change=record.score_change,
                description=record.description,
                evidence_imgs=record.evidence_imgs,
                gps_lat=record.gps_lat,
                gps_lng=record.gps_lng,
                location_name=record.location_name,
                source='overall',
                recorder_id=current_user.id,
                recorder_name=current_user.real_name,
                record_time=record_time
            )
            db.add(moral_record)
            
        elif record.check_type == 'SUBJECT':
            # 学科检查同步到教学记录表
            # 整体检查的学科检查针对整个教研组，teacher_id设为NULL
            # category: 学科/教研组（如数学、语文）
            # major_category: 指标大项（如习题组编、教学设计）
            teaching_record = BizTeachingRecord(
                teacher_id=None,  # 整体检查针对教研组，不是具体教师
                check_item=record.item,
                content=record.description,
                type='deduction' if record.score_change < 0 else 'bonus',
                score=record.score_change,
                category=record.category,  # 学科/教研组
                major_category=record.major_category or record.category,  # 指标大项
                indicator_id=record.indicator_id,
                description=record.description,
                evidence_imgs=record.evidence_imgs,
                gps_lat=record.gps_lat,
                gps_lng=record.gps_lng,
                location_name=record.location_name,
                source='overall',  # 标记来源为整体检查
                recorder_id=current_user.id,
                recorder_name=current_user.real_name,
                record_time=record_time,
                class_id=record.target_id
            )
            db.add(teaching_record)
        
        db.commit()
        db.refresh(overall_record)
        
        return {
            "id": overall_record.id,
            "message": "整体检查记录创建成功"
        }
    except Exception as e:
        db.rollback()
        # 如果表不存在，尝试创建表
        if "biz_overall_record" in str(e).lower():
            try:
                Base.metadata.create_all(bind=db.get_bind())
                db.add(overall_record)
                db.commit()
                db.refresh(overall_record)
                return {
                    "id": overall_record.id,
                    "message": "整体检查记录创建成功"
                }
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"创建记录失败: {str(e2)}")
        raise HTTPException(status_code=500, detail=f"创建记录失败: {str(e)}")


@router.post("/records/batch")
async def create_overall_records_batch(
    data: dict,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    批量创建整体检查记录
    同时同步到德育/教学记录表以支持报表汇总
    """
    records_data = data.get("records", [])
    if not records_data:
        raise HTTPException(status_code=400, detail="No records provided")

    beijing_tz = timezone(timedelta(hours=8))
    created_ids = []

    try:
        for record_data in records_data:
            record_time = datetime.now(beijing_tz)
            check_type = record_data.get("check_type")
            target_id = record_data.get("target_id")
            category = record_data.get("category")
            major_category = record_data.get("major_category")  # 指标大项
            sub_category = record_data.get("sub_category")
            item = record_data.get("item")
            indicator_id = record_data.get("indicator_id")
            score_change = record_data.get("score_change", -1)
            
            # 1. 保存到整体检查记录表
            # 学科检查特殊处理：category=学科，sub_category=指标大项
            db_category = category
            db_sub_category = sub_category
            if check_type == 'SUBJECT':
                # 对于学科检查：
                # category = 学科（数学、语文等）
                # sub_category = 指标大项（习题组编、教学设计等）
                db_sub_category = major_category or sub_category or ''
            
            overall_record = BizOverallRecord(
                check_type=check_type,
                target_id=target_id,
                target_name=record_data.get("target_name"),
                category=db_category,
                sub_category=db_sub_category,
                item=item,
                indicator_id=indicator_id,
                score_change=score_change,
                description=record_data.get("description"),
                gps_lat=record_data.get("gps_lat"),
                gps_lng=record_data.get("gps_lng"),
                location_name=record_data.get("location_name"),
                source='miniprogram',
                recorder_id=current_user.id,
                record_time=record_time
            )

            db.add(overall_record)
            db.flush()
            created_ids.append(overall_record.id)
            
            # 2. 根据检查类型同步到对应的记录表
            if check_type == 'CLASS':
                # 班级检查同步到德育记录表
                moral_record = BizMoralRecord(
                    student_id=None,
                    student_name=None,
                    class_id=target_id,
                    class_name=record_data.get("target_name"),
                    rule_id=indicator_id or 1,
                    major_category=category,
                    minor_category=sub_category or '',
                    rule_snapshot=item,
                    score_change=score_change,
                    description=record_data.get("description"),
                    gps_lat=record_data.get("gps_lat"),
                    gps_lng=record_data.get("gps_lng"),
                    location_name=record_data.get("location_name"),
                    source='overall',
                    recorder_id=current_user.id,
                    recorder_name=current_user.real_name,
                    record_time=record_time
                )
                db.add(moral_record)
                
            elif check_type == 'DORM':
                # 宿舍检查同步到德育记录表
                # 宿舍检查的category是小项名称（午休晚休/寝室内务）
                # major_category根据小项确定：午休晚休→德育，寝室内务→劳育
                dorm_minor_category = category  # 小项：午休晚休/寝室内务
                dorm_major_category = '德育' if category == '午休晚休' else ('劳育' if category == '寝室内务' else category)
                
                # 解析房间信息获取班级ID
                # target_name 格式: "男生宿舍1层: 101" 或 "1层: 101"
                target_name = record_data.get("target_name", "")
                dorm_class_id = target_id
                
                # 如果 target_id 为空，尝试从房间信息获取班级
                if not dorm_class_id and target_name:
                    import re
                    # 尝试解析: "楼栋楼层层: 房间号" 格式
                    match = re.match(r'(.+?)(\d+)层:\s*(\d+)', target_name)
                    if match:
                        building = match.group(1).strip()  # 楼栋名称
                        floor = int(match.group(2))        # 楼层
                        room = match.group(3)              # 房间号
                        
                        # 查询该房间内的学生获取班级信息
                        from app.models.student import BaseStudent
                        room_students = db.query(BaseStudent).filter(
                            BaseStudent.dorm_building == building,
                            BaseStudent.dorm_floor == floor,
                            BaseStudent.dorm_room == room,
                            BaseStudent.status == 1
                        ).all()
                        
                        if room_students:
                            # 按班级分组统计人数，分数按比例分配给各班级
                            class_counts = {}
                            for student in room_students:
                                if student.class_id:
                                    class_counts[student.class_id] = class_counts.get(student.class_id, 0) + 1
                            
                            total_count = sum(class_counts.values())
                            
                            # 为每个班级创建记录，分数按人数比例分配
                            # 构建包含宿舍信息的description
                            dorm_description = record_data.get("description") or f"[{dorm_minor_category}] {item}"
                            # 只要 floor 和 room 存在，就构建包含宿舍信息的 description
                            if floor and room:
                                building_str = building if building else ''
                                dorm_description = f"[{dorm_minor_category}] {item} | {building_str}{floor}层{room}房间"
                            
                            for cls_id, count in class_counts.items():
                                ratio = count / total_count if total_count > 0 else 1
                                cls_score = score_change * ratio
                                
                                # 获取班级和年级信息
                                cls_org = db.query(SysOrg).filter(SysOrg.id == cls_id).first()
                                cls_name = cls_org.name if cls_org else ''
                                cls_grade_name = get_grade_name_by_class_id(db, cls_id)
                                
                                moral_record = BizMoralRecord(
                                    student_id=None,
                                    student_name=None,
                                    class_id=cls_id,
                                    class_name=cls_name,
                                    grade_name=cls_grade_name,
                                    rule_id=indicator_id or 1,
                                    major_category=dorm_major_category,
                                    minor_category=dorm_minor_category,
                                    rule_snapshot=item,
                                    score_change=round(cls_score, 1),
                                    description=dorm_description,
                                    gps_lat=record_data.get("gps_lat"),
                                    gps_lng=record_data.get("gps_lng"),
                                    location_name=record_data.get("location_name"),
                                    source='overall',
                                    recorder_id=current_user.id,
                                    recorder_name=current_user.real_name,
                                    record_time=record_time
                                )
                                db.add(moral_record)
                            
                            print(f"[整体检查-DORM] 房间 {target_name} 分配到 {len(class_counts)} 个班级")
                            continue  # 跳过下面的单条记录创建
                
                # 如果无法解析房间或没有学生，创建单条记录（class_id可能为空）
                # 获取年级信息
                single_grade_name = get_grade_name_by_class_id(db, dorm_class_id) if dorm_class_id else ''
                # 获取班级名称
                single_class_name = target_name
                if dorm_class_id:
                    cls_org = db.query(SysOrg).filter(SysOrg.id == dorm_class_id).first()
                    if cls_org:
                        single_class_name = cls_org.name
                
                # 构建包含宿舍信息的description
                building = record_data.get("building")
                floor = record_data.get("floor")
                room = record_data.get("room")
                description = record_data.get("description") or f"[{dorm_minor_category}] {item}"
                if building and floor and room:
                    description = f"[{dorm_minor_category}] {item} | {building}{floor}层{room}房间"
                
                moral_record = BizMoralRecord(
                    student_id=None,
                    student_name=None,
                    class_id=dorm_class_id,
                    class_name=single_class_name,
                    grade_name=single_grade_name,
                    rule_id=indicator_id or 1,
                    major_category=dorm_major_category,
                    minor_category=dorm_minor_category,
                    rule_snapshot=item,
                    score_change=score_change,
                    description=description,
                    gps_lat=record_data.get("gps_lat"),
                    gps_lng=record_data.get("gps_lng"),
                    location_name=record_data.get("location_name"),
                    source='overall',
                    recorder_id=current_user.id,
                    recorder_name=current_user.real_name,
                    record_time=record_time
                )
                db.add(moral_record)
                
            elif check_type == 'SUBJECT':
                # 学科检查同步到教学记录表
                # category: 学科/教研组
                # major_category: 指标大项
                # 注意：major_category 不能为空，如果为空则记录警告
                if not major_category:
                    print(f"[警告] 学科检查 major_category 为空，category={category}, item={item}")
                # 使用 major_category 如果非空，否则使用 category（但这是不期望的情况）
                final_major_category = major_category if major_category else category
                print(f"[学科检查] category={category}, major_category={major_category}, final_major_category={final_major_category}")
                
                teaching_record = BizTeachingRecord(
                    teacher_id=None,
                    check_item=item,
                    content=record_data.get("description"),
                    type='deduction' if score_change < 0 else 'bonus',
                    score=score_change,
                    category=category,  # 学科/教研组
                    major_category=final_major_category,  # 指标大项
                    indicator_id=indicator_id,
                    description=record_data.get("description"),
                    gps_lat=record_data.get("gps_lat"),
                    gps_lng=record_data.get("gps_lng"),
                    location_name=record_data.get("location_name"),
                    source='overall',
                    recorder_id=current_user.id,
                    recorder_name=current_user.real_name,
                    record_time=record_time,
                    class_id=target_id
                )
                db.add(teaching_record)

        db.commit()

        return {
            "ids": created_ids,
            "count": len(created_ids),
            "message": f"成功创建 {len(created_ids)} 条整体检查记录"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"批量创建记录失败: {str(e)}")


@router.get("/records")
async def get_overall_records(
    check_type: Optional[str] = None,
    target_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    获取整体检查记录列表
    """
    query = db.query(BizOverallRecord)
    
    if check_type:
        query = query.filter(BizOverallRecord.check_type == check_type)
    if target_id:
        query = query.filter(BizOverallRecord.target_id == target_id)
    if start_date:
        query = query.filter(BizOverallRecord.record_time >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(BizOverallRecord.record_time <= datetime.fromisoformat(end_date))
    
    total = query.count()
    records = query.order_by(BizOverallRecord.record_time.desc())\
        .offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": [
            {
                "id": r.id,
                "check_type": r.check_type,
                "target_id": r.target_id,
                "target_name": r.target_name,
                "category": r.category,
                "item": r.item,
                "score_change": float(r.score_change),
                "description": r.description,
                "evidence_imgs": r.evidence_imgs,
                "location_name": r.location_name,
                "record_time": r.record_time.isoformat(),
                "recorder_id": r.recorder_id
            }
            for r in records
        ]
    }


# ==================== 班级/学科组列表API ====================

@router.get("/targets/classes")
async def get_target_classes(
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    获取班级列表（用于班级检查）
    """
    query = db.query(SysOrg).filter(SysOrg.type == 'class')
    
    if org_id:
        # 获取org_id下的所有班级
        query = query.filter(SysOrg.parent_id == org_id)
    
    classes = query.order_by(SysOrg.name).all()
    
    return {
        "classes": [
            {
                "id": cls.id,
                "name": cls.name,
                "parent_id": cls.parent_id
            }
            for cls in classes
        ]
    }


@router.get("/targets/subjects")
async def get_target_subjects(
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("moral:class"))
) -> Any:
    """
    获取学科组列表（用于学科检查）
    返回固定学科列表
    """
    subjects = [
        {"id": 1, "name": "语文组"},
        {"id": 2, "name": "数学组"},
        {"id": 3, "name": "英语组"},
        {"id": 4, "name": "物理组"},
        {"id": 5, "name": "化学组"},
        {"id": 6, "name": "生物组"},
        {"id": 7, "name": "政治组"},
        {"id": 8, "name": "历史组"},
        {"id": 9, "name": "地理组"},
    ]
    
    return {"subjects": subjects}
