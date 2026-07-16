package common

import (
	"net/url"
)

const MCPOAuthContinuationCookie = "filestash_mcp_oauth"

func NewMCPOAuthContinuation(requestID string) (string, string, error) {
	if !validMCPOAuthRequestID(requestID) {
		return "", "", ErrNotValid
	}
	value, err := EncryptString(SECRET_KEY_DERIVATE_FOR_PROOF, requestID)
	if err != nil {
		return "", "", err
	}
	return value, MCPOAuthCallback(requestID), nil
}

func ParseMCPOAuthContinuation(value string) (string, string, error) {
	requestID, err := DecryptString(SECRET_KEY_DERIVATE_FOR_PROOF, value)
	if err != nil || !validMCPOAuthRequestID(requestID) {
		return "", "", ErrNotValid
	}
	return requestID, MCPOAuthCallback(requestID), nil
}

func MCPOAuthCallback(requestID string) string {
	return WithBase("/api/mcp") + "?" + url.Values{"request_id": {requestID}}.Encode()
}

func validMCPOAuthRequestID(requestID string) bool {
	if len(requestID) != 48 {
		return false
	}
	for _, char := range requestID {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') {
			return false
		}
	}
	return true
}
