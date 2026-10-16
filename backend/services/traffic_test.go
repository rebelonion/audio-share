package services

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestTrafficLiveJSONMatchesClientFields(t *testing.T) {
	live := NewTrafficMeter(nil).Live()
	live.ActiveDownloads = 1
	data, err := json.Marshal(live)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{`"intervalSeconds":5`, `"samples":[]`, `"activeStreams":0`, `"activeDownloads":1`, `"discarded":{"bytes":0,"requests":0}`} {
		if !strings.Contains(string(data), field) {
			t.Errorf("live JSON %s is missing %s", data, field)
		}
	}
}

func TestTrafficDiscardRecordsLostBytesAndRequests(t *testing.T) {
	meter := NewTrafficMeter(nil)
	now := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)
	meter.Request(TrafficStream)
	meter.Add(TrafficStream, 300)
	meter.sample(now.Add(-25 * time.Hour))
	meter.Request(TrafficAPI)
	meter.Add(TrafficAPI, 20)
	meter.sample(now)

	meter.discardLocked(func(key trafficBucket) bool { return now.Sub(key.minute) > trafficPendingLimit })
	if got := meter.Live().Discarded; got != (TrafficCount{Bytes: 300, Requests: 1}) {
		t.Fatalf("discarded = %+v", got)
	}
	if len(meter.pending) != 1 {
		t.Fatalf("pending buckets = %d, want the recent one kept", len(meter.pending))
	}
}

func TestTrafficSampleFilesBytesUnderTheMinuteTheyWereSent(t *testing.T) {
	meter := NewTrafficMeter(nil)
	boundary := time.Date(2026, 10, 16, 13, 0, 0, 0, time.UTC)
	meter.Add(TrafficStream, 10)
	meter.sample(boundary) // covers 12:59:55 to 13:00:00
	meter.Add(TrafficStream, 20)
	meter.sample(boundary.Add(5 * time.Second))
	if got := meter.pending[trafficBucket{boundary.Add(-time.Minute), TrafficStream}].Bytes; got != 10 {
		t.Fatalf("12:59 bytes = %d, want 10", got)
	}
	if got := meter.pending[trafficBucket{boundary, TrafficStream}].Bytes; got != 20 {
		t.Fatalf("13:00 bytes = %d, want 20", got)
	}
}

func TestTrafficLiveSampleRecordsItsRealLength(t *testing.T) {
	meter := NewTrafficMeter(nil)
	start := time.Date(2026, 10, 16, 13, 0, 3, 0, time.UTC)
	meter.lastAt = start
	meter.sample(start.Add(2 * time.Second)) // first boundary after starting
	meter.sample(start.Add(7 * time.Second))
	samples := meter.Live().Samples
	if samples[0].Seconds != 2 || samples[1].Seconds != 5 {
		t.Fatalf("sample lengths = %v, %v; want 2, 5", samples[0].Seconds, samples[1].Seconds)
	}
}

func TestTrafficSaveFailuresAreShownAndReportedOncePerMinute(t *testing.T) {
	meter := NewTrafficMeter(nil)
	start := time.Date(2026, 10, 16, 13, 0, 0, 0, time.UTC)
	meter.Add(TrafficStream, 70)
	meter.sample(start)
	failure := errors.New("permission denied for table traffic_minutes")
	var reports int
	for seconds := 0; seconds <= 70; seconds += 10 {
		if meter.saveFailedLocked(start.Add(time.Duration(seconds)*time.Second), failure) != nil {
			reports++
		}
	}
	if reports != 2 {
		t.Fatalf("reports over 70s of failures = %d, want 2 (first failure, then one a minute)", reports)
	}
	saving := meter.Live().Saving
	if saving.FailingSince == nil || !saving.FailingSince.Equal(start) || saving.LastError != failure.Error() || saving.Unsaved.Bytes != 70 {
		t.Fatalf("saving status = %+v", saving)
	}
	if !strings.Contains(meter.saveFailedLocked(start.Add(3*time.Minute), failure).Context.Message, "70 bytes") {
		t.Fatal("failure report does not say how much is waiting")
	}
}
