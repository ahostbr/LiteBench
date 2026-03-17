import { ipcMain } from 'electron';
import OpenAI from 'openai';
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
} from '../db';
import type {
  EndpointCreateInput,
  EndpointUpdateInput,
  ModelInfo,
} from '../../shared/types';

export function registerEndpointsHandlers(): void {
  ipcMain.handle('bench:endpoints:list', () => {
    return listEndpoints();
  });

  ipcMain.handle(
    'bench:endpoints:create',
    (_event, input: EndpointCreateInput) => {
      return createEndpoint(input);
    },
  );

  ipcMain.handle(
    'bench:endpoints:update',
    (_event, endpointId: number, input: EndpointUpdateInput) => {
      return updateEndpoint(endpointId, input);
    },
  );

  ipcMain.handle('bench:endpoints:delete', (_event, endpointId: number) => {
    deleteEndpoint(endpointId);
  });

  ipcMain.handle('bench:endpoints:models', async (_event, endpointId: number) => {
    const endpoint = getEndpoint(endpointId);
    if (!endpoint) {
      throw new Error('Endpoint not found');
    }

    const client = new OpenAI({
      apiKey: endpoint.api_key,
      baseURL: endpoint.base_url,
      timeout: 30_000,
    });

    try {
      const result = await client.models.list();
      const models: ModelInfo[] = result.data.map((model) => ({
        id: model.id,
        object: model.object,
      }));
      return { models };
    } catch (error) {
      throw new Error(
        `Failed to connect to endpoint: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
