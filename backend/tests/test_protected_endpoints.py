"""RBAC 保护接口的鉴权测试：未登录一律拒绝，登录后可访问。"""

import pytest

# 受保护的代表性端点（覆盖用户/权限/德育/教学四个域）
PROTECTED_GET_ENDPOINTS = [
    "/api/users/",
    "/api/permissions/modules",
    "/api/moral/indicators",
    "/api/teaching/indicators",
]


class TestUnauthenticated:
    @pytest.mark.parametrize("url", PROTECTED_GET_ENDPOINTS)
    def test_rejects_without_token(self, client, url):
        resp = client.get(url)
        assert resp.status_code in (401, 403), f"{url} 未登录应被拒绝"


class TestAuthenticated:
    @pytest.mark.parametrize("url", PROTECTED_GET_ENDPOINTS)
    def test_allows_with_token(self, client, auth_headers, url):
        resp = client.get(url, headers=auth_headers)
        assert resp.status_code == 200, f"{url}: {resp.text[:200]}"
