import { useEffect, useMemo, useState } from 'react'
import { buildGameUrl } from '../lib/gameId'

export function InvitePanel({ gameId }: { gameId: string }) {
  const shareUrl = useMemo(() => buildGameUrl(gameId), [gameId])
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(shareUrl, { width: 200, margin: 1, color: { dark: '#0b0b10', light: '#ffffff' } }))
      .then((url) => {
        if (active) setQrCodeUrl(url)
      })
      .catch(() => {
        if (active) setQrCodeUrl('')
      })
    return () => {
      active = false
    }
  }, [shareUrl])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="invite">
      {qrCodeUrl && <img src={qrCodeUrl} alt="QR code d'accès à la partie" />}
      <div>
        <small>Faites scanner ce QR code ou partagez le lien.</small>
        <button type="button" className="secondary-button small" onClick={() => void copyLink()}>
          {copied ? 'Lien copié ✓' : 'Copier le lien'}
        </button>
      </div>
    </div>
  )
}
