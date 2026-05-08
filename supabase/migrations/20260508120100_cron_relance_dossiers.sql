-- Schedule pg_cron : déclenche l'Edge Function relance-dossiers-vieillissants
-- tous les jours à 7h UTC (= 9h Paris en été, 8h en hiver).
--
-- Migration idempotente-safe : si le vault secret n'existe pas encore,
-- la migration log un NOTICE et retourne sans planifier. Elle peut être
-- ré-exécutée plus tard une fois le secret créé.
--
-- Setup unique côté Dashboard SQL Editor avant que cette migration
-- prenne effet :
--
--   select vault.create_secret(
--     'eyJ...la_service_role_jwt_complete...',
--     'cron_relance_service_role_key',
--     'Bearer pour cron relance dossiers vieillissants'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  jid bigint;
  has_secret boolean;
begin
  select exists (
    select 1 from vault.decrypted_secrets where name = 'cron_relance_service_role_key'
  ) into has_secret;

  if not has_secret then
    raise notice 'cron_relance_service_role_key absent du vault — cron non planifie. Cree le secret puis reapplique cette migration.';
    return;
  end if;

  select jobid into jid from cron.job where jobname = 'relance-dossiers-vieillissants';
  if jid is not null then perform cron.unschedule(jid); end if;

  perform cron.schedule(
    'relance-dossiers-vieillissants',
    '0 7 * * *',
    $cmd$
    select net.http_post(
      url     := 'https://tvgbblbceqvdtqnbeoik.supabase.co/functions/v1/relance-dossiers-vieillissants',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'cron_relance_service_role_key'
        )
      ),
      body    := '{}'::jsonb
    );
    $cmd$
  );
end $$;
