import { DomainError } from '../errors/DomainError';

export type ReportBucket = 'daily' | 'weekly' | 'monthly';

/** A half-open [from, to) period used by every report and export. */
export class DateRange {
  private constructor(
    readonly from: Date,
    readonly to: Date,
  ) {}

  static create(from: Date, to: Date): DateRange {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new DomainError('Report range needs two valid dates');
    }
    if (from.getTime() > to.getTime()) {
      throw new DomainError('Report range starts after it ends');
    }
    return new DateRange(from, to);
  }

  private static startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  private static addDays(d: Date, days: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
  }

  static today(now = new Date()): DateRange {
    const start = DateRange.startOfDay(now);
    return new DateRange(start, DateRange.addDays(start, 1));
  }

  static yesterday(now = new Date()): DateRange {
    const start = DateRange.addDays(DateRange.startOfDay(now), -1);
    return new DateRange(start, DateRange.addDays(start, 1));
  }

  /** The week runs Monday to Sunday. */
  static thisWeek(now = new Date()): DateRange {
    const today = DateRange.startOfDay(now);
    const daysSinceMonday = (today.getDay() + 6) % 7;
    const start = DateRange.addDays(today, -daysSinceMonday);
    return new DateRange(start, DateRange.addDays(start, 7));
  }

  static thisMonth(now = new Date()): DateRange {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return new DateRange(start, end);
  }

  static lastDays(days: number, now = new Date()): DateRange {
    const end = DateRange.addDays(DateRange.startOfDay(now), 1);
    return new DateRange(DateRange.addDays(end, -days), end);
  }

  /** Builds a range from two date-only strings, making `to` cover its whole day. */
  static fromDateStrings(fromIso: string, toIso: string): DateRange {
    const f = fromIso.split('-').map(Number);
    const t = toIso.split('-').map(Number);
    const [fy, fm, fd] = [f[0], f[1], f[2]];
    const [ty, tm, td] = [t[0], t[1], t[2]];
    if (!fy || !fm || !fd || !ty || !tm || !td) {
      throw new DomainError('Dates must be formatted as YYYY-MM-DD');
    }
    return DateRange.create(new Date(fy, fm - 1, fd), new Date(ty, tm - 1, td + 1));
  }

  get days(): number {
    return Math.max(1, Math.round((this.to.getTime() - this.from.getTime()) / 86400000));
  }

  toIsoStrings(): { from: string; to: string } {
    return { from: this.from.toISOString(), to: this.to.toISOString() };
  }

  /** Human label used in report headers and in the exported file name. */
  label(): string {
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const lastDay = new Date(this.to.getTime() - 1);
    return fmt(this.from) === fmt(lastDay) ? fmt(this.from) : `${fmt(this.from)} - ${fmt(lastDay)}`;
  }

  fileSlug(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return `${fmt(this.from)}_${fmt(new Date(this.to.getTime() - 1))}`;
  }
}
