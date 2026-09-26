import { useEffect, useState } from 'react'
import { readStored, writeStored } from '../lib/storage'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'nd1913.theme'

function darkQuery() {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function savedTheme(): Theme | null {
  const value = readStored('local', THEME_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? (darkQuery().matches ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Follows the OS theme until the user picks one explicitly.
  useEffect(() => {
    const query = darkQuery()
    const onChange = (event: MediaQueryListEvent) => {
      if (!savedTheme()) setTheme(event.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    writeStored('local', THEME_KEY, next)
    setTheme(next)
  }

  return { theme, toggleTheme }
}
