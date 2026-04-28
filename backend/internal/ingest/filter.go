package ingest

import "fmt"

type Outcome string

const (
	OutcomeAccepted     Outcome = "accepted"
	OutcomeDroppedSize  Outcome = "dropped_size"
	OutcomeDroppedParse Outcome = "dropped_parse_error"
	OutcomeDroppedSig   Outcome = "dropped_bad_signature"
)

const (
	maxEmailSizeBytes = 10 * 1024 * 1024 // 10 MiB
	IngestClockSkew   = 300              // seconds
)

type Decision struct {
	Outcome Outcome
	Reason  string
}

func Accept() Decision { return Decision{Outcome: OutcomeAccepted} }
func Drop(o Outcome, reason string) Decision {
	return Decision{Outcome: o, Reason: reason}
}

// CheckSize rejects messages larger than the hardcoded ceiling.
func CheckSize(size int) Decision {
	if size > maxEmailSizeBytes {
		return Drop(OutcomeDroppedSize, fmt.Sprintf("size %d > limit %d", size, maxEmailSizeBytes))
	}
	return Accept()
}
