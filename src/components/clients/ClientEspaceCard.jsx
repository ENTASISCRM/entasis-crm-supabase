// src/components/clients/ClientEspaceCard.jsx
// Carte « Espace client » de la fiche : état de l'accès portail (invitation
// par email, sans mot de passe) et documents partagés avec le client
// (bucket privé client-docs + table client_documents). Le client retrouve
// ces documents en lecture seule sur son espace.

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { SkeletonText } from '../ui/Skeleton'
import { confirmDialog } from '../ui/confirm'
import { messageErreur } from '../../lib/ui-shared'

const CATEGORIES = [
  { key: 'releve', label: 'Relevé' },
  { key: 'avenant', label: 'Avenant' },
  { key: 'conformite', label: 'Conformité' },
  { key: 'attestation', label: 'Attestation' },
  { key: 'autre', label: 'Autre' },
]

export default function ClientEspaceCard({ clientId, client, supabase, profile }) {
  const [compte, setCompte] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [categorie, setCategorie] = useState('releve')

  const isManager = profile?.role === 'manager'

  const recharger = useCallback(async () => {
    const [acctRes, docsRes] = await Promise.all([
      supabase.from('client_accounts').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ])
    if (!acctRes.error) setCompte(acctRes.data)
    if (!docsRes.error) setDocs(docsRes.data || [])
  }, [clientId, supabase])

  useEffect(() => {
    if (!clientId) return
    let vivant = true
    ;(async () => {
      try { await recharger() } finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [clientId, recharger])

  async function inviter() {
    if (!client?.email) {
      toast.error('Renseignez d\'abord l\'email du client')
      return
    }
    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/portal-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'Invitation impossible')
      toast.success(json.emailSent
        ? 'Accès ouvert — email envoyé au client'
        : 'Accès ouvert (email non envoyé : prévenez le client)')
      recharger()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setInviting(false)
    }
  }

  async function toggleActif() {
    try {
      const { error } = await supabase
        .from('client_accounts')
        .update({ actif: !compte.actif })
        .eq('client_id', clientId)
      if (error) throw error
      toast.success(compte.actif ? 'Accès suspendu' : 'Accès réactivé')
      recharger()
    } catch {
      toast.error('Modification impossible')
    }
  }

  async function uploader(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Fichier trop lourd (20 Mo max)')
      return
    }
    setUploading(true)
    try {
      const propre = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `${clientId}/${Date.now()}_${propre}`
      const { error: upErr } = await supabase.storage
        .from('client-docs')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from('client_documents').insert({
        client_id: clientId,
        titre: file.name.replace(/\.[^.]+$/, ''),
        categorie,
        storage_path: path,
        uploaded_by: profile?.id || null,
      })
      if (insErr) throw insErr
      toast.success('Document partagé avec le client')
      recharger()
    } catch (err) {
      console.error('Erreur upload document:', err)
      toast.error('Envoi du document impossible')
    } finally {
      setUploading(false)
    }
  }

  async function ouvrir(doc) {
    const { data, error } = await supabase.storage.from('client-docs').createSignedUrl(doc.storage_path, 300)
    if (error || !data?.signedUrl) { toast.error('Ouverture impossible'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function supprimer(doc) {
    if (!(await confirmDialog({title:`Retirer « ${doc.titre} » de l'espace client ?`,message:'Le client ne verra plus ce document.',confirmLabel:'Retirer',danger:true}))) return
    try {
      const { error } = await supabase.from('client_documents').delete().eq('id', doc.id)
      if (error) throw error
      await supabase.storage.from('client-docs').remove([doc.storage_path])
      toast.success('Document retiré')
      recharger()
    } catch {
      toast.error('Suppression impossible')
    }
  }

  return (
    <div className="card" style={{ marginBottom: '32px' }}>
      <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
        <h3>
          Espace client
          {!loading && compte && (
            <span style={{ fontWeight: '400', fontSize: '13px', color: 'var(--t2)', marginLeft: '8px' }}>
              {compte.actif ? 'accès actif' : 'accès suspendu'} · {compte.email}
            </span>
          )}
        </h3>
        {!loading && (compte ? (
          isManager && (
            <button className="btn btn-secondary btn-sm" onClick={toggleActif}>
              {compte.actif ? 'Suspendre l\'accès' : 'Réactiver l\'accès'}
            </button>
          )
        ) : (
          <button className="btn btn-primary btn-sm" onClick={inviter} disabled={inviting}>
            {inviting ? 'Ouverture…' : 'Ouvrir l\'accès'}
          </button>
        ))}
      </div>
      <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
        {loading ? (
          <SkeletonText lines={2} />
        ) : (
          <>
            {!compte && (
              <div style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '16px' }}>
                Le client n'a pas encore accès à son espace (contrats, patrimoine, documents).
                L'ouverture envoie un email d'invitation ; la connexion se fait ensuite par
                code email, sans mot de passe.
              </div>
            )}

            {/* Documents partagés */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              marginBottom: docs.length > 0 ? '12px' : '0',
            }}>
              <strong style={{ fontSize: '13px' }}>Documents partagés ({docs.length})</strong>
              <div style={{ flex: 1 }} />
              <select className="input" value={categorie} onChange={e => setCategorie(e.target.value)} style={{ width: '140px' }}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                {uploading ? 'Envoi…' : '+ Déposer un document'}
                <input type="file" style={{ display: 'none' }} onChange={uploader} disabled={uploading} />
              </label>
            </div>

            {docs.map(doc => (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'baseline', gap: '10px',
                padding: '9px 0', borderBottom: '1px solid var(--bd)', fontSize: '13px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: '600' }}>{doc.titre}</span>
                  <span style={{ color: 'var(--t2)', marginLeft: '8px', fontSize: '12px' }}>
                    {(CATEGORIES.find(c => c.key === doc.categorie) || {}).label || doc.categorie}
                    {' · '}{new Date(doc.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => ouvrir(doc)}>Ouvrir</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => supprimer(doc)}>Retirer</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
