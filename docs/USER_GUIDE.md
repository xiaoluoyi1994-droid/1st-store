# AIVA汽车线索挖掘使用说明

版本0.1.1，2026年10月25日。原说明来自2026年10月9日的生成记录，本版同步正确性修订与验证边界。本说明用于评论意向采集：按圈选竞品账号获取可访问评论，输出客户账号名称、平台ID、意向表达原文和评论时间戳。重点是采集与追溯；新媒体交付候选清单，后续自主留资、商机清洗和门店承接作为独立流程。

## 1 运行前准备

准备一台可持续运行的Windows、Linux或macOS电脑；安装Node.js 20或更新版、Git。准备竞品的完整主页链接和自己的抖音/小红书浏览器登录状态。

主页格式：
- 抖音：`https://www.douyin.com/user/<sec_uid>`。
- 小红书：`https://www.xiaohongshu.com/user/profile/<user_id>`。

仅有昵称或账号展示号时，请先在平台打开正确账号主页，复制完整链接。短链接先在正常浏览器中打开。不自动匹配同名账号。

程序读取正常页面实际返回的数据。页面可访问不保证评论全部可获取；首次运行需要核查实际字段、登录状态及覆盖报告。

## 2 安装与初始化

在PowerShell或终端执行以下命令。路径中的空格要保留引号。

```powershell
git clone https://github.com/xiaoluoyi1994-droid/1st-store.git
cd 1st-store
cd .agents/skills/aiva-lead-miner/scripts
npm install
npx playwright install chromium
cd ../../../..
node .agents/skills/aiva-lead-miner/scripts/cli.mjs init --config config.json
```

init创建配置，不会自动选中任何真实账号，也不会覆盖已有配置。若使用已安装Chrome，在config.json的browser对象增加 `"channel":"chrome"`；例：

```json
"browser": {"channel":"chrome", "headless":true, "delay_ms":1600, "max_reply_clicks":5}
```

配置默认回溯30天、最多10条作品、每条最多200条评论、8轮页面滚动。更改config.json的lookback_days和limits即可调整。即使调大上限，也不能推定平台全量覆盖。

## 3 添加和圈选竞品账号

下面尖括号里的内容需要替换为你实际的主页链接，不要原样执行。

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs add --config config.json --platform douyin --url "<完整抖音主页链接>" --id dy-01 --label "竞品抖音账号一"
node .agents/skills/aiva-lead-miner/scripts/cli.mjs add --config config.json --platform xiaohongshu --url "<完整小红书主页链接>" --id xhs-01 --label "竞品小红书账号一"
node .agents/skills/aiva-lead-miner/scripts/cli.mjs select --config config.json --ids dy-01,xhs-01
node .agents/skills/aiva-lead-miner/scripts/cli.mjs list --config config.json
```

添加后默认未圈选；select保存圈选范围。任务ID自己命名，必须唯一，只使用字母、数字、横线和下划线。名称仅用于识别，实际范围以主页ID和作品ID判断。

以后改为只抓抖音账号：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs select --config config.json --ids dy-01
```

后续定期任务会读取这个新范围。一次性抓取另一个已添加账号可以在run后加 `--targets xhs-01`，不改变已保存的定期圈选范围。

## 4 本人登录

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs login --config config.json --platform douyin
node .agents/skills/aiva-lead-miner/scripts/cli.mjs login --config config.json --platform xiaohongshu
```

浏览器弹出后，你自己扫码或完成平台登录。确认登录成功，再回到终端按回车。程序将会话保存到配置旁的sessions目录；不会把Cookie上传GitHub。

这一步登录你自己的浏览账号，不是登录竞品账号。不要提供密码或他人Cookie给AI。保存会话并不证明平台采集权限或持续可用性；实际访问限制会在运行时报告。

## 5 单次采集

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs run --config config.json
```

程序依次打开圈选主页，读取该主页返回的作品列表，打开这些作品并滚动评论。普通页面提供的展开回复按钮也会按上限尝试展开。仅处理圈选账号作品，忽略推荐内容和其他账号响应。

查看终端返回的output_dir，目录内包含：

| 文件 | 内容 |
|---|---|
| new-leads.csv | 本次新增候选，Excel可直接打开 |
| new-leads.jsonl | 本次新增机器可读记录，保留原文 |
| selected-leads.csv | 当前圈选账号在回溯窗口内的累计候选 |
| report.json | 范围、状态、观察到的评论数、覆盖与失败原因 |

CSV的前四列固定为客户账号名称、客户账号ID、意向表达评论、评论时间戳。辅助字段含原始时间、ID类型、平台、竞品账号、作品/评论ID、来源链接、意向标签和采集时间。

ID是平台实际返回的标识。抖音通常为sec_uid，小红书为user_id，不保证等于展示号，也不是手机、微信或实名。

评论时间转为UTC，例如 `2026-10-09T08:00:00.000Z` 对应北京时间当日16:00；原始秒/毫秒值另列保留。字段缺失会标记“待核验”，不能用采集时间替代评论发布时间。

名单按评论级去重。同一个客户发表不同意向评论，会保留多行。第二次运行不会再次把同一评论列入新增，但累计清单仍保留记录。切换圈选后，当前导出不包含未圈选账号的历史记录。

## 6 意向表达规则

第一期使用可解释规则，覆盖询价、试驾、购车计划、置换、交付咨询和选车比较。纯赞美、明确不买、已提车和同行招揽按现有规则排除；条件性表达保留标签供复核。

规则可能漏掉混合表达、反讽、间接需求和增购场景，候选需要人工审核。可在config.json的intent_keywords补充字面关键词；详细规则见Skill的references/intent-rules.md。第一期不提供模型准确率或成交概率。

## 7 定时与定期运行

先完成一次真实运行并检查report，再选择以下方式。**时间以运行电脑本地时区为准**；中国业务电脑建议设为北京时间。config.timezone不会修改系统时区。

每天10:00运行，先预览：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs schedule --config config.json --daily 10:00
```

确认预览后安装到Windows任务计划或Linux/macOS的cron：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs schedule --config config.json --daily 10:00 --install
```

任务名称为AIVA-Lead-Miner。已有同名任务会报错，不自动覆盖。Windows以当前用户任务运行，按机器策略可能要求用户保持登录；机器关机、休眠或会话失效都可能中断采集。路径在创建计划时解析为绝对路径，移动整个安装目录后需重建计划。

取消日任务：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs schedule --remove
```

每6小时运行一次可用常驻模式：

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs daemon --config config.json --hours 6
```

常驻模式立即运行一次，之后等待指定间隔；不是每次强制对齐整点。Ctrl+C停止，关闭进程停止。每次运行重新读取圈选清单，暂时失败会报告，下一轮继续尝试。

本次发布不启动GitHub Actions采集，也不上传客户名单。离线测试可按本说明手动运行。发布代码不会自动开启定期采集。未给出真实账号、登录状态、运行机器和频率时，本项目仅交付定时能力，不宣称任务已启动。

## 8 状态与故障处理

读取data/latest-report.json。退出码0为成功，2为部分失败，1为全部失败或配置错误；成功不代表全量采集。

| 情况 | 处理 |
|---|---|
| 未圈选账号 | 使用select保存范围 |
| LOGIN_REQUIRED | 对相应平台重新运行login |
| BROWSER_UNAVAILABLE | 安装Chromium，或配置channel为chrome |
| 平台验证/限流 | 暂停采集，在正常浏览器人工处理并降低频率 |
| PROFILE_SCHEMA_CHANGED / COMMENT_SCHEMA_CHANGED | 页面结构或字段已变化，更新对应解析器并验证 |
| 未观察到主页作品列表 | 检查登录、主页、可访问作品及页面改动；不推定无潜客 |
| ID/时间缺失 | 保留待核验项；不虚构补全 |
| 已有运行任务或遗留锁 | 确认旧任务结束后再删除data/run.lock |
| 状态文件损坏 | 先备份state.json，修复或移走后再运行，不直接覆盖 |

浏览器模式始终标记coverage:limited。数量上限、页面滚动、验证、嵌套回复以及作品可访问范围都会影响覆盖。没有捕获任何正常评论列表响应与平台明确返回空列表，是不同状态。

state.json用于本地增量记录，不是完整CRM；不会自动同步平台后续删除。lookback_days限制当前导出窗口，历史状态不会自动清理。清理需由使用者确认后备份并删除data目录。

## 9 无登录离线演示

```powershell
node .agents/skills/aiva-lead-miner/scripts/cli.mjs demo --config demo/config.json
node .agents/skills/aiva-lead-miner/scripts/cli.mjs run --config demo/config.json
node .agents/skills/aiva-lead-miner/scripts/cli.mjs select --config demo/config.json --ids demo-xhs
node .agents/skills/aiva-lead-miner/scripts/cli.mjs run --config demo/config.json
```

demo命令会创建虚构样本配置，默认只圈选虚构抖音账号，不覆盖已有文件。mode为fixture、coverage为synthetic，不能当真实业务成果汇报。

## 10 升级为Agent与平台

Agent复用core.mjs的runJob入口，读取report与JSONL，做失败处理、语义复核和运营摘要。平台增加账号圈选界面、租户隔离、任务队列、会话管理、数据库与下载；保留schema_version、record_key、job_id及时间语义。

已预留HTTP数据源契约，可对接获得权限的官方/第三方服务；未提供任何声称开通任意竞品评论权限的官方接口。该适配契约见Skill的references/access-and-sources.md。

当前未交付Web平台、远程常驻服务器、LLM评分或自动联系客户能力。

## 11 公开范围和验证记录

公开通用代码、规则、使用说明与虚构样本。config.json、sessions、data、客户结果、日志和环境变量不提交仓库。本说明只适度承接新媒体的账号归属、来源记录和复盘逻辑，不公开用户上传的内部文档及表格。

已运行离线测试：圈选范围、重复运行、长ID字符串、秒/毫秒时间、缺失时间、评论回复映射、跨账号返回、CSV公式防护、状态异常和计划命令生成。尚未用真实用户登录环境验证抖音/小红书端到端覆盖，也未在用户Windows电脑安装任务计划。验收须根据实际抓取范围、字段完整性和人工复核结果填写，不能预设提效量级。

## 12 本次修订的边界

HTTP 数据被本地数量上限截断时，覆盖报告改为 limited。同一任务 ID 改绑平台或账号时，累计导出按当前平台与账号过滤历史。无评论 ID 时，秒／毫秒时间统一后再生成本地回退去重键。

0.1.0 已有无 ID 历史记录的回退键未自动迁移；继续使用旧 state.json 可能首次重复。先备份旧数据，在独立目录验证再决定保留或重新建立状态。真实 ID 记录不受这一时间归一化变更影响。

当前离线测试与实测边界以 [验证记录](VALIDATION.md) 为准。
