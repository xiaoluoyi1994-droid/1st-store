# AIVA 汽车线索挖掘

按圈选的抖音 / 小红书账号采集可访问评论，导出客户账号名称、平台 ID、意向表达原文和评论时间戳。

## 当前状态

- 提供浏览器、用户自备 HTTP 服务和虚构样本三种输入。浏览器适配尚未在真实账号环境验证。
- 离线测试验证代码行为，不证明平台采集覆盖或线索有效率。
- 定时命令已提供；发布仓库不会启动真实采集。
- 评论候选供人工复核，不等于已授权销售线索。

## 开始使用

完整安装、圈选、登录、单次与定期运行见 [使用说明](docs/USER_GUIDE.md)。

无需平台登录的离线演示（在仓库根目录执行，需要 Node.js 20+）：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs demo --config demo/config.json
node .agents/skills/aiva-lead-miner/scripts/cli.mjs run --config demo/config.json
```

运行离线测试：

```powershell
node --test .agents/skills/aiva-lead-miner/scripts/tests/core.test.mjs
```

## 在 GPT 和 Codex 使用

Skill 位于 [.agents/skills/aiva-lead-miner/SKILL.md](.agents/skills/aiva-lead-miner/SKILL.md)。Codex 在该仓库工作时可发现并调用它。GPT 侧需在支持 Skill 的环境导入或安装对应版本，并以一次真实调用验证；仓库提交不会自动更新先前在 GPT 保存的副本。

连接、认证及同步说明见 [GitHub 连接说明](docs/GITHUB_CONNECTION.md)。修订依据与测试边界见 [验证记录](docs/VALIDATION.md)。专家问题与重写后的任务见 [任务定义](docs/TASK_BRIEF.md)。

公开仓库只包含通用代码、说明和虚构样本。真实账号配置、平台会话、采集结果与日志留在本机。
