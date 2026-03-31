from sqlalchemy import Column, Integer, BIGINT, VARCHAR, JSON, DATE, CHAR, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin, FullAuditMixin, SoftDeleteMixin


class SysOrg(Base, TimestampMixin, SoftDeleteMixin):
    """组织机构表 - 支持软删除"""
    __tablename__ = "sys_org"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    parent_id = Column(BIGINT, index=True, default=0, nullable=False)
    name = Column(VARCHAR(100), nullable=False)
    type = Column(VARCHAR(20), nullable=False)  # group, school, dept, grade, class
    
    # 学校特有字段
    school_type = Column(VARCHAR(20), nullable=True)  # 民办, 公办
    address = Column(VARCHAR(255), nullable=True)
    principal_name = Column(VARCHAR(50), nullable=True)
    contact_phone = Column(VARCHAR(20), nullable=True)
    stages = Column(VARCHAR(50), nullable=True)  # 办学学段
    
    sort_order = Column(Integer, default=0, nullable=False)
    tree_path = Column(VARCHAR(255), index=True, nullable=True)

    # 关联的指标
    moral_indicators = relationship("CfgMoralIndicator", back_populates="org")
    teaching_indicators = relationship("CfgTeachingIndicator", back_populates="org")


class BaseClassInfo(Base, FullAuditMixin):
    """班级扩展表 - 使用完整审计支持"""
    __tablename__ = "base_class_info"

    org_id = Column(BIGINT, ForeignKey('sys_org.id'), primary_key=True, index=True)
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    grade_name = Column(VARCHAR(30), nullable=True)  # 年级名称
    head_teacher_id = Column(BIGINT, index=True, nullable=True)  # 班主任ID（关联BaseTeacher）
    grade_year = Column(Integer, nullable=True)  # 入学年份
    stage = Column(VARCHAR(20), nullable=True)  # 学段 (小学, 初中, 高中)
    student_count = Column(Integer, default=0, nullable=False)  # 学生人数
    graduation_status = Column(Integer, default=0, nullable=False)  # 0:在读, 1:已毕业
    seating_chart = Column(JSON, nullable=True)
    all_students = Column(JSON, nullable=True)  # 全班学生姓名列表

    # 关联
    org = relationship("SysOrg", foreign_keys=[org_id], backref="class_info")
    school = relationship("SysOrg", foreign_keys=[school_id], backref="class_infos")


class BaseTeacher(Base, FullAuditMixin):
    """教师档案表 - 可关联系统用户"""
    __tablename__ = "base_teacher"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    user_id = Column(BIGINT, ForeignKey('sys_user.id'), nullable=True, index=True)  # 关联系统用户
    
    # 基本信息
    name = Column(VARCHAR(50), nullable=False)
    gender = Column(CHAR(1), nullable=True)  # M:男, F:女
    phone = Column(VARCHAR(20), nullable=True)  # 联系电话

    # 工作信息
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)  # 所属学校

    # 任教信息
    subject = Column(VARCHAR(50), nullable=True, index=True)  # 任教学科
    grades = Column(VARCHAR(100), nullable=True)  # 任教年级，逗号分隔
    positions = Column(VARCHAR(100), nullable=True)  # 岗位

    # 关联
    user = relationship("SysUser", backref="teacher_profile")
    school = relationship("SysOrg", backref="teachers")


class BaseClassTeacher(Base, TimestampMixin):
    """班级教师任课表 - 记录班级与教师的任课关系"""
    __tablename__ = "base_class_teacher"

    id = Column(BIGINT, primary_key=True, autoincrement=True)
    class_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)
    teacher_id = Column(BIGINT, ForeignKey('base_teacher.id'), nullable=False, index=True)  # 关联教师档案
    subject = Column(VARCHAR(50), nullable=False)  # 任教科目
    is_head_teacher = Column(Integer, default=0, nullable=False)  # 是否班主任 (0:否, 1:是)
    start_date = Column(DATE, nullable=True)  # 开始任教日期
    end_date = Column(DATE, nullable=True)  # 结束任教日期
    status = Column(Integer, default=1, nullable=False)  # 1:正常, 0:结束

    # 关联
    cls = relationship("SysOrg", backref="class_teachers")
    teacher = relationship("BaseTeacher", backref="teaching_classes")


# TeacherChangeLog 已删除 - 未使用的冗余表
