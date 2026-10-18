import SiteBanner from '@/components/ui/SiteBanner'
import {IconButton} from '@/components/ui/Button'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { INFO_BANNER, type BannerVariant, type SiteBanner as BannerContent } from '@/lib/config'
import { useRybbit } from '@/hooks/useRybbit'
import { formatBannerPart, hasLiveParts, parseBannerMessage } from '@/lib/bannerTokens'

const styles: Record<BannerVariant, {
  icon: typeof Info
  className: string
  linkClassName: string
}> = {
  info: {
    icon: Info,
    className: 'border-[rgba(196,136,42,0.45)] bg-[rgba(35,29,19,0.96)] text-[var(--foreground)]',
    linkClassName: 'text-[var(--primary)] hover:text-[var(--primary-hover)]',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-[rgba(190,120,42,0.62)] bg-[rgba(58,38,14,0.96)] text-[var(--foreground)]',
    linkClassName: 'text-[#efb65f] hover:text-[#ffd08a]',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--foreground)]',
    linkClassName: 'text-[var(--success-text)] hover:text-[var(--primary-hover)]',
  },
}

// Any visible change to the banner shows it again to visitors who dismissed it.
function getDismissKey({ message, variant, linkText, linkUrl }: BannerContent) {
  let hash = 5381
  const value = `${message}|${variant}|${linkText ?? ''}|${linkUrl ?? ''}`
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i)
  }
  return `info-banner-dismissed:${hash >>> 0}`
}

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

function wasDismissed(key: string) {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function storeDismissal(key: string) {
  try {
    localStorage.setItem(key, 'true')
  } catch {
    // Banner dismissal is a convenience; keep the UI usable if storage is blocked.
  }
}

// Renders the message with its date and countdown placeholders filled in for
// this visitor, ticking once a second while any of them change over time.
function BannerMessage({ message }: { message: string }) {
  const parts = useMemo(() => parseBannerMessage(message), [message])
  const live = hasLiveParts(parts)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [live])

  return (
    <span>
      {parts.map((part, index) => part.type === 'text'
        ? <span key={index}>{part.text}</span>
        : (
          <time key={index} dateTime={part.iso} className={part.type === 'countdown' ? 'font-medium tabular-nums' : 'font-medium'}>
            {formatBannerPart(part, now)}
          </time>
        ))}
    </span>
  )
}

interface ViewProps {
  banner: BannerContent
  onDismiss?: () => void
  onLinkClick?: () => void
  // Renders the link inertly, for the admin preview.
  preview?: boolean
}

export function InfoBannerView({ banner, onDismiss, onLinkClick, preview }: ViewProps) {
  const variantStyle = styles[banner.variant]
  const Icon = variantStyle.icon
  const linkClassName = `font-medium underline underline-offset-4 transition-colors ${variantStyle.linkClassName}`
  const { linkText, linkUrl } = banner

  return (
    <SiteBanner className={variantStyle.className} aria-label={preview ? 'Banner preview' : 'Site notice'}
      icon={<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      action={onDismiss && <IconButton size="sm" onClick={onDismiss} aria-label="Dismiss notice"><X className="h-4 w-4" aria-hidden="true" /></IconButton>}>
      <BannerMessage message={banner.message} />
      {linkText && linkUrl && (
        <>
          {' '}
          {preview ? (
            <span className={linkClassName}>{linkText}</span>
          ) : isExternalUrl(linkUrl) ? (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onLinkClick}
              className={linkClassName}
            >
              {linkText}
            </a>
          ) : (
            <Link to={linkUrl} onClick={onLinkClick} className={linkClassName}>
              {linkText}
            </Link>
          )}
        </>
      )}
    </SiteBanner>
  )
}

export default function InfoBanner() {
  const { track } = useRybbit()
  const dismissKey = INFO_BANNER ? getDismissKey(INFO_BANNER) : ''
  const [dismissed, setDismissed] = useState(() => !INFO_BANNER || wasDismissed(dismissKey))

  if (!INFO_BANNER || dismissed) return null
  const banner = INFO_BANNER

  const handleLinkClick = () => {
    track('info-banner-link-click', {
      url: banner.linkUrl,
      text: banner.linkText,
      variant: banner.variant,
    })
  }

  const handleDismiss = () => {
    storeDismissal(dismissKey)
    setDismissed(true)
    track('info-banner-dismiss', {
      message: banner.message,
      variant: banner.variant,
    })
  }

  return <InfoBannerView banner={banner} onDismiss={handleDismiss} onLinkClick={handleLinkClick} />
}
