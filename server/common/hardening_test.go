package common

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestTransformConfigSecretsRoundTrip(t *testing.T) {
	input := []byte(`{"general":{"secret_key":"app-key"},"email":{"password":"mail-pass"},"connections":[{"token":"api-token"}]}`)
	encrypted, err := transformConfigSecrets(input, "0123456789abcdef0123456789abcdef", true, true)
	if err != nil {
		t.Fatal(err)
	}
	if string(encrypted) == string(input) || !json.Valid(encrypted) {
		t.Fatalf("expected valid encrypted JSON: %s", encrypted)
	}
	plain, err := transformConfigSecrets(encrypted, "0123456789abcdef0123456789abcdef", false, true)
	if err != nil {
		t.Fatal(err)
	}
	var got, want any
	_ = json.Unmarshal(plain, &got)
	_ = json.Unmarshal(input, &want)
	if !deepEqualJSON(got, want) {
		t.Fatalf("round trip mismatch: %s", plain)
	}
}

func TestTransformConfigSecretsSupportsPreviousKeyRotation(t *testing.T) {
	oldKey := Hash("old-secret-value-with-entropy", 32)
	newKey := Hash("new-secret-value-with-entropy", 32)
	input := []byte(`{"email":{"password":"mail-pass"}}`)
	encrypted, err := transformConfigSecrets(input, oldKey, true, true)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := transformConfigSecrets(encrypted, newKey, false, true, oldKey)
	if err != nil {
		t.Fatal(err)
	}
	if string(plain) != string(input) {
		t.Fatalf("previous key did not decrypt config: %s", plain)
	}
	reEncrypted, err := transformConfigSecrets(plain, newKey, true, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := transformConfigSecrets(reEncrypted, oldKey, false, true); err == nil {
		t.Fatal("rotated config remained decryptable with the previous key")
	}
}

func TestPreviousConfigEncryptionKeyFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "previous-secret")
	if err := os.WriteFile(path, []byte("previous-secret-from-file\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONFIG_SECRET_PREVIOUS", "previous-secret-from-env")
	t.Setenv("CONFIG_SECRET_PREVIOUS_FILE", path)
	keys, err := previousConfigEncryptionKeys()
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 || keys[0] != Hash("previous-secret-from-env", 32) || keys[1] != Hash("previous-secret-from-file", 32) {
		t.Fatalf("unexpected previous keys: %#v", keys)
	}
}

func TestLegacyConfigCiphertextMigratesToCurrentDerivation(t *testing.T) {
	secret := "external-config-secret-with-entropy"
	plaintext := `{"issuer":"https://idp.example","client_secret":"legacy-value"}`
	legacyCiphertext, err := EncryptString(Hash(secret, 16), plaintext)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	oldConfigPath := CONFIG_PATH
	CONFIG_PATH = dir
	t.Cleanup(func() { CONFIG_PATH = oldConfigPath })
	t.Setenv("CONFIG_SECRET", secret)
	t.Setenv("CONFIG_SECRET_FILE", "")
	t.Setenv("CONFIG_SECRET_PREVIOUS", "")
	t.Setenv("CONFIG_SECRET_PREVIOUS_FILE", "")
	t.Setenv("CONFIG_ENCRYPT", "true")
	config := fmt.Sprintf(`{"general":{"secret_key":"application-secret"},"middleware":{"identity_provider":{"params":%q}}}`, legacyCiphertext)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}

	loaded, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(loaded, &decoded); err != nil {
		t.Fatal(err)
	}
	params := decoded["middleware"].(map[string]any)["identity_provider"].(map[string]any)["params"]
	if params != plaintext {
		t.Fatalf("legacy ciphertext did not decrypt: %#v", params)
	}
	if err := SaveConfig(loaded); err != nil {
		t.Fatal(err)
	}
	saved, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(saved, &decoded); err != nil {
		t.Fatal(err)
	}
	migrated := decoded["middleware"].(map[string]any)["identity_provider"].(map[string]any)["params"].(string)
	currentKey := Hash(Hash(secret, 32), 16)
	if got, err := DecryptString(currentKey, migrated); err != nil || got != plaintext {
		t.Fatalf("ciphertext was not re-encrypted with current derivation: got=%q err=%v", got, err)
	}
	if _, err := DecryptString(Hash(secret, 16), migrated); err == nil {
		t.Fatal("migrated ciphertext remained encrypted with the historical derivation")
	}
}

func TestHistoricalConfigKeyUsesExactColocatedDerivation(t *testing.T) {
	t.Setenv("CONFIG_SECRET", "")
	t.Setenv("CONFIG_SECRET_FILE", "")
	t.Setenv("CONFIG_SECRET_PREVIOUS", "")
	t.Setenv("CONFIG_SECRET_PREVIOUS_FILE", "")
	applicationSecret := "colocated-application-secret"
	keys, err := historicalConfigEncryptionKeys(`{"general":{"secret_key":"` + applicationSecret + `"}}`)
	if err != nil {
		t.Fatal(err)
	}
	want := Hash(Hash("PROOF_"+applicationSecret, len(applicationSecret)), 16)
	if len(keys) != 1 || keys[0] != want {
		t.Fatalf("historical derivation changed: got=%v want=%q", keys, want)
	}
}

func TestMCPOAuthContinuationIsBoundToInternalCallback(t *testing.T) {
	InitSecretDerivate(strings.Repeat("k", 32))
	requestID := strings.Repeat("r", 48)
	cookie, next, err := NewMCPOAuthContinuation(requestID)
	if err != nil {
		t.Fatal(err)
	}
	gotID, gotNext, err := ParseMCPOAuthContinuation(cookie)
	if err != nil || gotID != requestID || gotNext != next || next != WithBase("/api/mcp?request_id="+requestID) {
		t.Fatalf("invalid continuation: id=%q next=%q err=%v", gotID, gotNext, err)
	}
	if _, _, err := ParseMCPOAuthContinuation(cookie + "tampered"); err == nil {
		t.Fatal("tampered continuation was accepted")
	}
}

func deepEqualJSON(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

func TestWriteAtomicConfigReplacesFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"old":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeAtomicConfig(path, []byte(`{"new":true}`)); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != `{"new":true}` {
		t.Fatalf("got=%q err=%v", got, err)
	}
}

func TestHTTPServerHasResourceBounds(t *testing.T) {
	srv := NewHTTPServer(":0", nil)
	if srv.ReadHeaderTimeout <= 0 || srv.ReadTimeout <= 0 || srv.WriteTimeout <= 0 || srv.IdleTimeout <= 0 || srv.MaxHeaderBytes <= 0 {
		t.Fatalf("server is missing bounds: %#v", srv)
	}
	if srv.ReadTimeout < time.Minute {
		t.Fatalf("upload-compatible read timeout is too short: %s", srv.ReadTimeout)
	}
}

func TestDriverAndPluginGettersReturnSnapshots(t *testing.T) {
	driver := NewDriver()
	driver.Register("first", Nothing{})
	snapshot := driver.Drivers()
	delete(snapshot, "first")
	if _, ok := driver.Drivers()["first"]; !ok {
		t.Fatal("driver registry exposed its backing map")
	}

	Hooks.Register.FrontendOverrides("/snapshot-test.js")
	overrides := Hooks.Get.FrontendOverrides()
	overrides[len(overrides)-1] = "/mutated.js"
	got := Hooks.Get.FrontendOverrides()
	if got[len(got)-1] != "/snapshot-test.js" {
		t.Fatal("plugin registry exposed its backing slice")
	}
}

func TestAppCacheCopiesShareSynchronization(t *testing.T) {
	cache := NewQuickCache(5, 1)
	copyOfCache := cache
	key := map[string]string{"session": "shared"}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(value int) {
			defer wg.Done()
			copyOfCache.Set(key, value)
			_ = cache.Get(key)
		}(i)
	}
	wg.Wait()
}
