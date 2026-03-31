from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, text
from app.database import get_db
from app.models.user import SysUser
from app.models.role import SysRole, sys_user_role
from app.models.org import SysOrg, BaseTeacher, BaseClassTeacher
from app.utils.auth import get_password_hash, verify_password
from app.utils.deps import get_current_active_user
from app.utils.data_scope import get_user_data_scope
from app.utils.log_helper import log_operation, MODULE_USER, ACTION_CREATE, ACTION_UPDATE, ACTION_DELETE
from io import BytesIO
import csv
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

router = APIRouter()


# Pydantic models for request/response
class UserCreate(BaseModel):
    username: str
    password: str
    real_name: str
    org_id: int = None
    status: int = 1
    role_ids: List[int] = []


class UserUpdate(BaseModel):
    username: str = None
    real_name: str = None
    org_id: int = None
    status: int = None
    role_ids: List[int] = []


class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    real_name: str
    avatar_url: str = None
    org_id: int = None
    status: int
    last_login_time: str = None
    roles: List[dict] = []


@router.get("/")
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get user list with pagination and search (filtered by data scope)
    """
    scope = get_user_data_scope(db, current_user)
    
    query = db.query(SysUser).options(joinedload(SysUser.roles))
    
    # 应用数据权限过滤：用户只能看到同组织或下属组织的用户
    if not scope.has_all:
        # 收集所有可访问的组织ID
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        if accessible_org_ids:
            query = query.filter(SysUser.org_id.in_(accessible_org_ids))
        else:
            # 没有任何组织权限，只能看到自己
            query = query.filter(SysUser.id == current_user.id)

    # Search by keyword (username, real_name)
    if keyword:
        query = query.filter(
            or_(
                SysUser.username.like(f"%{keyword}%"),
                SysUser.real_name.like(f"%{keyword}%")
            )
        )

    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for user in users:
        # Get user roles
        user_roles = []
        for role in user.roles:
            user_roles.append({
                "id": role.id,
                "name": role.name,
                "code": role.code
            })

        # Get organization info if user has one
        org_info = None
        if user.org_id:
            org = db.query(SysOrg).filter(SysOrg.id == user.org_id).first()
            if org:
                org_info = {
                    "id": org.id,
                    "name": org.name
                }

        result.append({
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "avatar_url": user.avatar_url,
            "org_id": user.org_id,
            "org": org_info,
            "status": user.status,
            "last_login_time": user.last_login_time.isoformat() if user.last_login_time else None,
            "roles": user_roles,
            "wechat_openid": user.wechat_openid
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": result
    }


@router.get("/{user_id}")
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Get user by ID (requires access to user's organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    user = db.query(SysUser).options(joinedload(SysUser.roles)).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 检查是否有权限访问该用户
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        if user.org_id not in accessible_org_ids and user.id != current_user.id:
            raise HTTPException(status_code=403, detail="无权限访问该用户信息")

    # Get user roles
    user_roles = []
    for role in user.roles:
        user_roles.append({
            "id": role.id,
            "name": role.name,
            "code": role.code
        })

    # Get organization info if user has one
    org_info = None
    if user.org_id:
        org = db.query(SysOrg).filter(SysOrg.id == user.org_id).first()
        if org:
            org_info = {
                "id": org.id,
                "name": org.name
            }

    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "avatar_url": user.avatar_url,
        "org_id": user.org_id,
        "org": org_info,
        "status": user.status,
        "last_login_time": user.last_login_time.isoformat() if user.last_login_time else None,
        "roles": user_roles
    }


@router.post("/")
async def create_user(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Create a new user (requires access to target organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    # 检查是否有权限在该组织下创建用户
    if user_data.org_id is not None:
        if not scope.has_all:
            accessible_org_ids = set()
            accessible_org_ids.update(scope.school_ids)
            accessible_org_ids.update(scope.grade_ids)
            accessible_org_ids.update(scope.class_ids)
            accessible_org_ids.update(scope.teaching_group_ids)
            accessible_org_ids.update(scope.department_ids)
            
            if user_data.org_id not in accessible_org_ids:
                raise HTTPException(status_code=403, detail="无权限在该组织下创建用户")
    
    # Check if username already exists
    existing_user = db.query(SysUser).filter(SysUser.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="用户名已存在")

    # Hash password (use default password "111111" for new users)
    hashed_password = get_password_hash(user_data.password)

    # Create user
    db_user = SysUser(
        username=user_data.username,
        password=hashed_password,
        real_name=user_data.real_name,
        org_id=user_data.org_id,
        status=user_data.status,
        password_changed=False  # New users need to change password on first login
    )
    db.add(db_user)
    db.flush()  # Get user.id

    # Assign roles
    if user_data.role_ids:
        for role_id in user_data.role_ids:
            role = db.query(SysRole).filter(SysRole.id == role_id).first()
            if role:
                db.execute(
                    "INSERT INTO sys_user_role (user_id, role_id) VALUES (:user_id, :role_id)",
                    {"user_id": db_user.id, "role_id": role_id}
                )

    db.commit()
    db.refresh(db_user)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action=ACTION_CREATE,
        description=f"新增用户: {db_user.real_name}({db_user.username})",
        status="成功",
        request=request
    )

    return {
        "id": db_user.id,
        "username": db_user.username,
        "real_name": db_user.real_name,
        "message": "User created successfully"
    }


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update user information (requires access to user's organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 检查是否有权限修改该用户
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        if user.org_id not in accessible_org_ids and user.id != current_user.id:
            raise HTTPException(status_code=403, detail="无权限修改该用户信息")
        
        # 如果要修改组织，检查是否有权限将用户移动到新组织
        if user_data.org_id is not None and user_data.org_id != user.org_id:
            if user_data.org_id not in accessible_org_ids:
                raise HTTPException(status_code=403, detail="无权限将用户移动到该组织")

    # Check if username is being changed and already exists
    if user_data.username and user_data.username != user.username:
        existing = db.query(SysUser).filter(SysUser.username == user_data.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="用户名已存在")

    # Update fields
    if user_data.username is not None:
        user.username = user_data.username
    if user_data.real_name is not None:
        user.real_name = user_data.real_name
    if user_data.org_id is not None:
        user.org_id = user_data.org_id
    if user_data.status is not None:
        user.status = user_data.status

    # Update roles if provided
    if user_data.role_ids is not None:
        # Delete existing roles
        db.execute("DELETE FROM sys_user_role WHERE user_id = :user_id", {"user_id": user_id})

        # Add new roles
        for role_id in user_data.role_ids:
            role = db.query(SysRole).filter(SysRole.id == role_id).first()
            if role:
                db.execute(
                    "INSERT INTO sys_user_role (user_id, role_id) VALUES (:user_id, :role_id)",
                    {"user_id": user.id, "role_id": role_id}
                )

    db.commit()
    db.refresh(user)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action=ACTION_UPDATE,
        description=f"更新用户: {user.real_name}({user.username})",
        status="成功",
        request=request
    )

    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "message": "User updated successfully"
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Delete user (requires access to user's organization)
    """
    scope = get_user_data_scope(db, current_user)
    
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if trying to delete self
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    
    # 检查是否有权限删除该用户
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        if user.org_id not in accessible_org_ids:
            raise HTTPException(status_code=403, detail="无权限删除该用户")

    # 保存用户信息用于日志
    user_info = f"{user.real_name}({user.username})"

    # 检查是否有关联的教师档案
    teacher = db.query(BaseTeacher).filter(BaseTeacher.user_id == user_id).first()
    if teacher:
        # 删除教师的任课班级关联
        db.query(BaseClassTeacher).filter(BaseClassTeacher.teacher_id == teacher.id).delete()
        # 删除教师档案
        db.delete(teacher)

    # Delete user roles first
    db.execute("DELETE FROM sys_user_role WHERE user_id = :user_id", {"user_id": user_id})

    # Delete user
    db.delete(user)
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action=ACTION_DELETE,
        description=f"删除用户: {user_info}",
        status="成功",
        request=request
    )

    return {"message": "User deleted successfully"}


@router.put("/{user_id}/password")
async def update_password(
    user_id: int,
    password_data: PasswordUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Update user password
    """
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify old password (skip verification if changing default password)
    if user.password_changed:
        if not verify_password(password_data.old_password, user.password):
            raise HTTPException(status_code=400, detail="Incorrect old password")
    else:
        # For first-time password change, verify the default password "111111"
        if not verify_password("111111", user.password):
            raise HTTPException(status_code=400, detail="Incorrect default password")

    # Update password and mark as changed
    user.password = get_password_hash(password_data.new_password)
    user.password_changed = True
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action=ACTION_UPDATE,
        description=f"修改密码: {user.real_name}({user.username})",
        status="成功",
        request=request
    )

    return {"message": "Password updated successfully"}


@router.put("/{user_id}/status")
async def update_user_status(
    user_id: int,
    status: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
) -> Any:
    """
    Enable or disable user
    """
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if trying to disable self
    if user_id == current_user.id and status == 0:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")

    user.status = status
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action="启用" if status == 1 else "禁用",
        description=f"{'启用' if status == 1 else '禁用'}用户: {user.real_name}({user.username})",
        status="成功",
        request=request
    )

    return {
        "id": user.id,
        "username": user.username,
        "status": status,
        "message": "User status updated successfully"
    }


# ============== 用户管理优化功能 ==============

class UserTransfer(BaseModel):
    """用户调动请求"""
    target_org_id: int
    keep_roles: bool = True  # 是否保留原有角色
    new_role_ids: List[int] = []  # 新角色列表（如果不保留）


class UserBatchCreate(BaseModel):
    """批量创建用户"""
    users: List[dict]  # [{username, real_name, org_id, role_ids, password}]


@router.get("/template/download")
async def download_import_template(
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    下载用户批量导入模板
    """
    # 获取组织列表
    orgs = db.query(SysOrg).order_by(SysOrg.id).all()
    org_list = [(org.id, org.name) for org in orgs]
    
    # 获取角色列表
    roles = db.query(SysRole).order_by(SysRole.id).all()
    role_list = [(role.id, role.name) for role in roles]
    
    # 创建工作簿
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "用户导入模板"
    
    # 设置表头
    headers = ["账号*", "姓名*", "所属组织", "角色(多个用逗号分隔)", "初始密码", "状态"]
    header_fills = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fills
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # 添加示例数据
    sample_data = [
        ["zhangsan", "张三", org_list[0][1] if org_list else "", role_list[0][1] if role_list else "", "111111", "启用"],
        ["lisi", "李四", org_list[0][1] if org_list else "", "", "111111", "启用"],
    ]
    for row_idx, row_data in enumerate(sample_data, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)
    
    # 添加说明sheet
    ws_info = wb.create_sheet("填写说明")
    instructions = [
        ["字段说明"],
        ["账号*: 必填，登录账号，不能重复"],
        ["姓名*: 必填，用户真实姓名"],
        ["所属组织: 组织名称，请参考【组织列表】sheet，留空则不分配组织"],
        ["角色: 角色名称列表，多个用逗号分隔，请参考【角色列表】sheet"],
        ["初始密码: 默认为111111，留空则使用默认密码"],
        ["状态: 启用/禁用，默认为启用"],
        [""],
        ["注意: 填写组织和角色时，请确保名称与列表中完全一致"],
    ]
    for row_idx, row_data in enumerate(instructions, 1):
        ws_info.cell(row=row_idx, column=1, value=row_data[0] if row_data else "")
    
    # 添加组织列表sheet
    ws_org = wb.create_sheet("组织列表")
    ws_org.cell(row=1, column=1, value="组织ID")
    ws_org.cell(row=1, column=2, value="组织名称")
    ws_org.cell(row=1, column=1).font = Font(bold=True)
    ws_org.cell(row=1, column=2).font = Font(bold=True)
    for idx, (org_id, org_name) in enumerate(org_list, 2):
        ws_org.cell(row=idx, column=1, value=org_id)
        ws_org.cell(row=idx, column=2, value=org_name)
    ws_org.column_dimensions['A'].width = 10
    ws_org.column_dimensions['B'].width = 40
    
    # 添加角色列表sheet
    ws_role = wb.create_sheet("角色列表")
    ws_role.cell(row=1, column=1, value="角色ID")
    ws_role.cell(row=1, column=2, value="角色名称")
    ws_role.cell(row=1, column=1).font = Font(bold=True)
    ws_role.cell(row=1, column=2).font = Font(bold=True)
    for idx, (role_id, role_name) in enumerate(role_list, 2):
        ws_role.cell(row=idx, column=1, value=role_id)
        ws_role.cell(row=idx, column=2, value=role_name)
    ws_role.column_dimensions['A'].width = 10
    ws_role.column_dimensions['B'].width = 30
    
    # 调整列宽
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 15
    ws.column_dimensions['C'].width = 30
    ws.column_dimensions['D'].width = 25
    ws.column_dimensions['E'].width = 15
    ws.column_dimensions['F'].width = 10
    
    # 调整说明sheet列宽
    ws_info.column_dimensions['A'].width = 60
    
    # 保存到内存
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    # 使用 iter 参数返回 BytesIO 内容
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=user_import_template.xlsx",
            "Content-Length": str(len(output.getvalue()))
        }
    )


@router.post("/import")
async def import_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    批量导入用户
    支持Excel(.xlsx, .xls)和CSV格式
    """
    scope = get_user_data_scope(db, current_user)
    
    # 读取文件内容
    content = await file.read()
    filename = file.filename.lower()
    
    # 解析文件
    users_data = []
    if filename.endswith('.csv'):
        # 解析CSV
        content_str = content.decode('utf-8-sig')
        reader = csv.reader(content_str.splitlines())
        rows = list(reader)
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="文件内容为空或格式错误")
        headers = [h.strip() for h in rows[0]]
        for row in rows[1:]:
            if row and any(cell.strip() for cell in row):
                users_data.append(dict(zip(headers, row)))
    else:
        # 解析Excel
        wb = openpyxl.load_workbook(BytesIO(content))
        ws = wb.active
        headers = [cell.value for cell in ws[1] if cell.value]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and any(cell for cell in row):
                users_data.append(dict(zip(headers, row)))
    
    if not users_data:
        raise HTTPException(status_code=400, detail="未找到有效的用户数据")
    
    # 校验和导入
    success_count = 0
    errors = []
    imported_users = []
    
    for row_idx, user_data in enumerate(users_data, start=2):  # 从第2行开始（第1行是表头）
        try:
            # 获取必填字段
            username = str(user_data.get('账号*', '') or user_data.get('username', '')).strip()
            real_name = str(user_data.get('姓名*', '') or user_data.get('real_name', '')).strip()
            
            if not username or not real_name:
                errors.append({"row": row_idx, "message": "账号和姓名为必填项"})
                continue
            
            # 检查账号是否已存在
            existing = db.query(SysUser).filter(SysUser.username == username).first()
            if existing:
                errors.append({"row": row_idx, "message": f"账号 {username} 已存在"})
                continue
            
            # 获取组织ID（支持名称或ID）
            org_id = None
            org_value = user_data.get('所属组织') or user_data.get('所属组织ID') or user_data.get('org_id') or user_data.get('org_name')
            if org_value:
                org_value = str(org_value).strip()
                # 尝试按名称查找
                org = db.query(SysOrg).filter(SysOrg.name == org_value).first()
                if org:
                    org_id = org.id
                else:
                    # 尝试按ID查找（兼容旧格式）
                    try:
                        org_id = int(org_value)
                        org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
                        if not org:
                            errors.append({"row": row_idx, "message": f"组织 '{org_value}' 不存在"})
                            continue
                    except ValueError:
                        errors.append({"row": row_idx, "message": f"组织 '{org_value}' 不存在"})
                        continue
                
                # 检查权限
                if org_id and not scope.has_all:
                    accessible_org_ids = set()
                    accessible_org_ids.update(scope.school_ids)
                    accessible_org_ids.update(scope.grade_ids)
                    accessible_org_ids.update(scope.class_ids)
                    accessible_org_ids.update(scope.teaching_group_ids)
                    accessible_org_ids.update(scope.department_ids)
                    if org_id not in accessible_org_ids:
                        errors.append({"row": row_idx, "message": f"无权限在组织 '{org_value}' 下创建用户"})
                        continue
            
            # 获取角色（支持名称或ID）
            role_ids = []
            role_str = user_data.get('角色(多个用逗号分隔)') or user_data.get('角色ID(多个用逗号分隔)') or user_data.get('role_ids') or user_data.get('roles') or ''
            if role_str:
                role_names = [r.strip() for r in str(role_str).split(',') if r.strip()]
                for role_name in role_names:
                    # 尝试按名称查找
                    role = db.query(SysRole).filter(SysRole.name == role_name).first()
                    if role:
                        role_ids.append(role.id)
                    else:
                        # 尝试按ID查找（兼容旧格式）
                        try:
                            role_id = int(role_name)
                            role = db.query(SysRole).filter(SysRole.id == role_id).first()
                            if role:
                                role_ids.append(role.id)
                            else:
                                errors.append({"row": row_idx, "message": f"角色 '{role_name}' 不存在"})
                        except ValueError:
                            errors.append({"row": row_idx, "message": f"角色 '{role_name}' 不存在"})
            
            if errors and errors[-1].get("row") == row_idx:
                continue
            
            # 获取密码和状态
            password = str(user_data.get('初始密码', '') or user_data.get('password', '')).strip() or '111111'
            status_str = str(user_data.get('状态', '1') or user_data.get('status', '1')).strip()
            status = 1 if status_str in ['1', '启用', 'active'] else 0
            
            # 创建用户
            db_user = SysUser(
                username=username,
                password=get_password_hash(password),
                real_name=real_name,
                org_id=org_id,
                status=status,
                password_changed=False
            )
            db.add(db_user)
            db.flush()
            
            # 分配角色
            if role_ids:
                for role_id in role_ids:
                    db.execute(
                        sys_user_role.insert().values(user_id=db_user.id, role_id=role_id)
                    )
            
            imported_users.append({
                "id": db_user.id,
                "username": username,
                "real_name": real_name
            })
            success_count += 1
            
        except Exception as e:
            errors.append({"row": row_idx, "message": str(e)})
    
    db.commit()
    
    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action="批量导入",
        description=f"批量导入用户: 成功{success_count}条, 失败{len(errors)}条",
        status="成功" if success_count > 0 else "失败",
        request=None
    )
    
    return {
        "total": len(users_data),
        "success": success_count,
        "failed": len(errors),
        "errors": errors,
        "imported_users": imported_users
    }


@router.post("/{user_id}/transfer")
async def transfer_user(
    user_id: int,
    transfer_data: UserTransfer,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    用户调动 - 将用户移动到新的组织
    """
    scope = get_user_data_scope(db, current_user)
    
    # 获取用户
    user = db.query(SysUser).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查权限
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        # 检查是否有权限操作该用户
        if user.org_id not in accessible_org_ids and user.id != current_user.id:
            raise HTTPException(status_code=403, detail="无权限调动该用户")
        
        # 检查是否有权限调动到目标组织
        if transfer_data.target_org_id not in accessible_org_ids:
            raise HTTPException(status_code=403, detail="无权限调动到目标组织")
    
    # 验证目标组织
    target_org = db.query(SysOrg).filter(SysOrg.id == transfer_data.target_org_id).first()
    if not target_org:
        raise HTTPException(status_code=404, detail="目标组织不存在")
    
    # 记录原组织信息
    old_org_id = user.org_id
    old_org_name = ""
    if old_org_id:
        old_org = db.query(SysOrg).filter(SysOrg.id == old_org_id).first()
        if old_org:
            old_org_name = old_org.name
    
    # 更新用户组织
    user.org_id = transfer_data.target_org_id
    
    # 处理角色
    if not transfer_data.keep_roles and transfer_data.new_role_ids:
        # 删除原有角色
        db.execute(text("DELETE FROM sys_user_role WHERE user_id = :user_id"), {"user_id": user_id})
        
        # 分配新角色
        for role_id in transfer_data.new_role_ids:
            role = db.query(SysRole).filter(SysRole.id == role_id).first()
            if role:
                db.execute(
                    sys_user_role.insert().values(user_id=user_id, role_id=role_id)
                )
    
    db.commit()
    
    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action="用户调动",
        description=f"用户调动: {user.real_name} 从 {old_org_name} 调动到 {target_org.name}",
        status="成功",
        request=request
    )
    
    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "old_org_id": old_org_id,
        "new_org_id": transfer_data.target_org_id,
        "message": "用户调动成功"
    }


@router.get("/{user_id}/permission-preview")
async def get_user_permission_preview(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    获取用户权限预览 - 显示用户可访问的数据范围
    """
    # 获取用户
    user = db.query(SysUser).options(joinedload(SysUser.roles)).filter(SysUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查权限
    scope = get_user_data_scope(db, current_user)
    if not scope.has_all:
        accessible_org_ids = set()
        accessible_org_ids.update(scope.school_ids)
        accessible_org_ids.update(scope.grade_ids)
        accessible_org_ids.update(scope.class_ids)
        accessible_org_ids.update(scope.teaching_group_ids)
        accessible_org_ids.update(scope.department_ids)
        
        if user.org_id not in accessible_org_ids and user.id != current_user.id:
            raise HTTPException(status_code=403, detail="无权限查看该用户权限")
    
    # 获取用户的角色和数据范围
    roles_info = []
    for role in user.roles:
        roles_info.append({
            "id": role.id,
            "name": role.name,
            "code": role.code,
            "data_scope": role.data_scope
        })
    
    # 获取用户可访问的组织
    user_scope = get_user_data_scope(db, user)
    
    accessible_orgs = []
    if user_scope.has_all:
        accessible_orgs.append({"id": 0, "name": "全部数据", "type": "all"})
    else:
        # 获取可访问的学校
        for school_id in user_scope.school_ids:
            org = db.query(SysOrg).filter(SysOrg.id == school_id).first()
            if org:
                accessible_orgs.append({
                    "id": org.id,
                    "name": org.name,
                    "type": org.type
                })
        
        # 获取可访问的年级
        for grade_id in user_scope.grade_ids:
            org = db.query(SysOrg).filter(SysOrg.id == grade_id).first()
            if org:
                accessible_orgs.append({
                    "id": org.id,
                    "name": org.name,
                    "type": org.type
                })
        
        # 获取可访问的班级
        for class_id in user_scope.class_ids:
            org = db.query(SysOrg).filter(SysOrg.id == class_id).first()
            if org:
                accessible_orgs.append({
                    "id": org.id,
                    "name": org.name,
                    "type": org.type
                })
    
    return {
        "user_id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "org_id": user.org_id,
        "roles": roles_info,
        "data_scope": {
            "has_all": user_scope.has_all,
            "school_count": len(user_scope.school_ids),
            "grade_count": len(user_scope.grade_ids),
            "class_count": len(user_scope.class_ids)
        },
        "accessible_orgs": accessible_orgs
    }


@router.post("/batch-status")
async def batch_update_user_status(
    user_ids: List[int],
    status: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: SysUser = Depends(get_current_active_user)
):
    """
    批量启用/禁用用户
    """
    if not user_ids:
        raise HTTPException(status_code=400, detail="用户ID列表不能为空")
    
    # 不能禁用自己
    if status == 0 and current_user.id in user_ids:
        raise HTTPException(status_code=400, detail="不能禁用自己")
    
    scope = get_user_data_scope(db, current_user)
    
    updated_count = 0
    errors = []
    
    for user_id in user_ids:
        user = db.query(SysUser).filter(SysUser.id == user_id).first()
        if not user:
            errors.append({"user_id": user_id, "message": "用户不存在"})
            continue
        
        # 检查权限
        if not scope.has_all:
            accessible_org_ids = set()
            accessible_org_ids.update(scope.school_ids)
            accessible_org_ids.update(scope.grade_ids)
            accessible_org_ids.update(scope.class_ids)
            accessible_org_ids.update(scope.teaching_group_ids)
            accessible_org_ids.update(scope.department_ids)
            
            if user.org_id not in accessible_org_ids:
                errors.append({"user_id": user_id, "message": "无权限操作该用户"})
                continue
        
        user.status = status
        updated_count += 1
    
    db.commit()
    
    # 记录操作日志
    action = "批量启用" if status == 1 else "批量禁用"
    log_operation(
        db=db,
        user=current_user,
        module=MODULE_USER,
        action=action,
        description=f"{action}用户: {updated_count}人",
        status="成功",
        request=request
    )
    
    return {
        "total": len(user_ids),
        "success": updated_count,
        "failed": len(errors),
        "errors": errors
    }
