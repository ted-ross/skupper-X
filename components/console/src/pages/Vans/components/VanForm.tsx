import { useState, FC, FormEvent, useCallback } from 'react';

import {
  Form,
  FormGroup,
  TextInput,
  FormAlert,
  Alert,
  FormSelect,
  FormSelectOption,
  Checkbox
} from '@patternfly/react-core';
import { useMutation, useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { VanRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import labels from '../../../core/config/labels';
import { QueriesBackbones } from '../../Backbones/Backbones.enum';

const VanForm: FC<{
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [bid, setBid] = useState<string | undefined>();
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [startImmediately, setStartImmediately] = useState<boolean>(false);
  const [noEndTime, setNoEndTime] = useState<boolean>(false);

  const { data: backbones } = useQuery({
    queryKey: [QueriesBackbones.GetBackbones],
    queryFn: () => RESTApi.fetchBackbones()
  });

  const mutationCreate = useMutation({
    mutationFn: (data: { bid: string; request: VanRequest }) => RESTApi.createVan(data.bid, data.request),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleBackboneChange = useCallback((_: FormEvent<HTMLSelectElement>, value: string) => {
    setBid(value);
  }, []);

  const handleNameChange = useCallback((_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  }, []);

  const handleStartTimeChange = useCallback((_: FormEvent<HTMLInputElement>, value: string) => {
    setStartTime(value);
  }, []);

  const handleEndTimeChange = useCallback((_: FormEvent<HTMLInputElement>, value: string) => {
    setEndTime(value);
  }, []);

  const handleStartImmediatelyChange = useCallback((checked: boolean) => {
    setStartImmediately(checked);
    if (checked) {
      setStartTime('');
    }
  }, []);

  const handleNoEndTimeChange = useCallback((checked: boolean) => {
    setNoEndTime(checked);
    if (checked) {
      setEndTime('');
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name) {
      setValidated(labels.validation.nameRequired);
      return;
    }
    if (!bid) {
      setValidated(labels.validation.backboneRequired);
      return;
    }
    const vanRequest = {
      name
    } as VanRequest;
    if (!startImmediately && startTime) {
      vanRequest.starttime = startTime;
    }
    if (!noEndTime && endTime) {
      vanRequest.endtime = endTime;
    }
    mutationCreate.mutate({ bid, request: vanRequest });
  }, [name, bid, startTime, endTime, startImmediately, noEndTime, mutationCreate.mutate]);

  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    isSubmitDisabled: !name || !bid,
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}
      <FormGroup isRequired label={labels.forms.name} fieldId="van-name">
        <TextInput
          isRequired
          type="text"
          id="van-name"
          name="van-name"
          value={name}
          onChange={handleNameChange}
          isDisabled={mutationCreate.isPending}
        />
      </FormGroup>
      <FormGroup label={labels.navigation.backbones} fieldId="van-backbone">
        <FormSelect value={bid} onChange={handleBackboneChange} id="van-backbone" name="van-backbone">
          <FormSelectOption value="" label={labels.navigation.backbones} isDisabled />
          {backbones?.map((option: any) => <FormSelectOption key={option.id} value={option.id} label={option.name} />)}
        </FormSelect>
      </FormGroup>
      <FormGroup label={labels.forms.startTime} fieldId="start-time">
        <TextInput
          type="datetime-local"
          id="start-time"
          name="start-time"
          value={startTime}
          onChange={handleStartTimeChange}
          isDisabled={startImmediately}
          style={{ marginBottom: '8px' }}
        />
        <Checkbox
          id="start-immediately"
          label={labels.forms.startImmediately}
          isChecked={startImmediately}
          onChange={(_event, checked) => handleStartImmediatelyChange(checked)}
        />
      </FormGroup>
      <FormGroup label={labels.forms.endTime} fieldId="end-time">
        <TextInput
          type="datetime-local"
          id="end-time"
          name="end-time"
          value={endTime}
          onChange={handleEndTimeChange}
          isDisabled={noEndTime}
          style={{ marginBottom: '8px' }}
        />
        <Checkbox
          id="no-end-time"
          label={labels.forms.noEndTime}
          isChecked={noEndTime}
          onChange={(_event, checked) => handleNoEndTimeChange(checked)}
        />
      </FormGroup>
    </Form>
  );
};

export default VanForm;
