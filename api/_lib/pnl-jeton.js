// api/_lib/pnl-jeton.js
// ═══════════════════════════════════════════════════════════════════════════
// Jeton de deverrouillage de l espace rentabilite.
//
// Le code saisi par Louis n ouvre pas l espace a lui seul : il echange contre
// un jeton court, signe cote serveur avec PNL_SECRET, valable quinze minutes
// et lie a l identifiant de l utilisateur. Sans ce jeton ET le jeton Supabase,
// api/pnl.js ne calcule rien.
//
// Pourquoi signer plutot que poser un booleen : un booleen dans le navigateur
// se met a true depuis la console. Un jeton signe ne se fabrique pas sans le
// secret, qui ne quitte jamais Vercel.
//
// Aucune dependance externe : node:crypto suffit, et scrypt resiste a
// l attaque par dictionnaire sur un code court.
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto'

export const DUREE_JETON_MS = 15 * 60 * 1000   // quinze minutes
export const MAX_TENTATIVES = 5
export const DUREE_BLOCAGE_MS = 15 * 60 * 1000

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// Comparaison a temps constant, meme quand les longueurs different : sinon la
// duree de la reponse trahit la longueur du secret.
export function egaliteSure(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8')
  const bb = Buffer.from(String(b ?? ''), 'utf8')
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba)   // consomme le meme temps, ne fuit rien
    return false
  }
  return timingSafeEqual(ba, bb)
}

// ─── Empreinte du code ────────────────────────────────────────────────────
// Format : scrypt$N$r$p$sel$empreinte, tout en base64url. Le code lui meme
// n est jamais stocke, ni journalise, ni renvoye.
const N = 16384, R = 8, P = 1, LONGUEUR = 32

export function empreinteCode(code, selFourni) {
  const sel = selFourni ? Buffer.from(selFourni, 'base64url') : randomBytes(16)
  const derive = scryptSync(String(code), sel, LONGUEUR, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${b64url(sel)}$${b64url(derive)}`
}

export function verifierCode(code, empreinte) {
  if (!empreinte || typeof empreinte !== 'string') return false
  const morceaux = empreinte.split('$')
  if (morceaux.length !== 6 || morceaux[0] !== 'scrypt') return false
  const [, n, r, p, sel] = morceaux
  try {
    const derive = scryptSync(String(code), Buffer.from(sel, 'base64url'), LONGUEUR, {
      N: Number(n), r: Number(r), p: Number(p),
    })
    return egaliteSure(`scrypt$${n}$${r}$${p}$${sel}$${b64url(derive)}`, empreinte)
  } catch {
    return false
  }
}

// ─── Jeton de session ─────────────────────────────────────────────────────
// charge.sub  : identifiant de l utilisateur, le jeton ne vaut que pour lui
// charge.sid  : identifiant de session Supabase, pour qu un jeton ne survive
//               pas a un changement de session (deconnexion, autre appareil)
// charge.exp  : expiration absolue, en millisecondes
export function signerJeton({ userId, sessionId, secret, maintenant = Date.now() }) {
  if (!secret) throw new Error('PNL_SECRET absent')
  const charge = { sub: userId, sid: sessionId || null, exp: maintenant + DUREE_JETON_MS }
  const corps = b64url(JSON.stringify(charge))
  const signature = createHmac('sha256', secret).update(corps).digest('base64url')
  return `${corps}.${signature}`
}

/**
 * Verifie un jeton. Renvoie { ok, motif, charge }.
 * Le motif sert au journal, jamais a l utilisateur : on ne lui dit pas
 * pourquoi son jeton est refuse.
 */
export function verifierJeton({ jeton, userId, sessionId, secret, maintenant = Date.now() }) {
  if (!secret) return { ok: false, motif: 'secret absent' }
  if (!jeton || typeof jeton !== 'string' || !jeton.includes('.')) {
    return { ok: false, motif: 'jeton malforme' }
  }
  const [corps, signature] = jeton.split('.')
  const attendue = createHmac('sha256', secret).update(corps).digest('base64url')
  if (!egaliteSure(signature, attendue)) return { ok: false, motif: 'signature invalide' }

  let charge
  try { charge = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8')) }
  catch { return { ok: false, motif: 'charge illisible' } }

  if (!charge?.exp || charge.exp < maintenant) return { ok: false, motif: 'jeton expire' }
  if (charge.sub !== userId) return { ok: false, motif: 'jeton d un autre utilisateur' }
  // Un jeton emis pour une autre session ne vaut rien : deconnexion ou
  // reconnexion referme l espace.
  if (charge.sid && sessionId && charge.sid !== sessionId) {
    return { ok: false, motif: 'jeton d une autre session' }
  }
  return { ok: true, charge }
}
