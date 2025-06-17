import { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Form,
  FormGroup,
  Grid,
  GridItem,
  Icon,
  TextInput,
  Stack,
  StackItem,
  FormSelect,
  FormSelectOption,
  Alert
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { AngleDownIcon, AngleRightIcon, PlusIcon, TrashIcon } from '@patternfly/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import labels from '../../../core/config/labels';

interface ConfigAttribute {
  type: string;
  default: string;
  description: string;
}

interface ConfigurationMap {
  [key: string]: ConfigAttribute;
}

interface ExpandedRow {
  [key: string]: boolean;
}

interface LibraryConfigurationProps {
  libraryId: string;
}

const LibraryConfiguration = function ({ libraryId }: LibraryConfigurationProps) {
  const [expandedRows, setExpandedRows] = useState<ExpandedRow>({});
  const [editingConfig, setEditingConfig] = useState<ConfigurationMap>({});
  const [newAttributeName, setNewAttributeName] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [error, setError] = useState<string>();

  const queryClient = useQueryClient();

  // Fetch configuration data
  const { data: configMap = {} } = useQuery({
    queryKey: ['libraryConfig', libraryId],
    queryFn: async () => {
      const response = await RESTApi.fetchLibraryConfig(libraryId);
      // The API might return the config directly or wrapped in a config property
      const result = response.config || response;
      return result;
    }
  });

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: (config: ConfigurationMap) => {
      return RESTApi.updateLibraryConfig(libraryId, { config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryConfig', libraryId] });
      setError(undefined);
    },
    onError: (error: HTTPError) => {
      setError(error.descriptionMessage || labels.errors.failedToUpdateConfiguration);
    }
  });

  useEffect(() => {
    // Cast the API response to our ConfigurationMap type
    setEditingConfig(configMap as ConfigurationMap);
  }, [configMap]);

  const toggleRow = useCallback((attributeName: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [attributeName]: !prev[attributeName]
    }));
  }, []);

  const handleAddNew = useCallback(() => {
    if (newAttributeName.trim() && !editingConfig[newAttributeName]) {
      const newConfig = {
        ...editingConfig,
        [newAttributeName]: {
          type: 'string',
          default: '',
          description: ''
        }
      };
      setEditingConfig(newConfig);
      setExpandedRows((prev) => ({ ...prev, [newAttributeName]: true }));
      setNewAttributeName('');
      setIsAddingNew(false);
    }
  }, [newAttributeName, editingConfig]);

  const handleDeleteAttribute = useCallback(
    (attributeName: string) => {
      const { [attributeName]: deleted, ...remaining } = editingConfig;
      setEditingConfig(remaining);
      setExpandedRows((prev) => {
        const { [attributeName]: deletedExpanded, ...remainingExpanded } = prev;
        return remainingExpanded;
      });

      // Auto-save after deletion
      setTimeout(() => {
        updateConfigMutation.mutate(remaining);
      }, 100);
    },
    [editingConfig, updateConfigMutation]
  );

  const handleUpdateAttribute = useCallback((attributeName: string, field: keyof ConfigAttribute, value: string) => {
    setEditingConfig((prev) => ({
      ...prev,
      [attributeName]: {
        ...prev[attributeName],
        [field]: value
      }
    }));
  }, []);

  const handleSave = useCallback(() => {
    updateConfigMutation.mutate(editingConfig);
  }, [editingConfig, updateConfigMutation]);

  const handleReset = useCallback(() => {
    setEditingConfig(configMap as ConfigurationMap);
    setError(undefined);
  }, [configMap]);

  const hasChanges = JSON.stringify(editingConfig) !== JSON.stringify(configMap);

  return (
    <Stack hasGutter>
      {error && (
        <StackItem>
          <Alert variant="danger" title={labels.errors.configurationError} isInline>
            {error}
          </Alert>
        </StackItem>
      )}

      <StackItem>
        <Table variant="compact">
          <Thead>
            <Tr>
              <Th width={10}></Th>
              <Th>{labels.forms.attribute}</Th>
              <Th>{labels.forms.type}</Th>
              <Th>{labels.forms.default}</Th>
              <Th>{labels.forms.description}</Th>
              <Th width={15}>{labels.forms.actions}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {Object.entries(editingConfig).map(([attributeName, config]) => (
              <Tr key={attributeName}>
                <Td>
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={() => toggleRow(attributeName)}
                    icon={<Icon>{expandedRows[attributeName] ? <AngleDownIcon /> : <AngleRightIcon />}</Icon>}
                  />
                </Td>
                <Td>{attributeName}</Td>
                <Td>{config.type}</Td>
                <Td>{config.default}</Td>
                <Td>{config.description}</Td>
                <Td>
                  <Button
                    variant="link"
                    size="sm"
                    icon={<TrashIcon />}
                    onClick={() => handleDeleteAttribute(attributeName)}
                    isDanger
                  >
                    {labels.buttons.delete}
                  </Button>
                </Td>
              </Tr>
            ))}

            {/* Add new attribute row */}
            {isAddingNew ? (
              <Tr>
                <Td></Td>
                <Td>
                  <TextInput
                    value={newAttributeName}
                    onChange={(_event, value) => setNewAttributeName(value)}
                    placeholder={labels.placeholders.attributeName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNew();
                      if (e.key === 'Escape') setIsAddingNew(false);
                    }}
                    autoFocus
                  />
                </Td>
                <Td>string</Td>
                <Td></Td>
                <Td>{labels.buttons.newAttribute}</Td>
                <Td>
                  <Button size="sm" onClick={handleAddNew}>
                    {labels.buttons.add}
                  </Button>
                  <Button variant="link" size="sm" onClick={() => setIsAddingNew(false)}>
                    {labels.buttons.cancel}
                  </Button>
                </Td>
              </Tr>
            ) : (
              <Tr>
                <Td colSpan={6}>
                  <Button variant="link" size="sm" icon={<PlusIcon />} onClick={() => setIsAddingNew(true)}>
                    {labels.forms.addNewAttribute}
                  </Button>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </StackItem>

      {/* Expanded edit forms */}
      {Object.entries(editingConfig).map(
        ([attributeName, config]) =>
          expandedRows[attributeName] && (
            <StackItem key={`edit-${attributeName}`}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {labels.buttons.editAttribute} {attributeName}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Form>
                    <Grid hasGutter>
                      <GridItem span={4}>
                        <FormGroup label={labels.forms.type} fieldId={`type-${attributeName}`}>
                          <FormSelect
                            value={config.type}
                            onChange={(_event, value) => handleUpdateAttribute(attributeName, 'type', value)}
                          >
                            <FormSelectOption value="string" label="string" />
                            <FormSelectOption value="number" label="number" />
                            <FormSelectOption value="boolean" label="boolean" />
                            <FormSelectOption value="object" label="object" />
                            <FormSelectOption value="array" label="array" />
                          </FormSelect>
                        </FormGroup>
                      </GridItem>
                      <GridItem span={4}>
                        <FormGroup label={labels.forms.defaultValue} fieldId={`default-${attributeName}`}>
                          <TextInput
                            value={config.default}
                            onChange={(_event, value) => handleUpdateAttribute(attributeName, 'default', value)}
                            placeholder={labels.placeholders.defaultValue}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={4}>
                        <FormGroup label={labels.forms.description} fieldId={`description-${attributeName}`}>
                          <TextInput
                            value={config.description}
                            onChange={(_event, value) => handleUpdateAttribute(attributeName, 'description', value)}
                            placeholder={labels.placeholders.attributeDescription}
                          />
                        </FormGroup>
                      </GridItem>
                    </Grid>
                  </Form>
                </CardBody>
              </Card>
            </StackItem>
          )
      )}

      {/* Save/Reset Actions */}
      {hasChanges && (
        <StackItem>
          <Button variant="primary" onClick={handleSave} isLoading={updateConfigMutation.isPending}>
            {labels.buttons.save}
          </Button>{' '}
          <Button variant="secondary" onClick={handleReset}>
            {labels.buttons.reset}
          </Button>
        </StackItem>
      )}
    </Stack>
  );
};

export default LibraryConfiguration;
