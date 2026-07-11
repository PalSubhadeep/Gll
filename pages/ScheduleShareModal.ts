import { Page } from '@playwright/test';
import { formatCalendarDayLabel, formatHour24, snapToMinuteStep, MINUTE_STEP } from '../utils/scheduleTime';

// The hour and minute columns each render as a single container whose
// full text content is every value concatenated with no separators
// (confirmed via codegen). Used as scoping anchors so we can search for
// "00"/"10"/"20" within the correct column -- those three values exist
// in BOTH columns (hours 00/10/20 and minutes 00/10/20), so an
// unscoped getByRole click on them is ambiguous (strict-mode violation).
const HOUR_COLUMN_TEXT = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).join('');
const MINUTE_VALUES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));
const MINUTE_COLUMN_TEXT = MINUTE_VALUES.join('');

/**
 * Handles the "Schedule Send" toggle and date/time picker inside the
 * share-to-institution modal. Composes alongside ShareInstitutionModal
 * (which owns the institution search/select + final submit) rather than
 * duplicating that logic here.
 */
export class ScheduleShareModal {
  constructor(private readonly page: Page) {}

  private get scheduleSendSwitch() {
    return this.page.getByRole('switch', { name: 'Schedule Send' });
  }

  private get pickDateTimeButton() {
    return this.page.getByRole('button', { name: 'Pick a date & time' });
  }

  private get hourColumn() {
    return this.page.getByText(HOUR_COLUMN_TEXT, { exact: true });
  }

  private get minuteColumn() {
    return this.page.getByText(MINUTE_COLUMN_TEXT, { exact: true });
  }

  async enableScheduleSend() {
    await this.scheduleSendSwitch.click();
  }

  async openDateTimePicker() {
    await this.pickDateTimeButton.click();
  }

  /**
   * Selects the calendar day matching `target`, using a dynamically built
   * accessible label instead of a hardcoded date string.
   */
  async selectDate(target: Date) {
    const label = formatCalendarDayLabel(target);
    await this.page.getByRole('button', { name: label }).click();
  }

  /** 24-hour clock, e.g. "09", "14", "00". Scoped to the hour column to avoid clashing with the minute column. */
  async selectHour(target: Date) {
    const hourValue = formatHour24(target);
    await this.hourColumn.getByRole('button', { name: hourValue, exact: true }).click();
  }

  /**
   * 10-minute increments only (00/10/20/30/40/50). `target` should already
   * be snapped via snapToMinuteStep() before calling this -- otherwise
   * e.g. minute=23 will never match a button and this will time out.
   */
  async selectMinute(target: Date) {
    const minuteValue = String(target.getMinutes()).padStart(2, '0');
    await this.minuteColumn.getByRole('button', { name: minuteValue, exact: true }).click();
  }

  /**
   * Full flow: toggle schedule send, open picker, set date + hour + minute.
   * Snaps `target` to the nearest available 10-minute step first and
   * returns the SNAPPED time -- use this return value (not your original
   * target) for any later assertions or polling, since it's what was
   * actually selected in the UI.
   */
  async scheduleFor(target: Date): Promise<Date> {
    const snapped = snapToMinuteStep(target);

    await this.enableScheduleSend();
    await this.openDateTimePicker();
    await this.selectDate(snapped);
    await this.selectHour(snapped);
    await this.selectMinute(snapped);

    return snapped;
  }
}