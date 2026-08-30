'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Cart,
  DiscountFactory,
  type DiscountType,
  type Product,
  Quantity,
  type StockBatch,
} from '@/domain';

/**
 * Holds the basket for the current sale.
 *
 * The Cart itself is a domain object and every operation returns a new one, so this hook is
 * only a place to keep the latest instance. All the arithmetic, the merging of a rescanned
 * item and the clamping of a discount live in the domain, where they are tested without a
 * browser.
 */
export function useCart() {
  const [cart, setCart] = useState<Cart>(() => Cart.empty());

  const add = useCallback(
    (product: Product, quantity = 1, batch: StockBatch | null = null) => {
      setCart((current) => current.add(product, Quantity.of(quantity), batch));
    },
    [],
  );

  // Lines are addressed by key, not by product: the same article at two purchase prices is
  // two rows, and either one has to be adjustable without disturbing the other.
  const increment = useCallback((key: string) => {
    setCart((current) => current.increment(key));
  }, []);

  const decrement = useCallback((key: string) => {
    setCart((current) => current.decrement(key));
  }, []);

  const remove = useCallback((key: string) => {
    setCart((current) => current.remove(key));
  }, []);

  const setDiscount = useCallback((type: DiscountType, value: number) => {
    setCart((current) => current.withDiscount(DiscountFactory.create(type, value)));
  }, []);

  const clear = useCallback(() => setCart(Cart.empty()), []);

  return useMemo(
    () => ({ cart, add, increment, decrement, remove, setDiscount, clear }),
    [cart, add, increment, decrement, remove, setDiscount, clear],
  );
}
