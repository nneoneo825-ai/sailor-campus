import os

# 必须在导入任何 app 模块之前设置环境变量：
# app/database.py 在 import 时校验 DATABASE_URL 必须是 MySQL，
# app/utils/auth.py 在 import 时读取 SECRET_KEY。
os.environ.setdefault(
    "DATABASE_URL",
    "mysql+pymysql://root:root@localhost:3306/sailor_campus_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
# 禁用内置管理员后门，避免干扰测试
os.environ.setdefault("BUILTIN_ADMIN_PASSWORD", "")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.models import SysUser
from app.utils.auth import get_password_hash

TEST_USERNAME = "testuser"
TEST_PASSWORD = "Test@1234"


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """会话级：建表 → 跑测试 → 删表（仅作用于测试库）。"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def client():
    # 延迟到此处导入 main：确保 DATABASE_URL 已设置且表已创建
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def test_user(db):
    """一个正常的、已改过初始密码、拥有 admin 角色的启用用户。"""
    import main  # noqa: F401  触发权限与默认角色的初始化

    from app.models import SysRole

    user = db.query(SysUser).filter_by(username=TEST_USERNAME).first()
    if not user:
        user = SysUser(
            username=TEST_USERNAME,
            password=get_password_hash(TEST_PASSWORD),
            real_name="测试用户",
            status=1,
            password_changed=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 赋予 admin 角色（main 导入时由 assign_default_permissions 创建并授予全部权限）
    admin_role = db.query(SysRole).filter_by(code="admin").first()
    if admin_role and admin_role not in user.roles:
        user.roles.append(admin_role)
        db.commit()
    return user


@pytest.fixture()
def auth_headers(client, test_user):
    resp = client.post(
        "/api/auth/login",
        data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
