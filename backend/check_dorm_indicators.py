# -*- coding: utf-8 -*-
"""检查宿舍指标数据"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import SessionLocal

def check_dorm_indicators():
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("[CHECK] 检查宿舍相关指标")
        print("=" * 70)
        
        # 1. 查询午休晚休小项下的所有指标
        print("\n[1] 午休晚休小项下的所有指标:")
        print("-" * 50)
        
        results = db.execute(text("""
            SELECT id, name, category, sub_category, is_enabled, is_overall, default_score
            FROM cfg_moral_indicator
            WHERE sub_category = '午休晚休'
        """)).fetchall()
        
        for r in results:
            print(f"  ID: {r[0]}, name: {r[1]}")
            print(f"    category: {r[2]}, sub_category: {r[3]}")
            print(f"    is_enabled: {r[4]}, is_overall: {r[5]}, default_score: {r[6]}")
        
        print()
        print("[2] 午休晚休小项下 is_overall=1 的指标:")
        print("-" * 50)
        
        results2 = db.execute(text("""
            SELECT id, name, category, is_enabled, is_overall
            FROM cfg_moral_indicator
            WHERE sub_category = '午休晚休' AND is_overall = 1
        """)).fetchall()
        
        for r in results2:
            print(f"  ID: {r[0]}, name: {r[1]}, category: {r[2]}")
        
        if not results2:
            print("  无 is_overall=1 的指标！")
        
        print()
        print("[3] 寝室内务小项下的所有指标:")
        print("-" * 50)
        
        results3 = db.execute(text("""
            SELECT id, name, category, sub_category, is_enabled, is_overall, default_score
            FROM cfg_moral_indicator
            WHERE sub_category = '寝室内务'
        """)).fetchall()
        
        for r in results3:
            print(f"  ID: {r[0]}, name: {r[1]}")
            print(f"    category: {r[2]}, sub_category: {r[3]}")
            print(f"    is_enabled: {r[4]}, is_overall: {r[5]}, default_score: {r[6]}")
        
        print()
        print("[4] 寝室内务小项下 is_overall=1 的指标:")
        print("-" * 50)
        
        results4 = db.execute(text("""
            SELECT id, name, category, is_enabled, is_overall
            FROM cfg_moral_indicator
            WHERE sub_category = '寝室内务' AND is_overall = 1
        """)).fetchall()
        
        for r in results4:
            print(f"  ID: {r[0]}, name: {r[1]}, category: {r[2]}")
        
        if not results4:
            print("  无 is_overall=1 的指标！")
        
        print()
        print("=" * 70)
        print("[DONE] 检查完成")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_dorm_indicators()
