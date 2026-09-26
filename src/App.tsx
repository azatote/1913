import { useEffect, useState } from 'react'
import { GameScreen } from './components/GameScreen'
import { Home } from './components/Home'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './hooks/useTheme'
import { buildGameUrl, readGameIdFromUrl } from './lib/gameId'
import { isSupabaseConfigured } from './lib/supabase'
import './App.css'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [gameId, setGameId] = useState<string | null>(() => readGameIdFromUrl())

  useEffect(() => {
    const onPopState = () => setGameId(readGameIdFromUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openGame = (nextGameId: string | null) => {
    window.history.pushState(null, '', buildGameUrl(nextGameId))
    setGameId(nextGameId)
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="center-page">
        <ThemeToggle theme={theme} onToggle={toggleTheme} floating />
        <section className="center-card">
          <span className="eyebrow">Configuration requise</span>
          <h1>Connectez <span className="accent">Supabase</span></h1>
          <p className="center-copy">
            Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code>
            (ou dans les variables d'environnement Vercel), puis relancez le site.
          </p>
        </section>
      </main>
    )
  }

  return gameId ? (
    <GameScreen
      key={gameId}
      gameId={gameId}
      themeToggle={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
      onLeave={() => openGame(null)}
    />
  ) : (
    <Home themeToggle={<ThemeToggle theme={theme} onToggle={toggleTheme} floating />} onOpen={openGame} />
  )
}
