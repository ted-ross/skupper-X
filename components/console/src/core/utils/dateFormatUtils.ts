/**
 * Utility functions for date formatting with browser locale support
 * Uses only native JavaScript APIs for simple, dependency-free date handling
 */

// Type declarations for global objects that might not be available in all environments
declare const navigator: { language: string } | undefined;
declare const console: { warn: (message?: any, ...optionalParams: any[]) => void } | undefined;

/**
 * Gets the browser locale or falls back to 'en-US'
 */
function getBrowserLocale(): string {
  if (typeof navigator !== 'undefined' && navigator?.language) {
    return navigator.language;
  }
  return 'en-US';
}

/**
 * Formats a date using the browser's locale settings
 */
export function formatDateWithLocale(
  date: Date,
  options: {
    showDate?: boolean;
    showTime?: boolean;
    dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
    timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
    locale?: string;
    compact?: boolean;
  } = {}
): string {
  const {
    showDate = true,
    showTime = true,
    dateStyle = 'medium',
    timeStyle = 'medium',
    locale,
    compact = false
  } = options;

  // Use browser locale if none specified
  const formatLocale = locale || getBrowserLocale();

  // For compact format, use shorter styles
  const actualDateStyle = compact ? 'short' : dateStyle;
  const actualTimeStyle = compact ? 'short' : timeStyle;

  try {
    if (showDate && showTime) {
      return new Intl.DateTimeFormat(formatLocale, {
        dateStyle: actualDateStyle,
        timeStyle: actualTimeStyle
      }).format(date);
    } else if (showDate) {
      return new Intl.DateTimeFormat(formatLocale, {
        dateStyle: actualDateStyle
      }).format(date);
    } else if (showTime) {
      return new Intl.DateTimeFormat(formatLocale, {
        timeStyle: actualTimeStyle
      }).format(date);
    }
  } catch (error) {
    // Fallback to standard formatting if locale is not supported
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('Locale formatting failed, using fallback:', error);
    }
    return date.toLocaleString();
  }

  return date.toLocaleString();
}

/**
 * Formats relative time (e.g., "2 hours ago", "in 3 days") using native JavaScript
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  const formatUnit = (value: number, unit: string) => {
    const absValue = Math.abs(value);
    const plural = absValue !== 1 ? 's' : '';
    const direction = value < 0 ? 'in ' : '';
    const suffix = value >= 0 ? ' ago' : '';
    return `${direction}${absValue} ${unit}${plural}${suffix}`;
  };

  if (Math.abs(diffInYears) >= 1) {
    return formatUnit(diffInYears, 'year');
  } else if (Math.abs(diffInMonths) >= 1) {
    return formatUnit(diffInMonths, 'month');
  } else if (Math.abs(diffInWeeks) >= 1) {
    return formatUnit(diffInWeeks, 'week');
  } else if (Math.abs(diffInDays) >= 1) {
    return formatUnit(diffInDays, 'day');
  } else if (Math.abs(diffInHours) >= 1) {
    return formatUnit(diffInHours, 'hour');
  } else if (Math.abs(diffInMinutes) >= 1) {
    return formatUnit(diffInMinutes, 'minute');
  } else {
    return formatUnit(diffInSeconds, 'second');
  }
}

/**
 * Converts various date inputs to a Date object
 */
export function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    // Handle both milliseconds and seconds timestamps
    const timestamp = value < 1e12 ? value * 1000 : value;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Gets a comprehensive tooltip with full date/time information
 */
export function getDateTooltip(date: Date, locale?: string): string {
  const formatLocale = locale || getBrowserLocale();

  try {
    return new Intl.DateTimeFormat(formatLocale, {
      dateStyle: 'full',
      timeStyle: 'long'
    }).format(date);
  } catch (error) {
    return date.toString();
  }
}
