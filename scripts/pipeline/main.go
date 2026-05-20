package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Result carries either a successfully extracted value or an error, tagged with the source URL.
type Result struct {
	URL   string
	Value string
	Err   error
}

// fetchResponse is the intermediate payload between fetch and process stages.
type fetchResponse struct {
	url  string
	body []byte
}

// source fans out URLs into a channel, closing it when done or when ctx is cancelled.
func source(ctx context.Context, urls []string) <-chan string {
	out := make(chan string)
	go func() {
		defer close(out)
		for _, u := range urls {
			select {
			case <-ctx.Done():
				return
			case out <- u:
			}
		}
	}()
	return out
}

// fetch reads from the URL channel, performs HTTP GETs concurrently (bounded by workers),
// and pushes raw responses downstream.
func fetch(ctx context.Context, urls <-chan string, workers int, client *http.Client) <-chan fetchResponse {
	out := make(chan fetchResponse)
	var wg sync.WaitGroup

	for range workers {
		wg.Go(func() {
			for u := range urls {
				resp := doFetch(ctx, client, u)
				select {
				case <-ctx.Done():
					return
				case out <- resp:
				}
			}
		})
	}

	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}

func doFetch(ctx context.Context, client *http.Client, url string) fetchResponse {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fetchResponse{url: url, body: nil}
	}

	resp, err := client.Do(req)
	if err != nil {
		return fetchResponse{url: url, body: nil}
	}
	defer resp.Body.Close()

	// Cap read to 1 MiB to avoid unbounded allocation.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fetchResponse{url: url, body: nil}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fetchResponse{url: url, body: nil}
	}

	return fetchResponse{url: url, body: body}
}

// process parses JSON bodies, extracts `field`, and emits Results.
func process(ctx context.Context, in <-chan fetchResponse, field string, workers int) <-chan Result {
	out := make(chan Result)
	var wg sync.WaitGroup

	for range workers {
		wg.Go(func() {
			for fr := range in {
				r := extract(fr, field)
				select {
				case <-ctx.Done():
					return
				case out <- r:
				}
			}
		})
	}

	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}

func extract(fr fetchResponse, field string) Result {
	if fr.body == nil {
		return Result{URL: fr.url, Err: fmt.Errorf("fetch failed for %s", fr.url)}
	}

	var data map[string]any
	if err := json.Unmarshal(fr.body, &data); err != nil {
		return Result{URL: fr.url, Err: fmt.Errorf("json parse: %w", err)}
	}

	val, ok := data[field]
	if !ok {
		return Result{URL: fr.url, Err: fmt.Errorf("field %q not found in response", field)}
	}

	return Result{URL: fr.url, Value: fmt.Sprintf("%v", val)}
}

// sink drains the results channel into a slice, respecting cancellation.
func sink(ctx context.Context, in <-chan Result) []Result {
	var results []Result
	for {
		select {
		case <-ctx.Done():
			// Drain remaining to prevent goroutine leaks, but tag them.
			for r := range in {
				r.Err = fmt.Errorf("cancelled: %w", ctx.Err())
				results = append(results, r)
			}
			return results
		case r, ok := <-in:
			if !ok {
				return results
			}
			results = append(results, r)
		}
	}
}

// Pipeline ties together source -> fetch -> process -> sink with a shared cancellable context.
func Pipeline(ctx context.Context, urls []string, field string, fetchWorkers, processWorkers int) []Result {
	client := &http.Client{Timeout: 10 * time.Second}

	urlCh := source(ctx, urls)
	fetchCh := fetch(ctx, urlCh, fetchWorkers, client)
	resultCh := process(ctx, fetchCh, field, processWorkers)
	return sink(ctx, resultCh)
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	urls := []string{
		"https://httpbin.org/get",
		"https://httpbin.org/get?foo=bar",
		"https://httpbin.org/get?baz=qux",
		"https://httpbin.org/status/500", // will produce an error result
		"https://httpbin.org/delay/60",   // will hit timeout -> error
	}

	results := Pipeline(ctx, urls, "url", 3, 2)

	fmt.Printf("Collected %d results:\n", len(results))
	for _, r := range results {
		if r.Err != nil {
			fmt.Printf("  ERR  %-50s %v\n", r.URL, r.Err)
		} else {
			fmt.Printf("  OK   %-50s %s\n", r.URL, r.Value)
		}
	}
}
