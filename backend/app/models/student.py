from sqlalchemy import Column, Integer, BIGINT, VARCHAR, CHAR, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from app.database import Base
from .base import FullAuditMixin


class BaseStudent(Base, FullAuditMixin):
    """学生档案表 - 被管理对象"""
    __tablename__ = "base_student"

    id = Column(VARCHAR(32), primary_key=True)  # 学号作为主键

    # 基本信息
    name = Column(VARCHAR(50), nullable=False)
    gender = Column(CHAR(1), nullable=True)  # M:男, F:女
    student_no = Column(VARCHAR(30), unique=True, nullable=True, index=True)  # 学籍号（可选，与主键ID相同）

    # 学籍信息
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=False, index=True)  # 所属学校
    class_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=True, index=True)  # 所属班级
    grade_name = Column(VARCHAR(30), nullable=True)  # 年级名称
    status = Column(Integer, default=1, nullable=False, index=True)  # 1:在读, 2:休学, 3:退学, 4:毕业, 5:转出

    # 宿舍信息
    dorm_building = Column(VARCHAR(50), nullable=True)
    dorm_floor = Column(Integer, nullable=True)
    dorm_room = Column(VARCHAR(20), nullable=True)
    bed_no = Column(Integer, nullable=True)
    
    # 分数
    score = Column(DECIMAL(6, 2), nullable=True, default=100)  # 学生分数

    # 关联
    school = relationship("SysOrg", foreign_keys=[school_id], backref="students")
    class_org = relationship("SysOrg", foreign_keys=[class_id], backref="class_students")


# StudentChangeLog 已删除 - 未使用的冗余表
