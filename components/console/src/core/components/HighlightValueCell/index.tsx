import { useMemo, useRef } from 'react';

import { HighlightValueCellProps } from './HighightValueCell.interfaces';
import { hexColors } from '../../../config/colors';

const HighlightValueCell = function <T>({ value, format }: HighlightValueCellProps<T>) {
  const prevValueRef = useRef<number>();

  const isValueUpdated = useMemo(() => {
    if (!prevValueRef.current) {
      prevValueRef.current = value;

      return false;
    }

    if (format(value) !== format(prevValueRef.current)) {
      prevValueRef.current = value;

      return true;
    }

    return false;
  }, [format, value]);

  return isValueUpdated ? (
    <div
      data-testid="highlighted-value"
      style={{
        fontWeight: 900,
        color: hexColors.Green500
      }}
    >
      {format(value)}
    </div>
  ) : (
    format(value)
  );
};

export default HighlightValueCell;
