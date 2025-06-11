import { useState, FC, FormEvent, useCallback } from 'react';

import { Form, FormGroup, TextInput, FormAlert, Alert, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import {
  BackboneSiteRequest,
  BackboneSiteResponse,
  HTTPError,
  TargetPlatformResponse
} from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import { useMutationWithCacheInvalidation, CacheInvalidationPresets } from '../../../core/hooks/useMutationWithCacheInvalidation';
import labels from '../../../core/config/labels';
import { DEFAULT_PLATFORM } from '../../../config/config';

const SiteForm: FC<{
  bid: string;
  position?: { x: number; y: number };
  editingSite?: BackboneSiteResponse;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, position, editingSite, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>(editingSite?.name || '');
  const [platform, setPlatform] = useState<string>(editingSite?.targetplatform || DEFAULT_PLATFORM);

  // Fetch available target platforms
  const { data: platforms } = useSuspenseQuery({
    queryKey: ['targetPlatforms'],
    queryFn: () => RESTApi.fetchTargetPlatforms()
  });

  const mutationCreate = useMutationWithCacheInvalidation(
    (data: BackboneSiteRequest) => RESTApi.createSite(bid, data),
    CacheInvalidationPresets.createSite(bid),
    {
      onError: (data: HTTPError) => {
        setValidated(data.descriptionMessage);
      },
      onSuccess: () => {
        setValidated(undefined);
        setName('');
        setPlatform(DEFAULT_PLATFORM);
        setTimeout(() => {
          onSubmit();
        }, 100);
      }
    }
  );

  const mutationUpdate = useMutationWithCacheInvalidation(
    (data: Partial<BackboneSiteRequest>) => RESTApi.updateSite(editingSite!.id, data),
    CacheInvalidationPresets.updateSite(bid),
    {
      onError: (data: HTTPError) => {
        setValidated(data.descriptionMessage);
      },
      onSuccess: () => {
        setValidated(undefined);
        setTimeout(() => {
          onSubmit();
        }, 100);
      }
    }
  );

  const handleNameChange = useCallback((_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
    setValidated(undefined);
  }, []);

  const handlePlatformChange = useCallback((_: FormEvent<HTMLSelectElement>, selectedPlatform: string) => {
    setPlatform(selectedPlatform);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setValidated(labels.validation.nameRequired);
      return;
    }

    if (editingSite) {
      // Edit mode - only send name and metadata (platform cannot be changed)
      const updateData: Partial<BackboneSiteRequest> = {
        name
      };
      if (position) {
        updateData.metadata = JSON.stringify({ position });
      }
      mutationUpdate.mutate(updateData);
    } else {
      // Create mode - send all fields including platform
      const createData: BackboneSiteRequest = {
        name,
        platform
      };
      if (position) {
        createData.metadata = JSON.stringify({ position });
      }
      mutationCreate.mutate(createData);
    }
  }, [name, platform, position, editingSite]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending || mutationUpdate.isPending,
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  return (
    <Form
      id="site-form"
      isHorizontal
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={labels.errors.generic} isInline>
            {validated}
          </Alert>
        </FormAlert>
      )}
      <FormGroup isRequired label={labels.forms.name} fieldId="site-name">
        <TextInput isRequired type="text" id="site-name" name="site-name" value={name} onChange={handleNameChange} />
      </FormGroup>
      <FormGroup label={labels.forms.type} fieldId="site-platform">
        <FormSelect
          value={platform}
          onChange={handlePlatformChange}
          id="site-platform"
          name="site-platform"
          aria-label={labels.forms.type}
          isDisabled={!!editingSite}
        >
          {platforms &&
            platforms.map((platformOption: TargetPlatformResponse) => (
              <FormSelectOption
                key={platformOption.shortname}
                value={platformOption.shortname}
                label={platformOption.longname}
              />
            ))}
        </FormSelect>
      </FormGroup>
    </Form>
  );
};

export default SiteForm;
