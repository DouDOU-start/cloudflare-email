# 验证码 API 使用说明

验证码 API 用于从最新未读邮件中提取验证码，适合外部自动化流程读取 OpenAI / ChatGPT 登录验证码。

## 启用方式

后端配置里需要存在 `admin_api_key`，也可以通过环境变量 `ADMIN_API_KEY` 覆盖：

```yaml
admin_api_key: "your-admin-api-key"
```

安装脚本会自动生成该值。也可以在管理后台的“系统设置”页面查看或更新。

## 请求接口

```text
POST /api/code/email
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
```

请求体：

```json
{
  "platform": "openai",
  "recipient": "user@example.com",
  "sender_suffix": "openai.com",
  "mark_read": true
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `platform` | 是 | 平台类型。当前支持 `openai`。 |
| `recipient` | 是 | 接收验证码邮件的完整邮箱地址。 |
| `sender_suffix` | 是 | 发件人域名后缀，例如 `openai.com`。允许匹配子域名。 |
| `mark_read` | 否 | 是否在成功提取后把邮件标为已读，默认 `true`。 |

## curl 示例

```bash
curl -sS -X POST 'https://your-domain.example/api/code/email' \
  -H 'Authorization: Bearer your-admin-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "openai",
    "recipient": "user@example.com",
    "sender_suffix": "openai.com"
  }'
```

成功响应：

```json
{
  "code": "123456",
  "message_id": 123,
  "from": "OpenAI <noreply@tm.openai.com>",
  "to": "user@example.com",
  "subject": "Your temporary ChatGPT login code",
  "received_at": 1714380000
}
```

只读取验证码但不标记邮件已读：

```bash
curl -sS -X POST 'https://your-domain.example/api/code/email' \
  -H 'Authorization: Bearer your-admin-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "openai",
    "recipient": "user@example.com",
    "sender_suffix": "openai.com",
    "mark_read": false
  }'
```

## 匹配规则

- 只搜索未读邮件。
- 按接收时间从新到旧检查，最多检查最近 50 封候选邮件。
- `recipient` 必须与邮件收件地址完全一致，大小写会归一化。
- `sender_suffix` 匹配发件人域名或其子域名，例如 `openai.com` 可以匹配 `openai.com` 和 `tm.openai.com`。
- 成功提取后默认把该邮件标为已读，避免重复返回同一个验证码。

## 常见状态码

| 状态码 | 说明 |
| --- | --- |
| `200` | 找到验证码。 |
| `400` | 请求体或字段无效。 |
| `401` | `Authorization` 缺失或 API Key 错误。 |
| `404` | 没有找到可提取验证码的未读邮件。 |
| `429` | 请求过快，或连续认证失败后被临时限制。 |
| `503` | 未配置 `admin_api_key`，验证码 API 未启用。 |
