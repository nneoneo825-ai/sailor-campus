from sqlalchemy import Column, BIGINT, VARCHAR, TEXT, DATETIME, ForeignKey, SmallInteger
from sqlalchemy.orm import relationship
from app.database import Base
from .base import TimestampMixin, SoftDeleteMixin


class ScheduleTask(Base, TimestampMixin, SoftDeleteMixin):
    """日程任务表"""
    __tablename__ = "schedule_task"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    
    # 任务基本信息
    title = Column(VARCHAR(200), nullable=False)  # 任务名称
    task_date = Column(DATETIME, nullable=False, index=True)  # 执行日期
    start_time = Column(VARCHAR(10), nullable=False)  # 开始时间 HH:MM
    end_time = Column(VARCHAR(10), nullable=False)  # 结束时间 HH:MM
    
    # 任务类型: MORAL-德育检查, TEACHING-教学评价, DORM-宿舍检查, GENERAL-整体检查
    task_type = Column(VARCHAR(20), nullable=False, default='MORAL', index=True)
    
    # 状态: pending-待处理, in_progress-进行中, completed-已完成, cancelled-已取消
    status = Column(VARCHAR(20), nullable=False, default='pending', index=True)
    
    # 关联信息
    creator_id = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False, index=True)  # 创建人
    school_id = Column(BIGINT, ForeignKey('sys_org.id'), nullable=True, index=True)  # 所属学校
    
    # 指派信息
    assignee_type = Column(VARCHAR(20), nullable=False, default='self')  # self-本人, dept-部门, user-指定用户
    assignee_id = Column(BIGINT, ForeignKey('sys_user.id'), nullable=True)  # 指派用户ID (assignee_type为user时)
    assignee_name = Column(VARCHAR(100), nullable=True)  # 指派人/部门名称
    
    # 备注
    remark = Column(TEXT, nullable=True)
    
    # 完成信息
    completed_at = Column(DATETIME, nullable=True)
    completed_by = Column(BIGINT, ForeignKey('sys_user.id'), nullable=True)
    complete_remark = Column(TEXT, nullable=True)
    
    # 关联
    creator = relationship("SysUser", foreign_keys=[creator_id], backref="created_tasks")
    school = relationship("SysOrg", backref="schedule_tasks")


class TaskNotification(Base, TimestampMixin, SoftDeleteMixin):
    """任务通知表"""
    __tablename__ = "task_notification"

    id = Column(BIGINT, primary_key=True, autoincrement=True, index=True)
    
    task_id = Column(BIGINT, ForeignKey('schedule_task.id'), nullable=False, index=True)
    user_id = Column(BIGINT, ForeignKey('sys_user.id'), nullable=False, index=True)
    
    # 通知类型: created-任务创建, assigned-被指派, reminder-提醒, completed-完成
    notification_type = Column(VARCHAR(20), nullable=False, default='created')
    
    # 通知内容
    title = Column(VARCHAR(200), nullable=False)
    content = Column(TEXT, nullable=True)
    
    # 状态
    is_read = Column(SmallInteger, default=0, nullable=False)  # 0:未读, 1:已读
    read_at = Column(DATETIME, nullable=True)
    
    # 关联
    task = relationship("ScheduleTask", backref="notifications")
    user = relationship("SysUser", backref="task_notifications")
