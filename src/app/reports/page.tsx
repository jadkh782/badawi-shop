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

type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom';

const BUCKET_LABEL: Record<ReportBucket, string> = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
};

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * How wide a bucket has to be before it can honestly describe the period.
 *
 * A single day grouped by month is one bar labelled "Aug 2026" holding one afternoon's
 * takings, which is not a smaller version of the truth but a different claim altogether.
 * A grouping is offered only once the period is long enough to fill a few of them.
 */
function bucketFits(bucket: ReportBucket, days: number): boolean {
  if (bucket === 'weekly') return days >= 14;
  if (bucket === 'monthly') return days >= 60;
  return true;
}

/** The grouping the period asks for when nobody has said otherwise. */
function naturalBucket(days: number): ReportBucket {
  if (days > 182) return 'monthly';
  if (days > 31) return 'weekly';
  return 'daily';
}

/**
 * Reports.
 *
 * One filter decides the period, and it is the row of presets at the top. The grouping
 * control underneath is not a second filter: it only decides how wide the bars of the chart
 * are, which is why it sits with the chart and says so.
 *
 * The period drives the screen and the spreadsheet alike, so the file the shop downloads
 * always matches the figures it was looking at when it tapped Export.
 */
export default function ReportsPage() {
  const { notify } = useToast();

  // Opening on a single day means a chart with one bar, which draws nothing and reads as a
  // broken screen. A week is the shortest period that actually shows a shape.
  const [preset, setPreset] = useState<Preset>('last7');
  const [fromDay, setFromDay] = useState(() => isoDay(new Date()));
  const [toDay, setToDay] = useState(() => isoDay(new Date()));
  // Null means "whatever the period asks for". Choosing a grouping by hand pins it until the
  // period changes, at which point the pin is dropped rather than carried somewhere it does
  // not fit.
  const [chosenBucket, setChosenBucket] = useState<ReportBucket | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    switch (preset) {
      case 'today':
        return DateRange.today();
      case 'yesterday':
        return DateRange.yesterday();
      case 'last7':
        return DateRange.lastDays(7);
      case 'last30':
        return DateRange.lastDays(30);
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

  const days = range.days;
  const bucket =
    chosenBucket && bucketFits(chosenBucket, days) ? chosenBucket : naturalBucket(days);

  function choosePreset(next: Preset) {
    setPreset(next);
    setChosenBucket(null);
  }

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
      <div className="px-4 pt-4">
        <p className="eyebrow">Period</p>
        <div className="strip -mx-4 mt-2 px-4 pb-1 lg:flex-wrap lg:overflow-visible">
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip"
              data-active={preset === option.id}
              onClick={() => choosePreset(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
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
              onChange={(event) => {
                setFromDay(event.target.value);
                setChosenBucket(null);
              }}
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
              onChange={(event) => {
                setToDay(event.target.value);
                setChosenBucket(null);
              }}
              className="field tnum mt-2"
            />
          </div>
        </div>
      )}

      <p className="px-4 pt-3 text-sm font-semibold text-[var(--color-muted)]">
        {range.label()}
        <span className="ml-2 font-medium text-[var(--color-faint)]">
          {days === 1 ? '1 day' : `${days} days`}
        </span>
      </p>

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
            {data.series.length > 1 && (
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                <span className="eyebrow">Group the chart by</span>
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly'] as const).map((option) => {
                    const fits = bucketFits(option, days);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setChosenBucket(option)}
                        disabled={!fits}
                        aria-pressed={bucket === option}
                        title={
                          fits
                            ? undefined
                            : `This period is too short to group by ${BUCKET_LABEL[
                                option
                              ].toLowerCase()}`
                        }
                        className="min-h-11 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-35"
                        style={{
                          background:
                            bucket === option ? 'var(--color-paper)' : 'var(--color-ink-raised)',
                          color: bucket === option ? 'var(--color-ink)' : 'var(--color-muted)',
                        }}
                      >
                        {BUCKET_LABEL[option]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <TrendChart points={data.series} />
          </div>
          <ReportBody data={data} />
        </div>
      )}
    </AppShell>
  );
}
