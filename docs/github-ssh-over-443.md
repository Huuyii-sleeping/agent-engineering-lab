# GitHub SSH Over 443 沉淀

## 背景

这台机器访问 GitHub 时，HTTPS 推送链路不稳定：

- `github.com` 可以解析 DNS
- 可以 `ping github.com`
- 但 `github.com:443` 的 TCP 连接失败

这会导致下面这种错误：

```text
fatal: unable to access 'https://github.com/<owner>/<repo>.git/':
Failed to connect to github.com port 443
```

实测发现：

- `ssh.github.com:443` 可连通
- `github.com:22` 也可连通

因此最终采用的方案是：

- 仓库远端从 `HTTPS` 切换到 `SSH`
- SSH 不走默认的 `github.com:22`
- 而是通过 `~/.ssh/config` 强制改走 `ssh.github.com:443`

## 当前采用的方案

### 1. 仓库远端改为 SSH

原始远端：

```bash
git remote set-url origin https://github.com/Huuyii-sleeping/agent-engineering-lab.git
```

切换后：

```bash
git remote set-url origin git@github.com:Huuyii-sleeping/agent-engineering-lab.git
```

查看结果：

```bash
git remote -v
```

期望输出类似：

```text
origin  git@github.com:Huuyii-sleeping/agent-engineering-lab.git (fetch)
origin  git@github.com:Huuyii-sleeping/agent-engineering-lab.git (push)
```

### 2. 用户级 SSH 配置改为走 443

文件：

```text
C:\Users\Lenovo\.ssh\config
```

内容：

```sshconfig
Host github.com
  HostName ssh.github.com
  User git
  Port 443
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

这段配置的含义是：

- Git 仍然使用 `git@github.com:...` 这种标准 SSH 远端
- 但 SSH 会自动把目标改写成：
  - 主机：`ssh.github.com`
  - 端口：`443`

## 验证方式

### 1. 测试 443 链路

```powershell
Test-NetConnection ssh.github.com -Port 443
```

如果 `TcpTestSucceeded` 为 `True`，说明网络链路可走。

### 2. 测试 SSH 认证

```bash
ssh -T git@github.com
```

成功时会看到类似输出：

```text
Hi <github-username>! You've successfully authenticated, but GitHub does not provide shell access.
```

这不是报错，而是 GitHub 的正常成功提示。

### 3. 测试推送

```bash
git push
```

## 实际踩坑记录

### 1. `~/.ssh/config` 不能带 UTF-8 BOM

如果用带 BOM 的 UTF-8 写入，OpenSSH 可能报：

```text
Bad configuration option: \357\273\277host
```

原因是第一行的 `Host` 前面被写进了 BOM。

建议：

- 用 ASCII 或 UTF-8 无 BOM 保存 `~/.ssh/config`

### 2. SSH 能连通不等于公钥已生效

如果出现：

```text
Permission denied (publickey)
```

说明网络已经通了，但当前私钥没有被 GitHub 账号信任。

需要确认：

- 本机存在私钥，例如：
  - `C:\Users\Lenovo\.ssh\id_ed25519`
- 对应公钥已经添加到 GitHub 账号的 SSH keys

### 3. 沙箱用户和真实用户不是同一个家目录

有些命令在受限环境里会读到另一个 `HOME`，导致看到的不是 `C:\Users\Lenovo\.ssh\config`。

遇到这种情况时，应优先以真实用户环境验证：

- 真实 `HOME`
- 真实 `~/.ssh/config`
- 真实 `id_ed25519`

## 适用场景

这套方案适用于以下情况：

- HTTPS 推送不稳定或被拦截
- `github.com:443` 直连失败
- `ssh.github.com:443` 可连通
- 本机已经有 SSH key，或可以补充 SSH key

## 最小恢复步骤

如果以后需要重新配置，只做下面两步即可：

1. 把远端切成 SSH：

```bash
git remote set-url origin git@github.com:<owner>/<repo>.git
```

2. 把 `~/.ssh/config` 写成：

```sshconfig
Host github.com
  HostName ssh.github.com
  User git
  Port 443
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

然后执行：

```bash
ssh -T git@github.com
git push
```
