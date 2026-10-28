# opensandbox-lab

OpenSandbox 的学习沉淀仓库：笔记、动手实验记录，以及托起这些内容的 GitHub Pages 站点。

在线阅读：<https://0ranan.github.io/opensandbox-lab/>

## 这个仓库放什么

- `notes/`：按主题写的学习笔记，例如安装路线的取舍、密钥与鉴权怎么配。
- `notes/experiments/`：能复现的实验记录，写清环境、步骤、结果与结论。
- 站点骨架：`_config.yml`、`_layouts/`、`assets/`，用 GitHub Pages 内置的 Jekyll 直接构建，没有本地打包步骤。

仓库不存放上游项目的完整源码副本、构建产物和任何凭据。

## 目录结构

```text
_config.yml        GitHub Pages 站点配置
index.md           站点入口页，只做导航
notes/             学习笔记，按主题分文件
notes/experiments/ 动手实验记录
_layouts/          页面布局：default 为站点骨架，note 为带侧边栏目录的笔记页
assets/css/        站点样式表
assets/js/         站点脚本，toc.js 负责生成侧边栏目录
.agents/skills/    助手使用的项目级技能
AGENTS.md          写作、目录与发布约定
```

## 新增一篇笔记

1. 在 `notes/` 下新建小写英文加连字符命名的文件，如 `notes/quickstart-01.md`。
2. 文件开头补 YAML front-matter：

```yaml
---
title: 环境准备
date: 2026-10-28
tags: [容器, 网络]
summary: 一句话说明这篇笔记解决什么问题
---
```

1. 正文从 `##` 起写，`##` 与 `###` 会自动成为侧边栏目录。
2. 回到 [index.md](index.md)，在对应栏目加一行 `- [标题](notes/文件名/)`。

文件名发布后不改名；站内链接用相对路径指向目录形式，不要以 `/` 开头。

## 本地预览

```bash
docker run --rm -v "$PWD":/srv/jekyll -p 4000:4000 -it jekyll/jekyll:4 \
  jekyll serve --host 0.0.0.0 --baseurl ""
```

需要本地装好 Ruby 与 Jekyll，仓库不内置构建依赖。日常写作不必本地构建，推到 `main` 后由 GitHub Pages 生成站点。

## 约定

完整的语言要求、目录规则、笔记结构与提交规范见 [AGENTS.md](AGENTS.md)。提交信息采用「类型前缀 + 中文描述」，例如 `docs: 补充环境准备步骤`。

## 许可证

[MIT](LICENSE)
