// api/_lib/gmail.js
// Envoi de mail depuis la boite Google d Entasis via le compte de service
// (delegation au niveau du domaine, scope gmail.send). Utilise pour les
// courriers qui doivent partir d une vraie adresse humaine plutot que d un
// expediteur technique : feuille de temps comptable, relances mandataires.
//
// Choix Louis (28/07/2026) : pas de Brevo pour ces envois.
//
// SECURITE : les adresses proviennent parfois de la base (profiles.email,
// modifiable par son titulaire). Elles sont donc VALIDEES avant d entrer
// dans les en-tetes : sans cela, un CR/LF dans une adresse permettrait
// d ajouter un Bcc ou de reecrire le corps du message (injection d en-tetes,
// CWE 93) et de faire partir un mail arbitraire depuis notre domaine.

import crypto from 'node:crypto'

export const EXPEDITEUR_DEFAUT = process.env.EXPEDITEUR_EMAIL || 'louis.hatton@entasis-conseil.fr'

// Adresse simple, sans separateur ni caractere de structuration MIME
const ADRESSE_VALIDE = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[a-zA-Z]{2,}$/

function adresseSure(valeur, role) {
  const s = String(valeur ?? '').trim()
  if (!ADRESSE_VALIDE.test(s)) {
    throw new Error(`Adresse ${role} invalide ou dangereuse : ${JSON.stringify(s.slice(0, 60))}`)
  }
  return s
}

// Toute valeur qui finit dans un en-tete doit etre debarrassee des sauts de ligne
const uneSeuleLigne = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim()

// base64 replie a 76 colonnes (RFC 2045) : indispensable pour les pieces
// jointes volumineuses, certains serveurs rejetant les lignes trop longues.
const base64Mime = (buf) => (Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8'))
  .toString('base64').replace(/(.{76})/g, '$1\r\n')

async function jetonGmail(expediteur) {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/^"|"$/g, '')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY absente')
  const compte = JSON.parse(raw.includes('private_key') ? raw : Buffer.from(raw, 'base64').toString())
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const hdr = b64u({ alg: 'RS256', typ: 'JWT' })
  const pld = b64u({
    iss: compte.client_email,
    sub: expediteur,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${hdr}.${pld}`)
  const sig = signer.sign(compte.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${hdr}.${pld}.${sig}`,
  })
  const j = await r.json()
  if (!j.access_token) {
    throw new Error(`Delegation gmail.send refusee pour ${compte.client_email} : ${JSON.stringify(j)}`)
  }
  return j.access_token
}

/**
 * Construit le message MIME complet. Sorti de l envoi pour etre testable.
 * ATTENTION : les lignes vides sont STRUCTURANTES en MIME (fin des en-tetes,
 * separation en-tete/contenu de chaque partie). Ne jamais filtrer ce tableau.
 */
export function construireMime({ to, sujet, corps, pieces = [], expediteur, repondreA }) {
  const destinataires = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((a) => adresseSure(a, 'destinataire'))
  if (destinataires.length === 0) throw new Error('Aucun destinataire')
  const de = adresseSure(expediteur || EXPEDITEUR_DEFAUT, 'expediteur')
  const reponse = repondreA ? adresseSure(repondreA, 'de reponse') : null
  const boundary = `entasis_${crypto.randomBytes(12).toString('hex')}`

  const lignes = [
    `From: ${de}`,
    `To: ${destinataires.join(', ')}`,
    ...(reponse ? [`Reply-To: ${reponse}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(uneSeuleLigne(sujet), 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',                       // fin des en-tetes (structurant)
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',                       // fin des en-tetes de la partie texte
    base64Mime(String(corps ?? '')),
    '',
  ]

  for (const p of pieces) {
    const nom = uneSeuleLigne(p.nom || 'piece-jointe').replace(/"/g, '')
    lignes.push(
      `--${boundary}`,
      `Content-Type: ${uneSeuleLigne(p.mime || 'application/octet-stream')}; name="${nom}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${nom}"`,
      '',                     // fin des en-tetes de la piece jointe
      base64Mime(p.contenu),
      '',
    )
  }
  lignes.push(`--${boundary}--`)
  return lignes.join('\r\n')
}

/**
 * Envoie un mail (texte simple, pieces jointes optionnelles).
 * @param {string[]} to     destinataires
 * @param {string} sujet
 * @param {string} corps    texte brut
 * @param {Array}  pieces   [{ nom, contenu: Buffer, mime }]
 */
export async function envoyerMailGmail({ to, sujet, corps, pieces = [], expediteur = EXPEDITEUR_DEFAUT, repondreA }) {
  const mime = construireMime({ to, sujet, corps, pieces, expediteur, repondreA })
  const token = await jetonGmail(adresseSure(expediteur, 'expediteur'))
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(expediteur)}/messages/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
    },
  )
  if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`)
  return true
}
