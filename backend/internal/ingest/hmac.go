package ingest

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// VerifySignature checks that sig = hex(HMAC-SHA256(secret, timestamp + "." + body))
// and that the timestamp is within ±skew seconds of now. It uses constant-time
// comparison to avoid timing leaks.
func VerifySignature(secret, tsHeader, sigHeader string, body []byte, skew time.Duration) error {
	if tsHeader == "" || sigHeader == "" {
		return fmt.Errorf("missing signature headers")
	}
	tsMs, err := strconv.ParseInt(tsHeader, 10, 64)
	if err != nil {
		return fmt.Errorf("bad timestamp: %w", err)
	}
	delta := time.Since(time.UnixMilli(tsMs))
	if delta < 0 {
		delta = -delta
	}
	if delta > skew {
		return fmt.Errorf("timestamp outside allowed skew (%s)", delta)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(tsHeader))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(sigHeader)) {
		return fmt.Errorf("signature mismatch")
	}
	return nil
}
