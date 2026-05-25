-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Audit des sessions d'impersonation manager
-- Date    : 2026-05-25
--
-- Permet à un manager de se connecter en tant qu'un conseiller (debug,
-- support, vérif rapide). Chaque action est tracée dans cette table pour
-- garantir la traçabilité (qui a vu quoi quand au nom de qui).
--
-- L'INSERT se fait uniquement depuis l'API route serverless /api/impersonate
-- via la service_role_key (non exposée client). Le SELECT est limité aux
-- managers via RLS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_impersonation (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id      UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  manager_email   TEXT,
  target_user_id  UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_email    TEXT,
  reason          TEXT,
  user_agent      TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_impersonation_manager ON public.audit_impersonation(manager_id);
CREATE INDEX IF NOT EXISTS idx_audit_impersonation_target  ON public.audit_impersonation(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_impersonation_date    ON public.audit_impersonation(created_at DESC);

-- RLS : SELECT manager only. INSERT via service_role uniquement.
ALTER TABLE public.audit_impersonation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_select" ON public.audit_impersonation;
CREATE POLICY "manager_select"
  ON public.audit_impersonation
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

COMMENT ON TABLE public.audit_impersonation IS 'Journal des sessions d''impersonation manager. INSERT exclusivement via API route /api/impersonate (service_role).';
