import { useState, FC, FormEvent, useCallback } from 'react';

import { Form, FormGroup, TextInput, FormAlert, Alert, Checkbox } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { BackboneRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import labels from '../../../core/config/labels';

const BackboneForm: FC<{
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>('');
  const [multitenant, setMultitenant] = useState<boolean>(true);

  const mutationCreate = useMutation({
    mutationFn: (data: BackboneRequest) => {
      return RESTApi.createBackbone(data);
    },
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setValidated(undefined);

      // Clear form state to prepare for potential next use
      setName('');
      setMultitenant(true);

      // Small delay to allow for smooth transition
      setTimeout(() => {
        onSubmit();
      }, 100);
    }
  });

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

  const handleChangeMultitenant = useCallback((_: FormEvent<HTMLInputElement>, checked: boolean) => {
    setMultitenant(checked);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name?.trim()) {
      setValidated(labels.validation.nameRequired);
      return;
    }

    // Reset validation errors before submitting
    setValidated(undefined);

    mutationCreate.mutate({ name: name.trim(), multitenant: String(multitenant) } as BackboneRequest);
  }, [name, multitenant, mutationCreate.mutate]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    isSubmitDisabled: !name?.trim(),
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

      <FormGroup isRequired label={labels.forms.name} fieldId="backbone-name">
        <TextInput
          isRequired
          type="text"
          id="backbone-name"
          name="backbone-name"
          value={name}
          onChange={handleNameChange}
          isDisabled={mutationCreate.isPending}
        />
      </FormGroup>

      <FormGroup fieldId="backbone-multitenancy">
        <Checkbox
          id="backbone-multitenancy"
          label={labels.forms.manage}
          isChecked={multitenant}
          onChange={handleChangeMultitenant}
          isDisabled={mutationCreate.isPending}
        />
      </FormGroup>
    </Form>
  );
};

export default BackboneForm;
