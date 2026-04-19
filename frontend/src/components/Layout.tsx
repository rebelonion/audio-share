import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router'
import { Helmet } from 'react-helmet-async'
import { Music, Menu, X } from 'lucide-react'
import FloatingActionButton from './FloatingActionButton'
import GlobalSearchBar from './GlobalSearchBar'
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION, RYBBIT_URL, RYBBIT_SITE_ID } from '@/lib/config'

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <>
      <Helmet>
        <title>{DEFAULT_TITLE}</title>
        <link rel="icon" href="/favicon.svg" />
        {RYBBIT_URL && RYBBIT_SITE_ID && (
          <script
            defer
            src={`${RYBBIT_URL}/api/script.js`}
            data-site-id={RYBBIT_SITE_ID}
          />
        )}
      </Helmet>

      <div className="bg-[var(--background)] text-[var(--foreground)] min-h-screen flex flex-col">
        <header className="bg-[var(--card)] border-b border-[var(--border)]">
          <div className="h-[2px]" style={{ background: 'linear-gradient(to right, transparent 0%, var(--primary) 30%, var(--primary-hover) 70%, transparent 100%)', opacity: 0.9 }} />
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3 group">
                <Music className="h-6 w-6 text-[var(--primary)] transition-opacity group-hover:opacity-70" />
                <h1
                  className="text-[1.45rem] font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors leading-none tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {DEFAULT_TITLE}
                </h1>
              </Link>
              <div className="flex items-center gap-4 sm:gap-8">
                <GlobalSearchBar />
                <nav className="hidden sm:flex items-center gap-7">
                  {(['About', 'Stats', 'Requests', 'Contact'] as const).map(page => {
                    const isActive = location.pathname === `/${page.toLowerCase()}`
                    return (
                      <Link
                        key={page}
                        to={`/${page.toLowerCase()}`}
                        className={`text-[0.7rem] uppercase tracking-[0.12em] font-medium transition-colors relative ${
                          isActive
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {page}
                        <span
                          className="absolute -bottom-[18px] left-0 right-0 h-[2px] bg-[var(--primary)] rounded-full transition-opacity duration-200"
                          style={{ opacity: isActive ? 1 : 0 }}
                        />
                      </Link>
                    )
                  })}
                </nav>
                <button
                  className="sm:hidden relative h-6 w-6 text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                  onClick={() => setMenuOpen(o => !o)}
                  aria-label="Toggle menu"
                >
                  <Menu className={`absolute inset-0 h-6 w-6 transition-all duration-300 ${menuOpen ? 'opacity-0 rotate-90' : 'opacity-100 rotate-0'}`} />
                  <X className={`absolute inset-0 h-6 w-6 transition-all duration-300 ${menuOpen ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'}`} />
                </button>
              </div>
            </div>
          </div>
          <div className={`sm:hidden grid transition-[grid-template-rows] duration-300 ease-in-out ${menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className="border-t border-[var(--border)] px-4 py-3 space-y-1">
                {(['About', 'Stats', 'Requests', 'Contact'] as const).map(page => {
                  const isActive = location.pathname === `/${page.toLowerCase()}`
                  return (
                    <Link
                      key={page}
                      to={`/${page.toLowerCase()}`}
                      className={`block py-2 text-[0.7rem] uppercase tracking-[0.12em] font-medium transition-colors ${
                        isActive ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {page}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </header>

        <main className="w-full px-4 sm:px-6 lg:px-8 py-8 flex-grow">
          <Outlet />
        </main>

        <FloatingActionButton />

        <footer className="bg-[var(--card)] border-t border-[var(--border)] mt-auto">
          <div className="h-[1px] bg-[var(--primary)]" style={{ opacity: 0.4 }} />
          <div className="px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex flex-col items-center gap-4">
              <nav className="flex items-center gap-6">
                {(['About', 'Stats', 'Requests', 'Contact'] as const).map(page => (
                  <Link
                    key={page}
                    to={`/${page.toLowerCase()}`}
                    className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors duration-200"
                  >
                    {page}
                  </Link>
                ))}
              </nav>
              <a
                href="https://github.com/rebelonion/audio-share"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors duration-200"
                aria-label="GitHub repository"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 fill-current"
                >
                  <title>GitHub</title>
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              {DEFAULT_DESCRIPTION && (
                <p className="text-center text-[var(--muted-foreground)] text-xs tracking-wide">
                  {DEFAULT_DESCRIPTION}
                </p>
              )}
              <p className="text-center text-[var(--muted-foreground)] text-xs" style={{ opacity: 0.55 }}>
                &copy; {new Date().getFullYear()} rebelonion &mdash; MIT License
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
