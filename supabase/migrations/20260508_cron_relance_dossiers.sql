-- Schedule pg_cron : déclenche l'Edge Function relance-dossiers-vieillissants
-- tous les jours à 7h UTC (= 9h Paris en été, 8h en hiver).
--
-- ⚠️ Cette migration suppose que :
--   1. Les extensions pg_cron et pg_net sont activées (cf bloc create extension).
--   2. La service_role_key du projet est stockée dans Supabase Vault sous le nom
--      'cron_relance_service_role_key'. À faire UNE SEULE FOIS via le SQL Editor
--      du Dashboard Supabase :
--
--      select vault.create_secret(
--        'eyJ...la_service_role_jwt_complete...',
--        'cron_relance_service_role_key',
--        'Bearer token utilisé par pg_cron pour appeler les Edge Functions'
--      );
--
-- L'URL du projet est inlinée car non secrète (visible dans tous les clients).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotence : supprime un job existant du même nom avant de le recréer.
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'relance-dossiers-vieillissants';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'relance-dossiers-vieillissants',
  '0 7 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://tvgbblbceqvdtqnbeoik.supabase.co/functions/v1/relance-dossiers-vieillissants',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_relance_service_role_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $cmd$
);
