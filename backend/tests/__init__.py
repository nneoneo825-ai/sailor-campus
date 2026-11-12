"""后端 API 自动化测试。

运行方式：
    cd backend
    pip install -r requirements-dev.txt
    # 需要一个可用的 MySQL（测试库 sailor_campus_test 会自动建表/删表）
    export DATABASE_URL=mysql+pymysql://root:密码@localhost:3306/sailor_campus_test
    pytest

注意：测试会在会话结束时 DROP 测试库中的所有表，请确保 DATABASE_URL
指向专用测试库，绝不指向生产库。
"""
