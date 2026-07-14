import { createSign } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

// Liste des conseillers avec leur email et advisor_code
const TEAM = [
  { email: 'danny@entasis-conseil.fr', code: 'DANNY' },
  { email: 'jean.decamps@entasis-conseil.fr', code: 'JEAN' },
  { email: 'louis.hatton@entasis-conseil.fr', code: 'LH' },
  { email: 'thomas@entasis-conseil.fr', code: 'THOMASPOPEA' },
  { email: 'messager.clement@entasis-conseil.fr', code: 'CLEMENT' },
  { email: 'victor@entasis-conseil.fr', code: 'DB' },
  { email: 'alexis@entasis-conseil.fr', code: 'ALEXIS' },
  { email: 'gianni@entasis-conseil.fr', code: 'GIANNI' },
  { email: 'quentin@entasis-conseil.fr', code: 'QUENTIN' },
  { email: 'dany@entasis-conseil.fr', code: 'DANY' },
  { email: 'nans@entasis-conseil.fr', code: 'NANS' },
]

// Mots-clés pour détecter les réunions internes Entasis
const INTERNAL_KEYWORDS = [
  'entasis', 'réunion équipe', 'team meeting',
  'stand-up', 'standup', 'point équipe',
  'formation', 'réunion interne'
]

function isInternalMeeting(event) {
  const title = (event.summary || '').toLowerCase()
  return INTERNAL_KEYWORDS.some(kw => title.includes(kw))
}

// Générer un JWT pour le Service Account
async function getAccessToken(serviceAccount, impersonateEmail) {
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.private_key_id
  })).toString('base64url')

  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: impersonateEmail,  // Impersonate le conseiller
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url')

  const signingInput = `${header}.${payload}`

  // Signer avec la clé privée RSA
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(
    serviceAccount.private_key,
    'base64url'
  )

  const jwt = `${signingInput}.${signature}`

  // Échanger le JWT contre un access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  const tokenData = await tokenResponse.json()

  if (!tokenData.access_token) {
    throw new Error(`Token error for ${impersonateEmail}: ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}

// Récupérer les événements d'un conseiller pour une semaine
async function getCalendarEvents(accessToken, email, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100'
  })

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error(`Calendar error for ${email}:`, error)
    return []
  }

  const data = await response.json()
  return data.items || []
}

export default async function handler(req, res) {
  // 1. Authentifier réellement l'appelant (vrai token Supabase, plus juste la
  //    présence d'un header « Bearer * » — cf. audit sécurité 2026-07-14).
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  // 2. Cet endpoint expose les agendas Google des 11 conseillers (vue équipe
  //    de la Revue hebdo, écran manager). Les données viennent d'un service
  //    account Google, aucune RLS ne s'applique : on contrôle donc le rôle
  //    nous-mêmes, via le client service_role, comme api/impersonate.js.
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' })
  }
  const admin = createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (callerErr || !callerProfile) {
    return res.status(403).json({ error: 'Profil appelant introuvable' })
  }
  if (callerProfile.role !== 'manager') {
    return res.status(403).json({ error: 'Réservé aux managers' })
  }

  try {
    // Charger le Service Account
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKey) {
      return res.status(500).json({ error: 'Service Account non configuré' })
    }

    const serviceAccount = JSON.parse(serviceAccountKey)

    // Paramètres de la semaine
    const { weekKey } = req.query
    // weekKey format: "2026-W14"

    // Calculer lundi et dimanche de la semaine
    let monday, sunday
    if (weekKey) {
      const [year, weekPart] = weekKey.split('-W')
      const weekNum = parseInt(weekPart)
      const jan4 = new Date(parseInt(year), 0, 4)
      const startOfWeek1 = new Date(jan4)
      startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
      monday = new Date(startOfWeek1)
      monday.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7)
    } else {
      // Semaine courante
      monday = new Date()
      const day = monday.getDay()
      monday.setDate(monday.getDate() - ((day + 6) % 7))
    }
    monday.setHours(0, 0, 0, 0)
    sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    // Traiter chaque conseiller en parallèle
    const results = await Promise.allSettled(
      TEAM.map(async (advisor) => {
        try {
          // Obtenir un token pour ce conseiller
          const accessToken = await getAccessToken(
            serviceAccount,
            advisor.email
          )

          // Récupérer ses événements
          const events = await getCalendarEvents(
            accessToken,
            advisor.email,
            monday,
            sunday
          )

          // Filtrer et structurer les événements
          const clientEvents = events.filter(e => {
            // Exclure événements sans titre
            if (!e.summary) return false
            // Exclure réunions internes
            if (isInternalMeeting(e)) return false
            // Exclure événements toute la journée
            if (!e.start?.dateTime) return false
            return true
          })

          // Structurer par jour
          const byDay = {
            lundi: [], mardi: [], mercredi: [],
            jeudi: [], vendredi: []
          }
          const dayNames = ['dimanche', 'lundi', 'mardi',
            'mercredi', 'jeudi', 'vendredi', 'samedi']

          clientEvents.forEach(event => {
            const start = new Date(event.start.dateTime)
            const dayName = dayNames[start.getDay()]
            if (byDay[dayName] !== undefined) {
              byDay[dayName].push({
                title: event.summary,
                start: event.start.dateTime,
                end: event.end?.dateTime,
                location: event.location || null,
                description: event.description || null
              })
            }
          })

          return {
            advisor_code: advisor.code,
            email: advisor.email,
            total: clientEvents.length,
            byDay,
            events: clientEvents.map(e => ({
              title: e.summary,
              start: e.start.dateTime,
              end: e.end?.dateTime
            }))
          }
        } catch (err) {
          console.error(`Erreur pour ${advisor.email}:`, err.message)
          return {
            advisor_code: advisor.code,
            email: advisor.email,
            total: 0,
            byDay: { lundi: [], mardi: [], mercredi: [],
                     jeudi: [], vendredi: [] },
            events: [],
            error: err.message
          }
        }
      })
    )

    const calendarData = results.map(r =>
      r.status === 'fulfilled' ? r.value : null
    ).filter(Boolean)

    res.status(200).json({
      week: weekKey || 'current',
      monday: monday.toISOString(),
      sunday: sunday.toISOString(),
      advisors: calendarData
    })

  } catch (err) {
    console.error('team-calendar error:', err)
    res.status(500).json({ error: err.message })
  }
}