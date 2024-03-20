import { FC, useMemo, MouseEvent as ReactMouseEvent, useState, useCallback, Ref, useRef } from 'react';

import { Button, MenuToggle, MenuToggleElement, Select, SelectList, SelectOption } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';
import { useQueryClient } from '@tanstack/react-query';

interface SkUpdateDataButtonProps {
  isLoading?: boolean;
  isDisabled?: boolean;
  onClick?: Function;
  onRefreshIntervalSelected?: Function;
  refreshIntervalDefault?: number;
}

export const refreshDataIntervalMap = [
  {
    key: 'Refresh off',
    value: 0
  },
  {
    key: '15s',
    value: 15 * 1000
  },
  {
    key: '30s',
    value: 30 * 1000
  },
  {
    key: '60s',
    value: 60 * 1000
  },
  {
    key: '120s',
    value: 120 * 1000
  }
];

const SkUpdateDataButton: FC<SkUpdateDataButtonProps> = function ({
  isDisabled = false,
  onClick,
  onRefreshIntervalSelected,
  refreshIntervalDefault
}) {
  const queryClient = useQueryClient();

  const [isSelectOpen, setSelectOpen] = useState(false);
  const [refreshIntervalSelected, setSelectIntervalSelected] = useState<string | undefined>(
    findRefreshDataIntervalLabelFromValue(refreshIntervalDefault)
  );

  const refreshIntervalId = useRef<number>();

  const refreshIntervalOptions = useMemo(
    () =>
      refreshDataIntervalMap.map(({ key }, index) => (
        <SelectOption key={index} value={key}>
          {key}
        </SelectOption>
      )),
    []
  );

  const revalidateLiveQueries = useCallback(() => {
    queryClient.invalidateQueries({
      refetchType: 'active'
    });

    if (onClick) {
      onClick();
    }
  }, [onClick, queryClient]);

  const handleSelectRefreshInterval = useCallback(
    (_: ReactMouseEvent<Element, MouseEvent> | undefined, selection: string | number | undefined) => {
      const refreshDataIntervalSelected = selection as string;

      setSelectIntervalSelected(refreshDataIntervalSelected);
      setSelectOpen(false);

      const refreshInterval = findRefreshDataIntervalValueFromLabel(refreshDataIntervalSelected);
      clearInterval(refreshIntervalId.current);

      if (refreshInterval) {
        refreshIntervalId.current = window.setInterval(() => {
          revalidateLiveQueries();
        }, refreshInterval);
      }

      if (onRefreshIntervalSelected) {
        onRefreshIntervalSelected(findRefreshDataIntervalValueFromLabel(refreshDataIntervalSelected));
      }
    },
    [onRefreshIntervalSelected, revalidateLiveQueries]
  );

  return (
    <>
      <Select
        isOpen={isSelectOpen}
        onSelect={handleSelectRefreshInterval}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            isDisabled={isDisabled}
            data-testid="update-data-dropdown"
            ref={toggleRef}
            onClick={() => setSelectOpen(!isSelectOpen)}
            isExpanded={isSelectOpen}
          >
            {refreshIntervalSelected || refreshDataIntervalMap[0].key}
          </MenuToggle>
        )}
        shouldFocusToggleOnSelect
      >
        <SelectList>{refreshIntervalOptions}</SelectList>
      </Select>

      <Button
        key="split-action-primary"
        data-testid="update-data-click"
        onClick={() => revalidateLiveQueries()}
        style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
      >
        <SyncIcon />
      </Button>
    </>
  );
};

export default SkUpdateDataButton;

function findRefreshDataIntervalValueFromLabel(value: string | undefined): number {
  return refreshDataIntervalMap.find(({ key }) => key === value)?.value || 0;
}

function findRefreshDataIntervalLabelFromValue(valueSelected: number | undefined) {
  return (
    // value !== refreshDataIntervalMap[0].value. We don't want to show the label "off" when we select this value from the button
    refreshDataIntervalMap.find(({ value }) => value === valueSelected && value !== refreshDataIntervalMap[0].value)
      ?.key || ''
  );
}
