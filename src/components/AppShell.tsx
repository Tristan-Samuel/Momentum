import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ResumePrompt } from '@/components/ResumePrompt';
import { Icon, type IconName } from '@/components/ui/Icon';

const links: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
  { to: '/configure', label: 'Program', icon: 'program' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <ResumePrompt />
      <div
        key={location.pathname}
        className="animate-fade-up mx-auto w-full max-w-xl px-5 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]"
      >
        <Outlet />
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-md"
      >
        <ul className="mx-auto flex max-w-xl justify-between px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {links.map((link) => (
            <li key={link.to} className="flex-1">
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-1 text-[11px] tracking-wide transition-colors ${
                    isActive ? 'text-[var(--fg)]' : 'text-[var(--muted)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                        isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : ''
                      }`}
                    >
                      <Icon name={link.icon} size={21} strokeWidth={isActive ? 2.1 : 1.8} />
                    </span>
                    {link.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
