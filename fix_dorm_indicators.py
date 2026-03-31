#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
修复宿舍检查指标：设置午休晚休和寝室内务的 is_overall=1
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from sqlalchemy import text
from app.database import engine

def fix_dorm_indicators():
    with engine.begin() as conn:
        # 先查询当前状态
        print("当前状态:")
        result = conn.execute(text("""
            SELECT id, category, sub_category, name, is_overall, is_enabled 
            FROM cfg_moral_indicator 
            WHERE sub_category IN ('午休晚休', '寝室内务')
            ORDER BY category, sub_category, id
        """))
        rows = list(result)
        if not rows:
            print("  没有找到午休晚休或寝室内务指标！")
            return
        
        for row in rows:
            print(f"  ID={row[0]}, 类别={row[1]}, 小项={row[2]}, 名称={row[3]}, is_overall={row[4]}, is_enabled={row[5]}")
        
        # 更新 is_overall=1
        result = conn.execute(text("""
            UPDATE cfg_moral_indicator 
            SET is_overall = 1 
            WHERE sub_category IN ('午休晚休', '寝室内务')
        """))
        print(f"\n已更新 {result.rowcount} 条记录")
        
        # 验证
        print("\n更新后:")
        result = conn.execute(text("""
            SELECT id, category, sub_category, name, is_overall 
            FROM cfg_moral_indicator 
            WHERE sub_category IN ('午休晚休', '寝室内务')
            ORDER BY category, sub_category
        """))
        for row in result:
            print(f"  {row[0]}: {row[1]} - {row[2]} - {row[3]} (is_overall={row[4]})")

if __name__ == "__main__":
    fix_dorm_indicators()
