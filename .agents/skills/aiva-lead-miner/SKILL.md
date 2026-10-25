---
name: aiva-lead-miner
description: 按罗翊圈选的竞品抖音和小红书账号采集可访问评论，筛出汽车购车意向，输出客户账号名称、平台ID、评论原文和时间戳。用于单次、增量、定期评论采集，以及修改圈选账号和查看采集覆盖报告；不将评论候选当作已授权销售线索。
---

# AIVA汽车线索挖掘

执行第一期采集，保持用户指定账号范围，保留原始评论和时间证据。使用随附可执行程序，不把Skill描述当作已经运行的采集任务。

## 输入与圈选

读取用户本地任务配置，或接受用户给出的抖音/小红书完整主页链接、任务名称和圈选范围。只有昵称/抖音号时，请用户提供主页分享链接，不能猜测同名账号。说明客户ID类型：抖音通常是页面返回的sec_uid，小红书是user_id；两者不保证等于可见抖音号/小红书号。允许缺失字段，明确标记，禁止补造ID和时间。

使用 `scripts/cli.mjs`。命令示例中的 `<SKILL>` 指当前Skill目录，`<CONFIG>` 指用户自己的绝对配置路径；随Skill重命名时重新解析路径，不保留本次会话的工作目录。

1. `node <SKILL>/scripts/cli.mjs init --config <CONFIG>` 创建无圈选账号的配置。
2. `node <SKILL>/scripts/cli.mjs add --config <CONFIG> --platform douyin --url <主页链接> --id <任务ID> --label <竞品名称>` 添加账号；小红书用 `xiaohongshu`。
3. `node <SKILL>/scripts/cli.mjs select --config <CONFIG> --ids <ID1,ID2>` 保存本次及后续运行范围。先报告选中账号清单；已有明确圈选则直接继续。
4. 阅读 `references/access-and-sources.md` 判断数据源与访问边界。按用户已给出的圈选要求继续采集，不重复要求确认；不能因“页面公开”声称取得任意用途授权。
5. 浏览器模式缺登录状态时，运行 `login --config <CONFIG> --platform <平台>`，请用户在自己的电脑浏览器内完成登录。不能绕过验证、获取他人Cookie或使用隐蔽签名接口。依赖安装见 `references/runtime.md`。

## 抓取与交付

执行 `node <SKILL>/scripts/cli.mjs run --config <CONFIG>`。用户明确指定一次性范围时可附加 `--targets <ID1,ID2>`；该参数不改变下一次定时任务的已保存圈选。

浏览器采集程序只解析正常账号页面和作品页面返回的数据，按主页请求账号、作品ID二次约束，忽略推荐流及范围外评论。不保证每个平台字段或页面结构长期不变。记录作品数、评论数、登录/验证状态、数量上限和未展开回复。抓取失败、结构变化与“确实返回零条评论”必须区分；浏览器返回 `limited` 时不得声称全量覆盖。

按 `references/intent-rules.md` 使用可解释的汽车意向规则筛选询价、试驾、选车、购车计划、置换和交付咨询。第一期不使用成交概率、个人身份推断或付费模型调用。条件性表达保留标签，已提车/明确不买/同行招揽按当前规则排除；用户可修改关键词。

交付任务返回的 `output_dir` 下文件：
- `new-leads.csv`：本次新增意向候选，UTF-8 BOM，可用Excel打开。
- `new-leads.jsonl`：原文及机器可读记录，可供后续Agent接入。
- `selected-leads.csv`：当前圈选账号在回溯范围内的累计候选。
- `report.json`：本次范围、状态、覆盖与失败原因。

每条候选前四列为客户账号名称、客户账号ID、意向表达评论、评论时间戳。补充平台、ID类型、来源账号/作品/评论ID、采集时间和待核验项。评论时间转为UTC ISO8601，并保留原始值；采集时间不能替代评论时间。数据字段详见 `references/data-contract.md`。

## 定期执行

用户给出账号范围、运行电脑和频率后，先真实执行一次并检查覆盖报告。再安装系统计划任务或常驻执行：

- Windows/Linux/macOS每天运行：`schedule --config <CONFIG> --daily 10:00 --install`。先说明运行机器本地时区；本命令不覆盖已有同名任务。
- 按间隔运行：`daemon --config <CONFIG> --hours 6`。需要持续运行的电脑或服务器；每次重新读取圈选配置。
- 仅查看计划：去掉 `--install`。停止系统计划：`schedule --remove`。

任务未创建或未启动时，只说“定时能力已提供”，不能说已经在后台持续采集。若使用ChatGPT的Automations，需要先验证该运行环境能访问真实数据源；本地会话不会自动传入云端任务。空圈选或未验证访问时，不创建反复失败的云端任务。

## 后续升级

保持 `runJob(configFile, options)`、schema_version、平台ID类型、record_key和job_id契约。按 `references/agent-platform-extension.md` 接入Agent、MCP或平台任务队列，复用采集与输出。公开通用代码和虚构示例；真实账号清单、Cookie、结果名单留在用户本地，不提交公共仓库。新媒体侧交付评论候选，后续自主留资与商机清洗分发独立处理。
