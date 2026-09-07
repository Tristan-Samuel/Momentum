import { NavLink, Outlet } from 'react-router-dom';
import { ResumePrompt } from '@/components/ResumePrompt';

const links = [
  { to: '/', label: 'Home' },
  { to: '/history', label: 'History' },
  { to: '/progress', label: 'Progress' },
  { to: '/configure', label: 'Program' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <ResumePrompt />
      <div className="mx-auto w-full max-w-xl px-5 pb-24 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Outlet />
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-xl justify-between px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `block px-2 py-2 text-sm tracking-wide ${isActive ? 'text-[var(--fg)]' : 'text-[var(--muted)]'}`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
