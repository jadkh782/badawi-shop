'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateRange, type ReportBucket } from '@/domain';
import type { ReportData } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { TrendChart } from '@/presentation/components/TrendChart';
import { ReportBody } from '@/presentation/components/ReportBody';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const BUCKET_LABEL: Record<ReportBucket, string> = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
};

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Reports.
 *
 * The period is chosen once and drives everything on the screen and the spreadsheet, so the
 * file the shop downloads always matches the figures it was looking at when it tapped Export.
 */
export default function ReportsPage() {
  const { notify } = useToast();

  const [preset, setPreset] = useState<Preset>('today');
  const [fromDay, setFromDay] = useState(() => isoDay(new Date()));
  const [toDay, setToDay] = useState(() => isoDay(new Date()));
  const [bucket, setBucket] = useState<ReportBucket>('daily');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    switch (preset) {
      case 'today':
        return DateRange.today();
      case 'yesterday':
        return DateRange.yesterday();
      case 'week':
        return DateRange.thisWeek();
      case 'month':
        return DateRange.thisMonth();
      case 'custom':
      default:
        try {
          return DateRange.fromDateStrings(fromDay, toDay);
        } catch {
          return DateRange.today();
        }
    }
  }, [preset, fromDay, toDay]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await container().getReport.execute(range, bucket));
    } catch (error) {
      notify(messageFor(error), 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range, bucket, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportToExcel() {
    setExporting(true);
    try {
      const { report, outcome } = await container().exportReport.run(range, bucket);
      if (outcome === 'cancelled') {
        notify('Export cancelled');
      } else {
        // Naming the file matters: on Android it lands in Documents, and "it worked" without
        // saying where is the same as it not working.
        notify(
          outcome === 'shared' ? `Sent ${report.filename}` : `Saved ${report.filename}`,
          'success',
        );
      }
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="Reports"
      back="/"
      wide
      footer={
        <button
          type="button"
          className="btn btn-sell w-full"
          onClick={() => void exportToExcel()}
          disabled={exporting || loading}
        >
          {exporting ? 'Building the file...' : 'Export to Excel'}
        </button>
      }
    >
      <div className="strip px-4 pb-1 pt-4 lg:flex-wrap lg:overflow-visible">
        {PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            data-active={preset === option.id}
            onClick={() => setPreset(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-3 px-4">
          <div>
            <label className="eyebrow" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromDay}
              max={toDay}
              onChange={(event) => setFromDay(event.target.value)}
              className="field tnum mt-2"
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toDay}
              min={fromDay}
              onChange={(event) => setToDay(event.target.value)}
              className="field tnum mt-2"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <p className="text-sm font-semibold text-[var(--color-muted)]">{range.label()}</p>
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBucket(option)}
              aria-pressed={bucket === option}
              className="min-h-11 rounded-lg px-3 text-[11px] font-semibold"
              style={{
                background: bucket === option ? 'var(--color-paper)' : 'var(--color-ink-raised)',
                color: bucket === option ? 'var(--color-ink)' : 'var(--color-muted)',
              }}
            >
              {BUCKET_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-20 text-center text-sm text-[var(--color-muted)]">Loading...</p>
      ) : !data ? (
        <p className="py-20 text-center text-sm text-[var(--color-muted)]">
          The figures could not be loaded. Pull the period again.
        </p>
      ) : (
        <div className="grid gap-4 px-4 pb-8 pt-4 lg:grid-cols-2 lg:items-start">
          {/* The trend is the widest thing here, so it keeps the full row to itself. */}
          <div className="lg:col-span-2">
            <TrendChart points={data.series} />
          </div>
          <ReportBody data={data} />
        </div>
      )}
    </AppShell>
  );
}
