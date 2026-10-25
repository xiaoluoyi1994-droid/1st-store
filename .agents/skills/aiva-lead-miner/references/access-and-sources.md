# 数据来源与可用范围

## browser

使用用户自己浏览器会话访问圈选账号主页，滚动正常页面、打开其作品、滚动评论及页面提供的展开回复按钮。只读取正常页面已经返回的JSON数据，不调用签名生成器、不构造私有评论接口请求、不逆向风控、不切换代理规避限制。每个主页返回列表必须与圈选account_id相符，每条评论必须属于已确认的该账号作品。

平台可能不给完整客户ID、可能要求登录或验证、可能不加载作品、可能改动字段。能打开页面不保证能完成采集。程序按limited覆盖交付，report记录真实状态。页面包结构与时间字段需要用户账号实测；本次开发环境不具有用户抖音/小红书登录会话。

抖音圈选使用完整 `https://www.douyin.com/user/<sec_uid>`；小红书使用完整 `https://www.xiaohongshu.com/user/profile/<user_id>`。短链接需用户在浏览器打开后复制主页链接。不能仅凭同名昵称自动匹配。

## http

用户获得官方或允许使用的数据服务后，可通过HTTPS endpoint适配。程序使用Bearer token，token值来自目标配置的token_env环境变量，不写配置。服务必须返回本文件以下契约，不能直接将未知第三方接口视为已接通：

```json
{
  "platform":"douyin",
  "target_account_id":"目标sec_uid",
  "coverage":"limited",
  "next_cursor":null,
  "comments":[{
    "target_account_id":"目标sec_uid",
    "customer_name":"平台返回昵称",
    "customer_id":"平台返回字符串ID",
    "customer_id_type":"sec_uid",
    "comment_text":"原始评论",
    "comment_timestamp_raw":1791532800,
    "content_id":"作品ID",
    "comment_id":"评论ID",
    "source_url":"作品链接"
  }]
}
```

请求参数为platform、account_id、cursor、max_posts和max_comments_per_post。评论ID和客户ID必须使用字符串，以免大整数精度损失。跨账号返回、重复游标、401/403/429和未知结构都必须报错。该契约是本项目适配协议，不是抖音/小红书官方接口规范。

## fixture

仅作离线演示和测试；虚构账号与客户均带DEMO标记。运行报告mode为fixture、coverage为synthetic，不可作为真实采集成果。

## 公开与数据保存

账号ID属于平台标识，不是手机号、微信或实名。不得将候选清单自动用于批量私信/外呼，不推断跨平台真实身份。公开仓库只放通用规则和虚构样本；本地配置、会话、采集结果、日志均排除。候选供新媒体复核，销售线索需另行记录用户自主留资和实际承接。

核查入口：
- 抖音权限说明：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/basic-capacities/douyin
- Playwright会话保存：https://playwright.dev/docs/auth
- 已公开个人信息的使用范围：https://www.cac.gov.cn/2026-08/12/c_1788195297373459.htm
