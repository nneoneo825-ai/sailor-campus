"""修复初三2班班主任设置"""
import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models.org import BaseClassInfo

db = SessionLocal()

# 初三2班的ID
class_id = 102142

print("=" * 60)
print(f"修复班级 ID: {class_id} 的班主任设置")
print("=" * 60)

# 查询 BaseClassInfo
class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == class_id).first()

if class_info:
    print(f"当前 head_teacher_id: {class_info.head_teacher_id}")
    
    # 清空班主任设置
    class_info.head_teacher_id = None
    db.commit()
    
    print("已清空班主任设置")
    
    # 验证
    class_info = db.query(BaseClassInfo).filter(BaseClassInfo.org_id == class_id).first()
    print(f"修复后 head_teacher_id: {class_info.head_teacher_id}")
else:
    print("未找到 BaseClassInfo 记录")

db.close()
print("\n修复完成！")
