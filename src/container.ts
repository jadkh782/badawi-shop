'use client';

import type {
  IAuthService,
  ICategoryRepository,
  IProductRepository,
  IFileSaver,
  IReportExporter,
  IReportRepository,
  ISaleRepository,
  ISettingsRepository,
} from '@/application/ports';
import {
  CheckoutSale,
  ExportReport,
  FindProductByBarcode,
  GetReport,
  RestockProduct,
  SaveProduct,
  UpdateSettings,
} from '@/application/use-cases';
import { getBrowserClient } from '@/infrastructure/supabase/browserClient';
import { SupabaseAuthService } from '@/infrastructure/supabase/SupabaseAuthService';
import { SupabaseCategoryRepository } from '@/infrastructure/supabase/SupabaseCategoryRepository';
import { SupabaseProductRepository } from '@/infrastructure/supabase/SupabaseProductRepository';
import { SupabaseReportRepository } from '@/infrastructure/supabase/SupabaseReportRepository';
import { SupabaseSaleRepository } from '@/infrastructure/supabase/SupabaseSaleRepository';
import { SupabaseSettingsRepository } from '@/infrastructure/supabase/SupabaseSettingsRepository';
import { ClientReportExporter } from '@/infrastructure/export/ClientReportExporter';
import { BrowserFileSaver } from '@/infrastructure/files/BrowserFileSaver';
import { CapacitorFileSaver } from '@/infrastructure/files/CapacitorFileSaver';
import {
  DemoAuthService,
  DemoCategoryRepository,
  DemoProductRepository,
  DemoSaleRepository,
  DemoSettingsRepository,
} from '@/infrastructure/demo/DemoRepositories';
import { DemoReportRepository } from '@/infrastructure/demo/DemoReportRepository';

/** Set NEXT_PUBLIC_DEMO=1 to run the whole app against an in-memory shop. */
export const isDemo = process.env.NEXT_PUBLIC_DEMO === '1';

/**
 * The composition root.
 *
 * This is the only file in the application that names a concrete implementation. Everything
 * above it is written against the port interfaces, so moving off Supabase, or standing the
 * whole app up against fakes in a test, is a change here and nowhere else.
 */
export interface Container {
  products: IProductRepository;
  categories: ICategoryRepository;
  sales: ISaleRepository;
  reports: IReportRepository;
  settings: ISettingsRepository;
  auth: IAuthService;
  exporter: IReportExporter;
  fileSaver: IFileSaver;

  checkoutSale: CheckoutSale;
  findProductByBarcode: FindProductByBarcode;
  saveProduct: SaveProduct;
  restockProduct: RestockProduct;
  getReport: GetReport;
  exportReport: ExportReport;
  updateSettings: UpdateSettings;
}

let instance: Container | null = null;

export function buildContainer(): Container {
  // Swapping every dependency at once is a change to these seven lines and nothing else.
  // No screen, use case or entity knows which set it is talking to.
  const parts = isDemo
    ? {
        products: new DemoProductRepository(),
        categories: new DemoCategoryRepository(),
        sales: new DemoSaleRepository(),
        reports: new DemoReportRepository(),
        settings: new DemoSettingsRepository(),
        auth: new DemoAuthService(),
      }
    : (() => {
        const db = getBrowserClient();
        return {
          products: new SupabaseProductRepository(db),
          categories: new SupabaseCategoryRepository(db),
          sales: new SupabaseSaleRepository(db),
          reports: new SupabaseReportRepository(db),
          settings: new SupabaseSettingsRepository(db),
          auth: new SupabaseAuthService(db),
        };
      })();

  const { products, categories, sales, reports, settings, auth } = parts;
  // The spreadsheet is built on the device either way, so one exporter serves both.
  const exporter = new ClientReportExporter(reports, settings);
  // How the finished file reaches the user is the part that differs by platform.
  const fileSaver: IFileSaver = CapacitorFileSaver.isAvailable()
    ? new CapacitorFileSaver()
    : new BrowserFileSaver();

  return {
    products,
    categories,
    sales,
    reports,
    settings,
    auth,
    exporter,
    fileSaver,

    checkoutSale: new CheckoutSale(sales),
    findProductByBarcode: new FindProductByBarcode(products),
    saveProduct: new SaveProduct(products),
    restockProduct: new RestockProduct(products),
    getReport: new GetReport(reports),
    exportReport: new ExportReport(exporter, fileSaver),
    updateSettings: new UpdateSettings(settings),
  };
}

/** One container per browser session, built the first time something asks for it. */
export function container(): Container {
  if (!instance) instance = buildContainer();
  return instance;
}
