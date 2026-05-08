# Relance dossiers vieillissants

Edge Function qui envoie automatiquement un mail aux conseillers (avec
direction en copie) sur les dossiers en pipeline restés > 30 jours sans
mouvement, statut `En cours` ou `Prévu`.

- Cooldown : 7 jours entre deux relances sur le même dossier.
- Trigger : pg_cron quotidien à 7h UTC (cf migration `20260508_cron_relance_dossiers.sql`).
- Logs : table `dossier_relance_log` (cf migration `20260508_dossier_relance_log.sql`).

## Setup (une seule fois)

### 1. Domaine d'envoi vérifié dans Resend

- Compte Resend → ajouter le domaine `entasis-conseil.fr`.
- Renseigner les DNS (SPF + DKIM) chez le registrar.
- Attendre la propagation (~minutes).

### 2. Secrets côté Supabase

Via le Dashboard Supabase ou la CLI :

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  RELANCE_FROM='Entasis CRM <noreply@entasis-conseil.fr>' \
  RELANCE_CC='louis.hatton@entasis-conseil.fr'
```

### 3. Déploiement de l'Edge Function

```bash
supabase functions deploy relance-dossiers-vieillissants
```

### 4. Activation des extensions Postgres

Dashboard → Database → Extensions → activer `pg_cron` et `pg_net`.

### 5. Migrations

```bash
supabase db push
```

⚠️ Avant `db push`, éditer `20260508_cron_relance_dossiers.sql` pour remplacer
`<PROJECT_REF>` et `<SERVICE_ROLE_KEY>`.

## Test manuel

```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/relance-dossiers-vieillissants' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Réponse attendue :

```json
{ "ok": true, "sent": 3, "skipped": 0, "scanned": 5, "candidates": 3, "errors": [] }
```
