from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)

print('=== biz_moral_record 表结构 ===')
columns = inspector.get_columns('biz_moral_record')
for col in columns:
    print(f"{col['name']}: {col['type']} (nullable={col['nullable']})")

print()
print('=== biz_moral_record 外键约束 ===')
foreign_keys = inspector.get_foreign_keys('biz_moral_record')
for fk in foreign_keys:
    print(fk)

print()
print('=== cfg_moral_indicator 表结构 ===')
columns = inspector.get_columns('cfg_moral_indicator')
for col in columns:
    print(f"{col['name']}: {col['type']} (nullable={col['nullable']})")
