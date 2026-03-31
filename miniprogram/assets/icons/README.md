# 图标文件说明

此目录需要包含以下PNG格式的图标文件（建议尺寸：81x81px）：

## 必需的图标文件

### 导航栏图标
1. `home.png` - 首页图标（未选中状态）
2. `home-active.png` - 首页图标（选中状态）
3. `schedule.png` - 日程图标（未选中状态）
4. `schedule-active.png` - 日程图标（选中状态）
5. `stats.png` - 统计图标（未选中状态）
6. `stats-active.png` - 统计图标（选中状态）
7. `profile.png` - 我的图标（未选中状态）
8. `profile-active.png` - 我的图标（选中状态）

## 图标设计建议

- 使用简洁的线条或填充风格
- 图标颜色：
  - 未选中状态：使用灰色（#94a3b8）
  - 选中状态：使用蓝色（#3b82f6）
- 保持图标风格统一
- 确保在白色背景上清晰可见

## 快速获取图标

你可以从以下来源获取图标：

1. [Iconfont](https://www.iconfont.cn/) - 阿里巴巴矢量图标库
2. [Flaticon](https://www.flaticon.com/) - 免费图标库
3. [Iconify](https://iconify.design/) - 图标搜索引擎

## 临时解决方案

如果暂时没有图标文件，可以：

1. 在 `app.json` 中移除或注释掉 `iconPath` 和 `selectedIconPath` 配置
2. 或者使用纯色方块作为占位符

## 注意事项

- 图标文件必须是PNG格式
- 建议使用透明背景
- 文件名必须与app.json中配置的完全一致
