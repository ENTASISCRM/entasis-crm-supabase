// src/lib/record-login.js
// Journalise une connexion reussie dans login_audit via la RPC record_login.
// Recupere d abord l IP publique du navigateur (ipify), passee en parametre
// a la fonction qui ne la conserve qu en repli si l infra n expose pas l IP
// via les headers proxy. Fire and forget, ne bloque jamais le flux d auth.

import { supabase } from './supabase'

async function fetchPublicIp() {
  try {
    const opts =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? { signal: AbortSignal.timeout(2500) }
        : {}
    const r = await fetch('https://api.ipify.org?format=json', opts)
    if (!r.ok) return null
    const j = await r.json()
    return j?.ip ?? null
  } catch {
    return null
  }
}

export async function recordLogin() {
  try {
    const ip = await fetchPublicIp()
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
    await supabase.rpc('record_login', { p_ip: ip, p_user_agent: ua })
  } catch {
    // Silencieux, la journalisation ne doit jamais casser la connexion.
  }
}
