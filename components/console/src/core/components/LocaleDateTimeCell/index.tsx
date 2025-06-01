import React from 'react';

import { Flex, FlexItem, Icon, Tooltip } from '@patternfly/react-core';
import { CalendarAltIcon, ClockIcon, HistoryIcon } from '@patternfly/react-icons';
import { TableText } from '@patternfly/react-table';

import { formatDateWithLocale, formatRelativeTime, getDateTooltip, parseDate } from '../../utils/dateFormatUtils';

export interface LocaleDateTimeCellProps {
  /** The date value to format - can be a string, number (timestamp), or Date object */
  value?: string | number | Date | null | undefined;

  /** Whether to show the date part (default: true) */
  showDate?: boolean;

  /** Whether to show the time part (default: true) */
  showTime?: boolean;

  /** Whether to show relative time (e.g., "2 hours ago") instead of absolute time */
  showRelative?: boolean;

  /** Whether to show an icon next to the formatted date */
  showIcon?: boolean;

  /** Custom icon to display (defaults to clock icon for timestamps) */
  icon?: React.ReactNode;

  /** Whether to use a compact format for space-constrained areas */
  compact?: boolean;

  /** Custom tooltip text (defaults to full timestamp) */
  tooltip?: string;

  /** Whether to show tooltip on hover (default: true) */
  showTooltip?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Placeholder text when value is null/undefined (default: "-") */
  placeholder?: string;

  /** Whether to use table cell styling optimized for data tables */
  isTableCell?: boolean;

  /** Whether to wrap text or truncate (default: true for table cells) */
  truncate?: boolean;
}

/**
 * A flexible date/time formatting component with browser locale support and icons
 * Suitable for both table cells and general UI elements
 */
const LocaleDateTimeCell: React.FC<LocaleDateTimeCellProps> = ({
  value,
  showDate = true,
  showTime = true,
  showRelative = false,
  showIcon = true,
  icon,
  compact = false,
  tooltip,
  showTooltip = true,
  className = '',
  placeholder = '-',
  isTableCell = false,
  truncate = true
}) => {
  // Parse the input value to a Date object
  const parsedDate = parseDate(value);

  // If no valid date, show placeholder
  if (!parsedDate) {
    const content = <span className={className}>{placeholder}</span>;

    if (isTableCell) {
      return <TableText wrapModifier={truncate ? 'truncate' : 'wrap'}>{content}</TableText>;
    }

    return content;
  }

  // Format the date based on options
  const formattedDate = showRelative
    ? formatRelativeTime(parsedDate)
    : formatDateWithLocale(parsedDate, {
        showDate,
        showTime,
        compact
      });

  // Generate tooltip content
  const tooltipContent = tooltip || getDateTooltip(parsedDate);

  // Determine which icon to show
  const getIcon = () => {
    if (icon) {
      return icon;
    }

    if (showRelative) {
      return <HistoryIcon />;
    }

    if (showDate && showTime) {
      return <CalendarAltIcon />;
    }

    if (showDate) {
      return <CalendarAltIcon />;
    }

    return <ClockIcon />;
  };

  // Create the content element
  const content = (
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      spaceItems={{ default: compact ? 'spaceItemsXs' : 'spaceItemsSm' }}
      className={className}
    >
      {showIcon && (
        <FlexItem>
          <Icon iconSize={compact ? 'sm' : 'md'} isInline className="pf-u-color-200">
            {getIcon()}
          </Icon>
        </FlexItem>
      )}
      <FlexItem>
        <span>{formattedDate}</span>
      </FlexItem>
    </Flex>
  );

  // Wrap with tooltip if enabled
  const wrappedContent = showTooltip ? <Tooltip content={tooltipContent}>{content}</Tooltip> : content;

  // Return table-specific formatting if needed
  if (isTableCell) {
    return <TableText wrapModifier={truncate ? 'truncate' : 'wrap'}>{wrappedContent}</TableText>;
  }

  return wrappedContent;
};

export default LocaleDateTimeCell;
