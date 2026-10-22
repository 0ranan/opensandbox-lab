---
title: 实验：证明沙箱隔离是真的
date: 2026-10-22
tags: [OpenSandbox, 沙箱, 隔离, 实验]
summary: 用 osb 验证文件系统隔离、文件双向闭环、出口策略与生命周期回收
---

初学 OpenSandbox，你要验证的是**它存在的理由**：代码真的被关在一个跟你宿主机隔开的盒子里。所以目标是这个——

## 实验目标

一句话：创建一个 Python 沙箱，把自己的脚本送进去跑出结果再取回来，然后用对比实验证明「宿主文件进不去、网络出口能被掐断」，最后干净回收。

## 验收标准

做到这 5 条才算通关。

| 要证明的事 | 判定方法 |
| --- | --- |
| 沙箱是独立文件系统 | 在沙箱里 `ls /home/anran` 看不到你宿主机的文件；`cat /etc/os-release` 是镜像自己的 |
| 命令与文件双向流通 | 本地上传 `.py` → 沙箱执行 → 产物下载回宿主机 → 本地能打开 |
| 出口网络可控 | 先 `curl -I https://pypi.org` 通，再 `osb egress patch` 拒绝，再 curl 必须失败 |
| 状态可观测 | 读懂 `sandbox get` / `health` / `metrics` 三个输出分别代表什么 |
| 生命周期闭环 | `kill` 之后 `sandbox list` 里干净，且能用 `--timeout` 让它自己到期消失 |

## 命令骨架

```bash
# 0. 建沙箱（把输出的 id 记下来）
osb sandbox create --image python:3.12 --timeout 30m -o json

# 1. 观测
osb sandbox get <id> -o json
osb sandbox health <id> -o json
osb sandbox metrics <id> --watch -o raw      # 另开一个终端更有意思

# 2. 隔离性
osb command run <id> -o raw -- ls /home/anran
osb command run <id> -o raw -- cat /etc/os-release

# 3. 文件闭环
osb file write <id> /workspace/hello.py -c "print('hi from sandbox')" -o json
osb command run <id> -o raw -- python /workspace/hello.py
osb file download <id> /workspace/hello.py ./hello-from-sandbox.py -o json

# 4. 出口策略对比
osb egress get <id> -o json
osb command run <id> -o raw -- curl -I https://pypi.org
osb egress patch <id> --rule deny=pypi.org -o json
osb command run <id> -o raw -- curl -I https://pypi.org   # 这次应该失败

# 5. 收尾
osb sandbox kill <id> -o json
osb sandbox list
```

## 三个提醒

- 命令里的 `--` 是分界线，沙箱要执行的东西必须写在它后面——这是 `osb` 最容易翻车的约定。
- `python:3.12` 镜像不小，国内拉取慢就先换 `alpine` 做纯隔离实验，文件闭环再换回来。
- `egress patch` 依赖 egress sidecar 镜像（你配置里是 `opensandbox/egress:v1.1.7`），第一次跑会拉镜像，别以为是指令写错了。

（偏头）别急着全做，先跑 1→2→5，通了再折腾 egress。（小声补充）另外 `osb skills show sandbox-lifecycle` 和 `network-egress` 里有官方写的操作说明，比你到处瞎试强多了——读完再来找我，我要看你的实验记录，可别只贴命令不贴输出啊。
