# Fork 定制开发与上游同步指引

本仓库 Fork 自 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)。
本文档描述如何在保持定制开发的同时，长期、低冲突地合并上游更新。

---

## 目录

- [远程配置](#远程配置)
- [分支策略](#分支策略)
- [日常开发流程](#日常开发流程)
- [合并上游更新](#合并上游更新)
- [减少冲突的实践](#减少冲突的实践)
- [Git 别名快捷命令](#git-别名快捷命令)
- [常见场景速查](#常见场景速查)
- [故障排查](#故障排查)

---

## 远程配置

Fork 仓库需要两个远程：

| 远程 | 仓库 | 用途 |
|------|------|------|
| `origin` | `https://github.com/Yang-Kevin-DH/deepseek-harness.git` | 你的 Fork，日常 push/pull |
| `upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` | 原始仓库，仅 fetch 跟踪更新 |

### 初始配置命令

```sh
# 添加 upstream 远程（origin 已由 Fork 自动配置）
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git

# 禁止向 upstream 推送，防止误操作
git remote set-url --push upstream DISABLE

# 验证配置
git remote -v
```

预期输出：

```
origin    https://github.com/Yang-Kevin-DH/deepseek-harness.git (fetch)
origin    https://github.com/Yang-Kevin-DH/deepseek-harness.git (push)
upstream  https://github.com/deepseek-ai/deepseek-harness.git   (fetch)
upstream  DISABLE                                              (push)
```

### 首次拉取上游

```sh
git fetch upstream
```

此命令会获取上游所有分支和标签到本地，但不修改工作区。

---

## 分支策略

### 核心原则：保持 `master` 干净

```
master            ← 只跟踪上游，保持可 fast-forward，不做定制改动
feature/*         ← 定制功能分支，从 master 切出
fix/*             ← 定制修复分支
```

**`master` 分支的唯一职责是跟踪 `upstream/master`。** 所有定制开发在独立分支上进行。这样上游更新时 `master` 可以快速合并，功能分支再基于更新后的 `master` 进行 rebase 或 merge。

### 分支命名约定

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feature/` | 新增定制功能 | `feature/custom-profile` |
| `fix/` | 定制修复 | `fix/workaround-xxx` |
| `chore/` | 构建/配置定制 | `chore/custom-deps` |

---

## 日常开发流程

### 1. 从最新的 master 切出功能分支

```sh
# 确保 master 是最新的
git checkout master
git pull upstream master          # 拉取上游最新
git push origin master            # 同步到你的 Fork

# 切出功能分支
git checkout -b feature/my-customization
```

### 2. 开发并提交

```sh
# 编写代码...
git add <files>
git commit -m "feat: 添加 XXX 定制功能"
```

### 3. 推送到你的 Fork

```sh
git push -u origin feature/my-customization
```

`-u` 设置上游跟踪，之后只需 `git push` 即可。

### 4. 持续开发期间保持同步

功能分支开发周期较长时，定期将上游更新合入：

```sh
git fetch upstream
git checkout master
git merge upstream/master
git push origin master

git checkout feature/my-customization
git rebase master                 # 将你的提交重放到最新 master 之上
# 如有冲突，解决后：
git rebase --continue
git push origin feature/my-customization --force-with-lease
```

---

## 合并上游更新

### 完整同步流程

```sh
# ── 第一步：拉取上游最新 ──
git fetch upstream

# 查看上游有哪些新提交
git log --oneline master..upstream/master

# ── 第二步：同步 master ──
git checkout master
git merge upstream/master
# 由于 master 保持干净，此处通常为 fast-forward
git push origin master

# ── 第三步：将更新合入功能分支 ──
git checkout feature/my-customization
git rebase master
# 解决冲突（如有）后：
git rebase --continue
git push origin feature/my-customization --force-with-lease
```

### rebase vs merge 选择指南

| 方式 | 适用场景 | 优点 | 注意 |
|------|----------|------|------|
| `git rebase master` | 功能分支未发布或仅自己使用 | 线性历史，定制提交始终在上游之上 | 改写历史，需 `--force-with-lease` 推送 |
| `git merge master` | 功能分支已发布且他人基于它工作 | 不改写历史，安全 | 产生 merge commit，历史非线性 |

**推荐默认使用 `rebase`**，保持历史清晰。仅当分支已被他人拉取使用时改用 `merge`。

### 处理 rebase 冲突

```sh
git rebase master
# 冲突时 Git 会暂停并提示冲突文件

# 1. 查看冲突文件
git status

# 2. 编辑冲突文件，解决 <<<<<<< ======= >>>>>>> 标记

# 3. 标记已解决
git add <resolved-files>

# 4. 继续 rebase
git rebase --continue

# 如果需要放弃本次 rebase
git rebase --abort
```

---

## 减少冲突的实践

### 1. 优先新增文件而非修改原文件

新增的文件不会与上游改动冲突。例如添加自定义插件、配置文件时，创建新文件而非修改现有文件。

### 2. 利用配置覆盖而非改源码

本项目支持 cordis.yml overlay 机制（见 [`AGENTS.md`](AGENTS.md)）。优先通过配置覆盖行为，而非修改源码：

```yaml
# cordis.yml overlay 示例
plugins:
  my-custom-plugin:
    config:
      customOption: true
```

### 3. 必须改原文件时，集中改动并标记

用统一注释标记定制改动，便于冲突解决和审计：

```ts
// [CUSTOM-BEGIN] 定制改动：添加 XXX 功能
export const myCustomConfig = { /* ... */ };
// [CUSTOM-END]
```

### 4. 避免大规模重命名和移动

重命名、移动文件几乎必然与上游冲突。如需调整结构，优先在上游稳定后再操作。

### 5. 定期同步，不要积压

| 同步频率 | 冲突规模 | 建议 |
|----------|----------|------|
| 每周一次 | 小 | 推荐 |
| 每个上游 release | 中 | 可接受 |
| 积压数月 | 大 | 避免 |

---

## Git 别名快捷命令

将常用操作配置为 Git alias，简化日常命令：

```sh
# 一键同步 master 到上游
git config alias.sync-upstream '!git fetch upstream && git checkout master && git merge upstream/master && git push origin master && echo "✓ master 已同步至上游最新"'

# 查看上游领先本地的提交
git config alias.upstream-log 'log --oneline master..upstream/master'

# 功能分支 rebase 到最新 master（先同步 master 再 rebase）
git config alias.rebase-latest '!git fetch upstream && git checkout master && git merge upstream/master && git push origin master && git checkout - && git rebase master'
```

配置后使用：

```sh
git sync-upstream          # 同步 master
git upstream-log           # 查看上游新提交
git rebase-latest          # 同步并 rebase 当前分支
```

---

## 常见场景速查

### 场景一：开始新的定制功能

```sh
git checkout master && git pull upstream master
git checkout -b feature/new-feature
# 开发...
git push -u origin feature/new-feature
```

### 场景二：上游发布了新版本，想合并

```sh
git sync-upstream
git checkout feature/my-feature
git rebase master
# 解决冲突...
git push --force-with-lease
```

### 场景三：只想查看上游有什么新东西

```sh
git fetch upstream
git log --oneline master..upstream/master
git diff master..upstream/master --stat    # 查看文件变更概览
```

### 场景四：rebase 搞砸了，想回退

```sh
# 查看操作历史
git reflog

# 回退到 rebase 前的状态（找到 rebase 前的 HEAD）
git reset --hard HEAD@{N}    # N 为 reflog 中 rebase 前的序号
```

### 场景五：将已完成的定制功能合并回 master

```sh
git checkout master
git merge feature/my-feature       # 或 git rebase feature/my-feature
git push origin master
```

> 注意：合并到 master 后，该 master 将与 `upstream/master` 产生分叉。后续同步上游时将无法 fast-forward，需要处理合并冲突。因此建议仅在功能分支上长期维护定制改动，master 保持干净。

---

## 故障排查

### `git push origin master` 被拒绝（non-fast-forward）

你的 Fork 的 master 落后于远程。先拉取再推送：

```sh
git pull origin master --rebase
git push origin master
```

### `git push upstream` 报错

这是预期行为——upstream push 已设为 `DISABLE`。定制改动只应推送到 `origin`（你的 Fork）。

### rebase 后推送被拒绝

rebase 改写了历史，需要强推。**始终使用 `--force-with-lease` 而非 `--force`**：

```sh
git push origin feature/my-feature --force-with-lease
```

`--force-with-lease` 会在远程有他人新提交时拒绝推送，比 `--force` 更安全。

### 合并上游后大量冲突

说明积压太久或修改了上游频繁改动的文件。应对策略：

1. 用 `git checkout --theirs <file>` 或 `git checkout --ours <file>` 批量处理明确归属的文件
2. 对定制标记区域（`[CUSTOM-BEGIN]` / `[CUSTOM-END]`）手动保留定制改动
3. 考虑将定制改动重构为独立文件或配置 overlay，减少对原文件的直接修改
