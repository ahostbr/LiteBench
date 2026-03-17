import { ipcMain } from 'electron';
import {
  createCase,
  createSuite,
  deleteCase,
  deleteSuite,
  listSuites,
  seedDefaults,
  seedJudgment,
  seedSpeed,
  seedStandard,
  seedStress,
  updateCase,
} from '../db';
import type {
  TestCaseCreateInput,
  TestCaseUpdateInput,
  TestSuiteCreateInput,
} from '../../shared/types';

export function registerSuitesHandlers(): void {
  ipcMain.handle('bench:suites:list', () => {
    return listSuites();
  });

  ipcMain.handle('bench:suites:create', (_event, input: TestSuiteCreateInput) => {
    return createSuite(input);
  });

  ipcMain.handle('bench:suites:delete', (_event, suiteId: number) => {
    deleteSuite(suiteId);
  });

  ipcMain.handle('bench:suites:seed-defaults', () => {
    return seedDefaults();
  });

  ipcMain.handle('bench:suites:seed-standard', () => {
    return seedStandard();
  });

  ipcMain.handle('bench:suites:seed-stress', () => {
    return seedStress();
  });

  ipcMain.handle('bench:suites:seed-speed', () => {
    return seedSpeed();
  });

  ipcMain.handle('bench:suites:seed-judgment', () => {
    return seedJudgment();
  });

  ipcMain.handle(
    'bench:suites:cases:create',
    (_event, suiteId: number, input: TestCaseCreateInput) => {
      return createCase(suiteId, input);
    },
  );

  ipcMain.handle(
    'bench:suites:cases:update',
    (_event, suiteId: number, caseId: number, input: TestCaseUpdateInput) => {
      return updateCase(suiteId, caseId, input);
    },
  );

  ipcMain.handle(
    'bench:suites:cases:delete',
    (_event, suiteId: number, caseId: number) => {
      deleteCase(suiteId, caseId);
    },
  );
}
