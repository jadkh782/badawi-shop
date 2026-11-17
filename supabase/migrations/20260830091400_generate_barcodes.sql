-- ---------------------------------------------------------------------------
-- Giving a shelf of articles a barcode each.
--
-- A shop can arrive here with hundreds of articles and not one barcode between them, which
-- is exactly what happened: 267 articles, none scannable, none labelled. Generating them one
-- at a time through the article form is 267 trips through a form, so nobody does it, and the
-- labels never get printed.
--
-- This does a shelf at a time. The caller passes the articles it is looking at, which is how
-- the shop ends up working category by category rather than committing the whole catalogue
-- in one irreversible tap.
--
-- Articles that already have a barcode are skipped rather than overwritten. A code printed
-- on the box by its manufacturer is the better code: it is already on the article, and
-- replacing it would mean the thing in the customer's hand no longer matches the books.
-- ---------------------------------------------------------------------------

/*
  The check digit that completes an EAN-13.

  Alternating weights of one and three from the left, then whatever rounds the sum up to a
  multiple of ten. The same rule the app applies in TypeScript, which is a duplication worth
  accepting: doing this row by row from the client would be one request per article, and the
  shop would watch a spinner for a minute to avoid writing ten lines of SQL once.
*/
create or replace function public.ean13_check_digit(p_first12 text)
returns text
language sql
immutable
as $$
  select (((10 - (sum(
    substr(p_first12, i, 1)::int * (case when i % 2 = 1 then 1 else 3 end)
  ) % 10)) % 10))::text
  from generate_series(1, 12) as i;
$$;

-- ---------------------------------------------------------------------------
-- generate_barcodes: a code for each of these that has none.
--
-- Returns how many it actually assigned, which is not the number asked for whenever some of
-- them already had one.
-- ---------------------------------------------------------------------------
create or replace function public.generate_barcodes(p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_body    text;
  v_code    text;
  v_tries   integer;
  v_count   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to give articles a barcode' using errcode = '42501';
  end if;

  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    return 0;
  end if;

  for v_product in
    select id
      from public.products
     where id = any(p_product_ids)
       and barcode is null
       and is_active
     order by id
     for update
  loop
    v_tries := 0;

    loop
      v_tries := v_tries + 1;

      /*
        Begins 20, the prefix GS1 reserves for a shop's own use, so a code made here can
        never collide with a real manufacturer's and can never be mistaken for one. Ten
        random digits follow rather than a counter, which would need a shared sequence and a
        decision about what happens when the shop is reset.
      */
      v_body := '20' || lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
      v_code := v_body || public.ean13_check_digit(v_body);

      exit when not exists (select 1 from public.products where barcode = v_code);

      -- Ten random digits is ten billion codes. Twenty collisions in a row means something
      -- is wrong with the random source, not that the shop has run out of numbers.
      if v_tries > 20 then
        raise exception 'Could not find a free barcode after % tries', v_tries
          using errcode = 'BS005';
      end if;
    end loop;

    update public.products set barcode = v_code where id = v_product.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ean13_check_digit(text)',
    'public.generate_barcodes(uuid[])'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
