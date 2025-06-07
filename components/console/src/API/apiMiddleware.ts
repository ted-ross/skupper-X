import axios, { AxiosError } from 'axios';

import { FetchWithOptions, HTTPError } from './REST.interfaces';
import { MSG_TIMEOUT_ERROR } from '../config/config';

function handleStatusError(e: AxiosError<{ message?: string }>) {
  const error: HTTPError = { ...e };

  if (!e.response) {
    error.message = e.message || MSG_TIMEOUT_ERROR;
  }

  if (error.response?.status) {
    const {
      response: { status, statusText }
    } = error;

    error.message = `${status}: ${statusText}`;
    error.httpStatus = status.toString();
    error.descriptionMessage = (e.response?.data?.message as string) || (e.response?.data as string);
  }

  return Promise.reject(error);
}

export async function axiosFetch<T = unknown>(url: string, options: FetchWithOptions = {}): Promise<T> {
  const response = await axios(url, {
    ...options,
    paramsSerializer: {
      indexes: null // serialize arrays as &samekey=value1&samekey=value2
    }
  });

  return response.data;
}

axios.interceptors.response.use(
  (config) => config,
  (e) => handleStatusError(e)
);
