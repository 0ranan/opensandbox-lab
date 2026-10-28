---
title: Docker 本地路线起 server
date: 2026-10-28
tags: [OpenSandbox, Docker, 配置, 排错]
summary: 8080 上没有进程时 osb 报 Connection refused，起 server 要盯的那几行日志与验证命令
---

`osb sandbox create` 重试了几次，最后落到 `[Errno 111] Connection refused`。镜像和参数都没问题，是 8080 上压根没有进程在听。

```text
retrying POST http://127.0.0.1:8080/v1/sandboxes: attempt=2 cause=pre_send status=None backoff=0.500s request_id=None
retrying POST http://127.0.0.1:8080/v1/sandboxes: attempt=3 cause=pre_send status=None backoff=0.655s request_id=None
Failed to create sandbox with startup source python:3.12: [Errno 111] Connection refused
```

`cause=pre_send`、`status=None` 说明请求还没发出去就断了，跟服务端回 401 或 500 不是一类问题。

先确认端口：

```bash
ss -ltnp | grep 8080
curl -sS -m 3 http://127.0.0.1:8080/health
```

```text
curl: (7) Failed to connect to 127.0.0.1 port 8080 after 0 ms: Could not connect to server
```

两条都是空的，`osb config show` 里的 `domain` 指向 `127.0.0.1:8080` 也没问题，那就是 server 自己没起来。之前那套 8080 是 kind 里的 gateway 转出来的，集群一没（`kind get clusters` 回 `No kind clusters found`）端口就空了。

不装 K8s 也能跑，Docker 路线只需要 Docker 守护进程和一个 Python 包。

## 配置文件

`init-config` 会往 `~/.sandbox.toml` 落一份 Docker 模板：

```bash
uvx opensandbox-server init-config ~/.sandbox.toml --example docker
```

要看的只有这几行：

```toml
[server]
host = "127.0.0.1"
port = 8080

[runtime]
type = "docker"
execd_image = "opensandbox/execd:v1.1.0"

[ingress]
mode = "direct"
```

`mode = "direct"` 是两条路线的分界：没有 gateway，server 按 `[docker] port_range_min` 和 `port_range_max`（默认 40000–60000）给沙箱挑宿主机端口。

## 启动

```bash
OPENSANDBOX_INSECURE_SERVER=YES uvx opensandbox-server --config ~/.sandbox.toml
```

日志里这三行对上，说明配置读进去了、也确实走的 docker 实现：

```text
INFO ... opensandbox_server.config: Loaded configuration from ~/.sandbox.toml
INFO ... opensandbox_server.services.factory: Creating sandbox service with type: docker
INFO ... uvicorn.error: Uvicorn running on http://127.0.0.1:8080 (Press CTRL+C to quit)
```

`OPENSANDBOX_INSECURE_SERVER=YES` 不是随手加的。配置里 `server.api_key` 留空时，交互终端会要求手输 `YES` 确认，非交互场景（后台跑、写进脚本）没有这个环境变量就直接退出。

## 验证

另开一个终端：

```bash
curl -sS http://127.0.0.1:8080/health
```

```json
{"status":"healthy"}
```

再跑开头失败的那条命令：

```bash
osb sandbox create --image python:3.12 --timeout 30m -o json
```

```json
{
  "id": "<沙箱 ID>",
  "status": "created",
  "timeout": "0:30:00",
  "image": "python:3.12"
}
```

`docker ps` 里能看到这次创建落下来的容器，两个映射都落在端口区间内：

```text
sandbox-<沙箱 ID>   python:3.12   0.0.0.0:<宿主机端口>->8080/tcp, 0.0.0.0:<宿主机端口>->44772/tcp
```

44772 是容器里的 execd，8080 是沙箱里的 HTTP 服务端口。用完删掉，容器会跟着清：

```bash
osb sandbox kill <沙箱 ID>
```

## 踩坑

- server 是前台常驻进程。终端关掉或机器重启后 8080 又变空，`osb` 那边的表现还是开头那句 `Connection refused`。要长期跑就交给 tmux 或 systemd。
- `[store] path` 默认是 `~/.opensandbox/opensandbox.db`，这个文件必须可写。起不来时不一定提示权限问题，我这边第一次是直接崩在 `sqlite3.OperationalError: attempt to write a readonly database`，而且前面已经打了几行 uvicorn 的启动日志，很容易误判成代码问题。
- 第一次创建会把 `execd_image` 和镜像本身拉下来，比后续创建慢得多。

## 参考来源

- [server/DEVELOPMENT.md](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/DEVELOPMENT.md)，Docker 路线的开发流程，查阅于 2026-10-28
- [server/configuration.md](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/configuration.md)，`server` / `runtime` / `docker` / `ingress` 各段字段说明，查阅于 2026-10-28
- 同站笔记 [OpenSandbox 学习路径](opensandbox-learning-path/)
