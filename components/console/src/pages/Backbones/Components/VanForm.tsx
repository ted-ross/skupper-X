import { useState, FC, FormEvent, useEffect } from 'react';

import {
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  Button,
  FormAlert,
  Alert,
  FormSelect,
  FormSelectOption
} from '@patternfly/react-core';
import { useMutation, useQuery } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { VanRequest, HTTPError } from '@API/REST.interfaces';

import { BackboneLabels, QueriesBackbones } from '../Backbones.enum';

const VanForm: FC<{
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [bid, setBid] = useState<string | undefined>();

  const { data: backbones } = useQuery({
    queryKey: [QueriesBackbones.GetBackbones],
    queryFn: () => RESTApi.fetchBackbones()
  });

  const mutationCreate = useMutation({
    mutationFn: (data: VanRequest) => RESTApi.createVan(data.bid, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleBackboneChange = (_: FormEvent<HTMLSelectElement>, value: string) => {
    setBid(value);
  };

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  };

  const handleSubmit = () => {
    if (!name) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    const data = {
      bid,
      name
    } as VanRequest;

    mutationCreate.mutate(data);
  };

  const handleCancel = () => {
    onCancel();
  };

  useEffect(() => {
    if (backbones?.length) {
      setBid(backbones[0].id);
    }
  }, [backbones]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup isRequired label={BackboneLabels.Name} fieldId="name">
        <TextInput isRequired type="text" id="site-name" name="site-name" value={name} onChange={handleNameChange} />
      </FormGroup>

      <FormGroup label={BackboneLabels.Backbones} style={{ gridTemplateColumns: '1fr 4fr' }} fieldId="backbone">
        <FormSelect value={bid} onChange={handleBackboneChange} aria-label="FormSelect Input">
          {backbones?.map((option, index) => <FormSelectOption key={index} value={option.id} label={option.name} />)}
        </FormSelect>
      </FormGroup>

      <ActionGroup style={{ display: 'flex' }}>
        <Button variant="primary" onClick={handleSubmit}>
          {BackboneLabels.SubmitBackboneBtn}
        </Button>
        <Button variant="link" onClick={handleCancel}>
          {BackboneLabels.CancelBackboneBtn}
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default VanForm;
