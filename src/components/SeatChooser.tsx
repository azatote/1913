import { PLAYER_IDS, PLAYERS } from '../game/logic'
import type { PlayerId } from '../game/types'

type SeatChooserProps = {
  owners: Record<PlayerId, string | null>
  tabId: string
  onChoose: (seat: PlayerId) => void
}

const SEAT_HINTS: Record<PlayerId, string> = {
  bottom: 'Voit la table depuis le bas',
  top: 'Voit la table retournée',
}

export function SeatChooser({ owners, tabId, onChoose }: SeatChooserProps) {
  const allTaken = PLAYER_IDS.every((seat) => owners[seat] && owners[seat] !== tabId)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="seat-title">
      <section className="overlay-card">
        <span className="eyebrow">Ouverture de session</span>
        <h2 id="seat-title">Quel joueur voulez-vous <span className="accent">incarner ?</span></h2>
        <p className="center-copy">
          {allTaken ? 'Les deux places sont occupées. Attendez qu’un joueur quitte la partie.' : 'Choisissez votre point de vue avant de rejoindre la table.'}
        </p>
        <div className="seat-grid">
          {PLAYER_IDS.map((seat) => {
            const taken = Boolean(owners[seat] && owners[seat] !== tabId)
            return (
              <button key={seat} type="button" className="seat-button" disabled={taken} onClick={() => onChoose(seat)}>
                <strong>{PLAYERS[seat].label}</strong>
                <small>{taken ? 'Déjà pris' : SEAT_HINTS[seat]}</small>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
