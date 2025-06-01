import { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  Icon,
  TextInput,
  Stack,
  StackItem,
  Alert,
  ActionGroup,
  Checkbox
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import { INTERFACE_OPERATION_ICONS } from '../Libraries.constants';
import labels from '../../../core/config/labels';

// Icon constants for easy reference
const ICONS = INTERFACE_OPERATION_ICONS;

interface LibraryInterface {
  name: string;
  role: string;
  polarity: 'north' | 'south';
  maxBindings: string | number;
  data?: Record<string, unknown>;
}

interface LibraryInterfacesProps {
  libraryId: string;
  blockType?: {
    allownorth?: boolean;
    allowsouth?: boolean;
  };
}

interface ExpandedRow {
  [key: string]: boolean;
}

// Helper function to get polarity options based on block type
const getPolarityOptions = (blockType?: {
  allownorth?: boolean;
  allowsouth?: boolean;
}): LibraryInterface['polarity'][] => {
  const options: LibraryInterface['polarity'][] = [];
  if (blockType?.allownorth) options.push('north');
  if (blockType?.allowsouth) options.push('south');

  return options.length > 0 ? options : ['north', 'south'];
};

// Interface details component for read-only view
interface InterfaceDetailsProps {
  interface: LibraryInterface;
  name: string;
  onEdit: () => void;
}

const InterfaceDetails = ({ interface: iface, name, onEdit }: InterfaceDetailsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {labels.forms.interfaceDetails}: {name}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={6}>
            <strong>{labels.forms.interfaceName}:</strong> {iface.name}
          </GridItem>
          <GridItem span={6}>
            <strong>{labels.forms.role}:</strong> {iface.role}
          </GridItem>
          <GridItem span={6}>
            <strong>{labels.forms.polarity}:</strong> {iface.polarity}
          </GridItem>
          <GridItem span={6}>
            <strong>{labels.forms.maxBindings}:</strong> {iface.maxBindings}
          </GridItem>
          {iface.data && (
            <GridItem span={12}>
              <strong>{labels.forms.additionalData}:</strong>
              <pre
                style={{
                  marginTop: '8px',
                  background: '#f5f5f5',
                  padding: '8px',
                  borderRadius: '4px'
                }}
              >
                {JSON.stringify(iface.data, null, 2)}
              </pre>
            </GridItem>
          )}
        </Grid>
        <ActionGroup style={{ marginTop: '1rem' }}>
          <Button variant="primary" onClick={onEdit}>
            {labels.forms.editInterface}
          </Button>
        </ActionGroup>
      </CardBody>
    </Card>
  );
};

// Form component for interface creation/editing
interface InterfaceFormProps {
  formData: LibraryInterface;
  interfaceRoles: Array<{ name: string }>;
  blockType?: { allownorth?: boolean; allowsouth?: boolean };
  isLoading: boolean;
  onFieldChange: (field: keyof LibraryInterface, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
  saveButtonText: string;
}

const InterfaceForm = ({
  formData,
  interfaceRoles,
  blockType,
  isLoading,
  onFieldChange,
  onSave,
  onCancel,
  title,
  saveButtonText
}: InterfaceFormProps) => {
  const polarityOptions = getPolarityOptions(blockType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        <Form>
          <Grid hasGutter>
            <GridItem span={6}>
              <FormGroup label={labels.forms.interfaceName} isRequired>
                <TextInput
                  value={formData.name}
                  onChange={(_event, value) => onFieldChange('name', value)}
                  placeholder={labels.forms.enterInterfaceName}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label={labels.forms.role} isRequired>
                <FormSelect value={formData.role} onChange={(_event, value) => onFieldChange('role', value)}>
                  {interfaceRoles.map((role) => (
                    <FormSelectOption key={role.name} value={role.name} label={role.name} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label={labels.forms.polarity} isRequired>
                <FormSelect value={formData.polarity} onChange={(_event, value) => onFieldChange('polarity', value)}>
                  {polarityOptions.map((polarity) => (
                    <FormSelectOption key={polarity} value={polarity} label={polarity} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label={labels.forms.maxBindings}>
                <Stack>
                  <StackItem>
                    <TextInput
                      value={
                        typeof formData.maxBindings === 'string'
                          ? formData.maxBindings
                          : formData.maxBindings.toString()
                      }
                      onChange={(_event, value) => onFieldChange('maxBindings', value)}
                      isDisabled={formData.maxBindings === 'unlimited'}
                      placeholder="1"
                    />
                  </StackItem>
                  <StackItem>
                    <Checkbox
                      label={labels.forms.unlimited}
                      isChecked={formData.maxBindings === 'unlimited'}
                      onChange={(_event, checked) => onFieldChange('maxBindings', checked ? 'unlimited' : '1')}
                      id={`unlimited-checkbox-${Date.now()}`}
                    />
                  </StackItem>
                </Stack>
              </FormGroup>
            </GridItem>
          </Grid>
          <ActionGroup>
            <Button variant="primary" onClick={onSave} isLoading={isLoading}>
              {saveButtonText}
            </Button>
            <Button variant="link" onClick={onCancel}>
              {labels.buttons.cancel}
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
    </Card>
  );
};

// Interface table row component
interface InterfaceRowProps {
  name: string;
  interface: LibraryInterface;
  isExpanded: boolean;
  isEditing: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const InterfaceRow = ({
  name,
  interface: iface,
  isExpanded,
  isEditing,
  isDisabled,
  onToggle,
  onEdit,
  onDelete
}: InterfaceRowProps) => {
  return (
    <>
      <Tr key={name}>
        <Td>
          <Button
            variant="plain"
            aria-label={`${isExpanded ? labels.forms.collapse : labels.forms.expand} ${name}`}
            onClick={onToggle}
            icon={<Icon>{isExpanded ? <ICONS.expand /> : <ICONS.collapse />}</Icon>}
            isDisabled={isDisabled}
          />
        </Td>
        <Td>{name}</Td>
        <Td>{iface.role}</Td>
        <Td>{iface.polarity}</Td>
        <Td>{iface.maxBindings}</Td>
        <Td>{iface.data ? JSON.stringify(iface.data) : '-'}</Td>
        <Td>
          <Button variant="link" isDanger onClick={onDelete} isDisabled={isDisabled} icon={<ICONS.delete />}>
            {labels.forms.deleteInterface}
          </Button>
        </Td>
      </Tr>
      {isExpanded && !isEditing && (
        <Tr>
          <Td colSpan={7}>
            <InterfaceDetails interface={iface} name={name} onEdit={onEdit} />
          </Td>
        </Tr>
      )}
    </>
  );
};

// Main LibraryInterfaces component
const LibraryInterfaces = ({ libraryId, blockType }: LibraryInterfacesProps) => {
  const [interfaces, setInterfaces] = useState<{ [key: string]: LibraryInterface }>({});
  const [expandedRows, setExpandedRows] = useState<ExpandedRow>({});
  const [editingInterface, setEditingInterface] = useState<string | null>(null);
  const [formData, setFormData] = useState<LibraryInterface>({
    name: '',
    role: '',
    polarity: 'north',
    maxBindings: '1'
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  const queryClient = useQueryClient();

  // Fetch interface roles
  const { data: interfaceRoles = [] } = useQuery({
    queryKey: ['interfaceRoles'],
    queryFn: () => RESTApi.fetchInterfaceRoles()
  });

  // Fetch interfaces for this library block
  const { data: interfacesData, refetch } = useQuery({
    queryKey: ['libraryInterfaces', libraryId],
    queryFn: () => RESTApi.fetchLibraryInterfaces(libraryId),
    enabled: !!libraryId
  });

  // Convert interfaces array to map
  useEffect(() => {
    if (interfacesData && Array.isArray(interfacesData)) {
      const interfaceMap: { [key: string]: LibraryInterface } = {};
      interfacesData.forEach((iface: LibraryInterface) => {
        interfaceMap[iface.name] = iface;
      });
      setInterfaces(interfaceMap);
    } else if (interfacesData && typeof interfacesData === 'object') {
      setInterfaces(interfacesData as { [key: string]: LibraryInterface });
    }
  }, [interfacesData]);

  // Update interfaces mutation
  const updateInterfacesMutation = useMutation({
    mutationFn: (updatedInterfaces: { [key: string]: LibraryInterface }) => {
      return RESTApi.updateLibraryInterfaces(libraryId, updatedInterfaces);
    },
    onSuccess: () => {
      refetch();
      setEditingInterface(null);
      setIsAddingNew(false);
      setValidationError('');
      queryClient.invalidateQueries({ queryKey: ['libraryInterfaces', libraryId] });
    },
    onError: (error: HTTPError) => {
      setValidationError(error.descriptionMessage || labels.validation.failedToUpdateInterfaces);
    }
  });

  const toggleRow = useCallback((interfaceName: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [interfaceName]: !prev[interfaceName]
    }));
  }, []);

  const startEdit = useCallback(
    (interfaceName: string) => {
      const iface = interfaces[interfaceName];
      if (iface) {
        setFormData({ ...iface });
        setEditingInterface(interfaceName);
        setValidationError('');
        // Automatically expand the row when editing starts
        setExpandedRows((prev) => ({
          ...prev,
          [interfaceName]: true
        }));
      }
    },
    [interfaces]
  );

  const startAdd = useCallback(() => {
    setFormData({
      name: '',
      role: interfaceRoles[0]?.name || '',
      polarity: blockType?.allownorth ? 'north' : 'south',
      maxBindings: '1'
    });
    setIsAddingNew(true);
    setEditingInterface('new');
    setValidationError('');
  }, [interfaceRoles, blockType]);

  const cancelEdit = useCallback(() => {
    setEditingInterface(null);
    setIsAddingNew(false);
    setValidationError('');
  }, []);

  const saveInterface = useCallback(() => {
    if (!formData.name.trim()) {
      setValidationError(labels.validation.interfaceNameRequired);
      return;
    }

    if (!formData.role) {
      setValidationError(labels.validation.interfaceRoleRequired);
      return;
    }

    const updatedInterfaces = { ...interfaces };

    if (isAddingNew) {
      if (updatedInterfaces[formData.name]) {
        setValidationError(labels.validation.interfaceNameExists);
        return;
      }
      updatedInterfaces[formData.name] = { ...formData };
    } else if (editingInterface && editingInterface !== 'new') {
      // If renaming, remove old entry and add new one
      if (formData.name !== editingInterface) {
        delete updatedInterfaces[editingInterface];
      }
      updatedInterfaces[formData.name] = { ...formData };
    }

    updateInterfacesMutation.mutate(updatedInterfaces);
  }, [formData, interfaces, isAddingNew, editingInterface, updateInterfacesMutation]);

  const deleteInterface = useCallback(
    (interfaceName: string) => {
      const updatedInterfaces = { ...interfaces };
      delete updatedInterfaces[interfaceName];
      updateInterfacesMutation.mutate(updatedInterfaces);
    },
    [interfaces, updateInterfacesMutation]
  );

  const handleFieldChange = useCallback((field: keyof LibraryInterface, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const interfaceEntries = Object.entries(interfaces);

  return (
    <Stack hasGutter>
      {validationError && (
        <StackItem>
          <Alert variant="danger" title={labels.validation.validationError} isInline>
            {validationError}
          </Alert>
        </StackItem>
      )}

      <StackItem>
        <Button
          variant="primary"
          icon={<ICONS.add />}
          onClick={startAdd}
          isDisabled={isAddingNew || !!editingInterface}
        >
          {labels.buttons.addInterface}
        </Button>
      </StackItem>

      <StackItem>
        <Table aria-label={labels.forms.libraryInterfacesTable}>
          <Thead>
            <Tr>
              <Th width={10}></Th>
              <Th>{labels.forms.interfaceName}</Th>
              <Th>{labels.forms.role}</Th>
              <Th>{labels.forms.polarity}</Th>
              <Th>{labels.forms.maxBindings}</Th>
              <Th>{labels.forms.data}</Th>
              <Th width={15}>{labels.forms.actions}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {interfaceEntries.map(([name, iface]) => (
              <InterfaceRow
                key={name}
                name={name}
                interface={iface}
                isExpanded={expandedRows[name]}
                isEditing={editingInterface === name}
                isDisabled={isAddingNew || editingInterface !== null}
                onToggle={() => toggleRow(name)}
                onEdit={() => startEdit(name)}
                onDelete={() => deleteInterface(name)}
              />
            ))}

            {/* Add new interface row */}
            {isAddingNew && (
              <Tr>
                <Td colSpan={7}>
                  <InterfaceForm
                    formData={formData}
                    interfaceRoles={interfaceRoles}
                    blockType={blockType}
                    isLoading={updateInterfacesMutation.isPending}
                    onFieldChange={handleFieldChange}
                    onSave={saveInterface}
                    onCancel={cancelEdit}
                    title={labels.forms.addNewInterface}
                    saveButtonText={labels.buttons.saveInterface}
                  />
                </Td>
              </Tr>
            )}

            {/* Edit existing interface */}
            {editingInterface && editingInterface !== 'new' && expandedRows[editingInterface] && (
              <Tr>
                <Td colSpan={7}>
                  <InterfaceForm
                    formData={formData}
                    interfaceRoles={interfaceRoles}
                    blockType={blockType}
                    isLoading={updateInterfacesMutation.isPending}
                    onFieldChange={handleFieldChange}
                    onSave={saveInterface}
                    onCancel={cancelEdit}
                    title={`${labels.forms.editInterface}: ${editingInterface}`}
                    saveButtonText={labels.buttons.saveChanges}
                  />
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </StackItem>

      {interfaceEntries.length === 0 && !isAddingNew && (
        <StackItem>
          <Card>
            <CardBody>
              <i>{labels.forms.noInterfacesDefined}</i>
            </CardBody>
          </Card>
        </StackItem>
      )}
    </Stack>
  );
};

export default LibraryInterfaces;
