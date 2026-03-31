import sys
sys.path.insert(0, 'backend')
from app.database import SessionLocal
from app.models.role import SysPermission
from sqlalchemy import text

db = SessionLocal()

# 添加德育编辑权限
moral_edit_perm = SysPermission(
    code='moral:edit',
    name='编辑评价',
    module='moral',
    description='编辑德育评价'
)

# 添加教学编辑权限
teaching_edit_perm = SysPermission(
    code='teaching:edit',
    name='编辑评价',
    module='teaching',
    description='编辑教学评价'
)

try:
    # 检查是否已存在
    existing_moral = db.query(SysPermission).filter(SysPermission.code == 'moral:edit').first()
    existing_teaching = db.query(SysPermission).filter(SysPermission.code == 'teaching:edit').first()
    
    if not existing_moral:
        db.add(moral_edit_perm)
        print('添加权限: moral:edit - 编辑评价')
    else:
        print('权限已存在: moral:edit')
    
    if not existing_teaching:
        db.add(teaching_edit_perm)
        print('添加权限: teaching:edit - 编辑评价')
    else:
        print('权限已存在: teaching:edit')
    
    db.commit()
    print('权限添加完成!')
    
except Exception as e:
    db.rollback()
    print(f'错误: {e}')
finally:
    db.close()
