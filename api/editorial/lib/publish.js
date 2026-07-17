// api/editorial/lib/publish.js
// Publication d'UN package éditorial : construit le fichier markdown complet
// (frontmatter YAML + corps) et le commite dans le repo du site via l'API
// GitHub REST → le déploiement Vercel du site suit automatiquement.
// Module partagé entre la route veto (publication immédiate) et le script
// cron scripts/editorial/publish-due.mjs (publication à échéance).
//
// Variables d'environnement :
//   EDITORIAL_GH_TOKEN  token GitHub (fine-grained, Contents Read/Write sur
//                       le repo du site uniquement)
//
// Erreurs à code : ALREADY_PUBLISHED (fichier déjà présent dans le site),
// GH_ERROR (API GitHub).

const SITE_REPO = 'louishton-cmd/entasis-site'
const SITE_BRANCH = 'main'
const BLOG_DIR = 'src/content/blog'

function bizError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// Frontmatter YAML : les chaînes passent par JSON.stringify — une chaîne
// JSON double-quotée est un scalaire YAML valide (échappement des ", \, sauts
// de ligne). La date reste non quotée (YYYY-MM-DD, parsée en date par Astro),
// draft reste un booléen.
export function buildMarkdownFile(frontmatter, body) {
  const fm = frontmatter
  const lines = [
    '---',
    `title: ${JSON.stringify(fm.title)}`,
    `description: ${JSON.stringify(fm.description)}`,
    `date: ${fm.date}`,
    `category: ${JSON.stringify(fm.category)}`,
    `author: ${JSON.stringify(fm.author)}`,
    `readingTime: ${JSON.stringify(fm.readingTime)}`,
    `relatedProduct: ${JSON.stringify(fm.relatedProduct)}`,
    `draft: ${fm.draft === true}`,
    '---',
    '',
  ]
  return lines.join('\n') + body.trim() + '\n'
}

async function ghFetch(path, options = {}) {
  const token = process.env.EDITORIAL_GH_TOKEN
  if (!token) throw bizError('GH_ERROR', 'EDITORIAL_GH_TOKEN manquant')
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'entasis-editorial-agent',
      ...(options.body && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
}

// Publie un package (ligne complète de editorial_packages) :
//  1. construit le .md,
//  2. vérifie que le fichier n'existe pas déjà dans le site (GET → 404 attendu),
//  3. PUT contents (commit sur main),
//  4. met à jour le package : statut 'publie', published_at, commit_sha.
// dryRun : étapes 1 et 2 seulement (aucune écriture GitHub ni base).
export async function publishPackage(admin, row, { dryRun = false } = {}) {
  const path = `${BLOG_DIR}/${row.article_slug}.md`
  const markdown = buildMarkdownFile(row.article_frontmatter, row.article_md)

  // 2. Le fichier ne doit pas déjà exister (en dry-run sans token, on saute)
  if (process.env.EDITORIAL_GH_TOKEN || !dryRun) {
    const check = await ghFetch(`/repos/${SITE_REPO}/contents/${path}?ref=${SITE_BRANCH}`)
    if (check.status === 200) {
      throw bizError('ALREADY_PUBLISHED', `Le fichier ${path} existe déjà dans ${SITE_REPO}`)
    }
    if (check.status !== 404) {
      const detail = await check.text().catch(() => '')
      throw bizError('GH_ERROR', `GET contents → HTTP ${check.status} ${detail.slice(0, 200)}`)
    }
  }

  if (dryRun) {
    return { dryRun: true, repo: SITE_REPO, branch: SITE_BRANCH, path, markdown }
  }

  // 3. Commit du fichier
  const put = await ghFetch(`/repos/${SITE_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `feat(journal): ${row.article_frontmatter.title} (agent éditorial)`,
      content: Buffer.from(markdown, 'utf8').toString('base64'),
      branch: SITE_BRANCH,
    }),
  })
  const putBody = await put.json().catch(() => ({}))
  if (!put.ok) {
    throw bizError('GH_ERROR', `PUT contents → HTTP ${put.status} ${putBody.message || ''}`)
  }
  const commitSha = putBody.commit?.sha || null

  // 4. Mise à jour du package
  const { error } = await admin
    .from('editorial_packages')
    .update({
      statut: 'publie',
      published_at: new Date().toISOString(),
      commit_sha: commitSha,
    })
    .eq('id', row.id)
  if (error) {
    // Le commit est fait mais la base n'a pas suivi : à signaler clairement,
    // le commit_sha est dans le message pour reprise manuelle.
    throw new Error(
      `Commit ${commitSha} poussé dans ${SITE_REPO} mais update base en échec : ${error.message}`
    )
  }

  return { repo: SITE_REPO, branch: SITE_BRANCH, path, commitSha }
}
