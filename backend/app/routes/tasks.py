"""
日程任务API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app.models.task import ScheduleTask, TaskNotification
from app.models.user import SysUser
from app.utils.deps import get_current_user

router = APIRouter(prefix="/api/tasks", tags=["日程任务"])


# ==================== Pydantic 模型 ====================

class TaskCreate(BaseModel):
    """创建任务请求"""
    title: str
    task_date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    task_type: str = 'MORAL'
    assignee_type: str = 'self'  # self, dept, user
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    remark: Optional[str] = None


class TaskUpdate(BaseModel):
    """更新任务请求"""
    title: Optional[str] = None
    task_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None
    assignee_type: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    remark: Optional[str] = None


class TaskComplete(BaseModel):
    """完成任务请求"""
    complete_remark: Optional[str] = None


class TaskResponse(BaseModel):
    """任务响应"""
    id: int
    title: str
    task_date: str
    start_time: str
    end_time: str
    task_type: str
    status: str
    assignee_type: str
    assignee_id: Optional[int]
    assignee_name: Optional[str]
    remark: Optional[str]
    creator_id: int
    school_id: Optional[int]
    completed_at: Optional[str]
    completed_by: Optional[int]
    complete_remark: Optional[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ==================== API 路由 ====================

@router.get("", response_model=dict)
async def get_tasks(
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    task_date: Optional[str] = Query(None, description="指定日期 YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="任务状态"),
    task_type: Optional[str] = Query(None, description="任务类型"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """获取任务列表"""
    query = db.query(ScheduleTask).filter(ScheduleTask.deleted_at.is_(None))
    
    # 筛选用户可看到的任务：自己创建的 或 指派给自己的 或 指派给部门的
    query = query.filter(
        or_(
            ScheduleTask.creator_id == current_user.id,
            ScheduleTask.assignee_id == current_user.id,
            and_(
                ScheduleTask.assignee_type == 'dept',
                ScheduleTask.school_id == current_user.org_id
            )
        )
    )
    
    # 日期筛选
    if task_date:
        query = query.filter(ScheduleTask.task_date == task_date)
    elif start_date and end_date:
        query = query.filter(
            ScheduleTask.task_date >= start_date,
            ScheduleTask.task_date <= end_date
        )
    
    # 状态筛选
    if status:
        query = query.filter(ScheduleTask.status == status)
    
    # 类型筛选
    if task_type:
        query = query.filter(ScheduleTask.task_type == task_type)
    
    # 排序
    query = query.order_by(ScheduleTask.task_date, ScheduleTask.start_time)
    
    # 分页
    total = query.count()
    tasks = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "tasks": [_format_task(t) for t in tasks],
            "total": total,
            "page": page,
            "page_size": page_size
        }
    }


@router.get("/calendar", response_model=dict)
async def get_calendar_tasks(
    year: int = Query(..., description="年份"),
    month: int = Query(..., description="月份 1-12"),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """获取日历视图的任务（按日期分组）"""
    # 构建月份日期范围
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"
    
    query = db.query(ScheduleTask).filter(
        ScheduleTask.deleted_at.is_(None),
        ScheduleTask.task_date >= start_date,
        ScheduleTask.task_date < end_date
    )
    
    # 筛选用户可看到的任务
    query = query.filter(
        or_(
            ScheduleTask.creator_id == current_user.id,
            ScheduleTask.assignee_id == current_user.id,
            and_(
                ScheduleTask.assignee_type == 'dept',
                ScheduleTask.school_id == current_user.org_id
            )
        )
    )
    
    tasks = query.order_by(ScheduleTask.task_date, ScheduleTask.start_time).all()
    
    # 按日期分组
    calendar_data = {}
    for task in tasks:
        date_key = str(task.task_date)[:10] if isinstance(task.task_date, datetime) else str(task.task_date)
        if date_key not in calendar_data:
            calendar_data[date_key] = {
                "date": date_key,
                "tasks": [],
                "total": 0,
                "completed": 0
            }
        calendar_data[date_key]["tasks"].append(_format_task(task))
        calendar_data[date_key]["total"] += 1
        if task.status == 'completed':
            calendar_data[date_key]["completed"] += 1
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "calendar": list(calendar_data.values()),
            "year": year,
            "month": month
        }
    }


@router.post("", response_model=dict)
async def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """创建任务"""
    # 解析日期
    try:
        task_date = datetime.strptime(task_data.task_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，应为 YYYY-MM-DD")
    
    # 创建任务
    task = ScheduleTask(
        title=task_data.title,
        task_date=task_date,
        start_time=task_data.start_time,
        end_time=task_data.end_time,
        task_type=task_data.task_type,
        status='pending',
        creator_id=current_user.id,
        school_id=current_user.org_id,
        assignee_type=task_data.assignee_type,
        assignee_id=task_data.assignee_id,
        assignee_name=task_data.assignee_name,
        remark=task_data.remark
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # 创建通知
    if task_data.assignee_type == 'user' and task_data.assignee_id:
        notification = TaskNotification(
            task_id=task.id,
            user_id=task_data.assignee_id,
            notification_type='assigned',
            title=f"新任务指派：{task_data.title}",
            content=f"您被指派了一个新任务，执行时间：{task_data.start_time} - {task_data.end_time}"
        )
        db.add(notification)
        db.commit()
    
    return {
        "code": 0,
        "message": "创建成功",
        "data": _format_task(task)
    }


@router.get("/{task_id}", response_model=dict)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """获取任务详情"""
    task = db.query(ScheduleTask).filter(
        ScheduleTask.id == task_id,
        ScheduleTask.deleted_at.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 检查权限
    if not _can_access(task, current_user):
        raise HTTPException(status_code=403, detail="无权访问此任务")
    
    return {
        "code": 0,
        "message": "success",
        "data": _format_task(task)
    }


@router.put("/{task_id}", response_model=dict)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """更新任务"""
    task = db.query(ScheduleTask).filter(
        ScheduleTask.id == task_id,
        ScheduleTask.deleted_at.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以修改
    if task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有任务创建者可以修改")
    
    # 更新字段
    update_data = task_data.model_dump(exclude_unset=True)
    if 'task_date' in update_data and update_data['task_date']:
        try:
            update_data['task_date'] = datetime.strptime(update_data['task_date'], "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="日期格式错误")
    
    for key, value in update_data.items():
        setattr(task, key, value)
    
    db.commit()
    db.refresh(task)
    
    return {
        "code": 0,
        "message": "更新成功",
        "data": _format_task(task)
    }


@router.post("/{task_id}/complete", response_model=dict)
async def complete_task(
    task_id: int,
    complete_data: TaskComplete,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """完成任务"""
    task = db.query(ScheduleTask).filter(
        ScheduleTask.id == task_id,
        ScheduleTask.deleted_at.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 检查是否可以完成任务
    if not _can_access(task, current_user):
        raise HTTPException(status_code=403, detail="无权操作此任务")
    
    if task.status == 'completed':
        raise HTTPException(status_code=400, detail="任务已完成")
    
    task.status = 'completed'
    task.completed_at = datetime.now()
    task.completed_by = current_user.id
    task.complete_remark = complete_data.complete_remark
    
    db.commit()
    db.refresh(task)
    
    return {
        "code": 0,
        "message": "任务已完成",
        "data": _format_task(task)
    }


@router.post("/{task_id}/start", response_model=dict)
async def start_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """开始执行任务"""
    task = db.query(ScheduleTask).filter(
        ScheduleTask.id == task_id,
        ScheduleTask.deleted_at.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if not _can_access(task, current_user):
        raise HTTPException(status_code=403, detail="无权操作此任务")
    
    if task.status != 'pending':
        raise HTTPException(status_code=400, detail="只有待处理的任务可以开始")
    
    task.status = 'in_progress'
    db.commit()
    
    return {
        "code": 0,
        "message": "任务已开始",
        "data": _format_task(task)
    }


@router.delete("/{task_id}", response_model=dict)
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_user)
):
    """删除任务（软删除）"""
    task = db.query(ScheduleTask).filter(
        ScheduleTask.id == task_id,
        ScheduleTask.deleted_at.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以删除
    if task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有任务创建者可以删除")
    
    task.deleted_at = datetime.now()
    task.deleted_by = current_user.id
    db.commit()
    
    return {
        "code": 0,
        "message": "删除成功"
    }


# ==================== 辅助函数 ====================

def _format_task(task: ScheduleTask) -> dict:
    """格式化任务数据"""
    task_date_str = str(task.task_date)[:10] if isinstance(task.task_date, datetime) else str(task.task_date)
    return {
        "id": task.id,
        "title": task.title,
        "task_date": task_date_str,
        "start_time": task.start_time,
        "end_time": task.end_time,
        "time": f"{task.start_time} - {task.end_time}",
        "task_type": task.task_type,
        "status": task.status,
        "assignee_type": task.assignee_type,
        "assignee_id": task.assignee_id,
        "assignee_name": task.assignee_name,
        "remark": task.remark,
        "creator_id": task.creator_id,
        "school_id": task.school_id,
        "completed_at": str(task.completed_at) if task.completed_at else None,
        "completed_by": task.completed_by,
        "complete_remark": task.complete_remark,
        "created_at": str(task.created_at),
        "updated_at": str(task.updated_at)
    }


def _can_access(task: ScheduleTask, user: SysUser) -> bool:
    """检查用户是否可以访问任务"""
    if task.creator_id == user.id:
        return True
    if task.assignee_id == user.id:
        return True
    if task.assignee_type == 'dept' and task.school_id == user.org_id:
        return True
    return False
