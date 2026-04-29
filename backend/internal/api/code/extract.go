package code

import (
	"html"
	"regexp"
	"strings"
)

var (
	contextCodePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:验证码|校验码|动态码|verification\s+code|verify\s+code|otp)[^0-9A-Za-z]{0,24}([A-Z0-9]{4,8})`),
		regexp.MustCompile(`(?i)\bcode\b[^0-9A-Za-z]{0,24}([A-Z0-9]{4,8})`),
		regexp.MustCompile(`(?i)([A-Z0-9]{4,8})[^0-9A-Za-z]{0,24}(?:验证码|校验码|动态码|verification\s+code|verify\s+code|otp)`),
		regexp.MustCompile(`(?i)([A-Z0-9]{4,8})[^0-9A-Za-z]{0,24}\bcode\b`),
	}
	fallbackCodePattern = regexp.MustCompile(`\b([0-9]{4,8})\b`)
	tagPattern          = regexp.MustCompile(`(?s)<[^>]*>`)
	spacePattern        = regexp.MustCompile(`\s+`)
)

func ExtractVerificationCode(subject string, textBody string, htmlBody string) (string, bool) {
	parts := []string{subject, textBody, htmlToText(htmlBody)}
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

func extractWithContext(value string) (string, bool) {
	for _, pattern := range contextCodePatterns {
		match := pattern.FindStringSubmatch(value)
		if len(match) == 2 {
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
