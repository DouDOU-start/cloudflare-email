package admin

import (
	"net/http"

	"github.com/cf-email/backend/internal/cleanup"
	"github.com/cf-email/backend/internal/httpapi"
)

type cleanupReq struct {
	Days int `json:"days"`
}

func (s *Server) handleCleanup(w http.ResponseWriter, r *http.Request) {
	var req cleanupReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}
	if req.Days <= 0 {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "days must be positive"})
		return
	}

	worker := &cleanup.Worker{
		Queries: s.Queries,
		Storage: s.Storage,
		Logger:  s.Logger,
	}
	deleted, err := worker.PurgeOlderThan(r.Context(), req.Days)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusInternalServerError, httpapi.Error{Error: "cleanup failed"})
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}
