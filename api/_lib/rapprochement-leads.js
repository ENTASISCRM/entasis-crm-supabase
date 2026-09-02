// api/_lib/rapprochement-leads.js
// Le calcul pur du rapprochement « signé dans la Lead Room, pas dans le
// CRM », séparé de la fonction serveur pour se tester sans réseau.
//
// Entrées : les leads de la Lead Room (id, name, status, taken_by,
// updated_at, rdv_date, email, phone), les dossiers CRM qui portent un de
// ces lead_id (id, lead_id, status, product, advisor_code, client,
// client_email, client_phone), et deux tables de correspondance pour nommer le conseiller :
// advisors de la Lead Room par id (email) et profils CRM par email
// (advisor_code). Jamais de montant : les dossiers arrivent déjà sans.

export const SITUATIONS = { SANS_DOSSIER: 'sans_dossier', NON_SIGNE: 'dossier_non_signe', OK: 'ok' }

const emailCle = (v) => String(v || '').trim().toLowerCase()

/** Parmi plusieurs dossiers d'un même lead, un « Signé » l'emporte. */
export function choisirDossier(dossiers) {
  const liste = Array.isArray(dossiers) ? dossiers.filter(Boolean) : []
  if (!liste.length) return null
  return liste.find((d) => d.status === 'Signé') || liste[0]
}

export function situationDe(dossier) {
  if (!dossier) return SITUATIONS.SANS_DOSSIER
  return dossier.status === 'Signé' ? SITUATIONS.OK : SITUATIONS.NON_SIGNE
}

/**
 * @returns {Array} lignes { leadId, nom, statutLeadRoom, majLe, rdvLe, email,
 *   telephone, conseiller, dossier, situation }, sans les cas « ok », du plus
 *   récent au plus ancien.
 */
export function rapprocherLeads(leadsLeadRoom, dealsCrm, { advisorParId = new Map(), codeParEmail = new Map() } = {}) {
  const dossiersParLead = new Map()
  for (const d of (Array.isArray(dealsCrm) ? dealsCrm : [])) {
    if (!d?.lead_id) continue
    const cle = String(d.lead_id)
    if (!dossiersParLead.has(cle)) dossiersParLead.set(cle, [])
    dossiersParLead.get(cle).push(d)
  }

  const lignes = []
  for (const lead of (Array.isArray(leadsLeadRoom) ? leadsLeadRoom : [])) {
    if (!lead?.id) continue
    const dossier = choisirDossier(dossiersParLead.get(String(lead.id)))
    const situation = situationDe(dossier)
    if (situation === SITUATIONS.OK) continue

    // Le conseiller : celui du dossier CRM s'il existe, sinon celui qui a
    // pris le lead là bas, retrouvé par son email dans les profils CRM.
    const preneur = lead.taken_by ? advisorParId.get(String(lead.taken_by)) : null
    const conseiller = dossier?.advisor_code
      || (preneur ? codeParEmail.get(emailCle(preneur.email)) : null)
      || null

    lignes.push({
      leadId: lead.id,
      nom: lead.name || '',
      statutLeadRoom: lead.status,
      majLe: lead.updated_at || null,
      rdvLe: lead.rdv_date || null,
      // Contact repris du dossier CRM quand il existe : c'est par lui que la
      // sauvegarde retrouve le brouillon à compléter au lieu d'en créer un.
      email: dossier?.client_email || lead.email || '',
      telephone: dossier?.client_phone || lead.phone || '',
      conseiller,
      dossier: dossier ? {
        id: dossier.id || null,
        status: dossier.status || null,
        product: dossier.product || null,
        advisor_code: dossier.advisor_code || null,
        client: dossier.client || null,
      } : null,
      situation,
    })
  }

  lignes.sort((a, b) => String(b.majLe || '').localeCompare(String(a.majLe || '')))
  return lignes
}
