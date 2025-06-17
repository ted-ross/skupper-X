import { useState, MouseEvent as ReactMouseEvent, Ref, FC, FormEvent, useEffect, memo } from 'react';

import {
  Label,
  LabelGroup,
  Toolbar,
  ToolbarItem,
  ToolbarContent,
  ToolbarToggleGroup,
  ToolbarGroup,
  MenuToggle,
  MenuToggleElement,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  ToolbarFilter,
  Button
} from '@patternfly/react-core';
import { FilterIcon } from '@patternfly/react-icons';

import './SkSearchFilter.css';
import useDebounce from '../../utils/useDebounce';

interface FilterValues {
  [key: string]: string | undefined;
}

const PLACEHOLDER_PREFIX_LABEL = 'Search by';
const CLEAR_ALL_LABEL = 'Clear all filters';
const DEBOUNCE_TIME_MS = 300;

const SkSearchFilter: FC<{ onSearch?: Function; selectOptions: { id: string; name: string }[] }> = memo(
  ({ onSearch, selectOptions }) => {
    const [inputValue, setInputValue] = useState('');
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const [statusSelected, setStatusSelected] = useState(selectOptions[0].id);
    const [filterValues, setFilterValues] = useState<FilterValues>({});
    const filterDebounceValues = useDebounce<FilterValues>(filterValues, DEBOUNCE_TIME_MS);

    const handleInputChange = (_: FormEvent<HTMLInputElement>, newValue: string) => {
      setInputValue(newValue);

      if (newValue) {
        setFilterValues({ ...filterValues, [statusSelected]: newValue });
      } else {
        handleDeleteFilter(statusSelected);
      }
    };

    const handleClearInput = () => {
      handleDeleteFilter(statusSelected);
    };

    const handleSelect = (_?: ReactMouseEvent<Element, MouseEvent>, selected?: string | number) => {
      const selection = selected as keyof FilterValues;

      setInputValue(filterValues[selection] as string);
      setStatusSelected(selection as string);
      setIsStatusExpanded(false);
    };

    const handleDeleteFilter = (id: string) => {
      const newFilterValues = { ...filterValues, [id]: undefined };
      setInputValue('');
      setFilterValues(newFilterValues);
    };

    const handleDeleteGroup = () => {
      const initFiltersValue = selectOptions.reduce(
        (acc, { id }) => {
          acc[id] = undefined;

          return acc;
        },
        {} as Record<string, undefined>
      );

      setInputValue('');
      setFilterValues(initFiltersValue);
    };

    const handleToggle = () => {
      setIsStatusExpanded(!isStatusExpanded);
    };

    useEffect(() => {
      if (onSearch && Object.keys(filterDebounceValues).length) {
        onSearch(filterDebounceValues);
      }
    }, [onSearch, filterDebounceValues]);

    const statusMenuItems = selectOptions.map((option) => (
      <SelectOption key={option.id} value={option.id}>
        {option.name}
      </SelectOption>
    ));

    const filterNameSelected = selectOptions.find(({ id }) => id === statusSelected)?.name;
    const toggleGroupItems = (
      <ToolbarGroup variant="filter-group">
        <Select
          role="menu"
          toggle={(toggleRef: Ref<MenuToggleElement>) => (
            <MenuToggle ref={toggleRef} onClick={handleToggle} isExpanded={isStatusExpanded}>
              <FilterIcon /> {filterNameSelected}
            </MenuToggle>
          )}
          onSelect={handleSelect}
          selected={statusSelected}
          isOpen={isStatusExpanded}
          onOpenChange={handleToggle}
        >
          <SelectList>{statusMenuItems}</SelectList>
        </Select>

        <ToolbarItem>
          <SearchInput
            className="sk-search-filter"
            placeholder={`${PLACEHOLDER_PREFIX_LABEL} ${filterNameSelected?.toLocaleLowerCase()}`}
            onChange={handleInputChange}
            value={inputValue}
            onClear={handleClearInput}
          />
        </ToolbarItem>
      </ToolbarGroup>
    );

    const toolbarItems = (
      <ToolbarToggleGroup toggleIcon={<FilterIcon />} breakpoint="xl">
        {toggleGroupItems}
      </ToolbarToggleGroup>
    );

    const toolbarFilterItems = (
      <ToolbarGroup>
        {selectOptions.map(({ id, name }) => {
          const value = filterValues[id as keyof FilterValues];
          if (value) {
            return (
              <ToolbarFilter key={id} categoryName={name}>
                <LabelGroup categoryName={name}>
                  <Label variant="outline" key={value} onClose={() => handleDeleteFilter(id as string)}>
                    {value}
                  </Label>
                </LabelGroup>
              </ToolbarFilter>
            );
          }

          return null;
        })}

        {!!Object.values(filterValues).filter(Boolean).length && (
          <ToolbarItem>
            <Button variant="link" onClick={handleDeleteGroup}>
              {CLEAR_ALL_LABEL}
            </Button>
          </ToolbarItem>
        )}
      </ToolbarGroup>
    );

    return (
      <Toolbar collapseListedFiltersBreakpoint="xl">
        <ToolbarContent>{toolbarItems}</ToolbarContent>
        <ToolbarContent>{toolbarFilterItems}</ToolbarContent>
      </Toolbar>
    );
  }
);

export default SkSearchFilter;
