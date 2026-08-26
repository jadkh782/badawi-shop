'use client';

import { useCallback, useMemo, useState } from 'react';
import { Cart, DiscountFactory, type DiscountType, type Product, Quantity } from '@/domain';

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

  const add = useCallback((product: Product, quantity = 1) => {
    setCart((current) => current.add(product, Quantity.of(quantity)));
  }, []);

  const increment = useCallback((productId: string) => {
    setCart((current) => current.increment(productId));
  }, []);

  const decrement = useCallback((productId: string) => {
    setCart((current) => current.decrement(productId));
  }, []);

  const remove = useCallback((productId: string) => {
    setCart((current) => current.remove(productId));
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
