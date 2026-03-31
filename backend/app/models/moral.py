from sqlalchemy import Column, Integer, BIGINT, VARCHAR, DECIMAL, TEXT, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin, AuditMixin


class CfgMoralIndicator(Base, TimestampMixin):
    """德育评价指标库"""
    __tablename__ = "cfg_moral_indicator"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(VARCHAR(50), nullable=False)  # 大项分类，如：德育常规、卫生管理
    sub_category = Column(VARCHAR(50), nullable=False)  # 小项分类，如：考勤纪律、仪容仪表
    name = Column(VARCHAR(100), nullable=False)  # 指标名称，如：上课迟到
    type = Column(VARCHAR(20), nullable=False)  # bonus:加分, deduction:扣分
    default_score = Column(DECIMAL(4, 1), nullable=False)
    org_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=True)  # NULL表示全集团通用
    is_enabled = Column(Integer, default=1, nullable=False)  # 1:启用, 0:禁用
    is_overall = Column(Integer, default=0, nullable=False)  # 1:整体检查项, 0:非整体检查项

    # 关联组织机构
    org = relationship("SysOrg", back_populates="moral_indicators")


class CfgTeachingIndicator(Base, TimestampMixin):
    """教学评价指标库"""
    __tablename__ = "cfg_teaching_indicator"

    id = Column(Integer, primary_key=True, autoincrement=True)
    major_category = Column(VARCHAR(100), nullable=False)  # 大项分类
    name = Column(VARCHAR(100), nullable=False)  # 指标名称
    type = Column(VARCHAR(20), nullable=False)  # score:评分项, bonus:加分项, deduction:扣分项
    default_score = Column(DECIMAL(4, 1), nullable=False)
    org_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=True)  # NULL表示全集团通用
    is_enabled = Column(Integer, default=1, nullable=False)  # 1:启用, 0:禁用
    is_overall = Column(Integer, default=0, nullable=False)  # 1:整体检查项, 0:非整体检查项

    # 关联组织机构
    org = relationship("SysOrg", back_populates="teaching_indicators")


class BizMoralRecord(Base, TimestampMixin, AuditMixin):
    """德育检查记录表 - 流水记录，支持审计字段但不支持软删除"""
    __tablename__ = "biz_moral_record"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    student_id = Column(VARCHAR(32), index=True, nullable=True)  # 学号，与base_student.id一致
    student_name = Column(VARCHAR(50), nullable=True)  # 学生姓名快照
    class_id = Column(BIGINT, index=True, nullable=True)
    class_name = Column(VARCHAR(50), nullable=True)  # 班级名称快照
    grade_name = Column(VARCHAR(50), nullable=True)  # 年级名称快照
    # 注意：rule_id 在数据库中有外键约束，但这里不定义 SQLAlchemy 关系以避免自动join
    rule_id = Column(Integer, nullable=False)
    major_category = Column(VARCHAR(50), nullable=True)  # 大项分类快照 (对应cfg_moral_indicator.category)
    minor_category = Column(VARCHAR(50), nullable=True)  # 小项分类快照 (对应cfg_moral_indicator.sub_category)
    rule_snapshot = Column(VARCHAR(200), nullable=False)
    score_change = Column(DECIMAL(4, 1), nullable=False)
    description = Column(VARCHAR(500), nullable=True)
    evidence_imgs = Column(JSON, nullable=True)
    evidence_audio = Column(VARCHAR(255), nullable=True)
    gps_lat = Column(DECIMAL(10, 6), nullable=True)
    gps_lng = Column(DECIMAL(10, 6), nullable=True)
    location_name = Column(VARCHAR(100), nullable=True)
    source = Column(VARCHAR(20), default='web', nullable=False)  # web, miniprogram, import
    recorder_id = Column(BIGINT, index=True, nullable=True)
    recorder_name = Column(VARCHAR(50), nullable=True)  # 录入人姓名快照
    record_time = Column(DateTime, index=True, nullable=False)


class BizTeachingRecord(Base, TimestampMixin, AuditMixin):
    """教学记录表 - 流水记录，支持审计字段但不支持软删除"""
    __tablename__ = "biz_teaching_record"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    teacher_id = Column(BIGINT, index=True, nullable=True)  # 教师ID（整体检查为null）
    check_item = Column(VARCHAR(100), nullable=False)  # 检查项目
    content = Column(TEXT, nullable=True)  # 详细内容
    type = Column(VARCHAR(20), nullable=False)  # bonus/deduction/score
    score = Column(DECIMAL(4, 1), nullable=False)  # 分数
    major_category = Column(VARCHAR(100), nullable=True)  # 大项分类（指标大项）
    category = Column(VARCHAR(100), nullable=True)  # 学科/教研组（如数学、语文）
    indicator_id = Column(Integer, nullable=True)  # 关联的教学指标ID
    description = Column(VARCHAR(500), nullable=True)
    evidence_imgs = Column(JSON, nullable=True)
    evidence_audio = Column(VARCHAR(255), nullable=True)
    gps_lat = Column(DECIMAL(10, 6), nullable=True)
    gps_lng = Column(DECIMAL(10, 6), nullable=True)
    location_name = Column(VARCHAR(100), nullable=True)
    source = Column(VARCHAR(20), default='web', nullable=False)  # web, miniprogram, import
    recorder_id = Column(BIGINT, index=True, nullable=True)
    recorder_name = Column(VARCHAR(50), nullable=True)  # 录入人姓名
    record_time = Column(DateTime, index=True, nullable=False)
    class_id = Column(BIGINT, nullable=True)  # 班级ID(可选)


class BizOverallRecord(Base, TimestampMixin):
    """整体检查记录表"""
    __tablename__ = "biz_overall_record"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    check_type = Column(VARCHAR(20), nullable=False)  # CLASS:班级检查, SUBJECT:学科检查, DORM:宿舍检查
    target_id = Column(BIGINT, nullable=True)  # 目标ID（班级ID/学科组ID等）
    target_name = Column(VARCHAR(100), nullable=True)  # 目标名称
    category = Column(VARCHAR(50), nullable=False)  # 检查类别（大项）
    sub_category = Column(VARCHAR(50), nullable=True)  # 检查小项分类
    item = Column(VARCHAR(100), nullable=False)  # 检查项目
    indicator_id = Column(Integer, nullable=True)  # 关联的指标ID
    score_change = Column(DECIMAL(4, 1), nullable=False)  # 分数变化
    description = Column(VARCHAR(500), nullable=True)  # 详细描述
    evidence_imgs = Column(JSON, nullable=True)  # 证据图片
    gps_lat = Column(DECIMAL(10, 6), nullable=True)  # GPS纬度
    gps_lng = Column(DECIMAL(10, 6), nullable=True)  # GPS经度
    location_name = Column(VARCHAR(100), nullable=True)  # 位置名称
    source = Column(VARCHAR(20), default='miniprogram', nullable=False)  # 来源
    recorder_id = Column(BIGINT, index=True, nullable=True)  # 记录人ID
    record_time = Column(DateTime, index=True, nullable=False)  # 记录时间
