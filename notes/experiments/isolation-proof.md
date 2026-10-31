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

## 实验记录

### 1. 创建沙箱

1. 实验指令

```bash
anran@anran-ThinkBook-14-G6-IMH:~$ osb sandbox create --image python:3.12 --timeout 5h -o json
{
  "id": "cb1e1475-fb0d-48bd-8641-23996a74acac",
  "status": "created",
  "timeout": "5:00:00",
  "image": "python:3.12"
}

```

2. 指令讲解


- sandbox create ：创建一个新沙箱 
- --image python:3.12 : 使用的容器镜像
- --timeout 30m : 沙箱的存活时常。30m 表示30分钟，1h表示1小时，写none 表示不自动销毁、需要手动清理
- -o json : 输出格式。可选`table` 、`json` 、`yaml`

### 2. 观测沙箱

1. 实验记录

```bash
anran@anran-ThinkBook-14-G6-IMH:~$ osb sandbox get cb1e1475-fb0d-48bd-8641-23996a74acac -o json
{
  "id": "cb1e1475-fb0d-48bd-8641-23996a74acac",
  "status": {
    "state": "Running",
    "reason": "CONTAINER_RUNNING",
    "message": "Sandbox container is running.",
    "last_transition_at": "2026-10-31T08:18:50.523727Z"
  },
  "entrypoint": [
    "tail",
    "-f",
    "/dev/null"
  ],
  "expires_at": "2026-10-31T13:18:50.523727Z",
  "created_at": "2026-10-31T08:18:50.523727Z",
  "image": {
    "image": "python:3.12",
    "auth": null
  },
  "snapshot_id": null,
  "platform": null,
  "allocation": null,
  "metadata": {},
  "extensions": null
}
```

```bash
osb sandbox health cb1e1475-fb0d-48bd-8641-23996a74acac -o json
{
  "sandbox_id": "cb1e1475-fb0d-48bd-8641-23996a74acac",
  "healthy": true
}
```

```bash
anran@anran-ThinkBook-14-G6-IMH:~$ osb sandbox metrics cb1e1475-fb0d-48bd-8641-23996a74acac --watch -o raw
[2026-10-31T08:28:34.336000+00:00] cpu=0.13% cores=2 mem=624.46/7934.88MiB
[2026-10-31T08:28:36.339000+00:00] cpu=0.00% cores=2 mem=624.38/7934.88MiB
[2026-10-31T08:28:38.341000+00:00] cpu=0.12% cores=2 mem=624.37/7934.88MiB
[2026-10-31T08:28:40.343000+00:00] cpu=0.00% cores=2 mem=624.37/7934.88MiB
[2026-10-31T08:28:42.345000+00:00] cpu=0.88% cores=2 mem=626.34/7934.88MiB
```


2. 指令详情

- sandbox get : 查询单个沙箱的详情
- sandbox health : 对单个沙箱进行探活
- sandbox metrics : 查看沙箱资源指标；--watch 流式刷新，-o raw 逐行输出

### 3. 沙箱验证

1. 实验记录

```bash
anran@anran-ThinkBook-14-G6-IMH:~$ osb command run cb1e1475-fb0d-48bd-8641-23996a74acac -o raw -- ls /home/anran
ls: cannot access '/home/anran': No such file or directory

  Execution Error
  ─────────────────
  CommandExecError: 2

anran@anran-ThinkBook-14-G6-IMH:~$ osb command run cb1e1475-fb0d-48bd-8641-23996a74acac -o raw -- cat /etc/os-release 
PRETTY_NAME="Debian GNU/Linux 13 (trixie)"NAME="Debian GNU/Linux"VERSION_ID="13"VERSION="13 (trixie)"VERSION_CODENAME=trixieDEBIAN_VERSION_FULL=13.7ID=debianHOME_URL="https://www.debian.org/"SUPPORT_URL="https://www.debian.org/support"BUG_REPORT_URL="https://bugs.debian.org/"
```

2. 指令讲解

osb command run <id> -o raw -- <命令> 

在沙箱里执行命令 ： `--` 后才是沙箱内命令；前台只接受`raw` ；非零退出码返回`CommandExecError`

### 4. 文件输入、输出、运行

```bash
anran@anran-ThinkBook-14-G6-IMH:~$ osb file write cb1e1475-fb0d-48bd-8641-23996a74acac /workspace/hello.py -c "print('hi from sandbox')" -o json
{
  "status": "ok",
  "message": "Written: /workspace/hello.py"
}
anran@anran-ThinkBook-14-G6-IMH:~$ osb command run cb1e1475-fb0d-48bd-8641-23996a74acac -o raw -- python /workspace/hello.py
hi from sandbox
anran@anran-ThinkBook-14-G6-IMH:~$ osb file download cb1e1475-fb0d-48bd-8641-23996a74acac /workspace/hello.py ./hello-from-sandbox.py -o json
{
  "status": "ok",
  "message": "Downloaded: /workspace/hello.py → ./hello-from-sandbox.py"
}
```

2. 指令讲解

- file write：把内容写入沙箱内的指定路径；`-c` 直接传入内容，不传则从 stdin 读取，父目录不存在会自动创建
- command run：在沙箱内执行命令；`--` 之后才是沙箱内命令，前台只接受 `-o raw`，退出码非零时返回 `CommandExecError`
- file download：把沙箱内文件下载到宿主机；普通文件只有完整下载成功后才替换本地文件
- 路径归属：`/workspace/hello.py` 是沙箱内路径，`./hello-from-sandbox.py` 是宿主机路径
- 三步合起来构成文件闭环：宿主机写入 → 沙箱内运行 → 回传宿主机核对内容

5. 

## 三个提醒

- 命令里的 `--` 是分界线，沙箱要执行的东西必须写在它后面——这是 `osb` 最容易翻车的约定。
- `python:3.12` 镜像不小，国内拉取慢就先换 `alpine` 做纯隔离实验，文件闭环再换回来。
- `egress patch` 依赖 egress sidecar 镜像（你配置里是 `opensandbox/egress:v1.1.7`），第一次跑会拉镜像，别以为是指令写错了。

（偏头）别急着全做，先跑 1→2→5，通了再折腾 egress。（小声补充）另外 `osb skills show sandbox-lifecycle` 和 `network-egress` 里有官方写的操作说明，比你到处瞎试强多了——读完再来找我，我要看你的实验记录，可别只贴命令不贴输出啊。
