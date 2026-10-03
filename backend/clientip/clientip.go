// Package clientip resolves the visitor address used for rate limits, bandwidth
// limits, and local-access checks. Forwarding headers are only honored when the
// immediate peer is a configured trusted proxy, so direct clients cannot choose
// their own address.
package clientip

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

const (
	HeaderForwardedFor = "X-Forwarded-For"
	HeaderRealIP       = "X-Real-IP"
	HeaderCloudflare   = "CF-Connecting-IP"
)

// privateRanges are the networks a reverse proxy on the same host or container
// network normally connects from.
var privateRanges = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
}

type Resolver struct {
	trusted []netip.Prefix
	header  string
}

type result struct {
	ip          string
	clientKnown bool
}

// New parses a comma-separated list of trusted proxy IPs or CIDRs ("private"
// expands to loopback, private, and link-local ranges; "none" or empty trusts
// nothing) and the header those proxies use to report the visitor address.
func New(trustedProxies, header string) (*Resolver, error) {
	resolver := &Resolver{}
	switch strings.ToLower(strings.TrimSpace(header)) {
	case "", strings.ToLower(HeaderForwardedFor):
		resolver.header = HeaderForwardedFor
	case strings.ToLower(HeaderRealIP):
		resolver.header = HeaderRealIP
	case strings.ToLower(HeaderCloudflare):
		resolver.header = HeaderCloudflare
	default:
		return nil, fmt.Errorf("invalid CLIENT_IP_HEADER %q: use %s, %s, or %s", header, HeaderForwardedFor, HeaderRealIP, HeaderCloudflare)
	}
	for _, entry := range strings.Split(trustedProxies, ",") {
		entry = strings.TrimSpace(entry)
		switch strings.ToLower(entry) {
		case "", "none":
			continue
		case "private":
			resolver.trusted = append(resolver.trusted, privateRanges...)
			continue
		}
		if prefix, err := netip.ParsePrefix(entry); err == nil {
			resolver.trusted = append(resolver.trusted, prefix.Masked())
			continue
		}
		addr, err := netip.ParseAddr(entry)
		if err != nil {
			return nil, fmt.Errorf("invalid TRUSTED_PROXIES entry %q: use an IP, a CIDR, private, or none", entry)
		}
		addr = addr.Unmap().WithZone("")
		resolver.trusted = append(resolver.trusted, netip.PrefixFrom(addr, addr.BitLen()))
	}
	return resolver, nil
}

func (r *Resolver) isTrusted(addr netip.Addr) bool {
	for _, prefix := range r.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// Resolve returns the visitor address for a request that has not passed
// through Attach.
func (r *Resolver) Resolve(req *http.Request) string {
	return r.resolve(req).ip
}

func (r *Resolver) resolve(req *http.Request) result {
	peer, ok := parsePeer(req.RemoteAddr)
	if !ok {
		return result{ip: Peer(req)}
	}
	if !r.isTrusted(peer) {
		return result{ip: peer.String(), clientKnown: true}
	}
	if r.header != HeaderForwardedFor {
		if addr, ok := parseAddr(req.Header.Get(r.header)); ok {
			return result{ip: addr.String(), clientKnown: true}
		}
		return result{ip: peer.String()}
	}
	// Proxies append to X-Forwarded-For, so only entries added by trusted hops
	// are reliable. Walk right to left and stop at the first untrusted address.
	var hops []string
	for _, value := range req.Header.Values(HeaderForwardedFor) {
		hops = append(hops, strings.Split(value, ",")...)
	}
	client := peer
	for i := len(hops) - 1; i >= 0; i-- {
		addr, ok := parseAddr(hops[i])
		if !ok {
			return result{ip: peer.String()}
		}
		client = addr
		if !r.isTrusted(addr) {
			break
		}
	}
	return result{ip: client.String(), clientKnown: len(hops) > 0}
}

type contextKey struct{}

// Attach records the resolved visitor address on the request context.
func (r *Resolver) Attach(req *http.Request) *http.Request {
	return req.WithContext(context.WithValue(req.Context(), contextKey{}, r.resolve(req)))
}

func (r *Resolver) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		next.ServeHTTP(w, r.Attach(req))
	})
}

// FromRequest returns the address recorded by Attach, falling back to the
// immediate peer so unconfigured paths never trust forwarding headers.
func FromRequest(req *http.Request) string {
	if resolved, ok := req.Context().Value(contextKey{}).(result); ok {
		return resolved.ip
	}
	return Peer(req)
}

// ClientKnown reports whether the address identifies the visitor. A trusted
// proxy's missing or malformed forwarding header leaves the visitor unknown,
// even though FromRequest still supplies the peer address for rate limiting.
// Without a resolver, only the direct connection address is used.
func ClientKnown(req *http.Request) bool {
	if resolved, ok := req.Context().Value(contextKey{}).(result); ok {
		return resolved.clientKnown
	}
	_, ok := parsePeer(req.RemoteAddr)
	return ok
}

// Peer returns the address of the immediate connection, without any port.
func Peer(req *http.Request) string {
	if addr, ok := parsePeer(req.RemoteAddr); ok {
		return addr.String()
	}
	address := strings.TrimSpace(req.RemoteAddr)
	if host, _, err := net.SplitHostPort(address); err == nil {
		return host
	}
	return strings.Trim(address, "[]")
}

func parsePeer(remoteAddr string) (netip.Addr, bool) {
	remoteAddr = strings.TrimSpace(remoteAddr)
	if addrPort, err := netip.ParseAddrPort(remoteAddr); err == nil {
		return addrPort.Addr().Unmap().WithZone(""), true
	}
	return parseAddr(strings.Trim(remoteAddr, "[]"))
}

func parseAddr(value string) (netip.Addr, bool) {
	addr, err := netip.ParseAddr(strings.TrimSpace(value))
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap().WithZone(""), true
}
