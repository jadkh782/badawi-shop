-- ---------------------------------------------------------------------------
-- checkout_sale, now also putting the takings in the cash box.
--
-- Identical to before except for the one insert at the end. It stays inside the same
-- transaction as the sale, so the books and the cash box can never disagree: if the sale is
-- rolled back for want of stock, the money never went in either.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_sale(
  p_items            jsonb,
  p_discount_type    text default 'none',
  p_discount_value   numeric default 0,
  p_payment_currency text default 'USD',
  p_note             text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id        uuid := gen_random_uuid();
  v_settings       public.app_settings%rowtype;
  v_line           record;
  v_product        record;
  v_subtotal       bigint := 0;
  v_cost           bigint := 0;
  v_items          numeric := 0;
  v_line_total     bigint;
  v_line_cost      bigint;
  v_discount_cents bigint := 0;
  v_total          bigint;
  v_total_lbp      numeric;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to take a sale' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot check out an empty cart' using errcode = '22023';
  end if;

  if p_discount_type not in ('none', 'percent', 'amount') then
    raise exception 'Unknown discount type %', p_discount_type using errcode = '22023';
  end if;

  if p_payment_currency not in ('USD', 'LBP') then
    raise exception 'Unknown payment currency %', p_payment_currency using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id = 1;

  insert into public.sales (id, payment_currency, discount_type, discount_value, note,
                            usd_to_lbp_rate, created_by)
  values (v_sale_id, p_payment_currency, p_discount_type, greatest(coalesce(p_discount_value, 0), 0),
          nullif(btrim(coalesce(p_note, '')), ''), v_settings.usd_to_lbp_rate, auth.uid());

  for v_line in
    select (elem ->> 'product_id')::uuid as product_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as elem
    group by 1
    order by 1
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;

    select p.*, c.name as category_name
      into v_product
      from public.products p
      left join public.categories c on c.id = p.category_id
     where p.id = v_line.product_id
     for update of p;

    if not found then
      raise exception 'That product no longer exists' using errcode = '23503';
    end if;

    if v_product.quantity_in_stock < v_line.quantity then
      raise exception 'Only % % of "%" left in stock, % requested',
        v_product.quantity_in_stock, v_product.unit, v_product.name, v_line.quantity
        using errcode = 'BS001';
    end if;

    v_line_total := round(v_product.sale_price_cents * v_line.quantity);
    v_line_cost  := round(v_product.cost_price_cents * v_line.quantity);

    insert into public.sale_items (
      sale_id, product_id, product_name, barcode, category_name, unit,
      unit_price_cents, unit_cost_cents, quantity,
      line_total_cents, line_cost_cents, line_profit_cents
    ) values (
      v_sale_id, v_product.id, v_product.name, v_product.barcode, v_product.category_name,
      v_product.unit, v_product.sale_price_cents, v_product.cost_price_cents, v_line.quantity,
      v_line_total, v_line_cost, v_line_total - v_line_cost
    );

    update public.products
       set quantity_in_stock = quantity_in_stock - v_line.quantity
     where id = v_product.id;

    insert into public.stock_movements (product_id, delta, reason, sale_id, created_by)
    values (v_product.id, -v_line.quantity, 'sale', v_sale_id, auth.uid());

    v_subtotal := v_subtotal + v_line_total;
    v_cost     := v_cost + v_line_cost;
    v_items    := v_items + v_line.quantity;
  end loop;

  v_discount_cents := case p_discount_type
    when 'percent' then round(v_subtotal * least(greatest(coalesce(p_discount_value, 0), 0), 100) / 100.0)
    when 'amount'  then round(greatest(coalesce(p_discount_value, 0), 0) * 100)
    else 0
  end;
  v_discount_cents := least(v_discount_cents, v_subtotal);

  v_total := v_subtotal - v_discount_cents;
  v_total_lbp := round((v_total / 100.0) * v_settings.usd_to_lbp_rate / v_settings.lbp_rounding)
                 * v_settings.lbp_rounding;

  update public.sales
     set subtotal_cents   = v_subtotal,
         discount_cents   = v_discount_cents,
         total_cents      = v_total,
         total_cost_cents = v_cost,
         profit_cents     = v_total - v_cost,
         item_count       = v_items,
         total_lbp        = v_total_lbp
   where id = v_sale_id;

  -- The takings go into the cash box, in the same transaction as the sale itself.
  if v_total > 0 then
    insert into public.cash_movements (kind, amount_cents, sale_id, note, created_by)
    values ('sale', v_total, v_sale_id, null, auth.uid());
  end if;

  return v_sale_id;
end;
$$;

revoke all on function public.checkout_sale(jsonb, text, numeric, text, text) from public, anon;
grant execute on function public.checkout_sale(jsonb, text, numeric, text, text) to authenticated;
