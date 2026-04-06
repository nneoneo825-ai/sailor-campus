from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.models.role import SysRole, sys_role_org
from app.models.org import SysOrg
from app.utils.deps import get_current_active_user, require_permission, is_builtin_admin, get_current_user_with_scope
from app.utils.log_helper import log_operation, MODULE_USER, ACTION_CREATE, ACTION_UPDATE, ACTION_DELETE
from app.models.user import SysUser

router = APIRouter()


# Pydantic models for request/response
class RoleCreate(BaseModel):
    code: str
    name: str
    data_scope: int = 2  # 1:全部, 2:本校, 3:本年级, 4:本班, 5:仅本人, 6:自定义
    description: str = None
    permission_ids: List[int] = []  # 功能权限ID列表
    org_ids: List[int] = []  # 数据权限组织ID列表（当data_scope=6时使用）


class RoleUpdate(BaseModel):
    code: str = None
    name: str = None
    data_scope: int = None
    description: str = None
    permission_ids: List[int] = None
    org_ids: List[int] = None


@router.get("/list")
async def get_roles_simple(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:user"))
) -> Any:
    """
    获取角色简要列表（不分页），用于用户管理中的角色分配下拉选择
    仅需 system:user 权限
    """
    roles = db.query(SysRole).order_by(SysRole.id).all()
    return {
        "roles": [
            {
                "id": role.id,
                "code": role.code,
                "name": role.name,
            }
            for role in roles
        ]
    }


@router.get("/")
async def get_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Get role list with pagination and search
    """
    query = db.query(SysRole)

    # Search by keyword (code, name)
    if keyword:
        safe_keyword = keyword.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        query = query.filter(
            (SysRole.code.like(f"%{safe_keyword}%", escape='\\')) |
            (SysRole.name.like(f"%{safe_keyword}%", escape='\\'))
        )

    total = query.count()
    roles = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "roles": [
            {
                "id": role.id,
                "code": role.code,
                "name": role.name,
                "data_scope": role.data_scope,
                "data_scope_name": get_data_scope_name(role.data_scope)
            }
            for role in roles
        ]
    }


@router.get("/{role_id}")
async def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Get role by ID
    """
    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    return {
        "id": role.id,
        "code": role.code,
        "name": role.name,
        "data_scope": role.data_scope,
        "data_scope_name": get_data_scope_name(role.data_scope)
    }


@router.post("/")
async def create_role(
    role_data: RoleCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Create a new role with permissions
    仅管理员（has_all）可创建角色
    """
    # 权限校验：仅内置管理员或拥有全部数据权限的用户可创建角色
    if not is_builtin_admin(current_user):
        from app.utils.data_scope import get_user_data_scope
        scope = get_user_data_scope(db, current_user)
        if not scope.has_all:
            raise HTTPException(status_code=403, detail="仅管理员可创建角色")

    # Check if code already exists
    existing_role = db.query(SysRole).filter(SysRole.code == role_data.code).first()
    if existing_role:
        raise HTTPException(status_code=400, detail="Role code already exists")

    # Create role
    db_role = SysRole(
        code=role_data.code,
        name=role_data.name,
        data_scope=role_data.data_scope,
        description=role_data.description
    )
    db.add(db_role)
    db.flush()  # 获取ID但不提交

    # 配置功能权限
    if role_data.permission_ids:
        from app.models.role import SysPermission
        for perm_id in role_data.permission_ids:
            permission = db.query(SysPermission).filter(SysPermission.id == perm_id).first()
            if permission:
                db_role.permissions.append(permission)

    # 配置数据权限（自定义组织）
    if role_data.data_scope == 6 and role_data.org_ids:
        # data_scope=6 表示自定义数据范围
        for org_id in role_data.org_ids:
            org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
            if org:
                db.execute(
                    text("INSERT INTO sys_role_org (role_id, org_id) VALUES (:role_id, :org_id)"),
                    {"role_id": db_role.id, "org_id": org_id}
                )

    db.commit()
    db.refresh(db_role)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module="角色权限",
        action=ACTION_CREATE,
        description=f"新增角色: {db_role.name}({db_role.code}), 功能权限{len(role_data.permission_ids)}项, 数据范围:{get_data_scope_name(role_data.data_scope)}",
        status="成功",
        request=request
    )

    return {
        "id": db_role.id,
        "code": db_role.code,
        "name": db_role.name,
        "message": "Role created successfully"
    }


@router.put("/{role_id}")
async def update_role(
    role_id: int,
    role_data: RoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Update role information including permissions
    仅管理员（has_all）可修改角色
    """
    # 权限校验
    if not is_builtin_admin(current_user):
        from app.utils.data_scope import get_user_data_scope
        scope = get_user_data_scope(db, current_user)
        if not scope.has_all:
            raise HTTPException(status_code=403, detail="仅管理员可修改角色")

    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Check if code is being changed and already exists
    if role_data.code and role_data.code != role.code:
        existing = db.query(SysRole).filter(SysRole.code == role_data.code).first()
        if existing:
            raise HTTPException(status_code=400, detail="Role code already exists")

    # Update fields
    if role_data.code is not None:
        role.code = role_data.code
    if role_data.name is not None:
        role.name = role_data.name
    if role_data.data_scope is not None:
        role.data_scope = role_data.data_scope
    if role_data.description is not None:
        role.description = role_data.description

    # Update permissions
    if role_data.permission_ids is not None:
        # Clear existing permissions
        db.execute(
            text("DELETE FROM sys_role_permission WHERE role_id = :role_id"),
            {"role_id": role_id}
        )
        # Add new permissions
        from app.models.role import SysPermission
        for perm_id in role_data.permission_ids:
            permission = db.query(SysPermission).filter(SysPermission.id == perm_id).first()
            if permission:
                db.execute(
                    text("INSERT INTO sys_role_permission (role_id, permission_id) VALUES (:role_id, :perm_id)"),
                    {"role_id": role_id, "perm_id": perm_id}
                )

    # Update data scope orgs (自定义数据权限)
    if role_data.org_ids is not None:
        # Clear existing org associations
        db.execute(
            text("DELETE FROM sys_role_org WHERE role_id = :role_id"),
            {"role_id": role_id}
        )
        # Add new org associations
        for org_id in role_data.org_ids:
            org = db.query(SysOrg).filter(SysOrg.id == org_id).first()
            if org:
                db.execute(
                    text("INSERT INTO sys_role_org (role_id, org_id) VALUES (:role_id, :org_id)"),
                    {"role_id": role_id, "org_id": org_id}
                )

    db.commit()
    db.refresh(role)

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module="角色权限",
        action=ACTION_UPDATE,
        description=f"更新角色: {role.name}({role.code})",
        status="成功",
        request=request
    )

    return {
        "id": role.id,
        "code": role.code,
        "name": role.name,
        "message": "Role updated successfully"
    }


@router.delete("/{role_id}")
async def delete_role(
    role_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Delete role
    仅管理员（has_all）可删除角色
    """
    # 权限校验
    if not is_builtin_admin(current_user):
        from app.utils.data_scope import get_user_data_scope
        scope = get_user_data_scope(db, current_user)
        if not scope.has_all:
            raise HTTPException(status_code=403, detail="仅管理员可删除角色")

    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Check if role has users
    from sqlalchemy import text
    user_count = db.execute(
        text("SELECT COUNT(*) FROM sys_user_role WHERE role_id = :role_id"),
        {"role_id": role_id}
    ).scalar()

    if user_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role with {user_count} users. Please reassign users first."
        )

    # 保存角色信息用于日志
    role_info = f"{role.name}({role.code})"

    # Delete role
    db.delete(role)
    db.commit()

    # 记录操作日志
    log_operation(
        db=db,
        user=current_user,
        module="角色权限",
        action=ACTION_DELETE,
        description=f"删除角色: {role_info}",
        status="成功",
        request=request
    )

    return {"message": "Role deleted successfully"}


@router.get("/{role_id}/users")
async def get_role_users(
    role_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Get users assigned to this role
    """
    # Check if role exists
    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    from app.models.user import SysUser
    from sqlalchemy import text

    # Get user IDs with this role
    user_ids = db.execute(
        text("SELECT user_id FROM sys_user_role WHERE role_id = :role_id"),
        {"role_id": role_id}
    ).fetchall()
    user_ids = [row[0] for row in user_ids]

    if not user_ids:
        return {
            "total": 0,
            "page": page,
            "page_size": page_size,
            "users": []
        }

    # Get users
    query = db.query(SysUser).filter(SysUser.id.in_(user_ids))
    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "real_name": user.real_name,
                "avatar_url": user.avatar_url,
                "org_id": user.org_id,
                "status": user.status
            }
            for user in users
        ]
    }


def get_data_scope_name(data_scope: int) -> str:
    """
    Get data scope name by value
    """
    scope_map = {
        1: "全部",
        2: "本校",
        3: "本年级",
        4: "本班",
        5: "仅本人",
        6: "自定义"
    }
    return scope_map.get(data_scope, "未知")


@router.get("/{role_id}/orgs")
async def get_role_orgs(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("system:role"))
) -> Any:
    """
    Get orgs assigned to this role (for custom data scope)
    获取角色的自定义数据权限组织列表
    """
    # Check if role exists
    role = db.query(SysRole).filter(SysRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Get org IDs with this role
    org_ids = db.execute(
        text("SELECT org_id FROM sys_role_org WHERE role_id = :role_id"),
        {"role_id": role_id}
    ).fetchall()
    org_ids = [row[0] for row in org_ids]

    if not org_ids:
        return {
            "role_id": role_id,
            "role_name": role.name,
            "orgs": []
        }

    # Get org details
    orgs = db.query(SysOrg).filter(SysOrg.id.in_(org_ids)).all()

    return {
        "role_id": role_id,
        "role_name": role.name,
        "orgs": [
            {
                "id": org.id,
                "name": org.name,
                "type": org.type,
                "parent_id": org.parent_id
            }
            for org in orgs
        ]
    }
