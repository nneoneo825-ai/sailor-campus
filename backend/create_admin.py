"""
创建 admin 管理员账户
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import SysUser
from app.models.role import SysRole, sys_user_role
from app.utils.auth import get_password_hash

def create_admin():
    db = SessionLocal()
    
    try:
        # 检查 admin 用户是否已存在
        existing = db.query(SysUser).filter(SysUser.username == "admin").first()
        if existing:
            print("admin 用户已存在！")
            print(f"  用户ID: {existing.id}")
            print(f"  真实姓名: {existing.real_name}")
            print(f"  状态: {'启用' if existing.status == 1 else '禁用'}")
            return
        
        # 获取 admin 角色
        admin_role = db.query(SysRole).filter(SysRole.code == "admin").first()
        if not admin_role:
            print("错误: 未找到 admin 角色，请先初始化角色数据")
            return
        
        # 创建 admin 用户
        hashed_password = get_password_hash("nanpuqing")
        
        admin_user = SysUser(
            username="admin",
            password=hashed_password,
            real_name="系统管理员",
            status=1,  # 启用
            password_changed=True  # 标记为已修改密码
        )
        
        db.add(admin_user)
        db.flush()  # 获取生成的 ID
        
        # 分配 admin 角色
        db.execute(
            sys_user_role.insert().values(user_id=admin_user.id, role_id=admin_role.id)
        )
        
        db.commit()
        
        print("=" * 50)
        print("admin 用户创建成功！")
        print("=" * 50)
        print(f"  用户名: admin")
        print(f"  密码: nanpuqing")
        print(f"  角色: {admin_role.name}")
        print(f"  用户ID: {admin_user.id}")
        print("=" * 50)
        
    except Exception as e:
        db.rollback()
        print(f"创建失败: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
