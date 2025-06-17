import { FC, ReactNode, FormEvent, ComponentProps } from 'react';

import {
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  Button,
  FormAlert,
  Alert,
  FormSelect,
  FormSelectOption,
  Checkbox,
  ValidatedOptions
} from '@patternfly/react-core';

import { FormActionLabels } from './FormWrapper.enum';

export interface FormFieldProps {
  id: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'password' | 'datetime-local' | 'select' | 'checkbox';
  value?: string | boolean;
  onChange: (value: string | boolean) => void;
  isRequired?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[]; // For select fields
  description?: string; // For checkbox descriptions
  isDisabled?: boolean;
  validated?: ValidatedOptions;
  helperText?: string;
  min?: string | number; // For number inputs
  max?: string | number; // For number inputs
}

export interface FormWrapperProps {
  /** Form title for accessibility */
  title?: string;
  /** Form fields configuration */
  fields: FormFieldProps[];
  /** Current validation error message */
  validationError?: string;
  /** Submit button text */
  submitText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Submit handler */
  onSubmit: () => void;
  /** Cancel handler */
  onCancel: () => void;
  /** Whether form is in loading state */
  isLoading?: boolean;
  /** Whether to use horizontal layout */
  isHorizontal?: boolean;
  /** Custom form content to render after standard fields */
  customContent?: ReactNode;
  /** Additional form props */
  formProps?: ComponentProps<typeof Form>;
}

/**
 * Reusable form wrapper component that handles common form patterns
 * Provides consistent form layout, validation, and submission handling
 */
export const FormWrapper: FC<FormWrapperProps> = function ({
  title,
  fields,
  validationError,
  submitText = FormActionLabels.Submit,
  cancelText = FormActionLabels.Cancel,
  onSubmit,
  onCancel,
  isLoading = false,
  isHorizontal = true,
  customContent,
  formProps = {}
}) {
  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    onSubmit();
  };

  const renderField = (field: FormFieldProps) => {
    const baseProps = {
      id: field.id,
      name: field.id,
      isDisabled: field.isDisabled || isLoading,
      validated: field.validated
    };

    switch (field.type) {
      case 'text':
      case 'number':
      case 'email':
      case 'password':
      case 'datetime-local':
        return (
          <TextInput
            {...baseProps}
            type={field.type}
            value={field.value as string}
            onChange={(_, value) => field.onChange(value)}
            placeholder={field.placeholder}
            isRequired={field.isRequired}
            min={field.min}
            max={field.max}
          />
        );

      case 'select':
        return (
          <FormSelect
            {...baseProps}
            value={field.value as string}
            onChange={(_, value) => field.onChange(value)}
            aria-label={field.label}
          >
            {field.options?.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </FormSelect>
        );

      case 'checkbox':
        return (
          <Checkbox
            {...baseProps}
            label={field.label}
            isChecked={field.value as boolean}
            onChange={(_, checked) => field.onChange(checked)}
            description={field.description}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Form isHorizontal={isHorizontal} onSubmit={handleSubmit} {...formProps}>
      {title && <input type="hidden" aria-label={title} />}

      {validationError && (
        <FormAlert>
          <Alert variant="danger" title={validationError} isInline />
        </FormAlert>
      )}

      {fields.map((field) => {
        if (field.type === 'checkbox') {
          return (
            <FormGroup key={field.id} fieldId={field.id}>
              {renderField(field)}
              {field.helperText && <div className="sk-text-secondary sk-margin-top-xs">{field.helperText}</div>}
            </FormGroup>
          );
        }

        return (
          <FormGroup key={field.id} isRequired={field.isRequired} label={field.label} fieldId={field.id}>
            {renderField(field)}
            {field.helperText && <div className="sk-text-secondary sk-margin-top-xs">{field.helperText}</div>}
          </FormGroup>
        );
      })}

      {customContent}

      <ActionGroup>
        <Button variant="primary" type="submit" isLoading={isLoading} isDisabled={isLoading}>
          {submitText}
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={isLoading}>
          {cancelText}
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default FormWrapper;
