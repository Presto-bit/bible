# Bible App

双端（iOS / Android）圣经阅读 App：**Flutter 客户端** + **Python API 服务**，核心差异为基于资料库的 RAG 释经助手。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | 产品需求、5 Tab、AI 体系 |
| [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) | **代码执行计划（分期任务清单）** |
| [docs/SETUP.md](docs/SETUP.md) | Flutter / API 环境搭建 |
| [docs/READING-EXPERIENCE.md](docs/READING-EXPERIENCE.md) | 阅读排版与交互规范 |
| [docs/RAG.md](docs/RAG.md) | 向量库与 RAG（参考 minimax_aipodcast） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术架构与目录说明 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | **阿里云 Git + Docker 一键发版**（仓库 [Presto-bit/bible](https://github.com/Presto-bit/bible)） |

## 已确认决策

- **客户端**：Flutter
- **登录**：暂不强推；游客完整可读，登录仅用于云同步（二期）
- **主译本**：圣经新译本（CNV）｜对照：KJV
- **导航**：首页 · 圣经 · 助手 · 发现 · 我的

## 目录概览

```
Bible/
├── apps/mobile/          # Flutter App
├── services/api/         # Python API（RAG、AI、同步）
├── data/                 # 经文本体、词典、计划（放入数据文件）
├── content/              # RAG 注释源文件（PDF/MD）
├── infra/postgres/       # 数据库迁移
├── scripts/              # 导入与索引脚本
└── docs/                 # 产品与技术文档
```

## 快速开始（开发环境搭建后）

```bash
# 1. 放入经文本体
#    data/bible/cnv/  data/bible/kjv/

# 2. 放入注释资料
#    content/commentary/

# 3. 建索引
#    scripts/rag_index.py --source content/commentary

# 4. 启动 API
#    cd services/api && uvicorn app.main:app --reload

# 5. 启动 Flutter
#    cd apps/mobile && flutter run
```

## 数据准备

见 [data/README.md](data/README.md)。
