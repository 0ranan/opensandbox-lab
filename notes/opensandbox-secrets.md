---
title: 给 OpenSandbox 配置密钥
date: 2026-10-22
tags: [OpenSandbox, 密钥, 配置]
summary: 客户端没带 API Key 导致 401，以及三种补上密钥的方式
---

`osb sandbox list` 返回 401，错误码 `MISSING_API_KEY`，但同一时刻服务端是好的：`http://127.0.0.1:8080/health` 正常响应。这个地址由 kind 集群的 envoy gateway 转发到 `opensandbox-system/opensandbox-server`，服务端进程是 uvicorn，链路本身没问题。

## 原因

一边看客户端配置：

```bash
osb config show
```

`api_key = -`，说明 `~/.opensandbox/config.toml` 里的 `api_key` 没有设置。服务端那边 `opensandbox-server-config` 里是：

```toml
api_key = "my_api_key"
```

请求没带 key，服务端就回了 `MISSING_API_KEY` / 401。

## 三条解决办法

### 临时验证（只对当前命令生效）

```bash
osb --api-key my_api_key sandbox list
```

### 持久写入配置文件（推荐）

```bash
osb config set connection.api_key my_api_key
```

它把 `api_key = "my_api_key"` 写进 `~/.opensandbox/config.toml`，之后直接 `osb sandbox list` 即可。

### 环境变量（优先级高于配置文件）

```bash
export OPEN_SANDBOX_API_KEY=my_api_key
```

CLI 支持这个变量。长期生效需要写进 `~/.bashrc`，这一步要改 shell 配置，没有执行。

## 顺带记录的两个问题

`~/.opensandbox/config.toml` 里 `domain = "127.0.0.1:8080"`，这个端口现在是 kind 的 envoy 占着，恰好也是 OpenSandbox 的入口（gateway），所以能通。如果哪天 kind 集群重建、envoy 路由变了，这里会突然连不上，届时改：

```bash
osb config set connection.domain <新地址>
```

`opensandbox` 命名空间里还有两个 93 天前留下的沙箱 Pod，状态 Unknown：

```text
opensandbox  79ded81a-...-0   0/1  Unknown
opensandbox  cf0cb53b-...-0   0/1  Unknown
```

是节点重启后残留的僵尸对象，`osb sandbox list` 恢复后可能看到它们卡在异常状态。要清理就 `kubectl -n opensandbox delete pod ...`，属于删资源操作，没有执行。

## 密钥强度

`my_api_key` 是 Helm chart 的默认弱密钥（不是真实凭据），服务端明文放在 ConfigMap 里。本地玩没问题；如果这个集群有对外暴露的计划，最好换成随机强密钥：改 ConfigMap、重启 server、同步客户端 key 三步一起做。

## 参考来源

<!-- 待补：官方文档链接 + 查阅日期 -->
