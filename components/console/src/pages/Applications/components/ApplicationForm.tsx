import { useState, FC, FormEvent, useCallback, useEffect } from 'react';

import {
  Form,
  FormGroup,
  TextInput,
  FormAlert,
  Alert,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem
} from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { CreateApplicationRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import { useMutationWithCacheInvalidation, CacheInvalidationPresets } from '../../../core/hooks/useMutationWithCacheInvalidation';
import labels from '../../../core/config/labels';

const ApplicationForm: FC<{
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>('');
  const [rootblock, setRootblock] = useState<string>('');

  // Fetch library blocks for dropdown
  const {
    data: libraryBlocks = [],
    isLoading: isLoadingLibraries,
    error: libraryError
  } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => RESTApi.fetchLibraries()
  });

  // Filter for toplevel blocks only
  const toplevelBlocks = libraryBlocks.filter((block) => block.type === 'skupperx.io/toplevel');

  // Auto-select first toplevel block when data loads
  useEffect(() => {
    if (!isLoadingLibraries && toplevelBlocks.length > 0 && !rootblock) {
      setRootblock(toplevelBlocks[0].id);
    }
  }, [toplevelBlocks, isLoadingLibraries, rootblock]);

  const mutationCreate = useMutationWithCacheInvalidation(
    (data: CreateApplicationRequest) => RESTApi.createApplication(data),
    CacheInvalidationPresets.createApplication,
    {
      onError: (data: HTTPError) => {
        setValidated(data.descriptionMessage || 'Failed to create application');
      },
      onSuccess: () => {
        setValidated(undefined);

        // Clear form state to prepare for potential next use
        setName('');
        setRootblock('');

        // Small delay to allow for smooth transition
        setTimeout(() => {
          onSubmit();
        }, 100);
      }
    }
  );

  const handleNameChange = useCallback(
    (_: FormEvent<HTMLInputElement>, newName: string) => {
      setName(newName);
      // Clear validation errors when user starts typing
      if (validated) {
        setValidated(undefined);
      }
    },
    [validated]
  );

  const handleRootblockChange = useCallback(
    (_event: FormEvent<HTMLSelectElement>, value: string) => {
      setRootblock(value);
      // Clear validation errors when user makes a selection
      if (validated) {
        setValidated(undefined);
      }
    },
    [validated]
  );

  const handleSubmit = useCallback(() => {
    if (!name?.trim()) {
      setValidated(labels.validation.nameRequired);
      return;
    }

    if (!rootblock?.trim()) {
      setValidated('Root block ' + labels.validation.required);
      return;
    }

    // Reset validation errors before submitting
    setValidated(undefined);

    mutationCreate.mutate({
      name: name.trim(),
      rootblock: rootblock.trim()
    });
  }, [name, rootblock, mutationCreate.mutate]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    isSubmitDisabled: !name?.trim() || !rootblock?.trim(),
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  return (
    <Form isHorizontal onSubmit={handleSubmit}>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup isRequired label={labels.forms.name} fieldId="application-name">
        <TextInput
          isRequired
          type="text"
          id="application-name"
          name="application-name"
          value={name}
          onChange={handleNameChange}
          isDisabled={mutationCreate.isPending}
        />
      </FormGroup>

      <FormGroup isRequired label={labels.forms.rootBlock} fieldId="application-rootblock">
        <FormSelect
          isRequired
          id="application-rootblock"
          name="application-rootblock"
          value={rootblock}
          onChange={handleRootblockChange}
          isDisabled={mutationCreate.isPending || isLoadingLibraries}
        >
          {!isLoadingLibraries && toplevelBlocks.length === 0 && (
            <FormSelectOption isDisabled value="" label="No toplevel blocks available" />
          )}
          {toplevelBlocks.map((block) => (
            <FormSelectOption key={block.id} value={block.id} label={`${block.name};${block.revision}`} />
          ))}
        </FormSelect>
        <HelperText>
          <HelperTextItem>
            Only library blocks marked as top-level (skupperx.io/toplevel) can be used as root blocks for applications.
          </HelperTextItem>
        </HelperText>
        {libraryError && <Alert variant="warning" title="Failed to load library blocks" isInline />}
      </FormGroup>
    </Form>
  );
};

export default ApplicationForm;
