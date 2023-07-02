import axios, { AxiosResponse } from 'axios';
import { requestError } from '@/errors';
import { RequestError } from '@/protocols';

async function get<T>(url: string): Promise<AxiosResponse<T> | RequestError> {
  try {
    const result = await axios.get<T>(url);
    return result;
  } catch (error) {
    const { status, statusText } = error.response;

    return requestError(status, statusText);
  }
}

export const request = {
  get,
};
