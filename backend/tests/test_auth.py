"""认证相关接口测试：/api/auth/login、/api/auth/me"""
from tests.conftest import TEST_USERNAME, TEST_PASSWORD


class TestLogin:
    def test_login_success(self, client, test_user):
        resp = client.post(
            "/api/auth/login",
            data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["access_token"]
        assert body["token_type"] == "bearer"
        assert body["user"]["username"] == TEST_USERNAME

    def test_login_wrong_password(self, client, test_user):
        resp = client.post(
            "/api/auth/login",
            data={"username": TEST_USERNAME, "password": "wrong-password"},
        )
        assert resp.status_code == 400

    def test_login_unknown_user(self, client):
        resp = client.post(
            "/api/auth/login",
            data={"username": "no_such_user", "password": "whatever"},
        )
        assert resp.status_code == 400

    def test_login_disabled_user(self, client, db, test_user):
        test_user.status = 0
        db.commit()
        try:
            resp = client.post(
                "/api/auth/login",
                data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            )
            assert resp.status_code == 400
        finally:
            test_user.status = 1
            db.commit()

    def test_first_login_requires_password_change(self, client, db):
        from app.models import SysUser
        from app.utils.auth import get_password_hash

        user = SysUser(
            username="newbie",
            password=get_password_hash("Init@1234"),
            real_name="新用户",
            status=1,
            password_changed=False,  # 未修改初始密码
        )
        db.add(user)
        db.commit()
        try:
            resp = client.post(
                "/api/auth/login",
                data={"username": "newbie", "password": "Init@1234"},
            )
            assert resp.status_code == 403
            assert "password" in resp.json()["detail"].lower()
        finally:
            db.delete(user)
            db.commit()


class TestMe:
    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_me_with_invalid_token(self, client):
        resp = client.get(
            "/api/auth/me", headers={"Authorization": "Bearer not-a-token"}
        )
        assert resp.status_code in (401, 403)

    def test_me_with_token(self, client, auth_headers):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["username"] == TEST_USERNAME
