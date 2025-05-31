import { Tooltip } from '@patternfly/react-core';
import { TableText } from '@patternfly/react-table';

import { DurationCellProps } from './DurationCell';
import { formatTimeInterval } from '../../utils/formatTimeInterval';

/**
 *  startTime and endTime are expected to be in microseconds
 */
const DurationCell = function <T>({ startTime, endTime }: DurationCellProps<T>) {
  const duration = formatTimeInterval(endTime, startTime);

  return (
    <Tooltip content={duration}>
      <TableText wrapModifier="truncate">{duration}</TableText>
    </Tooltip>
  );
};

export default DurationCell;
