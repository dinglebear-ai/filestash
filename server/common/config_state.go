package common

/*
 * WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNI
 * WARNING - CHANGE IN THIS FILE CAN SILENTLY BREAK OTHER INSTALLATION - WARNING
 * WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARN
 *
 * Some contributors wanted to be able to load and persist config in other system
 * like S3 and provide custom encryption layer on top of it. Those contributors have
 * custom plugins which run generators that override this file before the build is
 * generated. Indeed for that specific use case we couldn't extend the runtime plugin
 * mechanism so had to fallback to this approach which would set the config loader at
 * build time, hence this warning.
 */

import (
	"encoding/json"
	"fmt"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var configKeysToEncrypt []string = []string{
	"middleware.identity_provider.params",
	"middleware.attribute_mapping.params",
}

func LoadConfig() ([]byte, error) {
	path := GetAbsolutePath(CONFIG_PATH, "config.json")
	file, err := os.OpenFile(path, os.O_RDONLY, os.ModePerm)
	if err != nil {
		if os.IsNotExist(err) {
			os.MkdirAll(GetAbsolutePath(CONFIG_PATH), 0770)
			return []byte(""), nil
		}
		return nil, err
	}
	cFile, err := io.ReadAll(file)
	closeErr := file.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if len(cFile) > 0 && !json.Valid(cFile) {
		backup, backupErr := os.ReadFile(path + ".bak")
		if backupErr != nil || !json.Valid(backup) {
			return nil, fmt.Errorf("configuration is invalid and no valid backup is available")
		}
		Log.Warning("common::config_state::load recovered configuration from last-known-good backup")
		cFile = backup
	}
	configStr := string(cFile)
	key, externalKey, err := configEncryptionKey(configStr)
	if err != nil {
		return nil, err
	}
	previousKeys, err := previousConfigEncryptionKeys()
	if err != nil {
		return nil, err
	}
	legacyKeys, err := historicalConfigEncryptionKeys(configStr)
	if err != nil {
		return nil, err
	}
	// Keep the short-key format emitted by the first external-key hardening
	// implementation as an additional migration candidate.
	legacyKeys = append(legacyKeys, Hash(key, 16))
	for _, previousKey := range previousKeys {
		legacyKeys = append(legacyKeys, Hash(previousKey, 16))
	}
	for _, jsonPathWithEncryptedData := range configKeysToEncrypt {
		p := gjson.Get(configStr, jsonPathWithEncryptedData).String()
		if p == "" {
			continue
		}
		t, err := decryptConfigValue(p, legacyKeys)
		if err != nil {
			if !defaultValue(true, "CONFIG_ENCRYPT") {
				break
			}
			Log.Warning("common::config_state::load cannot decrypt config path '%s': %s", jsonPathWithEncryptedData, err.Error())
			continue
		}
		val, err := sjson.Set(configStr, jsonPathWithEncryptedData, t)
		if err != nil {
			Log.Warning("common::config_state::load cannot put json value in config '%s': %s", jsonPathWithEncryptedData, err.Error())
			continue
		}
		configStr = val
	}
	transformed, err := transformConfigSecrets([]byte(configStr), key, false, externalKey, previousKeys...)
	if err != nil {
		return nil, err
	}
	configStr = string(transformed)
	return []byte(configStr), nil
}

func SaveConfig(v []byte) error {
	configStr := string(v)
	if !json.Valid(v) {
		return fmt.Errorf("refusing to persist invalid configuration JSON")
	}

	key, externalKey, err := configEncryptionKey(configStr)
	if err != nil {
		return err
	}
	toEncrypt := defaultValue(true, "CONFIG_ENCRYPT")
	for _, jsonPathWithEncryptedData := range configKeysToEncrypt {
		if !toEncrypt {
			continue
		}
		p := gjson.Get(configStr, jsonPathWithEncryptedData).String()
		if p == "" {
			continue
		}
		t, err := EncryptString(Hash(key, 16), p)
		if err != nil {
			Log.Warning("common::config_state::save cannot encrypt config path '%s': %s", jsonPathWithEncryptedData, err.Error())
			continue
		}
		val, err := sjson.Set(configStr, jsonPathWithEncryptedData, t)
		if err != nil {
			Log.Warning("common::config_state::save cannot put json value in config '%s': %s", jsonPathWithEncryptedData, err.Error())
			continue
		}
		configStr = val
	}
	if toEncrypt {
		transformed, transformErr := transformConfigSecrets([]byte(configStr), key, true, externalKey)
		if transformErr != nil {
			return transformErr
		}
		configStr = string(transformed)
	}
	path := GetAbsolutePath(CONFIG_PATH, "config.json")
	if current, err := os.ReadFile(path); err == nil && json.Valid(current) {
		if err := writeAtomicConfig(path+".bak", current); err != nil {
			return fmt.Errorf("write config backup: %w", err)
		}
	}
	if err := writeAtomicConfig(path, PrettyPrint([]byte(configStr))); err != nil {
		return fmt.Errorf(
			APPNAME+" needs to be able to atomically create and edit its configuration at `%s`: %w",
			path, err,
		)
	}
	return nil
}

func configEncryptionKey(configStr string) (string, bool, error) {
	if secret := strings.TrimSpace(os.Getenv("CONFIG_SECRET")); secret != "" {
		if len(secret) < 16 {
			return "", true, fmt.Errorf("CONFIG_SECRET must be at least 16 characters")
		}
		return Hash(secret, 32), true, nil
	}
	if secretFile := strings.TrimSpace(os.Getenv("CONFIG_SECRET_FILE")); secretFile != "" {
		data, err := os.ReadFile(secretFile)
		if err != nil {
			return "", true, fmt.Errorf("read CONFIG_SECRET_FILE: %w", err)
		}
		secret := strings.TrimSpace(string(data))
		if len(secret) < 16 {
			return "", true, fmt.Errorf("CONFIG_SECRET_FILE must contain at least 16 characters")
		}
		return Hash(secret, 32), true, nil
	}
	if defaultValue(true, "CONFIG_ENCRYPT") && strings.EqualFold(os.Getenv("FILESTASH_ENV"), "production") {
		return "", false, fmt.Errorf("production config encryption requires CONFIG_SECRET or CONFIG_SECRET_FILE")
	}
	secret := gjson.Get(configStr, "general.secret_key").String()
	InitSecretDerivate(secret)
	Log.Warning("common::config_state using legacy colocated config key; set CONFIG_SECRET or CONFIG_SECRET_FILE")
	return Hash(SECRET_KEY_DERIVATE_FOR_PROOF, 32), false, nil
}

func previousConfigEncryptionKeys() ([]string, error) {
	secrets := []struct {
		name  string
		value string
	}{
		{"CONFIG_SECRET_PREVIOUS", strings.TrimSpace(os.Getenv("CONFIG_SECRET_PREVIOUS"))},
	}
	if path := strings.TrimSpace(os.Getenv("CONFIG_SECRET_PREVIOUS_FILE")); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read CONFIG_SECRET_PREVIOUS_FILE: %w", err)
		}
		secrets = append(secrets, struct {
			name  string
			value string
		}{"CONFIG_SECRET_PREVIOUS_FILE", strings.TrimSpace(string(data))})
	}
	keys := make([]string, 0, len(secrets))
	for _, candidate := range secrets {
		if candidate.value == "" {
			continue
		}
		if len(candidate.value) < 16 {
			return nil, fmt.Errorf("%s must contain at least 16 characters", candidate.name)
		}
		keys = append(keys, Hash(candidate.value, 32))
	}
	return keys, nil
}

func historicalConfigEncryptionKeys(configStr string) ([]string, error) {
	secrets := []string{}
	if secret := strings.TrimSpace(os.Getenv("CONFIG_SECRET")); secret != "" {
		secrets = append(secrets, secret)
	}
	if path := strings.TrimSpace(os.Getenv("CONFIG_SECRET_FILE")); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read CONFIG_SECRET_FILE: %w", err)
		}
		if secret := strings.TrimSpace(string(data)); secret != "" {
			secrets = append(secrets, secret)
		}
	}
	if secret := strings.TrimSpace(os.Getenv("CONFIG_SECRET_PREVIOUS")); secret != "" {
		secrets = append(secrets, secret)
	}
	if path := strings.TrimSpace(os.Getenv("CONFIG_SECRET_PREVIOUS_FILE")); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read CONFIG_SECRET_PREVIOUS_FILE: %w", err)
		}
		if secret := strings.TrimSpace(string(data)); secret != "" {
			secrets = append(secrets, secret)
		}
	}

	keys := make([]string, 0, len(secrets)+1)
	seen := map[string]struct{}{}
	appendKey := func(key string) {
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	// This is the exact pre-hardening derivation: the environment secret was
	// passed directly to Hash, rather than first being expanded to 32 bytes.
	for _, secret := range secrets {
		appendKey(Hash(secret, 16))
	}
	// With no environment secret, the historical key was Hash(PROOF_<secret>,
	// len(secret)) followed by Hash(..., 16). Compute it locally so loading a
	// migration candidate does not mutate the process-wide runtime derivations.
	applicationSecret := gjson.Get(configStr, "general.secret_key").String()
	proofKey := Hash("PROOF_"+applicationSecret, len(applicationSecret))
	appendKey(Hash(proofKey, 16))
	return keys, nil
}

func decryptConfigValue(ciphertext string, keys []string) (string, error) {
	var lastErr error
	for _, key := range keys {
		plaintext, err := DecryptString(key, ciphertext)
		if err == nil {
			return plaintext, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no configuration decryption key is available")
	}
	return "", lastErr
}

func transformConfigSecrets(data []byte, key string, encrypt bool, externalKey bool, fallbackKeys ...string) ([]byte, error) {
	var root any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	var walk func(any, []string) error
	walk = func(node any, path []string) error {
		switch value := node.(type) {
		case map[string]any:
			for field, raw := range value {
				currentPath := append(path, field)
				text, isString := raw.(string)
				if isString && isConfigSecretField(field) && (externalKey || strings.Join(currentPath, ".") != "general.secret_key") {
					if encrypt {
						if text == "" || strings.HasPrefix(text, "enc:v1:") {
							continue
						}
						ciphertext, err := EncryptString(key, text)
						if err != nil {
							return err
						}
						value[field] = "enc:v1:" + ciphertext
					} else if strings.HasPrefix(text, "enc:v1:") {
						plaintext, err := decryptConfigValue(strings.TrimPrefix(text, "enc:v1:"), append([]string{key}, fallbackKeys...))
						if err != nil {
							return fmt.Errorf("decrypt %s: %w", strings.Join(currentPath, "."), err)
						}
						value[field] = plaintext
					}
					continue
				}
				if err := walk(raw, currentPath); err != nil {
					return err
				}
			}
		case []any:
			for i := range value {
				if err := walk(value[i], path); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := walk(root, nil); err != nil {
		return nil, err
	}
	return json.Marshal(root)
}

func isConfigSecretField(field string) bool {
	field = strings.ToLower(field)
	return field == "admin" || strings.Contains(field, "password") || strings.Contains(field, "secret") ||
		strings.Contains(field, "token") || strings.Contains(field, "credential") || field == "api_key" || field == "private_key"
}

func writeAtomicConfig(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0770); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".config-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0660); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func init() {
	Hooks.Register.Onload(func() {
		if err := os.Chmod(GetAbsolutePath(CONFIG_PATH), 0770); err != nil && os.IsNotExist(err) == false {
			Log.Warning("common::config_state::onload cannot chmod config directory: %s", err.Error())
		}
		if err := os.Chmod(GetAbsolutePath(CONFIG_PATH, "config.json"), 0660); err != nil && os.IsNotExist(err) == false {
			Log.Warning("common::config_state::onload cannot chmod config file: %s", err.Error())
		}
	})
}
