package handlers

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestArtworkEXIFOrientation(t *testing.T) {
	colors := []color.RGBA{{240, 20, 20, 255}, {20, 240, 20, 255}, {20, 20, 240, 255}, {240, 240, 20, 255}}
	img := image.NewRGBA(image.Rect(0, 0, 720, 480))
	for y := 0; y < 480; y++ {
		for x := 0; x < 720; x++ {
			img.SetRGBA(x, y, colors[(y/240)*2+x/360])
		}
	}
	var original bytes.Buffer
	if err := jpeg.Encode(&original, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	// Expected source quadrants at output top-left, top-right, bottom-left, bottom-right.
	quadrants := [8][4]int{{0, 1, 2, 3}, {1, 0, 3, 2}, {3, 2, 1, 0}, {2, 3, 0, 1}, {0, 2, 1, 3}, {2, 0, 3, 1}, {3, 1, 2, 0}, {1, 3, 0, 2}}
	for orientation := 1; orientation <= 8; orientation++ {
		t.Run(fmt.Sprint(orientation), func(t *testing.T) {
			// JPEG APP1 with a little-endian TIFF IFD containing the orientation tag.
			exif := []byte{'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, byte(orientation), 0, 0, 0, 0, 0, 0, 0}
			var tagged bytes.Buffer
			tagged.Write(original.Bytes()[:2])
			tagged.Write([]byte{0xff, 0xe1})
			if err := binary.Write(&tagged, binary.BigEndian, uint16(len(exif)+2)); err != nil {
				t.Fatal(err)
			}
			tagged.Write(exif)
			tagged.Write(original.Bytes()[2:])
			path := filepath.Join(t.TempDir(), "oriented.jpg")
			if err := os.WriteFile(path, tagged.Bytes(), 0600); err != nil {
				t.Fatal(err)
			}
			for name, generate := range map[string]func(string) ([]byte, error){"card": generateCardArtwork, "blur": generateBlurredThumbnail} {
				t.Run(name, func(t *testing.T) {
					data, err := generate(path)
					if err != nil {
						t.Fatal(err)
					}
					got, err := jpeg.Decode(bytes.NewReader(data))
					if err != nil {
						t.Fatal(err)
					}
					width, height := 360, 240
					if orientation >= 5 {
						width, height = 240, 360
					}
					if got.Bounds().Dx() != width || got.Bounds().Dy() != height {
						t.Fatalf("dimensions %v, want %dx%d", got.Bounds(), width, height)
					}
					for i, wantIndex := range quadrants[orientation-1] {
						x, y := width/4+(i%2)*width/2, height/4+(i/2)*height/2
						actual := color.RGBAModel.Convert(got.At(x, y)).(color.RGBA)
						want := colors[wantIndex]
						for _, delta := range []int{int(actual.R) - int(want.R), int(actual.G) - int(want.G), int(actual.B) - int(want.B)} {
							if delta < -25 || delta > 25 {
								t.Fatalf("quadrant %d: got %v, want %v", i, actual, want)
							}
						}
					}
				})
			}
		})
	}
}

type observedArtworkContext struct {
	context.Context
	entered chan struct{}
	once    sync.Once
}

func (c *observedArtworkContext) Done() <-chan struct{} {
	c.once.Do(func() { close(c.entered) })
	return c.Context.Done()
}

func TestArtworkSharedConversionSurvivesCallerCancellation(t *testing.T) {
	for _, variant := range []string{"card-v2", "blur-v2"} {
		t.Run(variant, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "source.jpg")
			if err := writeJPEG(source, image.NewRGBA(image.Rect(0, 0, 720, 480))); err != nil {
				t.Fatal(err)
			}
			info, err := os.Stat(source)
			if err != nil {
				t.Fatal(err)
			}
			cache := &artworkCache{dir: t.TempDir(), limit: artworkCacheLimit, slots: make(chan struct{}, 2)}
			// Occupy both conversion slots until both callers have joined the shared job.
			cache.slots <- struct{}{}
			cache.slots <- struct{}{}
			firstBase, cancel := context.WithCancel(context.Background())
			defer cancel()
			first := &observedArtworkContext{Context: firstBase, entered: make(chan struct{})}
			second := &observedArtworkContext{Context: context.Background(), entered: make(chan struct{})}
			firstResult := make(chan error, 1)
			secondResult := make(chan error, 1)
			go func() { _, err := cache.get(first, source, info, variant); firstResult <- err }()
			select {
			case <-first.entered:
			case <-time.After(5 * time.Second):
				t.Fatal("first caller did not start")
			}
			go func() {
				data, err := cache.get(second, source, info, variant)
				if err == nil {
					_, err = jpeg.DecodeConfig(bytes.NewReader(data))
				}
				secondResult <- err
			}()
			select {
			case <-second.entered:
			case <-time.After(5 * time.Second):
				t.Fatal("second caller did not join")
			}
			cancel()
			select {
			case err := <-firstResult:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("first caller: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("canceled caller kept waiting")
			}
			<-cache.slots
			<-cache.slots
			select {
			case err := <-secondResult:
				if err != nil {
					t.Fatalf("remaining caller failed: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("shared conversion did not finish")
			}
			files, err := artworkFiles(cache.dir)
			if err != nil {
				t.Fatal(err)
			}
			if len(files) != 1 {
				t.Fatalf("cache files: %d", len(files))
			}
		})
	}
}
