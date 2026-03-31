from app.database import Base
# 注意：导入顺序很重要，避免循环引用
# 先导入基础模型
from .role import SysRole, sys_user_role, SysPermission
from .org import SysOrg, BaseClassInfo, BaseTeacher, BaseClassTeacher
from .student import BaseStudent
from .moral import CfgMoralIndicator, BizMoralRecord, CfgTeachingIndicator, BizTeachingRecord, BizOverallRecord
from .task import ScheduleTask, TaskNotification
# 最后导入相互引用的模型（user引用log，log引用user）
from .user import SysUser
from .log import SysOperationLog

__all__ = [
    "Base",
    "SysUser",
    "SysRole",
    "sys_user_role",
    "SysOrg",
    "BaseClassInfo",
    "BaseTeacher",
    "BaseClassTeacher",
    "BaseStudent",
    "CfgMoralIndicator",
    "CfgTeachingIndicator",
    "BizMoralRecord",
    "BizTeachingRecord",
    "BizOverallRecord",
    "SysOperationLog",
    "ScheduleTask",
    "TaskNotification"
]
