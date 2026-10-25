# GPT、Codex 与 GitHub 的连接

## 各连接负责什么

- Chrome 的 GitHub 登录是浏览器会话。它不等于本机 Git 或 gh 已认证。
- GitHub 连接器使用独立的应用授权；本次可识别账号和目标仓库权限。
- Git 用于本机仓库、提交、拉取和推送；gh 用于 GitHub 登录、仓库与 PR 操作。
- Codex 可调用本机 Git／gh；在本仓库中可从 .agents/skills 发现 Skill。
- 先前 GPT 保存的 Skill 是独立副本。将文件提交到仓库不会自动更新它；需在支持的环境中导入／安装更新版本并实际调用。

## 本机 CLI 登录

需要 GitHub CLI。官方安装入口：https://cli.github.com/ 。2026-10-25 本机安装的版本为 2.103.2。

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh auth setup-git --hostname github.com
gh api user --jq .login
gh repo view xiaoluoyi1994-droid/1st-store --json nameWithOwner,viewerPermission
```

在 GitHub 官方页面自行完成设备认证；不要把 token、密码或平台 Cookie 写进聊天、配置示例或仓库。若当前终端找不到 gh，可使用安装时返回的 gh.exe 完整路径。

## 文件流与后续更新

维护来源是本仓库中 .agents/skills/aiva-lead-miner 和 docs；本地编辑后检查差异、运行离线测试，再提交和推送。GPT 端使用对应提交版本的导入／安装副本，另行做一次调用验证。

```powershell
git status --short
git diff
node --test .agents/skills/aiva-lead-miner/scripts/tests/core.test.mjs
git add .agents/skills/aiva-lead-miner docs README.md .gitignore .gitattributes
git commit -m "Update AIVA lead miner"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

最后两条提交 SHA 应一致；还要重新读取远端文件或在新的目录 clone，并按使用说明运行。不要提交 demo 运行产生的配置、sessions、data 或真实结果。

## 正确性边界

上传成功只证明远端文件存在；离线演示成功只证明已测处理链路。真实平台采集须有指定账号与本人登录后的实际报告；定时运行须有计划任务及后续执行记录；GPT 使用须有目标环境的实际调用。

官方参考：
- https://cli.github.com/manual/gh_auth_login
- https://cli.github.com/manual/gh_auth_setup-git
- https://learn.chatgpt.com/docs/build-skills
