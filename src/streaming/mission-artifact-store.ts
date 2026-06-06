import type { MissionArtifact } from "./mission-event-protocol";

export type MissionArtifactStore = {
  artifacts: MissionArtifact[];
  updatedAt: number;
};

export function createMissionArtifactStore(): MissionArtifactStore {
  return { artifacts: [], updatedAt: Date.now() };
}

export function upsertMissionArtifact(store: MissionArtifactStore, artifact: MissionArtifact): MissionArtifactStore {
  const byId = new Map(store.artifacts.map(item => [item.id, item]));
  byId.set(artifact.id, { ...byId.get(artifact.id), ...artifact });
  return {
    artifacts: Array.from(byId.values()).slice(-24),
    updatedAt: Date.now(),
  };
}
