package admin

import (
	"net/http"

	"github.com/cf-email/backend/internal/config"
	"github.com/cf-email/backend/internal/httpapi"
)

type updateSystemConfigReq struct {
	IngestToken   *string `json:"ingest_token,omitempty"`
	IngestSecret  *string `json:"ingest_secret,omitempty"`
	SessionSecret *string `json:"session_secret,omitempty"`
	AdminUsername *string `json:"admin_username,omitempty"`
	AdminPassword *string `json:"admin_password,omitempty"`
}

func (s *Server) handleGetSystemConfig(w http.ResponseWriter, _ *http.Request) {
	httpapi.WriteJSON(w, http.StatusOK, s.Config.SystemSettings())
}

func (s *Server) handleUpdateSystemConfig(w http.ResponseWriter, r *http.Request) {
	var req updateSystemConfigReq
	if err := httpapi.DecodeJSON(r, &req); err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: "invalid body"})
		return
	}

	settings, err := s.Config.UpdateSystemSettings(config.SystemPatch{
		IngestToken:   req.IngestToken,
		IngestSecret:  req.IngestSecret,
		SessionSecret: req.SessionSecret,
		AdminUsername: req.AdminUsername,
		AdminPassword: req.AdminPassword,
	})
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadRequest, httpapi.Error{Error: err.Error()})
		return
	}

	httpapi.WriteJSON(w, http.StatusOK, settings)
}
