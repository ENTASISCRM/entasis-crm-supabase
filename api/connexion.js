import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL DES CONNEXIONS : c est ici que l IP reelle est lue.
//
// Le CRM est une application qui tourne dans le navigateur : elle ne connait
// pas sa propre IP publique. La version precedente allait la demander a un
// service exterieur (ipify), ce qui envoyait l adresse de chaque collaborateur
// a un tiers pour rien.
//
// Cette fonction est appelee par le navigateur juste apres une connexion
// reussie. Vercel place devant elle l IP du client et la localisation deduite
// de cette IP, dans les en tetes de la requete. On les lit, on ecrit la ligne,
// on ne sort rien du cabinet.
//
// Ce qui est ecrit : la date, la personne, l IP, la ville, la region, le pays
// et le navigateur. Une ligne par connexion, rien pendant la session.
// ═══════════════════════════════════════════════════════════════════════════

// Vercel expose la localisation deduite de l IP sur toutes les requetes. Les
// valeurs sont encodees en pourcent quand elles portent un accent (« Paris »
// passe tel quel, « Orléans » arrive en « Orl%C3%A9ans »).
const lire = (req, nom) => {
  const v = req.headers[nom]
  if (!v) return null
  const s = Array.isArray(v) ? v[0] : String(v)
  if (!s.trim()) return null
  try { return decodeURIComponent(s).trim() || null } catch { return s.trim() || null }
}

// La chaine x-forwarded-for peut porter plusieurs adresses, la premiere est
// celle du client. x-real-ip sert de repli.
export function ipDuClient(req) {
  const chaine = lire(req, 'x-vercel-forwarded-for') || lire(req, 'x-forwarded-for')
  const premiere = String(chaine || '').split(',')[0].trim()
  return premiere || lire(req, 'x-real-ip') || null
}

export function localisationDuClient(req) {
  return {
    pays: lire(req, 'x-vercel-ip-country'),
    region: lire(req, 'x-vercel-ip-country-region'),
    ville: lire(req, 'x-vercel-ip-city'),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })

  let user
  try {
    user = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non authentifie' })
  }

  const ip = ipDuClient(req)
  const { pays, region, ville } = localisationDuClient(req)
  const userAgent = lire(req, 'user-agent')

  // La ligne s ecrit avec la cle de service, et l identite vient de
  // verifyAuth ci dessus, qui a valide le jeton. Ni l identite ni le lieu ne
  // passent par ce que le navigateur raconte : personne ne peut signer une
  // connexion, ni la sienne depuis un faux endroit, ni celle d un collegue.
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data, error } = await admin.rpc('enregistrer_connexion_serveur', {
    p_user_id: user.id,
    p_email: user.email || null,
    p_ip: ip,
    p_user_agent: userAgent,
    p_pays: pays,
    p_region: region,
    p_ville: ville,
  })

  if (error) {
    // Une connexion ne doit jamais echouer parce que son journal est en panne.
    console.warn('[connexion] trace non ecrite :', error.message, 'pour', user.id)
    return res.status(200).json({ enregistre: false })
  }
  // data vaut false quand le dedup a joue : la connexion etait deja tracee,
  // il ne faut surtout pas que le navigateur reessaie par le chemin de repli.
  return res.status(200).json({ enregistre: true, double: data === false })
}
