---
title: OpenSandbox 学习路径
date: 2026-10-22
tags: [OpenSandbox, 容器, Kubernetes, 学习路径]
summary: 三条安装路径的取舍，以及从 Docker 单机到 kind 控制面的五步顺序
---

你这个仓库的安装方式其实是**三条互相独立的路径**，学习目的和生产部署的最优解不一样。结论先说：**从 Docker 单机路线开始，不要一上来就上 Kubernetes。**

## 三种方式对比

| 方式 | 启动成本 | 你会学到什么 | 适合 |
| --- | --- | --- | --- |
| **Docker + 本地 server** | 5 分钟，只需 Docker + Python | server 的 API、生命周期状态机、execd、egress、SDK/CLI 全链路 | **学习首选** |
| **kind + Helm** | 30–60 分钟，需 Docker + kind + helm | CRD、controller reconcile、Pool 池化、gateway 路由、Helm 分层 | 学到控制面时才上 |
| **真实集群 + 伞形 chart** | 需要真实集群 | 生产运维、升级、可观测性 | 部署不是学习 |

文档首页 [deployment 首页](https://open-sandbox.ai/deployment/) 只覆盖第三条（K8s/Helm），所以只看它会误以为整个项目必须上 K8s——实际上 Docker 路线是这个项目的开发主线，[`server/DEVELOPMENT.md`](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/DEVELOPMENT.md) 就是围绕它写的。

---

## 阶段一：Docker 路线（建议第一周只做这个）

这条路线不涉及 CRD、Helm、controller，但**能跑到完整的 HTTP → server → 容器 → execd → 返回**闭环。

**方式 A：直接用发布版（只看行为）**

```bash
uvx opensandbox-server init-config ~/.sandbox.toml --example docker
uvx opensandbox-server
curl http://127.0.0.1:8080/health
```

**方式 B：从源码跑（要读/改代码时用这个）**

```bash
cd server
uv sync --all-groups
cp opensandbox_server/examples/example.config.toml ~/.sandbox.toml
uv run python -m opensandbox_server.main
```

方式 B 是 [`server/DEVELOPMENT.md`](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/DEVELOPMENT.md) 记录的开发流程，改完代码直接重启即可，且能直接用调试器。学这个项目我建议直接用 B。

然后装一个 SDK 跑 [`docs/getting-started/index.md`](https://open-sandbox.ai/getting-started/) 里的那段 Python 示例（创建沙箱 → 执行命令 → 写读文件 → 销毁）。这一段代码覆盖了几乎全部核心概念：`Sandbox.create`、`timeout`、`ConnectionConfig(use_server_proxy=True)`、`commands.run`、`files.write_files`、`destroy`。

**这一步之后你应该能回答：**

- `~/.sandbox.toml` 里 `[runtime] type = "docker"` 和 `[ingress] mode = "direct"` 分别意味着什么（Docker 模式不需要 gateway，这与 K8s 的关键差异就体现在这里）
- `execd` 镜像是在哪个环节被拉起来、怎么被访问的
- `use_server_proxy=True` 与 `False` 的区别（对应 `[proxy] resolve_internal`）

**读代码的入口顺序**（对着 [`server/DEVELOPMENT.md`](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/DEVELOPMENT.md) 的四层架构看）：

```text
server/opensandbox_server/
├── main.py                    ← 启动入口
├── api/                       ← FastAPI 路由
├── middleware/                ← API key 鉴权
├── services/
│   ├── runtime_resolver.py    ← 按配置选 docker 还是 k8s
│   ├── sandbox_service.py     ← 业务逻辑
│   └── docker/runtime.py      ← Docker 后端的全部实现（16.9 KB，不长）
└── config.py                  ← TOML 配置解析
```

`services/docker/runtime.py` 是最值得先读完的一个文件，因为它是"一个 sandbox 到底怎么被创建出来"的完整答案，且比 K8s 版本简单得多。

---

## 阶段二：配合 Docker 路线学沙箱内部

沙箱容器里跑的是 `components/execd`（Go）。这条线在文档里对应 [`docs/architecture/data-plane/execd.md`](https://open-sandbox.ai/architecture/data-plane/execd)。可以：

- 直接 `docker exec` 进一个用 SDK 创建的沙箱容器，看 execd 进程和它监听的端口
- 看 [`specs/execd-api.yaml`](https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/execd-api.yaml)——这是 execd 的对外契约，SDK 里的 `commands.run` / `files.*` 都对应其中某个 endpoint
- 想改 execd 代码：[`components/execd/build.sh`](https://github.com/opensandbox-group/OpenSandbox/blob/main/components/execd/build.sh) 构建自己的镜像，在 `~/.sandbox.toml` 的 `[runtime] execd_image` 里指过去

这一步会打通"SDK 方法 → HTTP 请求 → execd 接口"这条链，是理解这个项目最关键的一环。

---

## 阶段三：kind + Helm（想学控制面时再上）

K8s 路线的核心价值是 CRD + controller 的 reconcile 循环，而这部分**在 Docker 模式下完全不存在**（Docker 是 server 直接调 Docker API，没有中间层）。

**推荐做法：用逐组件安装，而不是伞形 chart。**

理由和你前面问的那四条命令一致：逐组件装能让你看到每一步的边界（CRD 在 `base`、controller 只做 reconcile、gateway 独立、server 只管 API），而伞形 chart 会把这些一次性掩盖掉。伞形适合部署，不适合学习。

```bash
# 一次性本地集群
kind create cluster --name sandbox-learn

# 按顺序（和文档一致）
helm install base manifests/charts/base
helm install opensandbox-controller manifests/charts/controller -n opensandbox-system --create-namespace
helm install ingress-gateway manifests/charts/ingress-gateway -n opensandbox-system
helm install opensandbox-server manifests/charts/server -n opensandbox-system
```

**kind 环境下三个必须先知道的限制**（否则会卡住）：

1. **`ingress-gateway` 的 Service 默认是 ClusterIP**，kind 里没有云厂商的 LoadBalancer。要么装 `cloud-provider-kind`/MetalLB，要么用 `kind create cluster --config` 配 `extraPortMappings` 走 NodePort，要么先不装 gateway、只学 controller（用 `kubectl apply` 直接创建 `BatchSandbox` 观察 Pod 生成）。
2. **不要碰 fast-sandbox**：它需要节点的 `/dev/kvm`，kind 的节点是容器，跑不了 Firecracker。
3. **`opensandbox`（沙箱工作负载）namespace 要手动建**，`base` 只创建 `opensandbox-system` 和 `opensandbox-dataplane`。

**如果你要改 controller 代码**，还有一条更贴合开发的路径：[`kubernetes/`](https://github.com/opensandbox-group/OpenSandbox/blob/main/kubernetes/Makefile) 目录下有完整的 make 目标，会自己建 kind 集群、build controller 镜像、load 进集群、装 CRD：

```bash
cd kubernetes
make setup-test-e2e     # 创建 kind 集群（默认名 sandbox-k8s-test-e2e）
make install-e2e-deps   # 装 CRD + controller
make test-e2e-core      # 跑 Core 标签的 e2e
make cleanup-test-e2e   # 删集群
```

这条路径比手写 helm install 更适合"改代码 → 验证"的循环，因为镜像构建和加载都自动化了。

---

## 明确不建议的路径

| 别做的 | 原因 |
| --- | --- |
| 先看 [deployment 首页](https://open-sandbox.ai/deployment/) 然后直接上 Helm | 它只讲 K8s 部署，会跳过 SDK/execd/egress 这些更容易理解的部分 |
| 用伞形 chart 作为第一步 | 一次装 7 个组件，出问题无法定位，也学不到分层 |
| 用 ACK/真实云集群学习（[`docs/deployment/ack.md`](https://open-sandbox.ai/deployment/ack)） | 费用和清理成本高，且大部分问题会被云平台掩盖 |
| 学习阶段启用 fast-sandbox | 需要裸金属 KVM、外挂镜像构建、外部 commit pin，复杂度和学习收益不成比例 |

---

## 建议的时间顺序

1. **Docker + 源码方式跑 server，跑通 Python SDK 示例**（半天）→ 理解生命周期闭环
2. **读 `services/docker/runtime.py` + [`specs/execd-api.yaml`](https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/execd-api.yaml)**，动手 `docker exec` 进沙箱看 execd（半天到一天）→ 理解数据面
3. **装 `osb` CLI 做同样的操作**（半小时）→ 验证自己理解了 API，因为 CLI 是最薄的封装
4. **kind + 逐组件 Helm，只装 base + controller，用 YAML 创建 Pool 和 BatchSandbox**（一天）→ 理解 CRD 和 reconcile
5. **再加 gateway + server，跑 K8s 模式的 SDK 示例**（半天）→ 理解 `mode = "gateway"` 与 `direct` 的差别，也就是 K8s 与 Docker 两条路径的根本分叉点

走完这五步，你就把六个 surface 里的 client、protocol、control plane、runtime backends、data plane 都实际碰过一遍了，剩下的 network/security 面可以按需深入（`components/egress` 和 [`docs/guides/credential-vault.md`](https://open-sandbox.ai/guides/credential-vault)）。
