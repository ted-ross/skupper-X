import { FC, useState, useCallback, useEffect, FormEvent } from 'react';

import { Form, FormGroup, TextInput, FormAlert, Alert, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LibraryBlockRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import labels from '../../../core/config/labels';
import { useLibraryMetadata } from '../hooks/useLibraryMetadata';

interface LibraryFormProps {
  onSubmit: () => void;
  onCancel: () => void;
}

const LibraryForm: FC<LibraryFormProps> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [bodystyle, setBodystyle] = useState<string>('');
  const [provider, setProvider] = useState<string>('');

  // Fetch metadata for block types and body styles
  const { blockTypes, bodyStyles, isLoading } = useLibraryMetadata();

  const mutationCreate = useMutation({
    mutationFn: (data: LibraryBlockRequest) => RESTApi.createLibraryJson(data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setValidated(labels.validation.nameRequired);
      return;
    }
    if (!type) {
      setValidated(labels.validation.typeRequired);
      return;
    }
    if (!bodystyle) {
      setValidated(labels.validation.bodyStyleRequired);
      return;
    }

    const libraryData: LibraryBlockRequest = {
      name: name.trim(),
      type,
      bodystyle,
      ...(provider.trim() && { provider: provider.trim() })
    };

    mutationCreate.mutate(libraryData);
  }, [name, type, bodystyle, provider, mutationCreate]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  const handleNameChange = useCallback((_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
    setValidated(undefined);
  }, []);

  const handleTypeChange = useCallback((_: FormEvent<HTMLSelectElement>, newType: string) => {
    setType(newType);
    setValidated(undefined);
  }, []);

  const handleBodystyleChange = useCallback((_: FormEvent<HTMLSelectElement>, newBodystyle: string) => {
    setBodystyle(newBodystyle);
    setValidated(undefined);
  }, []);

  const handleProviderChange = useCallback((_: FormEvent<HTMLInputElement>, newProvider: string) => {
    setProvider(newProvider);
    setValidated(undefined);
  }, []);

  // Set default values when metadata loads
  useEffect(() => {
    if (blockTypes && bodyStyles) {
      if (!type && blockTypes.length > 0) {
        setType(blockTypes[0].type);
      }
      if (!bodystyle && bodyStyles.length > 0) {
        setBodystyle(bodyStyles[0]);
      }
    }
  }, [blockTypes, bodyStyles, type, bodystyle]);

  // Show loading state while metadata is being fetched
  if (isLoading) {
    return <div className="pf-u-text-align-center pf-u-p-2xl">{labels.emptyStates.noLibrariesFound}</div>;
  }

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={labels.errors.generic} isInline>
            {validated}
          </Alert>
        </FormAlert>
      )}
      <FormGroup label={labels.forms.name} isRequired fieldId="library-name">
        <TextInput isRequired id="library-name" value={name} onChange={handleNameChange} />
      </FormGroup>
      <FormGroup label={labels.forms.type} isRequired fieldId="library-type">
        <FormSelect id="library-type" value={type} onChange={handleTypeChange}>
          {Array.isArray(blockTypes) &&
            blockTypes.map((blockType) => (
              <FormSelectOption
                key={blockType.type}
                value={blockType.type}
                label={blockType.description || blockType.type}
              />
            ))}
        </FormSelect>
      </FormGroup>
      <FormGroup label={labels.forms.bodyStyle} isRequired fieldId="library-bodystyle">
        <FormSelect id="library-bodystyle" value={bodystyle} onChange={handleBodystyleChange}>
          {Array.isArray(bodyStyles) &&
            bodyStyles.map((style) => (
              <FormSelectOption key={style} value={style} label={style.charAt(0).toUpperCase() + style.slice(1)} />
            ))}
        </FormSelect>
      </FormGroup>
      <FormGroup label={labels.forms.provider} fieldId="library-provider">
        <TextInput id="library-provider" value={provider} onChange={handleProviderChange} />
      </FormGroup>
    </Form>
  );
};

export default LibraryForm;
