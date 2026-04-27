import {
  createConfiguredDocketRepository,
  getDefaultDocketStatePath,
  type DocketRepository,
} from "@docket/db";

import { docketSeedData } from "./seed";
import type { DocketData, WorkflowResult } from "./types";

let repositoryOverride: DocketRepository<DocketData> | null = null;

function cloneSeed(): DocketData {
  return structuredClone(docketSeedData);
}

function getRepository(): DocketRepository<DocketData> {
  return repositoryOverride ?? createConfiguredDocketRepository<DocketData>({ seedData: cloneSeed });
}

export function getDocketStatePath(): string {
  return getDefaultDocketStatePath();
}

export function setDocketRepository(repository: DocketRepository<DocketData> | null): void {
  repositoryOverride = repository;
}

export function readDocketData(): DocketData {
  return getRepository().read();
}

export function writeDocketData(data: DocketData): DocketData {
  return getRepository().write(data);
}

export function resetDocketData(): DocketData {
  return getRepository().reset();
}

export function runPersistedWorkflow(workflow: (data: DocketData) => WorkflowResult): WorkflowResult {
  return getRepository().transact(workflow);
}
