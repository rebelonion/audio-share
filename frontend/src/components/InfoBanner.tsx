import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { INFO_BANNER, type BannerVariant } from '@/lib/config'
import { useRybbit } from '@/hooks/useRybbit'

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

function getDismissKey(message: string, linkUrl: string) {
  let hash = 5381
  const value = `${message}|${linkUrl}`
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

export default function InfoBanner() {
  const { track } = useRybbit()
  const dismissKey = getDismissKey(INFO_BANNER.message, INFO_BANNER.linkUrl)
  const [dismissed, setDismissed] = useState(() => wasDismissed(dismissKey))

  if (!INFO_BANNER.enabled || dismissed) return null

  const variantStyle = styles[INFO_BANNER.variant]
  const Icon = variantStyle.icon
  const hasLink = INFO_BANNER.linkText && INFO_BANNER.linkUrl

  const handleLinkClick = () => {
    track('info-banner-link-click', {
      url: INFO_BANNER.linkUrl,
      text: INFO_BANNER.linkText,
      variant: INFO_BANNER.variant,
    })
  }

  const handleDismiss = () => {
    storeDismissal(dismissKey)
    setDismissed(true)
    track('info-banner-dismiss', {
      message: INFO_BANNER.message,
      variant: INFO_BANNER.variant,
    })
  }

  return (
    <section className={`border-b ${variantStyle.className}`} aria-label="Site notice">
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm leading-6">
            <span>{INFO_BANNER.message}</span>
            {hasLink && (
              <>
                {' '}
                {isExternalUrl(INFO_BANNER.linkUrl) ? (
                  <a
                    href={INFO_BANNER.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleLinkClick}
                    className={`font-medium underline underline-offset-4 transition-colors ${variantStyle.linkClassName}`}
                  >
                    {INFO_BANNER.linkText}
                  </a>
                ) : (
                  <Link
                    to={INFO_BANNER.linkUrl}
                    onClick={handleLinkClick}
                    className={`font-medium underline underline-offset-4 transition-colors ${variantStyle.linkClassName}`}
                  >
                    {INFO_BANNER.linkText}
                  </Link>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
