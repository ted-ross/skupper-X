import { useState, useCallback } from 'react';
import {
  Card,
  CardBody,
  Stack,
  StackItem,
  Alert,
  Badge,
  Split,
  SplitItem,
  Button,
  Modal,
  ModalVariant,
  CodeBlock,
  CodeBlockCode,
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { EyeIcon, CodeBranchIcon, CalendarIcon, UserIcon } from '@patternfly/react-icons';

import { LibraryBlockHistoryResponse } from '../../../API/REST.interfaces';
import labels from '../../../core/config/labels';

interface LibraryHistoryProps {
  libraryId: string;
}

const LibraryHistory = ({ libraryId }: LibraryHistoryProps) => {
  const [selectedRevision, setSelectedRevision] = useState<LibraryBlockHistoryResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('configuration');

  // TODO: Use libraryId when real API is implemented
  console.log('LibraryHistory for library:', libraryId);

  // Use mock data for now since API endpoint may not be available
  const historyData: LibraryBlockHistoryResponse[] = [
    {
      revision: 3,
      created: '2024-12-04T10:30:00Z',
      author: 'john.doe@example.com',
      message: 'Updated interface bindings and configuration parameters',
      changes: {
        configuration: true,
        interfaces: true,
        body: false
      },
      data: {
        configuration: {
          timeout: { type: 'numeric', default: '30', description: 'Connection timeout in seconds' },
          retries: { type: 'numeric', default: '3', description: 'Number of retry attempts' }
        },
        interfaces: [
          { name: 'input', role: 'data', polarity: 'north', maxBindings: 1 },
          { name: 'output', role: 'data', polarity: 'south', maxBindings: 'unlimited' }
        ]
      }
    },
    {
      revision: 2,
      created: '2024-12-03T14:15:00Z',
      author: 'jane.smith@example.com',
      message: 'Added new template for Kubernetes deployment',
      changes: {
        configuration: false,
        interfaces: false,
        body: true
      },
      data: {
        body: [
          {
            targetPlatforms: ['kubernetes'],
            description: 'Kubernetes pod template',
            template:
              'apiVersion: v1\nkind: Pod\nmetadata:\n  name: example-pod\nspec:\n  containers:\n  - name: app\n    image: nginx:latest'
          }
        ]
      }
    },
    {
      revision: 1,
      created: '2024-12-01T09:00:00Z',
      author: 'admin@example.com',
      message: 'Initial block creation',
      changes: {
        configuration: true,
        interfaces: true,
        body: true
      },
      data: {
        configuration: {
          name: { type: 'string-name', default: '', description: 'Block instance name' }
        },
        interfaces: [{ name: 'input', role: 'data', polarity: 'north', maxBindings: 1 }],
        body: []
      }
    }
  ];

  const openRevisionDetails = useCallback((entry: LibraryBlockHistoryResponse) => {
    setSelectedRevision(entry);
    setIsModalOpen(true);
    setActiveTab('configuration');
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedRevision(null);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getChangesBadges = (changes: LibraryBlockHistoryResponse['changes']) => {
    const badges = [];
    if (changes.configuration) badges.push(<Badge key="config">{labels.generic.configuration}</Badge>);
    if (changes.interfaces) badges.push(<Badge key="interfaces">{labels.generic.interfaces}</Badge>);
    if (changes.body) badges.push(<Badge key="body">{labels.generic.body}</Badge>);
    return badges;
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <Card isPlain>
          <CardBody>
            {historyData.length === 0 ? (
              <Alert variant="info" title={labels.emptyStates.noHistoryAvailable} isInline>
                {labels.emptyStates.noHistoryDescription}
              </Alert>
            ) : (
              <Table aria-label="Revision history table">
                <Thead>
                  <Tr>
                    <Th>{labels.columns.revision}</Th>
                    <Th>{labels.columns.date}</Th>
                    <Th>{labels.columns.author}</Th>
                    <Th>{labels.columns.message}</Th>
                    <Th>{labels.columns.changes}</Th>
                    <Th width={10}>{labels.columns.actions}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {historyData.map((entry) => (
                    <Tr key={entry.revision}>
                      <Td>
                        <Split hasGutter>
                          <SplitItem>
                            <CodeBranchIcon />
                          </SplitItem>
                          <SplitItem>
                            <strong>v{entry.revision}</strong>
                          </SplitItem>
                        </Split>
                      </Td>
                      <Td>
                        <Split hasGutter>
                          <SplitItem>
                            <CalendarIcon />
                          </SplitItem>
                          <SplitItem>{formatDate(entry.created)}</SplitItem>
                        </Split>
                      </Td>
                      <Td>
                        <Split hasGutter>
                          <SplitItem>
                            <UserIcon />
                          </SplitItem>
                          <SplitItem>{entry.author}</SplitItem>
                        </Split>
                      </Td>
                      <Td>{entry.message}</Td>
                      <Td>
                        <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                          {getChangesBadges(entry.changes).map((badge, index) => (
                            <FlexItem key={index}>{badge}</FlexItem>
                          ))}
                        </Flex>
                      </Td>
                      <Td>
                        <Button variant="link" onClick={() => openRevisionDetails(entry)} icon={<EyeIcon />}>
                          {labels.buttons.view}
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </StackItem>

      {/* Revision Details Modal */}
      <Modal
        variant={ModalVariant.large}
        title={selectedRevision ? `${labels.descriptions.revisionDetails} ${selectedRevision.revision}` : ''}
        isOpen={isModalOpen}
        onClose={closeModal}
      >
        {selectedRevision && (
          <Stack hasGutter>
            <StackItem>
              <Card isPlain>
                <CardBody>
                  <Stack hasGutter>
                    <StackItem>
                      <strong>{labels.columns.date}:</strong> {formatDate(selectedRevision.created)}
                    </StackItem>
                    <StackItem>
                      <strong>{labels.columns.author}:</strong> {selectedRevision.author}
                    </StackItem>
                    <StackItem>
                      <strong>{labels.columns.message}:</strong> {selectedRevision.message}
                    </StackItem>
                    <StackItem>
                      <strong>{labels.columns.changes}:</strong>{' '}
                      <Flex spaceItems={{ default: 'spaceItemsXs' }} style={{ display: 'inline-flex' }}>
                        {getChangesBadges(selectedRevision.changes).map((badge, index) => (
                          <FlexItem key={index}>{badge}</FlexItem>
                        ))}
                      </Flex>
                    </StackItem>
                  </Stack>
                </CardBody>
              </Card>
            </StackItem>

            <StackItem>
              <Tabs activeKey={activeTab} onSelect={(_event, tabIndex) => setActiveTab(tabIndex as string)}>
                {selectedRevision.changes.configuration && (
                  <Tab eventKey="configuration" title={<TabTitleText>{labels.generic.configuration}</TabTitleText>}>
                    <Card>
                      <CardBody>
                        <CodeBlock>
                          <CodeBlockCode>{JSON.stringify(selectedRevision.data?.configuration, null, 2)}</CodeBlockCode>
                        </CodeBlock>
                      </CardBody>
                    </Card>
                  </Tab>
                )}

                {selectedRevision.changes.interfaces && (
                  <Tab eventKey="interfaces" title={<TabTitleText>{labels.generic.interfaces}</TabTitleText>}>
                    <Card>
                      <CardBody>
                        <CodeBlock>
                          <CodeBlockCode>{JSON.stringify(selectedRevision.data?.interfaces, null, 2)}</CodeBlockCode>
                        </CodeBlock>
                      </CardBody>
                    </Card>
                  </Tab>
                )}

                {selectedRevision.changes.body && (
                  <Tab eventKey="body" title={<TabTitleText>{labels.generic.body}</TabTitleText>}>
                    <Card>
                      <CardBody>
                        <CodeBlock>
                          <CodeBlockCode>{JSON.stringify(selectedRevision.data?.body, null, 2)}</CodeBlockCode>
                        </CodeBlock>
                      </CardBody>
                    </Card>
                  </Tab>
                )}
              </Tabs>
            </StackItem>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};

export default LibraryHistory;
