// src/components/clients/ClientEquipementCard.jsx
// Carte Equipement de la fiche client : familles detenues (pastille pleine),
// absences confirmees (croix) et famille suggeree par les regles du module
// Multi equipement. Seul endroit ou l equipement du client manquait encore.
// Donnees : vue client_equipment (security invoker, la RLS applique le
// perimetre) + referentiel product_families via le service equipment existant.

import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { listFamilies } from '../../services/equipment'
import { suggestionPour } from '../../config/multiEquipementRules'

export default function ClientEquipementCard({ clientId, client, supabase }) {
  const [families, setFamilies] = useState([])
  const [equip, setEquip] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) return
    let vivant = true
    ;(async () => {
      try {
        // La vue ne contient que les clients ayant au moins un deal signe ou
        // une declaration : maybeSingle pour tolerer l absence de ligne.
        const [fam, eqRes] = await Promise.all([
          listFamilies(),
          supabase.from('client_equipment').select('*').eq('client_id', clientId).maybeSingle(),
        ])
        if (!vivant) return
        if (eqRes.error) throw eqRes.error
        setFamilies(fam)
        setEquip(eqRes.data)
      } catch (e) {
        console.error('Erreur chargement equipement client:', e)
      } finally {
        if (vivant) setLoading(false)
      }
    })()
    return () => { vivant = false }
  }, [clientId, supabase])

  const familles = equip?.familles || []
  const absences = equip?.absences_confirmees || []

  // Meme forme d entree que la matrice Multi equipement. Sans ligne dans la
  // vue on retombe sur les champs de la fiche client (le cas TNS sans
  // prevoyance reste ainsi detecte pour un client encore non equipe).
  const sug = suggestionPour({
    familles,
    absences,
    profession: (equip?.profession ?? client?.profession) || '',
    statut: (equip?.statut_pro ?? client?.statut_pro) || '',
    revenus: Number((equip?.revenus_annuels ?? client?.revenus_annuels) || 0),
    patrimoine: Number((equip?.patrimoine_estime ?? client?.patrimoine_estime) || 0),
  })

  // La fiche client ne recoit pas setActiveTab : on passe par le bouton de
  // navigation deja rendu dans la sidebar (repli : simple message).
  function ouvrirMultiEquipement() {
    const btn = Array.from(document.querySelectorAll('.sidebar .nav-item'))
      .find(b => (b.textContent || '').includes('Multi-équipement'))
    if (btn) btn.click()
    else toast('Ouvrez l\'onglet Multi-équipement depuis le menu')
  }

  // Colonnes identiques a la matrice : la famille autre reste masquee sauf
  // si le client la detient ou l a declaree absente.
  const visibles = families.filter(f =>
    f.key !== 'autre' || familles.includes('autre') || absences.includes('autre')
  )

  return (
    <div className="card" style={{ marginBottom: '32px' }}>
      <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
        <h3>
          Équipement
          {!loading && familles.length > 0 && (
            <span style={{ fontWeight: '400', fontSize: '13px', color: 'var(--t2)', marginLeft: '8px' }}>
              {familles.length} famille{familles.length > 1 ? 's' : ''} détenue{familles.length > 1 ? 's' : ''}
            </span>
          )}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={ouvrirMultiEquipement}>
          Ouvrir dans Multi-équipement →
        </button>
      </div>
      <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
        {loading ? (
          <div style={{ color: 'var(--t2)', fontSize: '13px' }}>Chargement…</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {visibles.map(f => {
                const detenu = familles.includes(f.key)
                const absent = !detenu && absences.includes(f.key)
                const suggere = sug && sug.famille_suggeree === f.key
                return (
                  <span
                    key={f.key}
                    title={detenu
                      ? `${f.label} : détenu`
                      : absent
                        ? `${f.label} : absence confirmée`
                        : suggere
                          ? sug.raison
                          : `${f.label} : non renseigné`}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: detenu ? (f.couleur || 'var(--gold)') : 'transparent',
                      color: detenu ? 'white' : suggere ? 'var(--gold)' : absent ? 'var(--t3)' : 'var(--t2)',
                      border: detenu
                        ? '1px solid transparent'
                        : suggere
                          ? '1px dashed var(--gold)'
                          : '1px solid var(--bd)',
                      textDecoration: absent ? 'line-through' : 'none',
                    }}
                  >
                    {detenu ? '● ' : absent ? '✕ ' : ''}{f.label}{suggere ? ' · à proposer' : ''}
                  </span>
                )
              })}
            </div>
            {familles.length === 0 && absences.length === 0 && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--t2)' }}>
                Aucun équipement recensé pour ce client (ni deal signé, ni déclaration).
              </div>
            )}
            {sug && (
              <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--gold)' }}>{sug.label}</strong> — {sug.raison}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
