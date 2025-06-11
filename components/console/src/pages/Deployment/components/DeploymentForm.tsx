import { useState, useCallback, FormEvent, useEffect } from 'react';
import { Form, FormGroup, FormSelect, FormSelectOption, FormAlert, Alert } from '@patternfly/react-core';
import { useMutation, useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { DeploymentRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import { QueriesApplications } from '../../Applications/Applications.enum';
import { QueriesVans } from '../../Vans/Vans.enum';
import labels from '../../../core/config/labels';

interface DeploymentFormProps {
  onSubmit: () => void;
  onCancel: () => void;
}

const DeploymentForm = ({ onSubmit, onCancel }: DeploymentFormProps) => {
  const [validated, setValidated] = useState<string | undefined>();
  const [app, setApp] = useState<string>('');
  const [van, setVan] = useState<string>('');

  // Fetch applications data
  const { data: applications = [], isLoading: isLoadingApplications } = useQuery({
    queryKey: [QueriesApplications.GetApplications],
    queryFn: () => RESTApi.fetchApplications()
  });

  // Fetch VANs data
  const { data: vans = [], isLoading: isLoadingVans } = useQuery({
    queryKey: [QueriesVans.GetVans],
    queryFn: () => RESTApi.fetchVans()
  });

  // Set initial values when data loads
  useEffect(() => {
    if (applications.length > 0 && !app) {
      setApp(applications[0].id);
    }
  }, [applications, app]);

  useEffect(() => {
    if (vans.length > 0 && !van) {
      setVan(vans[0].id);
    }
  }, [vans, van]);

  const mutationCreate = useMutation({
    mutationFn: (data: DeploymentRequest) => RESTApi.createDeployment(data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage || labels.validation.failedToCreateDeployment);
    },
    onSuccess: () => {
      setValidated(undefined);
      setApp('');
      setVan('');
      setTimeout(() => {
        onSubmit();
      }, 100);
    }
  });

  const handleAppChange = useCallback(
    (_: FormEvent<HTMLSelectElement>, newApp: string) => {
      setApp(newApp);
      if (validated) {
        setValidated(undefined);
      }
    },
    [validated]
  );

  const handleVanChange = useCallback(
    (_: FormEvent<HTMLSelectElement>, newVan: string) => {
      setVan(newVan);
      if (validated) {
        setValidated(undefined);
      }
    },
    [validated]
  );

  const handleSubmit = useCallback(() => {
    if (!app?.trim()) {
      setValidated(labels.validation.applicationNameRequired);
      return;
    }

    if (!van?.trim()) {
      setValidated(labels.validation.vanNameRequired);
      return;
    }

    setValidated(undefined);

    mutationCreate.mutate({
      app: app.trim(),
      van: van.trim()
    });
  }, [app, van, mutationCreate.mutate]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    isSubmitDisabled: !app?.trim() || !van?.trim(),
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

      <FormGroup isRequired label={labels.forms.applicationName} fieldId="app-name">
        <FormSelect
          isRequired
          id="app-name"
          name="app-name"
          value={app}
          onChange={handleAppChange}
          isDisabled={mutationCreate.isPending || isLoadingApplications}
        >
          {applications.map((application) => (
            <FormSelectOption key={application.id} value={application.id} label={application.name} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup isRequired label={labels.forms.vanName} fieldId="van-name">
        <FormSelect
          isRequired
          id="van-name"
          name="van-name"
          value={van}
          onChange={handleVanChange}
          isDisabled={mutationCreate.isPending || isLoadingVans}
        >
          {vans.map((vanItem) => (
            <FormSelectOption key={vanItem.id} value={vanItem.id} label={vanItem.name} />
          ))}
        </FormSelect>
      </FormGroup>
    </Form>
  );
};

export default DeploymentForm;
