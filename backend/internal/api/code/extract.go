package code

import (
	"html"
	"regexp"
	"strings"
)

var (
	contextCodePatterns = []contextCodePattern{
		{pattern: regexp.MustCompile(`(?i)(?:验证码|校验码|动态码|verification\s+code|verify\s+code|otp)[^0-9A-Za-z]{0,24}([A-Z0-9]{4,8})`)},
		{pattern: regexp.MustCompile(`(?i)\bcode\b[^0-9A-Za-z]{0,24}([A-Z0-9]{4,8})`)},
		{pattern: regexp.MustCompile(`(?i)([A-Z0-9]{4,8})[^0-9A-Za-z]{0,24}(?:验证码|校验码|动态码|verification\s+code|verify\s+code|otp)`), requireDigit: true},
		{pattern: regexp.MustCompile(`(?i)([A-Z0-9]{4,8})[^0-9A-Za-z]{0,24}\bcode\b`), requireDigit: true},
	}
	openAICodePattern   = regexp.MustCompile(`(?i)temporary\s+verification\s+code\s+to\s+continue[^0-9]{0,200}([0-9]{6})`)
	fallbackCodePattern = regexp.MustCompile(`\b([0-9]{4,8})\b`)
	tagPattern          = regexp.MustCompile(`(?s)<[^>]*>`)
	spacePattern        = regexp.MustCompile(`\s+`)
)

type contextCodePattern struct {
	pattern      *regexp.Regexp
	requireDigit bool
}

func ExtractVerificationCode(platform string, subject string, textBody string, htmlBody string) (string, bool) {
	parts := []string{textBody, htmlToText(htmlBody), subject}
	if code, ok := extractForPlatform(platform, parts); ok {
		return code, true
	}
	for _, part := range parts {
		if code, ok := extractWithContext(part); ok {
			return code, true
		}
	}

	combined := strings.TrimSpace(strings.Join(parts, "\n"))
	if len([]rune(combined)) > 400 {
		return "", false
	}
	matches := fallbackCodePattern.FindAllStringSubmatch(combined, -1)
	if len(matches) == 1 && len(matches[0]) == 2 {
		return matches[0][1], true
	}
	return "", false
}

func extractForPlatform(platform string, parts []string) (string, bool) {
	switch platform {
	case "openai":
		for _, part := range parts {
			if code, ok := extractOpenAICode(part); ok {
				return code, true
			}
		}
	}
	return "", false
}

func extractOpenAICode(value string) (string, bool) {
	match := openAICodePattern.FindStringSubmatch(value)
	if len(match) != 2 {
		return "", false
	}
	return match[1], true
}

func extractWithContext(value string) (string, bool) {
	for _, codePattern := range contextCodePatterns {
		match := codePattern.pattern.FindStringSubmatch(value)
		if len(match) == 2 && (!codePattern.requireDigit || strings.ContainsAny(match[1], "0123456789")) {
			return strings.ToUpper(match[1]), true
		}
	}
	return "", false
}

func htmlToText(value string) string {
	if value == "" {
		return ""
	}
	value = strings.ReplaceAll(value, "<br>", "\n")
	value = strings.ReplaceAll(value, "<br/>", "\n")
	value = strings.ReplaceAll(value, "<br />", "\n")
	value = tagPattern.ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	return strings.TrimSpace(spacePattern.ReplaceAllString(value, " "))
}
