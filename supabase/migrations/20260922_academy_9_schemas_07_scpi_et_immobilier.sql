-- Entasis Academy, migration 9 : schemas et figures des decks (brouillons).
--
-- Genere par scripts/academy/generer-decks.mjs depuis scripts/academy/decks/*.json :
-- ne pas editer a la main, regenerer. Complete le brouillon courant d un
-- module deja seme par la migration 7 : pose les schemas de la version
-- (remplacement par cle, les autres cles conservees), pose payload.figure
-- sur les exercices existants reperes par (ordre, type) qui n en ont pas
-- encore, insere les exercices nouveaux (ordre au dela du maximum existant)
-- avec leur corrige, ordre et association deja melanges. Idempotent. Une
-- version publiee n est jamais touchee : sans brouillon, raise notice et
-- rien. A appliquer apres la migration 8 (colonne academy_module_versions.schemas).

-- ── Schemas : SCPI et immobilier patrimonial (scpi-et-immobilier) ──
do $schemas_scpi_et_immobilier$
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$scpi-et-immobilier$academy_deck$;
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', $academy_deck$scpi-et-immobilier$academy_deck$;
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', $academy_deck$scpi-et-immobilier$academy_deck$;
    return;
  end if;
  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := $academy_deck$[{"cle":"circuit_loyer","titre":"Le circuit du loyer, de l’immeuble à l’associé","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Le circuit du loyer, de l’immeuble à l’associé</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"32\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Le circuit du loyer, de l’immeuble à l’associé</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">Les locataires paient ; la société de gestion encaisse, paie, se rémunère.</text>\n<rect x=\"24\" y=\"76\" width=\"400\" height=\"40\" rx=\"8\" fill=\"#C5A55A\"/>\n<text x=\"44\" y=\"102\" font-size=\"16\" font-weight=\"700\" fill=\"#162443\">Loyers bruts encaissés</text>\n<text x=\"440\" y=\"89\" font-size=\"15\" fill=\"#2C3548\">risque de revenu :</text>\n<text x=\"440\" y=\"109\" font-size=\"15\" fill=\"#2C3548\">le taux d’occupation</text>\n<line x1=\"74\" y1=\"118\" x2=\"74\" y2=\"146\" stroke=\"#162443\" stroke-width=\"2\"/>\n<polygon points=\"68,146 80,146 74,156\" fill=\"#162443\"/>\n<line x1=\"74\" y1=\"134\" x2=\"266\" y2=\"134\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<polygon points=\"266,128 276,134 266,140\" fill=\"#C5A55A\"/>\n<rect x=\"280\" y=\"118\" width=\"344\" height=\"32\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"452\" y=\"139\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">moins les charges et les travaux</text>\n<rect x=\"24\" y=\"156\" width=\"312\" height=\"40\" rx=\"8\" fill=\"#F5EDD8\"/>\n<text x=\"44\" y=\"182\" font-size=\"16\" font-weight=\"700\" fill=\"#162443\">Reste après charges et travaux</text>\n<line x1=\"74\" y1=\"198\" x2=\"74\" y2=\"226\" stroke=\"#162443\" stroke-width=\"2\"/>\n<polygon points=\"68,226 80,226 74,236\" fill=\"#162443\"/>\n<line x1=\"74\" y1=\"214\" x2=\"266\" y2=\"214\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<polygon points=\"266,208 276,214 266,220\" fill=\"#C5A55A\"/>\n<rect x=\"280\" y=\"198\" width=\"344\" height=\"32\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"452\" y=\"219\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">moins la commission de gestion, 8 % à 10 %</text>\n<rect x=\"24\" y=\"236\" width=\"276\" height=\"40\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"44\" y=\"262\" font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\">Solde versé à l’associé</text>\n<text x=\"314\" y=\"261\" font-size=\"15\" fill=\"#2C3548\">chaque trimestre</text>\n<rect x=\"16\" y=\"298\" width=\"608\" height=\"50\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"320\" text-anchor=\"middle\" font-size=\"16\" font-weight=\"700\" fill=\"#162443\">L’associé touche un solde, jamais le loyer brut.</text>\n<text x=\"320\" y=\"340\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">Le taux de distribution est une observation passée, pas une promesse.</text>\n</svg>","legende":"Le loyer brut perd les charges, les travaux puis la commission de gestion avant d’arriver chez l’associé. Ce qui tombe chaque trimestre est un reste, jamais un taux promis."},{"cle":"capital_fixe_variable","titre":"Capital fixe ou capital variable : deux sorties","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Capital fixe ou capital variable : deux sorties</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"36\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Capital fixe ou capital variable : deux sorties</text>\n<rect x=\"130\" y=\"54\" width=\"242\" height=\"34\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"251\" y=\"76\" text-anchor=\"middle\" font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\">Capital fixe</text>\n<rect x=\"382\" y=\"54\" width=\"242\" height=\"34\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"503\" y=\"76\" text-anchor=\"middle\" font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\">Capital variable</text>\n<g font-size=\"15\" font-weight=\"700\" fill=\"#162443\">\n<text x=\"16\" y=\"129\">Le prix</text>\n<text x=\"16\" y=\"193\">Le circuit</text>\n<text x=\"16\" y=\"257\">Le rythme</text>\n</g>\n<g fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\">\n<rect x=\"130\" y=\"96\" width=\"242\" height=\"56\" rx=\"8\"/>\n<rect x=\"382\" y=\"96\" width=\"242\" height=\"56\" rx=\"8\"/>\n<rect x=\"130\" y=\"160\" width=\"242\" height=\"56\" rx=\"8\"/>\n<rect x=\"382\" y=\"160\" width=\"242\" height=\"56\" rx=\"8\"/>\n<rect x=\"130\" y=\"224\" width=\"242\" height=\"56\" rx=\"8\"/>\n<rect x=\"382\" y=\"224\" width=\"242\" height=\"56\" rx=\"8\"/>\n</g>\n<g font-size=\"15\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"251\" y=\"118\">Par confrontation de l’offre</text>\n<text x=\"251\" y=\"138\">et de la demande</text>\n<text x=\"503\" y=\"118\">Prix de retrait fixé</text>\n<text x=\"503\" y=\"138\">par la société de gestion</text>\n<text x=\"251\" y=\"182\">Marché secondaire : un ordre</text>\n<text x=\"251\" y=\"202\">sur un carnet, prix minimum</text>\n<text x=\"503\" y=\"182\">Demande de retrait, exécutée</text>\n<text x=\"503\" y=\"202\">si des souscriptions arrivent</text>\n<text x=\"251\" y=\"246\">Confrontation périodique,</text>\n<text x=\"251\" y=\"266\">d’un jour à trois mois</text>\n<text x=\"503\" y=\"246\">Sans souscription en face,</text>\n<text x=\"503\" y=\"266\">l’attente se compte en mois</text>\n</g>\n<rect x=\"16\" y=\"292\" width=\"608\" height=\"56\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"320\" y=\"316\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#FFFFFF\">Dans les deux cas : pas de date choisie pour récupérer l’argent.</text>\n<text x=\"320\" y=\"337\" text-anchor=\"middle\" font-size=\"15\" fill=\"#FFFFFF\">Le risque de liquidité se dit avant la souscription, jamais après.</text>\n</svg>","legende":"Capital fixe : marché secondaire et prix par confrontation ; capital variable : prix de retrait fixé par la société de gestion et exécution soumise aux souscriptions. Dans les deux cas, personne ne choisit la date de sortie."}]$academy_deck$::jsonb;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;
  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;
  if v_max >= 1 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"circuit_loyer"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 1 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"D'où vient le revenu versé à l'associé d'une SCPI ?","choix":["D'un intérêt fixé chaque année par la société de gestion","Des loyers des immeubles détenus, après charges et après frais","D'une plus-value acquise à la revente des parts","Des dividendes de sociétés foncières cotées en bourse"],"figure":{"ref":"circuit_loyer"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'associé détient une fraction d'un parc loué ; la société de gestion reverse le solde des loyers après charges et frais, en général chaque trimestre.$academy_deck$);
  end if;
  if v_max >= 4 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"capital_fixe_variable"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 4 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 1, $academy_deck${"enonce":"Dans une SCPI à capital variable, qui fixe le prix de retrait d'une part ?","choix":["La société de gestion","Le marché secondaire, par confrontation de l'offre et de la demande","L'AMF, lors du visa de la note d'information","L'associé vendeur, par un prix minimum inscrit sur un carnet"],"figure":{"ref":"capital_fixe_variable"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$En capital variable, le prix de retrait est fixé par la société de gestion ; le carnet d'ordres et la confrontation concernent le capital fixe.$academy_deck$);
  end if;
  if v_max >= 12 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"circuit_loyer"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 12 and type = $academy_deck$vrai_faux$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"La formule « rendement sans la gestion » signifie que l'associé d'une SCPI ne supporte aucun frais de gestion.","figure":{"ref":"circuit_loyer"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Elle signifie que l'associé ne gère pas lui-même les immeubles ; la commission de gestion reste prélevée sur les loyers.$academy_deck$);
  end if;
  if v_max >= 14 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"capital_fixe_variable"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 14 and type = $academy_deck$vrai_faux$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"enonce":"Dans une SCPI à capital fixe, le prix obtenu à la revente d'une part peut s'écarter de la valeur du patrimoine de la SCPI.","figure":{"ref":"capital_fixe_variable"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le prix se forme par confrontation de l'offre et de la demande sur le marché secondaire, pas sur la valeur des immeubles.$academy_deck$);
  end if;
  if v_max >= 41 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"circuit_loyer"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 41 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 41, $academy_deck$choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, à quelle étape se prélève la commission de gestion ?","choix":["À l’entrée, intégrée au prix de la part","Sur les loyers encaissés, avant le reversement du solde","À la revente des parts, sur le prix de cession","Chez l’associé, sur ses revenus fonciers"],"figure":{"ref":"circuit_loyer"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La commission de gestion, 8 % à 10 % des revenus selon l’AMF, se prélève sur les loyers ; la souscription est intégrée au prix de la part et la cession se paie à la revente.$academy_deck$);
  end if;
  if v_max >= 42 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"circuit_loyer"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 42 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 42, $academy_deck$multi$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, cochez tout ce qui est retiré des loyers bruts avant le solde reversé à l’associé.","choix":["Les charges et les travaux","La commission de gestion","La commission de souscription","Les prélèvements sociaux de 17,2 %","La commission de cession"],"figure":{"ref":"circuit_loyer"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1]}$academy_deck$::jsonb, $academy_deck$Le solde est le loyer après charges, travaux et commission de gestion ; la souscription est déjà dans le prix de la part, la cession attend la revente et les 17,2 % se paient chez l’associé, sur ses revenus fonciers.$academy_deck$);
  end if;
  if v_max >= 43 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"capital_fixe_variable"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 43 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 43, $academy_deck$trou_choix$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma, capital fixe et capital variable ont un point commun : ___.","choix":["personne ne choisit la date à laquelle l’argent revient","le prix de la part est fixé par la société de gestion","un ordre de vente s’inscrit sur un carnet","la sortie est exécutée sous un mois"],"figure":{"ref":"capital_fixe_variable"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Marché secondaire ou demande de retrait, la sortie dépend d’acheteurs ou de souscripteurs : c’est la phrase à prononcer avant toute souscription.$academy_deck$);
  end if;
end
$schemas_scpi_et_immobilier$;
