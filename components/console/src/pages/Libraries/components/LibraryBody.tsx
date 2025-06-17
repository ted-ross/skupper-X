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
  TextInput,
  TextArea,
  Stack,
  StackItem,
  Alert,
  ActionGroup,
  Checkbox,
  Badge,
  Split,
  SplitItem
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { AngleDownIcon, AngleRightIcon, PlusIcon, TrashIcon, CodeIcon, CubesIcon } from '@patternfly/react-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError, LibraryBlockResponse } from '../../../API/REST.interfaces';
import { TARGET_PLATFORMS, AFFINITY_OPTIONS } from '../Libraries.constants';
import labels from '../../../core/config/labels';
import { useLibraryBody } from '../hooks/useLibraryBody';

interface SimpleTemplate {
  targetPlatforms: string[];
  affinity?: string[];
  description: string;
  template: string;
}

interface LibraryBodyProps {
  libraryId: string;
  bodyStyle: LibraryBlockResponse['bodystyle'];
  blockType?: {
    allocatetosite?: boolean;
  };
}

interface ExpandedRow {
  [key: string]: boolean;
}

const LibraryBody = ({ libraryId, bodyStyle, blockType }: LibraryBodyProps) => {
  const [simpleBody, setSimpleBody] = useState<SimpleTemplate[]>([]);
  const [expandedRows, setExpandedRows] = useState<ExpandedRow>({});
  const [editingTemplate, setEditingTemplate] = useState<number | null>(null);
  const [formData, setFormData] = useState<SimpleTemplate>({
    targetPlatforms: [],
    affinity: [],
    description: '',
    template: ''
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  const queryClient = useQueryClient();
  const showAffinity = !blockType?.allocatetosite;

  // Available target platforms and affinity options
  const targetPlatforms = TARGET_PLATFORMS;
  const affinityOptions = AFFINITY_OPTIONS;

  // Fetch body data for this library block
  const { bodyData, refetch } = useLibraryBody(libraryId);

  useEffect(() => {
    if (bodyData) {
      if (bodyStyle === 'simple' && Array.isArray(bodyData)) {
        setSimpleBody(bodyData);
      }
      // Composite body handling would go here when implemented
    }
  }, [bodyData, bodyStyle]);

  // Update body mutation
  const updateBodyMutation = useMutation({
    mutationFn: (updatedBody: SimpleTemplate[]) => {
      return RESTApi.updateLibraryBody(libraryId, updatedBody as any);
    },
    onSuccess: () => {
      refetch();
      setEditingTemplate(null);
      setIsAddingNew(false);
      setValidationError('');
      queryClient.invalidateQueries({ queryKey: ['libraryBody', libraryId] });
    },
    onError: (error: HTTPError) => {
      setValidationError(error.descriptionMessage || 'Failed to update body');
    }
  });

  const toggleRow = useCallback((index: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  }, []);

  const startEdit = useCallback(
    (index: number) => {
      if (bodyStyle === 'simple') {
        const template = simpleBody[index];
        if (template) {
          setFormData({ ...template });
          setEditingTemplate(index);
          setValidationError('');
        }
      }
    },
    [simpleBody, bodyStyle]
  );

  const startAdd = useCallback(() => {
    setFormData({
      targetPlatforms: [],
      affinity: showAffinity ? [] : undefined,
      description: '',
      template: ''
    });
    setIsAddingNew(true);
    setEditingTemplate(-1);
    setValidationError('');
  }, [showAffinity]);

  const cancelEdit = useCallback(() => {
    setEditingTemplate(null);
    setIsAddingNew(false);
    setValidationError('');
  }, []);

  const saveTemplate = useCallback(() => {
    if (!formData.description.trim()) {
      setValidationError(labels.validation.required.replace('is', labels.forms.description + ' is'));
      return;
    }

    if (!formData.template.trim()) {
      setValidationError(labels.validation.required.replace('is', labels.forms.templateContent + ' is'));
      return;
    }

    if (formData.targetPlatforms.length === 0) {
      setValidationError(labels.validation.required.replace('is', labels.forms.targetPlatforms + ' is'));
      return;
    }

    const updatedSimpleBody = [...simpleBody];

    if (isAddingNew) {
      updatedSimpleBody.push({ ...formData });
    } else if (editingTemplate !== null && editingTemplate >= 0) {
      updatedSimpleBody[editingTemplate] = { ...formData };
    }

    updateBodyMutation.mutate(updatedSimpleBody);
  }, [formData, simpleBody, isAddingNew, editingTemplate, updateBodyMutation]);

  const deleteTemplate = useCallback(
    (index: number) => {
      const updatedSimpleBody = simpleBody.filter((_, i) => i !== index);
      updateBodyMutation.mutate(updatedSimpleBody);
    },
    [simpleBody, updateBodyMutation]
  );

  const handleFieldChange = useCallback((field: keyof SimpleTemplate, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handlePlatformToggle = useCallback((platform: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      targetPlatforms: checked
        ? [...prev.targetPlatforms, platform]
        : prev.targetPlatforms.filter((p) => p !== platform)
    }));
  }, []);

  const handleAffinityToggle = useCallback((affinity: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      affinity: checked ? [...(prev.affinity || []), affinity] : (prev.affinity || []).filter((a) => a !== affinity)
    }));
  }, []);

  if (bodyStyle === 'composite') {
    return (
      <Stack hasGutter>
        <StackItem>
          <Alert variant="info" title={labels.forms.compositeBlockEditorTitle} isInline>
            {labels.forms.compositeBlockEditorInfo}
          </Alert>
        </StackItem>
        <StackItem>
          <Card>
            <CardHeader>
              <CardTitle>
                <Split hasGutter>
                  <SplitItem>
                    <CubesIcon />
                  </SplitItem>
                  <SplitItem>{labels.forms.compositeBlockDefinition}</SplitItem>
                </Split>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p>{labels.forms.compositeBlockEditorInfo}</p>
              <ul>
                {labels.forms.compositeBlockEditorFeatures.map((feature: string, idx: number) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </StackItem>
      </Stack>
    );
  }

  // Simple body editor
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
          icon={<PlusIcon />}
          onClick={startAdd}
          isDisabled={isAddingNew || editingTemplate !== null}
        >
          {labels.buttons.addTemplate}
        </Button>
      </StackItem>

      <StackItem>
        <Table aria-label="Body templates table">
          <Thead>
            <Tr>
              <Th width={10}></Th>
              <Th>{labels.columns.targetPlatforms}</Th>
              {showAffinity && <Th>{labels.columns.affinity}</Th>}
              <Th>{labels.columns.description}</Th>
              <Th width={10} modifier="fitContent"></Th>
            </Tr>
          </Thead>
          <Tbody>
            {simpleBody.map((template, index) => (
              <>
                <Tr key={index}>
                  <Td>
                    <Button
                      variant="plain"
                      aria-label={`${expandedRows[index] ? labels.forms.collapse : labels.forms.expand} template ${index}`}
                      onClick={() => toggleRow(index)}
                      icon={expandedRows[index] ? <AngleDownIcon /> : <AngleRightIcon />}
                      isDisabled={isAddingNew || editingTemplate !== null}
                    />
                  </Td>
                  <Td>
                    {template.targetPlatforms.map((platform) => (
                      <Badge key={platform} style={{ marginRight: '4px' }}>
                        {labels.generic[platform as keyof typeof labels.generic] || platform}
                      </Badge>
                    ))}
                  </Td>
                  {showAffinity && (
                    <Td>
                      {template.affinity && template.affinity.length > 0
                        ? template.affinity.map((aff) => (
                            <Badge key={aff} style={{ marginRight: '4px' }}>
                              {labels.generic[aff as keyof typeof labels.generic] || aff}
                            </Badge>
                          ))
                        : '-'}
                    </Td>
                  )}
                  <Td>{template.description}</Td>
                  <Td modifier="fitContent">
                    <Button
                      variant="link"
                      isDanger
                      onClick={() => deleteTemplate(index)}
                      isDisabled={editingTemplate !== null}
                      icon={<TrashIcon />}
                    >
                      {labels.buttons.delete}
                    </Button>
                  </Td>
                </Tr>

                {/* Show expanded content when row is expanded, regardless of editing state */}
                {expandedRows[index] && !isAddingNew && editingTemplate !== index && (
                  <Tr key={`${index}-expanded`}>
                    <Td colSpan={showAffinity ? 5 : 4}>
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            <Split hasGutter>
                              <SplitItem>
                                <CodeIcon />
                              </SplitItem>
                              <SplitItem>{labels.forms.templateDetails}</SplitItem>
                            </Split>
                          </CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Grid hasGutter>
                            <GridItem span={12}>
                              <FormGroup label={labels.forms.description}>
                                <div>{template.description}</div>
                              </FormGroup>
                            </GridItem>

                            <GridItem span={6}>
                              <FormGroup label={labels.forms.targetPlatforms}>
                                <div>
                                  {template.targetPlatforms.map((platform) => (
                                    <Badge key={platform} style={{ marginRight: '4px' }}>
                                      {labels.generic[platform as keyof typeof labels.generic] || platform}
                                    </Badge>
                                  ))}
                                </div>
                              </FormGroup>
                            </GridItem>

                            {showAffinity && (
                              <GridItem span={6}>
                                <FormGroup label={labels.forms.affinity}>
                                  <div>
                                    {template.affinity && template.affinity.length > 0
                                      ? template.affinity.map((aff) => (
                                          <Badge key={aff} style={{ marginRight: '4px' }}>
                                            {labels.generic[aff as keyof typeof labels.generic] || aff}
                                          </Badge>
                                        ))
                                      : '-'}
                                  </div>
                                </FormGroup>
                              </GridItem>
                            )}

                            <GridItem span={12}>
                              <FormGroup label={labels.forms.templateContent}>
                                <TextArea value={template.template} readOnly rows={10} />
                              </FormGroup>
                            </GridItem>
                          </Grid>

                          {/* Action buttons for the expanded view */}
                          <ActionGroup style={{ marginTop: '1rem' }}>
                            <Button variant="primary" onClick={() => startEdit(index)}>
                              {labels.buttons.editTemplate}
                            </Button>
                          </ActionGroup>
                        </CardBody>
                      </Card>
                    </Td>
                  </Tr>
                )}

                {/* Edit existing template - only show when actually editing */}
                {editingTemplate === index && expandedRows[index] && (
                  <Tr key={`${index}-edit`}>
                    <Td colSpan={showAffinity ? 5 : 4}>
                      <Card>
                        <CardHeader>
                          <CardTitle>{labels.forms.editTemplate}</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Form>
                            <Grid hasGutter>
                              <GridItem span={12}>
                                <FormGroup label={labels.forms.description} isRequired>
                                  <TextInput
                                    value={formData.description}
                                    onChange={(_event, value) => handleFieldChange('description', value)}
                                    placeholder={labels.forms.description}
                                  />
                                </FormGroup>
                              </GridItem>

                              <GridItem span={6}>
                                <FormGroup label={labels.forms.targetPlatforms} isRequired>
                                  <Stack hasGutter>
                                    {targetPlatforms.map((platform) => (
                                      <StackItem key={platform}>
                                        <Checkbox
                                          label={labels.generic[platform as keyof typeof labels.generic] || platform}
                                          isChecked={formData.targetPlatforms.includes(platform)}
                                          onChange={(_event, checked) => handlePlatformToggle(platform, checked)}
                                          id={`edit-platform-${platform}`}
                                        />
                                      </StackItem>
                                    ))}
                                  </Stack>
                                </FormGroup>
                              </GridItem>

                              {showAffinity && (
                                <GridItem span={6}>
                                  <FormGroup label={labels.forms.affinity}>
                                    <Stack hasGutter>
                                      {affinityOptions.map((affinity) => (
                                        <StackItem key={affinity}>
                                          <Checkbox
                                            label={labels.generic[affinity as keyof typeof labels.generic] || affinity}
                                            isChecked={(formData.affinity || []).includes(affinity)}
                                            onChange={(_event, checked) => handleAffinityToggle(affinity, checked)}
                                            id={`edit-affinity-${affinity}`}
                                          />
                                        </StackItem>
                                      ))}
                                    </Stack>
                                  </FormGroup>
                                </GridItem>
                              )}

                              <GridItem span={12}>
                                <FormGroup label={labels.forms.templateContent} isRequired>
                                  <TextArea
                                    value={formData.template}
                                    onChange={(_event, value) => handleFieldChange('template', value)}
                                    placeholder={labels.forms.templateContent}
                                    rows={10}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                </FormGroup>
                              </GridItem>
                            </Grid>
                            <ActionGroup>
                              <Button variant="primary" onClick={saveTemplate} isLoading={updateBodyMutation.isPending}>
                                {labels.buttons.saveTemplate}
                              </Button>
                              <Button variant="link" onClick={cancelEdit}>
                                {labels.buttons.cancel}
                              </Button>
                            </ActionGroup>
                          </Form>
                        </CardBody>
                      </Card>
                    </Td>
                  </Tr>
                )}
              </>
            ))}

            {/* Add new template row */}
            {isAddingNew && (
              <Tr>
                <Td colSpan={showAffinity ? 5 : 4}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{labels.forms.addNewTemplate}</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Form>
                        <Grid hasGutter>
                          <GridItem span={12}>
                            <FormGroup label={labels.forms.description} isRequired>
                              <TextInput
                                value={formData.description}
                                onChange={(_event, value) => handleFieldChange('description', value)}
                                placeholder={labels.forms.description}
                              />
                            </FormGroup>
                          </GridItem>

                          <GridItem span={6}>
                            <FormGroup label={labels.forms.targetPlatforms} isRequired>
                              <Stack hasGutter>
                                {targetPlatforms.map((platform) => (
                                  <StackItem key={platform}>
                                    <Checkbox
                                      label={labels.generic[platform as keyof typeof labels.generic] || platform}
                                      isChecked={formData.targetPlatforms.includes(platform)}
                                      onChange={(_event, checked) => handlePlatformToggle(platform, checked)}
                                      id={`platform-${platform}`}
                                    />
                                  </StackItem>
                                ))}
                              </Stack>
                            </FormGroup>
                          </GridItem>

                          {showAffinity && (
                            <GridItem span={6}>
                              <FormGroup label={labels.forms.affinity}>
                                <Stack hasGutter>
                                  {affinityOptions.map((affinity) => (
                                    <StackItem key={affinity}>
                                      <Checkbox
                                        label={labels.generic[affinity as keyof typeof labels.generic] || affinity}
                                        isChecked={(formData.affinity || []).includes(affinity)}
                                        onChange={(_event, checked) => handleAffinityToggle(affinity, checked)}
                                        id={`affinity-${affinity}`}
                                      />
                                    </StackItem>
                                  ))}
                                </Stack>
                              </FormGroup>
                            </GridItem>
                          )}

                          <GridItem span={12}>
                            <FormGroup label={labels.forms.templateContent} isRequired>
                              <TextArea
                                value={formData.template}
                                onChange={(_event, value) => handleFieldChange('template', value)}
                                placeholder={labels.forms.templateContent}
                                rows={10}
                                style={{ fontFamily: 'monospace' }}
                              />
                            </FormGroup>
                          </GridItem>
                        </Grid>
                        <ActionGroup>
                          <Button variant="primary" onClick={saveTemplate} isLoading={updateBodyMutation.isPending}>
                            {labels.buttons.saveTemplate}
                          </Button>
                          <Button variant="link" onClick={cancelEdit}>
                            {labels.buttons.cancel}
                          </Button>
                        </ActionGroup>
                      </Form>
                    </CardBody>
                  </Card>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </StackItem>

      {simpleBody.length === 0 && !isAddingNew && (
        <StackItem>
          <Card>
            <CardBody>
              <Split hasGutter>
                <SplitItem>
                  <CodeIcon />
                </SplitItem>
                <SplitItem>
                  <i>{labels.forms.noTemplatesDefined}</i>
                </SplitItem>
              </Split>
            </CardBody>
          </Card>
        </StackItem>
      )}
    </Stack>
  );
};

export default LibraryBody;
