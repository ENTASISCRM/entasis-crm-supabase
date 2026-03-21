import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Fetch GreenCity IDF
    const res = await fetch('https://www.greencityimmobilier.fr/programmes/region/ile-de-france.html')
    const html = await res.text()

    // Parser basique : extraire les programmes depuis les balises <a> + titres
    const programmes = parseGreenCityHTML(html)

    // Récupérer l'ID du promoteur GreenCity
    const { data: promoteur } = await supabase
      .from('promoteurs')
      .select('id')
      .eq('slug', 'greencity')
      .single()

    // Upsert programmes
    const { error } = await supabase
      .from('programmes')
      .upsert(
        programmes.map(p => ({
          ...p,
          promoteur_id: promoteur?.id,
          promoteur_slug: 'greencity',
          region: 'ile-de-france',
          last_synced_at: new Date().toISOString()
        })),
        { onConflict: 'url_fiche', ignoreDuplicates: false }
      )

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, synced: programmes.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function parseGreenCityHTML(html: string) {
  const programmes: Array<{
    nom: string
    ville: string
    code_postal: string
    statut: string
    typologies: string[]
    url_fiche: string
  }> = []

  const programmeRegex = /href="(\/programme\/[\w-]+\.html)"[\s\S]*?<h3>(.*?)<\/h3>[\s\S]*?<\/a>/g
  const villeRegex = /([A-Z\s-]+)\s+(\d{5})/
  const statutRegex = /(Nouveau programme|Dernières opportunités|Travaux en cours|Livrée prochainement)/i
  const typologiesRegex = /Du?\s+(T\d(?:\s+au\s+T\d)?(?:\s+duplex)?)/i

  let match
  while ((match = programmeRegex.exec(html)) !== null) {
    const url = 'https://www.greencityimmobilier.fr' + match[1]
    const bloc = match[0]

    const villeMatch = villeRegex.exec(bloc)
    const statutMatch = statutRegex.exec(bloc)
    const typoMatch = typologiesRegex.exec(bloc)

    const statut = statutMatch ?
      statutMatch[1].toLowerCase().replace(/\s+/g, '_') : 'disponible'

    programmes.push({
      nom: match[2].trim(),
      ville: villeMatch ? villeMatch[1].trim() : '',
      code_postal: villeMatch ? villeMatch[2] : '',
      statut: statut === 'nouveau_programme' ? 'nouveau' :
              statut === 'dernières_opportunités' ? 'dernieres_opportunites' :
              statut === 'travaux_en_cours' ? 'travaux' : 'disponible',
      typologies: typoMatch ? extraireTypologies(typoMatch[1]) : [],
      url_fiche: url,
    })
  }

  return programmes
}

function extraireTypologies(str: string): string[] {
  const types: string[] = []
  const match = str.match(/T(\d)/g)
  if (match) {
    const nums = match.map(t => parseInt(t[1]))
    const min = Math.min(...nums), max = Math.max(...nums)
    for (let i = min; i <= max; i++) types.push(`T${i}`)
  }
  return types
}
