-- L upfront negocie d un produit structure EST la marge du cabinet : la
-- remuneration du conseiller etant fixee a 1,5 %, l ecart avec l upfront dit
-- exactement ce que la compagnie verse a Entasis.
--
-- La vue ucs_catalogue faisait deja le travail (upfront et notes_internes a la
-- direction, null aux autres), mais la TABLE restait lisible par les managers :
-- la politique ucs_write_manager etait ecrite FOR ALL, or en Postgres une
-- politique FOR ALL couvre aussi le SELECT et les politiques permissives
-- s additionnent. Verifie en simulant la session d un manager : 8 lignes de
-- catalogue et 4 upfronts lus. Constat de l audit de juillet, reste ouvert
-- jusqu au 07/09/2026.
drop policy if exists ucs_write_manager on public.ucs_structures;
drop policy if exists ucs_select_direction on public.ucs_structures;

create policy ucs_direction_seule on public.ucs_structures
  for all
  using (public.est_direction_pnl())
  with check (public.est_direction_pnl());

-- Les simulations portent commission_cabinet : un conseiller n a pas a lire ce
-- que le cabinet garde sur l affaire d un autre. Il garde les siennes.
drop policy if exists simu_select_own_or_manager on public.simulations_structures;
create policy simu_select_own_or_direction on public.simulations_structures
  for select
  using (conseiller_id = (select auth.uid()) or public.est_direction_pnl());
