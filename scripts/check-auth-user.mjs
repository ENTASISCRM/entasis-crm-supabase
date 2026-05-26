#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT : check-auth-user.mjs
// Débloque un utilisateur qui ne peut pas se connecter au CRM.
//
// Usage :
//   1. vercel env pull .env.local --environment=production
//   2a. Diagnostic + mail de reset (utilise SUPABASE_ANON_KEY, suffit dans 99% des cas) :
//       node --env-file=.env.local scripts/check-auth-user.mjs <email> --send-recovery
//   2b. Diagnostic avancé (nécessite SUPABASE_SERVICE_ROLE_KEY collée à la main
//       car Vercel ne la rend plus téléchargeable depuis qu'elle est "Sensitive") :
//       node --env-file=.env.local scripts/check-auth-user.mjs <email>
//
// Note Vercel "Sensitive" : la SERVICE_ROLE_KEY ne ressort plus en clair via
// `vercel env pull`. Pour les besoins de diagnostic complet (état auth.users,
// magic link manager), récupère-la depuis le Supabase Dashboard → Settings →
// API → service_role key, et colle-la temporairement dans .env.local.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const email = process.argv[2]
const sendRecovery = process.argv.includes('--send-recovery')
const sendMagicLink = process.argv.includes('--send-magic-link')

if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/check-auth-user.mjs <email> [--send-recovery|--send-magic-link]')
  process.exit(1)
}
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('SUPABASE_URL et SUPABASE_ANON_KEY requis dans .env.local')
  process.exit(1)
}

console.log(`\n═══════════════════════════════════════════════════════════`)
console.log(`Diagnostic auth pour : ${email}`)
console.log(`═══════════════════════════════════════════════════════════\n`)

// ─── Mode léger : juste envoyer un mail de reset (pas besoin de service_role) ───
if (sendRecovery) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email }),
  })
  console.log(`POST /auth/v1/recover → ${r.status}`)
  if (r.status === 200) {
    console.log(`✅ Mail de réinitialisation envoyé à ${email} (si le compte existe).`)
    console.log(`   ⚠️  Supabase renvoie 200 même si l'email est inconnu — pour le savoir,`)
    console.log(`   relance sans --send-recovery (nécessite SERVICE_ROLE_KEY).`)
  } else {
    const text = await r.text()
    console.error(`❌ Échec : ${text}`)
    process.exit(1)
  }
  process.exit(0)
}

// ─── Mode complet : nécessite SERVICE_ROLE_KEY ───
if (!SERVICE_KEY) {
  console.log(`⚠️  SUPABASE_SERVICE_ROLE_KEY absente.`)
  console.log(`   Pour un mail de réinit simple, relance avec --send-recovery.`)
  console.log(`   Pour le diagnostic complet, colle la service_role key dans .env.local :`)
  console.log(`     SUPABASE_SERVICE_ROLE_KEY="<colle depuis Supabase Dashboard>"\n`)
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listErr) {
  console.error('listUsers a échoué :', listErr.message)
  process.exit(1)
}
const authUser = list.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())

if (!authUser) {
  console.log('❌ Aucun compte auth.users pour cet email.')
  console.log('   → Crée le compte via Supabase Dashboard → Auth → Add user → Send invite.')
  process.exit(0)
}

console.log('✅ Compte auth.users trouvé :')
console.log(`   id              : ${authUser.id}`)
console.log(`   email           : ${authUser.email}`)
console.log(`   created_at      : ${authUser.created_at}`)
console.log(`   email_confirmed : ${authUser.email_confirmed_at ? '✅ ' + authUser.email_confirmed_at : '❌ NON CONFIRMÉ'}`)
console.log(`   last_sign_in_at : ${authUser.last_sign_in_at || '— jamais connecté'}`)
console.log(`   identities      : ${(authUser.identities || []).map(i => i.provider).join(', ') || '(aucune)'}`)
console.log(`   banned          : ${authUser.banned_until || '—'}`)

const { data: profile } = await admin.from('profiles').select('*').eq('id', authUser.id).maybeSingle()
if (!profile) {
  console.log(`\n⚠️  Pas de ligne dans profiles pour cet id (trigger handle_new_user pas passé).`)
} else {
  console.log(`\n✅ Profile :`)
  console.log(`   full_name    : ${profile.full_name}`)
  console.log(`   role         : ${profile.role}`)
  console.log(`   advisor_code : ${profile.advisor_code || '⚠️  NULL'}`)
  console.log(`   is_active    : ${profile.is_active}`)
}

if (sendMagicLink) {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.email,
    options: { redirectTo: 'https://crm.entasis-conseil.fr' },
  })
  if (linkErr) {
    console.error('Échec generateLink :', linkErr.message)
    process.exit(1)
  }
  console.log(`\n🔗 Magic link (valide 1h) à coller dans un mail :\n${linkData.properties.action_link}\n`)
}
