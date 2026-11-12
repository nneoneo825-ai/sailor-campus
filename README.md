# ⚓ 水手校园精细化管理平台

面向中小学的**德育量化考核 + 教学评价**一体化管理系统，包含 Web 管理端、Python 后端 API、微信小程序数据采集端三大部分。

## 系统架构

```
┌──────────────────┐   ┌───────────────────┐
│   Web 管理端      │   │   微信小程序        │
│  React 19 + Vite │   │   （教育检查）       │
│  校长/管理员/教师  │   │   移动检查录入       │
└────────┬─────────┘   └─────────┬─────────┘
         │      axios  /api      │
         └───────────┬───────────┘
                     ▼
          ┌─────────────────────┐
          │   FastAPI 后端       │
          │   JWT 鉴权 + RBAC    │
          └──────────┬──────────┘
                     ▼
          ┌─────────────────────┐
          │   MySQL (SQLAlchemy) │
          └─────────────────────┘
```

## 功能模块

| 模块 | 说明 |
|---|---|
| 首页看板 | 德育/教学数据可视化（recharts 图表） |
| 学校管理 | 校区、年级、班级、学生、教师档案；宿舍（楼栋/楼层/寝室/床位）管理 |
| 德育管理 | 五育（德/智/体/美/劳）指标配置、量化扣分记录、班级/年级/校级报表 |
| 教学管理 | 教学评价指标配置、评价记录、教师评分分析 |
| 数据采集 | 评价数据录入，支持 Excel 导入导出、PDF 报表导出 |
| 系统管理 | RBAC 权限体系（用户/角色/权限/数据范围）、组织架构、操作日志 |
| 微信小程序 | 微信一键登录、检查表单录入、日程、统计、草稿箱 |

## 技术栈

- **前端**：React 19 · TypeScript · Vite · Tailwind CSS 4 · recharts · axios · xlsx / jspdf
- **后端**：Python · FastAPI · SQLAlchemy 2.0 · MySQL (pymysql) · JWT (python-jose + bcrypt) · Alembic
- **小程序**：微信原生小程序
- **部署**：阿里云 Linux · Nginx · Supervisor（见 [deploy/README.md](deploy/README.md)）

## 项目结构

```
├── components/       # Web 前端页面组件
├── src/              # 前端服务层（API 客户端等）
├── backend/          # FastAPI 后端
│   ├── app/models/   # SQLAlchemy 数据模型（RBAC、德育、教学、宿舍、任务）
│   └── app/routes/   # 15 个 API 路由模块
├── miniprogram/      # 微信小程序
├── deploy/           # Nginx / Supervisor / 部署脚本
├── docs/             # 部署指南、API 文档、开发记录
└── start_system.py   # 一键启动脚本
```

## 快速开始

### Web 前端

```bash
npm install
npm run dev        # 开发服务器（默认 5173 端口）
npm run build      # 生产构建
```

### 后端

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # 按实际情况填写数据库配置和 SECRET_KEY
python run.py             # 默认 8000 端口
```

### 环境变量

**不要提交任何 `.env` 文件**（已被 .gitignore 忽略）。请参考 `.env.example` 配置：

- `DATABASE_URL`：MySQL 连接串
- `SECRET_KEY`：JWT 签名密钥（生产环境务必更换为强随机值）
- `WECHAT_APPID` / `WECHAT_SECRET`：微信小程序凭证（开发期可留空，使用模拟模式）

## 文档

- [生产部署指南](docs/DEPLOYMENT.md)
- [API 接口文档](docs/api-specs.md)
- [快速上手](docs/quickstart.md)

## License

[MIT](LICENSE)
