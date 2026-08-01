// Detecteur de nouvelle version : compare /version.json (ecrit a chaque
// build) toutes les 5 minutes et au retour sur l onglet. Quand une nouvelle
// version est en ligne, propose de recharger au lieu de laisser l equipe
// sur du code perime (boutons invisibles, regles de calcul obsoletes…).
import toast from 'react-hot-toast'

let versionInitiale = null
let dejaNotifie = false

async function verifier() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' })
    if (!r.ok) return
    const { build } = await r.json()
    if (versionInitiale === null) { versionInitiale = build; return }
    if (build !== versionInitiale && !dejaNotifie) {
      dejaNotifie = true
      toast((t) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Nouvelle version du CRM disponible.
          <button
            onClick={() => window.location.reload()}
            style={{
              border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              background: '#0A1628', color: '#fff', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            Recharger
          </button>
        </span>
      ), { duration: Infinity, id: 'version-update' })
    }
  } catch { /* hors ligne ou build local : silencieux */ }
}

export function demarrerVerifVersion() {
  verifier()
  setInterval(verifier, 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verifier()
  })
}
