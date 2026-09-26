import { useState, type FormEvent, type ReactNode } from 'react'
import { createInitialState } from '../game/logic'
import { errorMessage } from '../lib/errors'
import { extractGameId } from '../lib/gameId'
import { GAMES_TABLE, supabase } from '../lib/supabase'

type HomeProps = {
  themeToggle: ReactNode
  onOpen: (gameId: string) => void
}

export function Home({ themeToggle, onOpen }: HomeProps) {
  const [creating, setCreating] = useState(false)
  const [joinValue, setJoinValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createGame = async () => {
    if (!supabase) return
    setCreating(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from(GAMES_TABLE)
      .insert({ state: createInitialState(), revision: 0 })
      .select('id')
      .single<{ id: string }>()
    setCreating(false)
    if (insertError || !data) {
      setError(`Création impossible : ${errorMessage(insertError)}. Le script SQL a-t-il été exécuté dans Supabase ?`)
      return
    }
    onOpen(data.id)
  }

  const joinGame = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const gameId = extractGameId(joinValue)
    if (!gameId) {
      setError('Collez le lien de la partie ou son code (format xxxxxxxx-xxxx-…).')
      return
    }
    onOpen(gameId)
  }

  return (
    <main className="center-page">
      {themeToggle}
      <section className="center-card">
        <span className="eyebrow">Jeu de cartes · 2 joueurs · temps réel</span>
        <h1>Table de jeu <span className="accent">1913</span></h1>
        <p className="center-copy">
          Créez une partie, faites scanner le QR code à votre adversaire et jouez à deux :
          chacun voit la table depuis son côté.
        </p>
        <button type="button" className="primary-button full" onClick={() => void createGame()} disabled={creating}>
          {creating ? 'Création…' : 'Créer une partie'} <span aria-hidden="true">→</span>
        </button>
        <form className="join-form" onSubmit={joinGame}>
          <label htmlFor="join-input">Rejoindre une partie existante</label>
          <div>
            <input id="join-input" value={joinValue} onChange={(event) => setJoinValue(event.target.value)} placeholder="Lien ou code de la partie" autoComplete="off" />
            <button type="submit" className="secondary-button">Rejoindre</button>
          </div>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}
