from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text("SELECT COUNT(*) FROM biz_moral_record WHERE source = 'dorm'"))
    count = result.scalar()
    print(f'source=dorm 的记录数: {count}')
    
    result = conn.execute(text("SELECT COUNT(*) FROM cfg_moral_indicator WHERE category = '宿舍管理'"))
    count = result.scalar()
    print(f'category=宿舍管理 的指标数: {count}')
    
    # 列出宿舍管理指标
    result = conn.execute(text("SELECT id, sub_category, name FROM cfg_moral_indicator WHERE category = '宿舍管理'"))
    rows = result.fetchall()
    for row in rows:
        print(f'  ID: {row[0]}, sub_category: {row[1]}, name: {row[2][:30]}')
