import { useState, FC, FormEvent } from 'react';

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
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import {
  BackboneSiteRequest,
  BackboneSiteResponse,
  HTTPError,
  TargetPlatformResponse
} from '../../../API/REST.interfaces';
import { BackboneLabels } from '../Backbones.enum';

const SiteForm: FC<{
  bid: string;
  position?: { x: number; y: number };
  editingSite?: BackboneSiteResponse;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, position, editingSite, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>(editingSite?.name);
  const [platform, setPlatform] = useState<string>(editingSite?.targetplatform || 'kube');

  // Fetch available target platforms
  const { data: platforms } = useSuspenseQuery({
    queryKey: ['targetPlatforms'],
    queryFn: () => RESTApi.fetchTargetPlatforms()
  });

  const mutationCreate = useMutation({
    mutationFn: (data: BackboneSiteRequest) => RESTApi.createSite(bid, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const mutationUpdate = useMutation({
    mutationFn: (data: Partial<BackboneSiteRequest>) => RESTApi.updateSite(editingSite!.id, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
    // Clear validation error when user starts typing
    if (validated) {
      setValidated(undefined);
    }
  };

  const handlePlatformChange = (_: FormEvent<HTMLSelectElement>, selectedPlatform: string) => {
    setPlatform(selectedPlatform);
  };

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault(); // Prevent default form submission behavior

    if (!name) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    if (editingSite) {
      // Edit mode - only send name and metadata (platform cannot be changed)
      const updateData: Partial<BackboneSiteRequest> = {
        name
      };

      if (position) {
        updateData.metadata = JSON.stringify({
          position
        });
      }

      mutationUpdate.mutate(updateData);
    } else {
      // Create mode - send all fields including platform
      const createData: BackboneSiteRequest = {
        name,
        platform
      };

      if (position) {
        createData.metadata = JSON.stringify({
          position
        });
      }

      mutationCreate.mutate(createData);
    }
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Form isHorizontal onSubmit={handleSubmit}>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup isRequired label={BackboneLabels.Name} fieldId="site-name">
        <TextInput isRequired type="text" id="site-name" name="site-name" value={name} onChange={handleNameChange} />
      </FormGroup>

      <FormGroup label="Target Platform" fieldId="site-platform">
        <FormSelect
          value={platform}
          onChange={handlePlatformChange}
          id="site-platform"
          name="site-platform"
          aria-label="Target Platform"
          isDisabled={!!editingSite}
        >
          {platforms.map((platformOption: TargetPlatformResponse) => (
            <FormSelectOption
              key={platformOption.shortname}
              value={platformOption.shortname}
              label={platformOption.longname}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <ActionGroup style={{ display: 'flex' }}>
        <Button variant="primary" type="submit">
          {BackboneLabels.SubmitBackboneBtn}
        </Button>
        <Button variant="link" onClick={handleCancel}>
          {BackboneLabels.CancelBackboneBtn}
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default SiteForm;
