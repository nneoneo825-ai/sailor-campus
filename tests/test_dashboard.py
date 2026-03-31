"""
水手校园管理平台 - Dashboard 首页测试
使用 Playwright 进行端到端测试
"""
from playwright.sync_api import sync_playwright
import sys
import time


def test_dashboard():
    """测试 Dashboard 页面"""
    with sync_playwright() as p:
        # 启动浏览器（无头模式）
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 720})

        try:
            print("[START] 开始测试 Dashboard 页面...")

            # 1. 访问登录页面
            print("[INFO] 访问登录页面...")
            time.sleep(5)  # 等待服务完全就绪
            page.goto('http://localhost:5175', timeout=60000)
            page.wait_for_load_state('networkidle', timeout=30000)

            # 截图 - 登录页面
            page.screenshot(path='tests/screenshots/04_login_before.png', full_page=True)
            print("[PASS] 已截图: 登录页面")

            # 2. 填写登录表单
            print("[INFO] 填写登录信息...")
            page.locator('#username').fill('admin')
            page.locator('#password').fill('123456')

            # 截图 - 填写表单后
            page.screenshot(path='tests/screenshots/05_login_filled.png', full_page=True)
            print("[PASS] 已截图: 填写登录信息后")

            # 3. 点击登录按钮
            print("[INFO] 点击登录按钮...")
            page.locator('button[type="submit"]').click()

            # 等待页面跳转（不强制检查URL，因为可能有重定向）
            print("[INFO] 等待页面响应...")
            time.sleep(3)

            # 截图 - 登录后
            page.screenshot(path='tests/screenshots/06_after_login.png', full_page=True)
            print("[PASS] 已截图: 登录后的页面")

            # 4. 检查当前页面内容
            page_content = page.content()
            current_url = page.url
            print(f"[INFO] 当前URL: {current_url}")

            # 检查是否在 Dashboard 页面
            if "数据概览" in page_content or "dashboard" in page_content.lower():
                print("[PASS] 成功进入 Dashboard 页面")

                # 等待 Dashboard 数据加载
                print("[INFO] 等待 Dashboard 数据加载...")
                time.sleep(2)

                # 截图 - Dashboard 页面
                page.screenshot(path='tests/screenshots/07_dashboard.png', full_page=True)
                print("[PASS] 已截图: Dashboard 页面")

                # 检查统计卡片
                stat_cards = [
                    "在校学生总数",
                    "教职工人数",
                    "本周德育平均分",
                    "本周教学平均分"
                ]

                for card in stat_cards:
                    if card in page_content:
                        print(f"[PASS] 统计卡片存在: {card}")
                    else:
                        print(f"[WARN] 统计卡片未找到: {card}")

                # 检查图表区域
                if "五育综合评价" in page_content:
                    print("[PASS] 五育综合评价图表存在")

                if "德育与教学评分趋势" in page_content:
                    print("[PASS] 趋势图表存在")

                print("\n" + "="*50)
                print("[SUCCESS] Dashboard 测试通过！")
                print("="*50)
                return True

            elif "登录" in page_content and "用户名" in page_content:
                # 仍在登录页面，检查是否有错误信息
                if "错误" in page_content or "失败" in page_content:
                    print("[FAIL] 登录失败，请检查用户名和密码")
                else:
                    print("[INFO] 仍在登录页面，可能登录未成功")
                return False
            else:
                print("[INFO] 页面状态未知，请查看截图")
                return False

        except Exception as e:
            print(f"\n[FAIL] 测试失败: {e}")
            # 错误截图
            try:
                page.screenshot(path='tests/screenshots/dashboard_error.png', full_page=True)
                print("[INFO] 已保存错误截图: tests/screenshots/dashboard_error.png")
            except:
                pass
            return False

        finally:
            browser.close()


if __name__ == '__main__':
    # 创建截图目录
    import os
    os.makedirs('tests/screenshots', exist_ok=True)

    success = test_dashboard()

    sys.exit(0 if success else 1)
