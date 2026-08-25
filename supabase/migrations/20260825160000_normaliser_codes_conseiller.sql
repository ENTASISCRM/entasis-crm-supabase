-- « Pas de co conseiller » s ecrivait de trois facons : NULL, chaine vide, et
-- chaine d espaces. 159 dossiers portaient la chaine vide, qui se regroupait
-- en un conseiller fantome dans le Cockpit et rendait faux tout filtre
-- « co_advisor_code is not null ».
update deals
set co_advisor_code = nullif(trim(co_advisor_code), '')
where co_advisor_code is not null
  and co_advisor_code is distinct from nullif(trim(co_advisor_code), '');

update deals
set advisor_code = trim(advisor_code)
where advisor_code is not null and advisor_code <> trim(advisor_code);

create or replace function normaliser_codes_conseiller_deal()
returns trigger
language plpgsql
as $$
begin
  new.advisor_code := nullif(trim(coalesce(new.advisor_code, '')), '');
  new.co_advisor_code := nullif(trim(coalesce(new.co_advisor_code, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_normaliser_codes_conseiller on deals;
create trigger trg_normaliser_codes_conseiller
  before insert or update of advisor_code, co_advisor_code on deals
  for each row
  execute function normaliser_codes_conseiller_deal();
