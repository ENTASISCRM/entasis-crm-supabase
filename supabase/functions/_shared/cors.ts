// Helper CORS partagé entre Edge Functions CRM Entasis.
// Remplace l'allow-origin '*' par une allowlist :
//   - https://entasis-crm.vercel.app          (prod)
//   - https://entasis-crm-*.vercel.app        (previews)
//   - http://localhost:5173                   (Vite dev)
//
// Pour pg_cron / appels server-to-server : pas d'Origin envoyé → on
// laisse passer (le CORS n'a pas de sens hors navigateur).

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/entasis-crm\.vercel\.app$/,
  /^https:\/\/entasis-crm-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
]

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
} as const

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin) return { ...BASE_HEADERS }

  const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))
  if (!isAllowed) return { ...BASE_HEADERS }

  return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders(req) })
}
