import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { STATUTS_PRO } from '../../lib/ui-shared'

// Rouge charte pour le manque (semantique "champ obligatoire vide").
const ROUGE_MANQUE = '#B4453B'

// Un champ est vide s'il est null/undefined ou chaine vide apres trim. Meme
// regle que le verrou de signature et que le score de la fiche client.
function champVide(valeur) {
  return valeur == null || String(valeur).trim() === ''
}

// Pastille rouge affichee a cote du label d'un champ obligatoire encore vide
// pendant l'edition. Ne bloque pas la sauvegarde (la contrainte dure est a la
// signature), rend juste le manque tres visible.
function PastilleRequise({ vide }) {
  if (!vide) return null
  return (
    <span
      title="Champ obligatoire pour signer et alimenter les opportunités"
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: ROUGE_MANQUE,
        marginLeft: '6px',
        verticalAlign: 'middle'
      }}
    />
  )
}

// Normalise un numero francais a la perte de focus du champ : espaces,
// points, tirets et parentheses retires, prefixe international 33 ramene
// a 0, puis regroupement par paires de chiffres. Un numero non reconnu est
// laisse tel quel, aucun blocage. Fiabilise les liens tel de la fiche
// client et le rapprochement Lead Room qui compare les numeros.
function normaliserTelephone(brut) {
  if (!brut) return brut
  let t = String(brut).trim().replace(/[\s.()-]/g, '')
  if (t.startsWith('+33')) t = '0' + t.slice(3)
  else if (t.startsWith('0033')) t = '0' + t.slice(4)
  if (/^0\d{9}$/.test(t)) return t.replace(/(\d{2})(?=\d)/g, '$1 ')
  return String(brut).trim()
}

export default function ClientModal({ open, client, onClose, onSave, supabase, profile }) {
  const [form, setForm] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    age: '',
    date_naissance: '',
    adresse: '',
    code_postal: '',
    ville: '',
    situation_familiale: '',
    nb_enfants: 0,
    statut_pro: '',
    profession: '',
    revenus_annuels: '',
    patrimoine_estime: '',
    objectifs: [],
    notes: '',
    advisor_code: profile?.advisor_code || '',
    co_advisor_code: ''
  })

  const [loading, setLoading] = useState(false)

  // Options pour les objectifs
  const OBJECTIFS_OPTIONS = ['Retraite', 'Transmission', 'Défiscalisation', 'Épargne', 'Immobilier', 'Protection']
  const SITUATION_OPTIONS = ['Célibataire', 'Marié', 'Pacsé', 'Divorcé', 'Veuf']

  // Initialiser le formulaire quand client change
  useEffect(() => {
    if (client) {
      setForm({
        nom: client.nom || '',
        prenom: client.prenom || '',
        email: client.email || '',
        telephone: client.telephone || '',
        age: client.age || '',
        date_naissance: client.date_naissance || '',
        adresse: client.adresse || '',
        code_postal: client.code_postal || '',
        ville: client.ville || '',
        situation_familiale: client.situation_familiale || '',
        nb_enfants: client.nb_enfants || 0,
        statut_pro: client.statut_pro || '',
        profession: client.profession || '',
        revenus_annuels: client.revenus_annuels || '',
        patrimoine_estime: client.patrimoine_estime || '',
        objectifs: client.objectifs || [],
        notes: client.notes || '',
        advisor_code: client.advisor_code || profile?.advisor_code || '',
        co_advisor_code: client.co_advisor_code || ''
      })
    } else {
      // Formulaire vide pour création
      setForm({
        nom: '',
        prenom: '',
        email: '',
        telephone: '',
        age: '',
        date_naissance: '',
        adresse: '',
        code_postal: '',
        ville: '',
        situation_familiale: '',
        nb_enfants: 0,
        statut_pro: '',
        profession: '',
        revenus_annuels: '',
        patrimoine_estime: '',
        objectifs: [],
        notes: '',
        advisor_code: profile?.advisor_code || '',
        co_advisor_code: ''
      })
    }
  }, [client, profile])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // Signal doux, sans blocage : email saisi mais sans arobase
  const emailSuspect = !!form.email?.trim() && !form.email.includes('@')

  // Champs obligatoires (identiques au verrou de signature) encore vides.
  // Sert a la legende des pastilles rouges. Ne bloque PAS la sauvegarde : la
  // contrainte dure reste au passage en "Signé".
  const manquantsObligatoires = [
    ['email', form.email],
    ['téléphone', form.telephone],
    ['statut', form.statut_pro],
    ['profession', form.profession],
    ['revenus', form.revenus_annuels],
    ['patrimoine', form.patrimoine_estime],
  ].filter(([, v]) => champVide(v)).map(([label]) => label)

  const toggleObjectif = (objectif) => {
    if (form.objectifs.includes(objectif)) {
      set('objectifs', form.objectifs.filter(o => o !== objectif))
    } else {
      set('objectifs', [...form.objectifs, objectif])
    }
  }

  async function saveClient() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire')
      return
    }

    setLoading(true)

    try {
      const payload = {
        nom: form.nom.trim(),
        prenom: form.prenom?.trim() || null,
        email: form.email?.trim() || null,
        telephone: form.telephone?.trim() || null,
        age: form.age ? Number(form.age) : null,
        date_naissance: form.date_naissance?.trim() || null,
        adresse: form.adresse?.trim() || null,
        code_postal: form.code_postal?.trim() || null,
        ville: form.ville?.trim() || null,
        situation_familiale: form.situation_familiale || null,
        nb_enfants: Number(form.nb_enfants) || 0,
        statut_pro: form.statut_pro?.trim() || null,
        profession: form.profession?.trim() || null,
        revenus_annuels: form.revenus_annuels ? Number(form.revenus_annuels) : null,
        patrimoine_estime: form.patrimoine_estime ? Number(form.patrimoine_estime) : null,
        objectifs: form.objectifs || [],
        notes: form.notes?.trim() || null,
        advisor_code: profile?.role === 'manager'
          ? (form.advisor_code?.trim() || profile?.advisor_code)
          : profile?.advisor_code,
        co_advisor_code: form.co_advisor_code?.trim() || null,
      }

      if (client?.id) {
        // Mise à jour
        const updatedAt = new Date().toISOString()
        const { error } = await supabase
          .from('clients')
          .update({ ...payload, updated_at: updatedAt })
          .eq('id', client.id)

        if (error) {
          toast.error('Erreur: ' + error.message)
          return
        }

        toast.success('Client mis à jour')
        // Propage la fiche a jour au parent (ClientView) pour rafraichir
        // immediatement le bandeau "Fiche incomplete" et le score de
        // completude sans rechargement de page.
        if (onSave) onSave({ ...client, ...payload, updated_at: updatedAt })
      } else {
        // Création
        const { data, error } = await supabase
          .from('clients')
          .insert({ ...payload, created_by: profile?.id })
          .select()
          .single()

        if (error) {
          toast.error('Erreur: ' + error.message)
          return
        }

        toast.success('Client créé')
        if (onSave) onSave(data)
      }

      onClose()
    } catch (error) {
      console.error('Erreur sauvegarde client:', error)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 800, width: '90%' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {client ? 'Modifier le client' : 'Nouveau client'}
            </div>
            {client && <div className="modal-subtitle">{client.nom}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Legende des pastilles : rappelle les champs obligatoires encore
              vides. N'apparait que s'il en manque au moins un. */}
          {manquantsObligatoires.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              backgroundColor: 'rgba(180, 69, 59, 0.08)',
              border: `1px solid ${ROUGE_MANQUE}`,
              borderRadius: 'var(--rad)',
              fontSize: '13px',
              color: 'var(--t1)'
            }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: ROUGE_MANQUE,
                flexShrink: 0
              }} />
              <span>
                Champs <strong>obligatoires pour signer</strong> encore à remplir : {manquantsObligatoires.join(', ')}.
              </span>
            </div>
          )}

          {/* Section Identité */}
          <div className="form-section">
            <h3 className="form-section-title">Identité</h3>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Prénom</label>
                <input
                  className="form-input"
                  value={form.prenom}
                  onChange={e => set('prenom', e.target.value)}
                  placeholder="Jean"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input
                  className="form-input"
                  value={form.nom}
                  onChange={e => set('nom', e.target.value)}
                  placeholder="Dupont"
                  required
                />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Email <PastilleRequise vide={champVide(form.email)} /></label>
                <input
                  className="form-input"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="jean.dupont@email.com"
                  style={emailSuspect ? { borderColor: '#D97706' } : undefined}
                />
                {emailSuspect && (
                  <div style={{ fontSize: '12px', color: '#B45309', marginTop: '4px' }}>
                    Adresse sans @, vérifiez la saisie
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone <PastilleRequise vide={champVide(form.telephone)} /></label>
                <input
                  className="form-input"
                  value={form.telephone}
                  onChange={e => set('telephone', e.target.value)}
                  onBlur={e => set('telephone', normaliserTelephone(e.target.value))}
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Âge</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="120"
                  value={form.age}
                  onChange={e => set('age', e.target.value)}
                  placeholder="35"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Situation familiale</label>
                <select
                  className="form-input"
                  value={form.situation_familiale}
                  onChange={e => set('situation_familiale', e.target.value)}
                >
                  <option value="">-- Choisir --</option>
                  {SITUATION_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nombre d'enfants</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="20"
                  value={form.nb_enfants}
                  onChange={e => set('nb_enfants', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Profession <PastilleRequise vide={champVide(form.profession)} /></label>
                <input
                  className="form-input"
                  value={form.profession}
                  onChange={e => set('profession', e.target.value)}
                  placeholder="Ingénieur, Médecin, etc."
                />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Statut professionnel <PastilleRequise vide={champVide(form.statut_pro)} /></label>
                <select
                  className="form-input"
                  value={form.statut_pro}
                  onChange={e => set('statut_pro', e.target.value)}
                >
                  <option value="">-- Choisir --</option>
                  {STATUTS_PRO.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date de naissance</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.date_naissance}
                  onChange={e => set('date_naissance', e.target.value)}
                />
                <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>
                  Recommandé (sert aux anniversaires), non obligatoire.
                </div>
              </div>
            </div>
          </div>

          {/* Section Adresse */}
          <div className="form-section">
            <h3 className="form-section-title">Adresse</h3>
            <div className="form-group">
              <label className="form-label">Adresse</label>
              <input
                className="form-input"
                value={form.adresse}
                onChange={e => set('adresse', e.target.value)}
                placeholder="123 rue de la Paix"
              />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Code postal</label>
                <input
                  className="form-input"
                  value={form.code_postal}
                  onChange={e => set('code_postal', e.target.value)}
                  placeholder="75001"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input
                  className="form-input"
                  value={form.ville}
                  onChange={e => set('ville', e.target.value)}
                  placeholder="Paris"
                />
              </div>
            </div>
          </div>

          {/* Section Patrimoine */}
          <div className="form-section">
            <h3 className="form-section-title">Patrimoine</h3>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Revenus annuels (€) <PastilleRequise vide={champVide(form.revenus_annuels)} /></label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.revenus_annuels}
                  onChange={e => set('revenus_annuels', e.target.value)}
                  placeholder="50000"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Patrimoine estimé (€) <PastilleRequise vide={champVide(form.patrimoine_estime)} /></label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.patrimoine_estime}
                  onChange={e => set('patrimoine_estime', e.target.value)}
                  placeholder="200000"
                />
              </div>
            </div>

            {/* Objectifs */}
            <div className="form-group">
              <label className="form-label">Objectifs</label>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '8px'
              }}>
                {OBJECTIFS_OPTIONS.map(objectif => (
                  <label
                    key={objectif}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      border: '1px solid var(--bd)',
                      borderRadius: 'var(--rad)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      backgroundColor: form.objectifs.includes(objectif)
                        ? 'var(--gold)'
                        : 'var(--bg)',
                      color: form.objectifs.includes(objectif)
                        ? 'white'
                        : 'var(--t1)'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.objectifs.includes(objectif)}
                      onChange={() => toggleObjectif(objectif)}
                      style={{ display: 'none' }}
                    />
                    {objectif}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section Attribution */}
          {profile?.role === 'manager' && (
            <div className="form-section">
              <h3 className="form-section-title">Attribution</h3>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Code conseiller principal</label>
                  <input
                    className="form-input"
                    value={form.advisor_code}
                    onChange={e => set('advisor_code', e.target.value)}
                    placeholder="LOUIS"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Code co-conseiller</label>
                  <input
                    className="form-input"
                    value={form.co_advisor_code}
                    onChange={e => set('co_advisor_code', e.target.value)}
                    placeholder="JEAN"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section Notes */}
          <div className="form-section">
            <h3 className="form-section-title">Notes</h3>
            <div className="form-group">
              <label className="form-label">Notes libres</label>
              <textarea
                className="form-input"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Notes sur le client, ses besoins, historique..."
                rows="4"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={saveClient}
            disabled={loading || !form.nom?.trim()}
          >
            {loading ? 'Sauvegarde...' : (client ? 'Mettre à jour' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  )
}