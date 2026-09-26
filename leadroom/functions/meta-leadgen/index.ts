// ═══════════════════════════════════════════════════════════════════════════
// META LEADGEN, EN DIRECT : la fonction qui remplace Zapier
//
// Fonction Supabase (Deno) à déployer sur le projet LEAD ROOM
// (mtqowhjshvgkpkhnpilb), pas sur le CRM. Elle vit ici faute d'accès au
// dépôt de la Lead Room ; à y déplacer dès que possible.
//
// Ce qu'elle fait :
//   GET   la vérification d'abonnement de Meta (hub.challenge).
//   POST  une notification « leadgen » de Meta. Elle ne contient PAS les
//         réponses du prospect, seulement un identifiant : on vérifie la
//         signature, on va chercher le lead par l'API Graph, on retrouve la
//         campagne Lead Room par l'identifiant du formulaire (table
//         meta_forms), puis on rejoue exactement l'appel que Zapier faisait
//         vers la Lead Room. Le score et la priorité restent calculés là bas,
//         rien ne change dans l'application.
//
// Ce qu'elle garantit :
//   * une signature invalide est refusée (403) : personne ne peut injecter un
//     faux lead en devinant l'URL ;
//   * un même lead n'est traité qu'une fois, même si Meta renvoie la
//     notification (table meta_leadgen_events, clé leadgen_id) ;
//   * Meta reçoit toujours 200 une fois la signature vérifiée, sinon il
//     réessaie puis finit par désabonner la page. Une erreur de traitement
//     est écrite dans meta_leadgen_events, jamais renvoyée à Meta.
//
// Secrets attendus (Supabase → Edge Functions → Secrets), jamais dans le code :
//   META_APP_SECRET            secret de l'application Meta (signature)
//   META_VERIFY_TOKEN          phrase choisie, recopiée dans l'abonnement Meta
//   META_PAGE_TOKEN            jeton de page issu d'un utilisateur système
//   LEADROOM_WEBHOOK_URL       l'URL que le Zap appelle aujourd'hui
//   LEADROOM_WEBHOOK_SECRET    la valeur de l'en tête secret du Zap
//   LEADROOM_WEBHOOK_HEADER    le nom de cet en tête (défaut x-webhook-secret)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY : fournis par la plateforme.
//
// Déploiement : verify_jwt à FAUX, Meta n'envoie pas de jeton Supabase.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = 'https://graph.facebook.com/v21.0'
const env = (k: string, defaut = '') => (Deno.env.get(k) ?? defaut).trim()

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Signature Meta : sha256=HMAC(app_secret, corps brut) ────────────────────
async function signatureValide(corps: string, entete: string | null): Promise<boolean> {
  const secret = env('META_APP_SECRET')
  if (!secret || !entete?.startsWith('sha256=')) return false
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(corps)))
  const attendu = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')
  const recu = entete.slice('sha256='.length).toLowerCase()
  // Comparaison à temps constant : la longueur d'abord, puis chaque octet.
  if (recu.length !== attendu.length) return false
  let diff = 0
  for (let i = 0; i < attendu.length; i++) diff |= recu.charCodeAt(i) ^ attendu.charCodeAt(i)
  return diff === 0
}

// ── Clés de champs : « Quelle est votre TMI ? » devient quelle_est_votre_tmi ─
const normaliserCle = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const VRAI = new Set(['true', 'on', '1', 'oui', 'yes', 'checked'])

type ChampMeta = { name: string; values?: string[] }
type LeadMeta = {
  id: string; created_time?: string; form_id?: string; ad_id?: string; adset_id?: string;
  campaign_id?: string; platform?: string; is_organic?: boolean; field_data?: ChampMeta[]
}

// Le lead tel que la Lead Room l'attend (même forme que ce que Zapier envoie :
// des clés à plat, les inconnues finissent dans custom_fields côté Lead Room).
function construireCorps(lead: LeadMeta, slug: string, fieldMap: Record<string, string>) {
  const corps: Record<string, unknown> = {
    campaign: slug,
    platform: lead.platform === 'ig' ? 'ig' : 'fb',
    source: 'meta_direct',
    meta_leadgen_id: lead.id,
    meta_form_id: lead.form_id ?? null,
    meta_ad_id: lead.ad_id ?? null,
    meta_created_time: lead.created_time ?? null,
  }
  let prenom = '', nom = ''
  for (const champ of lead.field_data ?? []) {
    const brut = normaliserCle(champ.name)
    const valeur = (champ.values ?? []).map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')
    if (!valeur) continue
    const cle = fieldMap[champ.name] ?? fieldMap[brut] ?? brut
    switch (cle) {
      case 'full_name': case 'name': corps.name = valeur; break
      case 'first_name': prenom = valeur; break
      case 'last_name': nom = valeur; break
      case 'phone_number': case 'phone': corps.phone = valeur; break
      case 'email': case 'work_email': if (!corps.email) corps.email = valeur; break
      case 'consent': corps.consent = VRAI.has(valeur.toLowerCase()); break
      default: corps[cle] = valeur
    }
  }
  if (!corps.name && (prenom || nom)) corps.name = [prenom, nom].filter(Boolean).join(' ')
  if (!corps.name) corps.name = 'Sans nom'
  return corps
}

async function lireLead(leadgenId: string): Promise<LeadMeta> {
  const champs = 'id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,platform,is_organic'
  const r = await fetch(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${champs}&access_token=${encodeURIComponent(env('META_PAGE_TOKEN'))}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Graph ${r.status} : ${JSON.stringify(j?.error ?? j).slice(0, 300)}`)
  return j as LeadMeta
}

async function transmettre(corps: Record<string, unknown>): Promise<string> {
  const url = env('LEADROOM_WEBHOOK_URL')
  if (!url) throw new Error('LEADROOM_WEBHOOK_URL absent')
  const entetes: Record<string, string> = { 'content-type': 'application/json' }
  const secret = env('LEADROOM_WEBHOOK_SECRET')
  if (secret) entetes[env('LEADROOM_WEBHOOK_HEADER', 'x-webhook-secret')] = secret
  const r = await fetch(url, { method: 'POST', headers: entetes, body: JSON.stringify(corps) })
  const texte = await r.text().catch(() => '')
  if (!r.ok) throw new Error(`Lead Room ${r.status} : ${texte.slice(0, 300)}`)
  return texte.slice(0, 300)
}

type Notification = { leadgen_id: string; form_id?: string; page_id?: string; ad_id?: string; created_time?: number }

async function traiter(n: Notification, brut: unknown) {
  // Idempotence : la première insertion gagne, les suivantes ne font rien.
  const { data: nouveau } = await supabase
    .from('meta_leadgen_events')
    .insert({ leadgen_id: n.leadgen_id, form_id: n.form_id ?? null, page_id: n.page_id ?? null, brut })
    .select('leadgen_id')
    .maybeSingle()
  if (!nouveau) return

  const fin = async (statut: string, detail: string | null) => {
    await supabase.from('meta_leadgen_events')
      .update({ statut, detail, traite_le: new Date().toISOString() })
      .eq('leadgen_id', n.leadgen_id)
  }

  try {
    const { data: form } = await supabase
      .from('meta_forms').select('campaign_slug, field_map, actif').eq('form_id', String(n.form_id ?? '')).maybeSingle()
    if (!form) return await fin('form_inconnu', `formulaire ${n.form_id} sans campagne dans meta_forms`)
    if (!form.actif) return await fin('form_inactif', null)

    const lead = await lireLead(n.leadgen_id)
    const corps = construireCorps(lead, form.campaign_slug, (form.field_map ?? {}) as Record<string, string>)
    const reponse = await transmettre(corps)
    await fin('transmis', reponse)
  } catch (e) {
    await fin('erreur', String((e as Error)?.message ?? e).slice(0, 500))
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Vérification d'abonnement : Meta appelle en GET avec un défi à renvoyer.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const jeton = url.searchParams.get('hub.verify_token')
    const defi = url.searchParams.get('hub.challenge') ?? ''
    if (mode === 'subscribe' && jeton && jeton === env('META_VERIFY_TOKEN')) {
      return new Response(defi, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('Jeton de vérification invalide', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 })

  const corps = await req.text()
  if (!(await signatureValide(corps, req.headers.get('x-hub-signature-256')))) {
    return new Response('Signature invalide', { status: 403 })
  }

  let notification: { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Notification }> }> }
  try { notification = JSON.parse(corps) } catch { return new Response('JSON illisible', { status: 400 }) }

  const taches: Promise<void>[] = []
  for (const entree of notification.entry ?? []) {
    for (const changement of entree.changes ?? []) {
      const v = changement.value
      if (changement.field !== 'leadgen' || !v?.leadgen_id) continue
      taches.push(traiter({ ...v, page_id: v.page_id ?? entree.id }, changement))
    }
  }
  // On répond à Meta une fois le travail fait : quelques leads par appel, une
  // seconde chacun, très en dessous du délai que Meta tolère.
  await Promise.all(taches)
  return new Response('OK', { status: 200 })
})
