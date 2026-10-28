import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { GAMES_TABLE, supabase } from '../lib/supabase'

// Simple garde-fou contre les clics accidentels: ce mot de passe est visible dans le code du site.
const RESET_PASSWORD = '1913'

type ResetDatabaseProps = {
  onReset: () => Promise<void>
}

export function ResetDatabase({ onReset }: ResetDatabaseProps) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setError(null)
    if (password !== RESET_PASSWORD) {
      setError('Mot de passe incorrect.')
      return
    }
    if (!window.confirm('Supprimer définitivement TOUTES les parties pour tous les joueurs, y compris celle-ci ?')) return

    setBusy(true)
    const { error: deleteError } = await supabase.from(GAMES_TABLE).delete().not('id', 'is', null)
    if (deleteError) {
      setBusy(false)
      setError(`Réinitialisation impossible : ${errorMessage(deleteError)}`)
      return
    }
    await onReset()
  }

  if (!open) {
    return <button type="button" className="danger-button" onClick={() => setOpen(true)}>Réinitialiser la base</button>
  }

  return (
    <form className="join-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="reset-input">Réinitialiser la base (supprime toutes les parties)</label>
      <div>
        <input id="reset-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe" autoComplete="off" autoFocus />
        <button type="submit" className="danger-button" disabled={busy}>{busy ? 'Suppression…' : 'Valider'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  )
}
