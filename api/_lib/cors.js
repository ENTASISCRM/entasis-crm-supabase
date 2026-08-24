// En-têtes CORS partagés par les endpoints du CRM. Extrait de api/nav.js pour
// que nav.js et nav-batch.js appliquent exactement la même politique.
const ORIGINES_AUTORISEES = [
  'https://entasis-crm-supabase.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const DEFAUT = 'https://entasis-crm-supabase.vercel.app'

export function appliquerCors(req, res, methodes = 'GET') {
  const origine = req.headers.origin
  res.setHeader('Access-Control-Allow-Origin', ORIGINES_AUTORISEES.includes(origine) ? origine : DEFAUT)
  res.setHeader('Access-Control-Allow-Methods', methodes)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
