import type { Theme } from '../hooks/useTheme'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
  floating?: boolean
}

export function ThemeToggle({ theme, onToggle, floating = false }: ThemeToggleProps) {
  const label = theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'
  return (
    <button type="button" className={`theme-toggle${floating ? ' floating' : ''}`} onClick={onToggle} aria-label={label} title={label}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
