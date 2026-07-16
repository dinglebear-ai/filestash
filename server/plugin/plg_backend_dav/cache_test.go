package plg_backend_dav

import (
	"fmt"
	"sync"
	"testing"
)

func TestDavCollectionCacheConcurrentAccess(t *testing.T) {
	dav := Dav{cache: map[string]interface{}{}, cacheMu: &sync.RWMutex{}}
	const iterations = 500
	var wg sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				dav.cacheMu.Lock()
				dav.cache["getCollections"] = []DavCollection{{Name: fmt.Sprintf("%d-%d", worker, i)}}
				dav.cacheMu.Unlock()
				if _, err := dav.getCollections(); err != nil {
					t.Errorf("cached read failed: %v", err)
					return
				}
			}
		}(worker)
	}
	wg.Wait()
}
