package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/disintegration/imaging"
	"github.com/onion/audio-share-backend/services"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"golang.org/x/sync/singleflight"
)

const artworkCacheLimit = 1 << 30

type artworkCache struct {
	dir      string
	limit    int64
	setup    sync.Once
	setupErr error
	jobs     singleflight.Group
	slots    chan struct{}
}

var cachedArtwork = &artworkCache{limit: artworkCacheLimit, slots: make(chan struct{}, 2)}

func (c *artworkCache) init() error {
	c.setup.Do(func() {
		if c.dir == "" {
			c.dir = os.Getenv("ARTWORK_CACHE_DIR")
			if c.dir == "" {
				base, err := os.UserCacheDir()
				if err != nil {
					c.setupErr = err
					return
				}
				c.dir = filepath.Join(base, "audio-share", "artwork")
			}
		}
	})
	return c.setupErr
}

func (c *artworkCache) read(name string) ([]byte, error) {
	if err := c.init(); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(c.dir, name))
	if err == nil {
		now := time.Now()
		_ = os.Chtimes(filepath.Join(c.dir, name), now, now)
	}
	return data, err
}

func (c *artworkCache) get(ctx context.Context, source string, info os.FileInfo, variant string) ([]byte, error) {
	name := fmt.Sprintf("%x.jpg", sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d:%d", variant, source, info.ModTime().UnixNano(), info.Size()))))
	if data, err := c.read(name); err == nil {
		return data, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	result := c.jobs.DoChan(name, func() (any, error) {
		// The shared job outlives individual requests, with a bounded queue wait.
		queueCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		select {
		case c.slots <- struct{}{}:
		case <-queueCtx.Done():
			return nil, queueCtx.Err()
		}
		defer func() { <-c.slots }()
		if data, err := c.read(name); err == nil {
			return data, nil
		} else if !os.IsNotExist(err) {
			return nil, err
		}
		var data []byte
		var err error
		switch variant {
		case "card-v2":
			data, err = generateCardArtwork(source)
		case "blur-v2":
			data, err = generateBlurredThumbnail(source)
			if err != nil {
				log.Printf("Error generating blurred artwork: %v", err)
				data, err = generateMaturePlaceholder()
			}
		default:
			return nil, fmt.Errorf("unknown artwork variant %q", variant)
		}
		if err != nil {
			return nil, err
		}
		if err := c.write(name, data); err != nil {
			return nil, err
		}
		return data, nil
	})
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-result:
		if result.Err != nil {
			return nil, result.Err
		}
		return result.Val.([]byte), nil
	}
}

func decodeArtwork(source string) (image.Image, error) {
	file, err := os.Open(source)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return nil, err
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		return nil, fmt.Errorf("artwork dimensions exceed decoding limit")
	}
	if _, err := file.Seek(0, 0); err != nil {
		return nil, err
	}
	return imaging.Decode(file, imaging.AutoOrientation(true))
}

func generateCardArtwork(source string) ([]byte, error) {
	src, err := decodeArtwork(source)
	if err != nil {
		return nil, err
	}
	width, height := src.Bounds().Dx(), src.Bounds().Dy()
	if max(width, height) > 360 {
		width, height = scaledDimensions(width, height, 360)
	}
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 75}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Called only after the endpoint's artwork access checks.
func serveCardArtwork(w http.ResponseWriter, r *http.Request, source string, info os.FileInfo, cacheControl string) bool {
	if r.URL.Query().Get("size") != "card" {
		return false
	}
	data, err := cachedArtwork.get(r.Context(), source, info, "card-v2")
	if err != nil {
		services.AddErrorContext(r.Context(), services.ErrorDetails(err))
		return false // Keep existing artwork available if conversion or caching fails.
	}
	serveGeneratedArtwork(w, r, data, cacheControl)
	return true
}

func serveGeneratedArtwork(w http.ResponseWriter, r *http.Request, data []byte, cacheControl string) {
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("ETag", fmt.Sprintf("\"%x\"", sha256.Sum256(data)))
	// Source timestamps cannot validate transformed content or legacy cached variants.
	http.ServeContent(w, r, "artwork.jpg", time.Time{}, bytes.NewReader(data))
}

func encodeArtworkJPEG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 72}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
