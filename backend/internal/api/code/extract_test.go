package code

import (
	"strings"
	"testing"
)

func TestExtractVerificationCode(t *testing.T) {
	tests := []struct {
		name    string
		subject string
		text    string
		html    string
		want    string
		ok      bool
	}{
		{name: "chinese text", text: "您的验证码是 123456，五分钟内有效。", want: "123456", ok: true},
		{name: "english text", text: "Your verification code: AB12CD", want: "AB12CD", ok: true},
		{name: "html only", html: "<p>验证码：<b>778899</b></p>", want: "778899", ok: true},
		{name: "openai login subject is not code", subject: "Your temporary ChatGPT login code", text: "Enter this temporary verification code to continue:" + strings.Repeat(" ignored", 10) + " 047864" + strings.Repeat(" footer", 70), want: "047864", ok: true},
		{name: "fallback short", text: "1234", want: "1234", ok: true},
		{name: "no long fallback", text: "订单号 123456 支付金额 1000 元，收货电话 13800138000，地址信息较长，不应兜底提取。", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			platform := "generic"
			if strings.HasPrefix(tt.name, "openai ") {
				platform = "openai"
			}
			got, ok := ExtractVerificationCode(platform, tt.subject, tt.text, tt.html)
			if ok != tt.ok || got != tt.want {
				t.Fatalf("ExtractVerificationCode() = %q, %v; want %q, %v", got, ok, tt.want, tt.ok)
			}
		})
	}
}
