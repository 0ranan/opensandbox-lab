---
title: 给 OpenSandbox 配置密钥
date: 2026-10-22
tags: [OpenSandbox, 密钥, 配置, Docker]
summary: 服务端与客户端如何配同一把 API Key，以及 401 的两种错误码分别代表什么
---

OpenSandbox 的服务端配了 `api_key` 之后，所有业务接口都要校验请求头 `OPEN-SANDBOX-API-KEY`。不配的话等于把建沙箱、执行命令的权限一起交出去；配了但两边写得不一致，客户端拿到的就是 401，所以密钥值必须成对出现。

配置分为下列步骤：
- 生成一把随机密钥。
- 再写进服务端（Kubernetes 或 本地 Docker）。
- 最后把同一个值配到 `osb` 客户端。
服务端只在启动时读配置，改完要重启。

## 随机密钥

```bash
openssl rand -hex 32
```

或者

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

`my_api_key` 是 Helm chart 里写死的默认值，本地自己玩可以留着；一旦要让别人访问就得换掉。

## server 配置密钥（Kubernetes 路线）

服务端把 key 明文放在 ConfigMap `opensandbox-server-config` 的 `api_key` 字段：

```bash
kubectl -n <命名空间> edit configmap opensandbox-server-config
```

服务端只在启动时读一次配置，改完不重启不会感知：

```bash
kubectl -n <命名空间> rollout restart deployment/<server-deployment>
```

漏掉重启这一步，客户端拿新 key 过去照样被拒。

## server 配置密钥（Docker 本地路线）

本地 Docker 模式没有 ConfigMap，服务端读自己的配置文件。要让服务端校验 key，改 `~/.sandbox.toml` 的 `[server]` 段：

```toml
[server]
host = "127.0.0.1"
port = 8080
max_sandbox_timeout_seconds = 86400
api_key = "<你的密钥>"
```

改完同样要重启。启动时用 `--config` 指定文件，不传就走默认的 `~/.sandbox.toml`：

```bash
uvx opensandbox-server --config ~/.sandbox.toml
```

`api_key` 留空时服务端不会静默启动，而是要求先确认一次：交互式终端输入 `YES`，非交互场景（脚本、后台进程）必须显式给环境变量，否则直接退出。

```bash
OPENSANDBOX_INSECURE_SERVER=YES uvx opensandbox-server --config ~/.sandbox.toml
```

写了 `api_key` 之后这条就多余了，确认流程只在密钥为空时触发。另外 `[server] api_key` 和 `[tenants]` 不能同时开，多租户模式下密钥由 tenant provider 管，两处都配启动会报错。

## OSB 配置密钥

只对当前这条命令生效：

```bash
osb --api-key <密钥> sandbox list
```

要长期用就写进配置文件：

```bash
osb config set connection.api_key <密钥>
```

它把 `api_key = "<密钥>"` 写进 `~/.opensandbox/config.toml`，之后直接 `osb sandbox list` 即可。CLI 也认环境变量，优先级比配置文件高：

```bash
export OPEN_SANDBOX_API_KEY=<密钥>
```

长期生效要写进 `~/.bashrc`。客户端发出去的请求头叫 `OPEN-SANDBOX-API-KEY`，自己写 HTTP 调用时对得上这个字段。

验证只看业务接口，`/health` 永远 200，它和 `/version`、`/docs`、`/redoc`、`/openapi.json` 以及沙箱端口代理路径一起在鉴权豁免名单里。

```bash
osb sandbox list
```

输出正常列表就是通了。401 里回 `MISSING_API_KEY` 是客户端没带 key，回 `INVALID_API_KEY` 是带了但和服务端的值不一致。

