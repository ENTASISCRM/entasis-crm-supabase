# Relance dossiers vieillissants

Edge Function qui envoie automatiquement un mail aux conseillers (avec
direction en copie) sur les dossiers en pipeline restés > 30 jours sans
mouvement, statut `En cours` ou `Prévu`.

- Cooldown : 7 jours entre deux relances sur le même dossier.
- Trigger : pg_cron quotidien à 7h UTC (cf migration `20260508_cron_relance_dossiers.sql`).
- Logs : table `dossier_relance_log` (cf migration `20260508_dossier_relance_log.sql`).
- Email : Brevo (ex-Sendinblue), 300 mails/jour gratuits.

## Setup (une seule fois)

### 1. Compte Brevo

- Créer un compte sur https://app.brevo.com (gratuit jusqu'à 300 mails/jour).
- Settings → SMTP & API → API Keys → générer une clé.
- Settings → Senders, Domains & Dedicated IPs → ajouter et vérifier le
  domaine `entasis-conseil.fr`. Brevo fournit les enregistrements DNS
  (DKIM, BIMI, Brevo Code) à publier chez le registrar.
- Une fois le domaine vérifié, ajouter un sender `noreply@entasis-conseil.fr`.

### 2. Secrets Supabase

Via le Dashboard ou la CLI :

```bash
supabase secrets set \
  BREVO_API_KEY=xkeysib-xxxxxxxx \
  RELANCE_FROM_EMAIL='noreply@entasis-conseil.fr' \
  RELANCE_FROM_NAME='Entasis CRM' \
  RELANCE_CC='louis.hatton@entasis-conseil.fr'
```

### 3. Déploiement de l'Edge Function

```bash
supabase functions deploy relance-dossiers-vieillissants
```

### 4. Activation des extensions Postgres

Les migrations activent `pg_cron` et `pg_net` automatiquement, mais en
cas de souci les activer manuellement : Dashboard → Database → Extensions.

### 5. Stocker la service_role key dans Vault

Dashboard → SQL Editor — coller (en remplaçant la clé par celle du
projet, visible dans Settings → API) :

```sql
select vault.create_secret(
  'eyJ...la_service_role_jwt_complete...',
  'cron_relance_service_role_key',
  'Bearer token utilisé par pg_cron pour appeler les Edge Functions'
);
```

La clé est encryptée par Supabase. La migration cron récupère la valeur
décryptée à chaque tick via `vault.decrypted_secrets`.

### 6. Migrations

```bash
supabase db push
```

## Test manuel

```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/relance-dossiers-vieillissants' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Réponse attendue :

```json
{ "ok": true, "sent": 3, "skipped": 0, "scanned": 5, "candidates": 3, "errors": [] }
```
