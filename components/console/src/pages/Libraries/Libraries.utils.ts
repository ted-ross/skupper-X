import React from 'react';
import { LibraryBlockResponse, LibraryBlockTypeResponse } from '../../API/REST.interfaces';
import labels from '../../core/config/labels';
import { LIBRARY_SECTION_ICONS } from './Libraries.constants';

export interface LibrarySection {
  key: string;
  title: string;
  icon: React.ComponentType;
  enabled: boolean;
  description: string;
}

export const getLibrarySections = (
  library?: LibraryBlockResponse,
  currentBlockType?: LibraryBlockTypeResponse
): LibrarySection[] => [
  {
    key: 'configuration',
    title: labels.generic.configuration,
    icon: LIBRARY_SECTION_ICONS.configuration,
    enabled: true,
    description: labels.descriptions.configuration
  },
  {
    key: 'interfaces',
    title: labels.generic.interfaces,
    icon: LIBRARY_SECTION_ICONS.interfaces,
    enabled: currentBlockType ? currentBlockType.allownorth || currentBlockType.allowsouth : false,
    description: labels.descriptions.interfaces
  },
  {
    key: 'body',
    title: labels.generic.body,
    icon: LIBRARY_SECTION_ICONS.body,
    enabled: true,
    description: library?.bodystyle === 'composite' ? labels.descriptions.bodyComposite : labels.descriptions.bodySimple
  },
  {
    key: 'test',
    title: `${labels.generic.test} (mock section)`,
    icon: LIBRARY_SECTION_ICONS.test,
    enabled: true,
    description: labels.descriptions.test
  },
  {
    key: 'history',
    title: `${labels.generic.history} (mock section)`,
    icon: LIBRARY_SECTION_ICONS.history,
    enabled: true,
    description: labels.descriptions.history
  }
];
