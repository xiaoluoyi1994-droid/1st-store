# 运行环境

需要Node.js 20或更新版。进入本Skill的scripts目录，运行 `npm install`，然后 `npx playwright install chromium`。可使用本机Chrome，在配置写入 `"browser":{"channel":"chrome","headless":true,"delay_ms":1600,"max_reply_clicks":5}`，无需安装额外Chromium。

入口为 `node scripts/cli.mjs help`。配置、sessions和data位置均基于配置文件所在目录；运行不依赖终端当前目录。Skill脚本位于持久安装目录时，配置也应放用户自己的持久目录，不能放本次聊天临时目录。

Windows可使用PowerShell或cmd，路径含空格时加双引号。首次login弹出浏览器后用户自己扫码/登录，回终端按回车。定时运行需要这台电脑开机、联网、可用浏览器且会话仍有效。一次真实运行成功后再安装计划。Linux/macOS日任务使用crontab，Windows使用任务计划程序；时区取运行机器本地时区，config.timezone只是业务显示配置，不会改变系统时区。间隔任务用daemon，关闭进程就停止。

崩溃后run.lock可能遗留。确认旧进程退出后删除data/run.lock；不得在旧任务仍运行时删锁。依赖或会话缺失会报告失败，不会伪造空名单。
