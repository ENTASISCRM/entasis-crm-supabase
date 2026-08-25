-- Le co conseiller voyait le dossier, pouvait le glisser au kanban et
-- l enregistrer : l ecran confirmait, la base refusait en silence.
-- deals_select_v2 inclut co_advisor_code, deals_update_v2 ne l incluait pas.
-- Le co conseil est un travail a deux, remunere 50/50 : les deux tiennent le
-- dossier a jour. La SUPPRESSION reste au titulaire et a la direction.
drop policy if exists deals_update_v2 on deals;

create policy deals_update_v2 on deals
for update
using (
  (select profiles.role from profiles where profiles.id = auth.uid()) = 'manager'
  or advisor_code = (select profiles.advisor_code from profiles where profiles.id = auth.uid())
  or co_advisor_code = (select profiles.advisor_code from profiles where profiles.id = auth.uid())
)
with check (
  (select profiles.role from profiles where profiles.id = auth.uid()) = 'manager'
  or advisor_code = (select profiles.advisor_code from profiles where profiles.id = auth.uid())
  or co_advisor_code = (select profiles.advisor_code from profiles where profiles.id = auth.uid())
);
