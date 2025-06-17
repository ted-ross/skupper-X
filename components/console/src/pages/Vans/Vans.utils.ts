// Helper function to format PostgreSQL interval object
export const formatDeleteDelay = (interval: Record<string, number> | string | null | undefined): string => {
  if (!interval) {
    return '-';
  }

  // If it's already a string, return it
  if (typeof interval === 'string') {
    return interval;
  }

  // If it's an object (PostgreSQL interval), format it
  if (typeof interval === 'object') {
    const parts = [];
    if (interval.years) {
      parts.push(`${interval.years}y`);
    }
    if (interval.months) {
      parts.push(`${interval.months}mo`);
    }
    if (interval.days) {
      parts.push(`${interval.days}d`);
    }
    if (interval.hours) {
      parts.push(`${interval.hours}h`);
    }
    if (interval.minutes) {
      parts.push(`${interval.minutes}m`);
    }
    if (interval.seconds) {
      parts.push(`${interval.seconds}s`);
    }

    return parts.length > 0 ? parts.join(' ') : '-';
  }

  return '-';
};
