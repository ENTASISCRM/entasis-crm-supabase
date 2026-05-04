-- ============================================================================
-- Aligne le mois (month) des deals signés sur leur date de signature
-- (date_signed). Fix le bug où la PP signée d'un mois ne remontait pas dans
-- le dashboard du mois courant si le deal avait été créé un mois précédent.
--
-- Le format de la colonne month est en texte français ('JANVIER',
-- 'FÉVRIER', ..., 'DÉCEMBRE') et non en ISO YYYY-MM.
-- ============================================================================

-- Diagnostic, lance d'abord ce SELECT pour voir l'impact attendu :
-- select id, client, advisor_code, status, month as month_actuel,
--        date_signed,
--        case extract(month from date_signed::date)
--          when 1 then 'JANVIER' when 2 then 'FÉVRIER' when 3 then 'MARS'
--          when 4 then 'AVRIL' when 5 then 'MAI' when 6 then 'JUIN'
--          when 7 then 'JUILLET' when 8 then 'AOÛT' when 9 then 'SEPTEMBRE'
--          when 10 then 'OCTOBRE' when 11 then 'NOVEMBRE' when 12 then 'DÉCEMBRE'
--        end as month_attendu
-- from public.deals
-- where status = 'Signé'
--   and date_signed is not null
--   and date_signed != '';

update public.deals
set month = case extract(month from date_signed::date)
  when 1 then 'JANVIER'
  when 2 then 'FÉVRIER'
  when 3 then 'MARS'
  when 4 then 'AVRIL'
  when 5 then 'MAI'
  when 6 then 'JUIN'
  when 7 then 'JUILLET'
  when 8 then 'AOÛT'
  when 9 then 'SEPTEMBRE'
  when 10 then 'OCTOBRE'
  when 11 then 'NOVEMBRE'
  when 12 then 'DÉCEMBRE'
end
where status = 'Signé'
  and date_signed is not null
  and date_signed != ''
  and month != case extract(month from date_signed::date)
    when 1 then 'JANVIER' when 2 then 'FÉVRIER' when 3 then 'MARS'
    when 4 then 'AVRIL' when 5 then 'MAI' when 6 then 'JUIN'
    when 7 then 'JUILLET' when 8 then 'AOÛT' when 9 then 'SEPTEMBRE'
    when 10 then 'OCTOBRE' when 11 then 'NOVEMBRE' when 12 then 'DÉCEMBRE'
  end;
