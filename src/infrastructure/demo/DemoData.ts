import { Category, Money, Product, Quantity, Barcode } from '@/domain';

/** A shelf of realistic stock, so the demo shows the app doing its job rather than empty. */
export const DEMO_CATEGORIES: Category[] = [
  new Category('c1', 'Drinks', '#0ea5e9', 10),
  new Category('c2', 'Snacks', '#f59e0b', 20),
  new Category('c3', 'Groceries', '#22c55e', 30),
  new Category('c4', 'Bakery', '#d97706', 40),
  new Category('c5', 'Household', '#8b5cf6', 50),
];

interface Seed {
  id: string;
  barcode: string | null;
  name: string;
  category: string;
  cost: number;
  price: number;
  stock: number;
  low?: number;
  unit?: string;
}

const SEEDS: Seed[] = [
  { id: 'p1', barcode: '5449000000996', name: 'Coca Cola 1L', category: 'c1', cost: 0.6, price: 1.25, stock: 42 },
  { id: 'p2', barcode: '5449000011527', name: 'Fanta Orange 330ml', category: 'c1', cost: 0.35, price: 0.75, stock: 60 },
  { id: 'p3', barcode: '6281006000018', name: 'Almarai Water 1.5L', category: 'c1', cost: 0.2, price: 0.5, stock: 8, low: 12 },
  { id: 'p4', barcode: '7622210951953', name: 'Oreo Original', category: 'c2', cost: 0.45, price: 1.0, stock: 24 },
  { id: 'p5', barcode: '5000159461122', name: 'Snickers Bar', category: 'c2', cost: 0.4, price: 0.9, stock: 3, low: 10 },
  { id: 'p6', barcode: '6291003000225', name: 'Lays Salted 45g', category: 'c2', cost: 0.3, price: 0.7, stock: 36 },
  { id: 'p7', barcode: '8000500310427', name: 'Nutella 400g', category: 'c3', cost: 3.2, price: 4.75, stock: 14 },
  { id: 'p8', barcode: '6111035000430', name: 'Rice 1kg', category: 'c3', cost: 1.1, price: 1.75, stock: 0, low: 6 },
  { id: 'p9', barcode: null, name: 'Sugar (loose)', category: 'c3', cost: 0.8, price: 1.3, stock: 22.5, unit: 'kg' },
  { id: 'p10', barcode: null, name: 'Arabic bread', category: 'c4', cost: 0.25, price: 0.6, stock: 40 },
  { id: 'p11', barcode: null, name: 'Kaak', category: 'c4', cost: 0.4, price: 1.0, stock: 18 },
  { id: 'p12', barcode: '6221031492016', name: 'Persil 1.5kg', category: 'c5', cost: 4.1, price: 5.9, stock: 9 },
  { id: 'p13', barcode: '6291100630028', name: 'Fairy Dish Soap', category: 'c5', cost: 1.3, price: 2.25, stock: 5, low: 5 },
  { id: 'p14', barcode: '5410076811205', name: 'Pringles Original', category: 'c2', cost: 1.5, price: 2.6, stock: 16 },
];

export function demoProducts(): Product[] {
  return SEEDS.map(
    (seed) =>
      new Product({
        id: seed.id,
        barcode: seed.barcode ? Barcode.create(seed.barcode) : null,
        name: seed.name,
        categoryId: seed.category,
        categoryName: DEMO_CATEGORIES.find((c) => c.id === seed.category)?.name ?? null,
        costPrice: Money.fromDollars(seed.cost),
        salePrice: Money.fromDollars(seed.price),
        stock: Quantity.of(seed.stock),
        lowStockThreshold: Quantity.of(seed.low ?? 4),
        unit: seed.unit ?? 'piece',
        notes: null,
        isActive: true,
      }),
  );
}
