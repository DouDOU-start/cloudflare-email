package ratelimit

import (
	"sync"
	"time"
)

// SlidingWindow is a simple per-key request counter with a rolling window.
// Good enough for single-instance deployments; replace with a shared store
// if we ever horizontally scale.
type SlidingWindow struct {
	window time.Duration
	limit  int
	mu     sync.Mutex
	hits   map[string][]time.Time
}

func NewSlidingWindow(window time.Duration, limit int) *SlidingWindow {
	return &SlidingWindow{window: window, limit: limit, hits: map[string][]time.Time{}}
}

// Allow records a hit for key and returns true if the key is under the limit.
func (s *SlidingWindow) Allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-s.window)
	s.mu.Lock()
	defer s.mu.Unlock()
	arr := s.hits[key]
	// Prune anything older than the window.
	i := 0
	for ; i < len(arr); i++ {
		if arr[i].After(cutoff) {
			break
		}
	}
	arr = arr[i:]
	if len(arr) >= s.limit {
		s.hits[key] = arr
		return false
	}
	arr = append(arr, now)
	s.hits[key] = arr
	return true
}

// Ban tracks failures per key with a configurable threshold and ban duration.
// Returns (bannedUntil, banned) on Record and Check.
type Ban struct {
	window    time.Duration
	threshold int
	banDur    time.Duration
	mu        sync.Mutex
	fails     map[string][]time.Time
	banned    map[string]time.Time
}

func NewBan(window time.Duration, threshold int, banDur time.Duration) *Ban {
	return &Ban{
		window:    window,
		threshold: threshold,
		banDur:    banDur,
		fails:     map[string][]time.Time{},
		banned:    map[string]time.Time{},
	}
}

// Check returns (isBanned, retryAfterSeconds).
func (b *Ban) Check(key string) (bool, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	until, ok := b.banned[key]
	if !ok {
		return false, 0
	}
	if time.Now().After(until) {
		delete(b.banned, key)
		return false, 0
	}
	return true, int(time.Until(until).Seconds())
}

// Fail records a failure. If threshold reached, the key gets banned for banDur.
func (b *Ban) Fail(key string) {
	now := time.Now()
	cutoff := now.Add(-b.window)
	b.mu.Lock()
	defer b.mu.Unlock()
	arr := b.fails[key]
	i := 0
	for ; i < len(arr); i++ {
		if arr[i].After(cutoff) {
			break
		}
	}
	arr = append(arr[i:], now)
	b.fails[key] = arr
	if len(arr) >= b.threshold {
		b.banned[key] = now.Add(b.banDur)
		delete(b.fails, key)
	}
}

// Success clears a key's fail history.
func (b *Ban) Success(key string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.fails, key)
}
