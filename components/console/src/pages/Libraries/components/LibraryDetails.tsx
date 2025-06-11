import React, { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardExpandableContent,
  Stack,
  StackItem,
  Grid,
  GridItem,
  Icon
} from '@patternfly/react-core';

import LibraryOverview from './LibraryOverview';
import LibraryConfiguration from './LibraryConfiguration';
import LibraryInterfaces from './LibraryInterfaces';
import LibraryBody from './LibraryBody';
import LibraryTest from './LibraryTest';
import LibraryHistory from './LibraryHistory';
import { LibraryBlockResponse, LibraryBlockTypeResponse } from '../../../API/REST.interfaces';
import { getLibrarySections } from '../Libraries.utils';
import { useLibraryMetadata } from '../hooks/useLibraryMetadata';

interface LibraryDetailsProps {
  library: LibraryBlockResponse;
  libraryId: string;
}

const LibraryDetails: React.FC<LibraryDetailsProps> = ({ library, libraryId }) => {
  // Fetch block types from library metadata
  const { blockTypes } = useLibraryMetadata();

  // State for expandable cards
  const [expandedCards, setExpandedCards] = useState<{
    configuration: boolean;
    interfaces: boolean;
    body: boolean;
    test: boolean;
    history: boolean;
  }>({
    configuration: false,
    interfaces: false,
    body: false,
    test: false,
    history: false
  });

  const onExpand = (_event: React.MouseEvent, cardId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId as keyof typeof expandedCards]
    }));
  };

  const currentBlockType: LibraryBlockTypeResponse | undefined = blockTypes.find(
    (blockType) => blockType.type === library?.type
  );
  const cardSections = getLibrarySections(library, currentBlockType);

  return (
    <Stack hasGutter>
      {/* Library Overview Card */}
      <StackItem>
        <LibraryOverview library={library} libraryId={libraryId} />
      </StackItem>

      {/* Expandable Section Cards */}
      <StackItem>
        <Grid hasGutter>
          {cardSections.map((section) => (
            <GridItem key={section.key} span={12} lg={12}>
              <Card isFullHeight isExpanded={expandedCards[section.key as keyof typeof expandedCards]}>
                <CardHeader
                  onExpand={section.enabled ? (_event, _cardId) => onExpand(_event, section.key) : undefined}
                  toggleButtonProps={{
                    id: `toggle-button-${section.key}`,
                    'aria-label': `${section.title} Details`,
                    'aria-expanded': expandedCards[section.key as keyof typeof expandedCards]
                  }}
                >
                  <CardTitle>
                    <Icon isInline>
                      <section.icon />
                    </Icon>{' '}
                    {section.title}
                  </CardTitle>
                </CardHeader>

                <CardExpandableContent>
                  <CardBody>
                    <Stack hasGutter>
                      <StackItem>{section.description}</StackItem>
                      <StackItem>
                        {section.key === 'configuration' && <LibraryConfiguration libraryId={libraryId} />}
                        {section.key === 'interfaces' && (
                          <LibraryInterfaces
                            libraryId={libraryId}
                            blockType={
                              currentBlockType
                                ? {
                                    allownorth: currentBlockType.allownorth,
                                    allowsouth: currentBlockType.allowsouth
                                  }
                                : undefined
                            }
                          />
                        )}
                        {section.key === 'body' && (
                          <LibraryBody
                            libraryId={libraryId}
                            bodyStyle={library?.bodystyle}
                            blockType={
                              currentBlockType
                                ? {
                                    allocatetosite: currentBlockType.allocatetosite
                                  }
                                : undefined
                            }
                          />
                        )}
                        {section.key === 'test' && <LibraryTest bodyStyle={library.bodystyle} />}
                        {section.key === 'history' && <LibraryHistory libraryId={libraryId} />}
                      </StackItem>
                    </Stack>
                  </CardBody>
                </CardExpandableContent>
              </Card>
            </GridItem>
          ))}
        </Grid>
      </StackItem>
    </Stack>
  );
};

export default LibraryDetails;
