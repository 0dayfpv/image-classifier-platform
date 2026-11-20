import { useCallback, useEffect, useRef, useState } from 'react';
import { removeSavedClassifierHead } from '../ml/transferClassifier';
import {
  projectRepository,
  type ProjectSummary,
} from '../storage/projectRepository';
import type {
  CreateSampleInput,
  LabelBucketRecord,
  ProjectRecord,
  ReactionConfig,
  SampleRecord,
  StageId,
  TrainingConfig,
} from '../types/domain';

function readProjectIdFromUrl(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    return id && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

function writeProjectIdToUrl(projectId: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.history) return;
    const nextUrl = projectId
      ? `${window.location.pathname}?project=${encodeURIComponent(projectId)}`
      : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  } catch {
    // Ignore history API errors in restricted environments
  }
}

export function buildDatasetSignature(
  labels: readonly LabelBucketRecord[],
  samples: readonly SampleRecord[]
): string {
  const labelPart = [...labels]
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    .map((l) => l.id)
    .join(',');
  const samplePart = [...samples]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((s) => `${s.id}:${s.labelId}`)
    .join(',');
  return `${labelPart}|${samplePart}`;
}

export function useProjectWorkspace() {
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    readProjectIdFromUrl()
  );
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const activeProjectRef = useRef<ProjectRecord | null>(null);
  const [activeStage, setActiveStage] = useState<StageId>('train');
  const [labels, setLabels] = useState<LabelBucketRecord[]>([]);
  const [samples, setSamples] = useState<SampleRecord[]>([]);

  const setActiveProjectSync = useCallback((proj: ProjectRecord | null) => {
    activeProjectRef.current = proj;
    setActiveProject(proj);
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const summaries = await projectRepository.listProjectSummaries();
      setProjectSummaries(summaries);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  const loadWorkspaceData = useCallback(
    async (projectId: string) => {
      const [proj, projLabels, projSamples] = await Promise.all([
        projectRepository.getProject(projectId),
        projectRepository.listLabels(projectId),
        projectRepository.listSamples(projectId),
      ]);

      if (!proj) {
        setActiveProjectId(null);
        setActiveProjectSync(null);
        setLabels([]);
        setSamples([]);
        writeProjectIdToUrl(null);
        return;
      }

      setActiveProjectSync(proj);
      setLabels(projLabels);
      setSamples(projSamples);
    },
    [setActiveProjectSync]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await projectRepository.listProjectSummaries();
        if (!cancelled) {
          setProjectSummaries(summaries);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    (async () => {
      const [proj, projLabels, projSamples] = await Promise.all([
        projectRepository.getProject(activeProjectId),
        projectRepository.listLabels(activeProjectId),
        projectRepository.listSamples(activeProjectId),
      ]);
      if (cancelled) return;
      if (!proj) {
        setActiveProjectId(null);
        setActiveProjectSync(null);
        setLabels([]);
        setSamples([]);
        writeProjectIdToUrl(null);
        return;
      }
      setActiveProjectSync(proj);
      setLabels(projLabels);
      setSamples(projSamples);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, setActiveProjectSync]);

  const createProject = useCallback(
    async (name: string) => {
      const created = await projectRepository.createProject(name);
      setActiveProjectSync(created);
      setLabels([]);
      setSamples([]);
      setActiveStage('train');
      setActiveProjectId(created.id);
      writeProjectIdToUrl(created.id);
      await refreshDashboard();
    },
    [refreshDashboard, setActiveProjectSync]
  );

  const openProject = useCallback(
    async (projectId: string) => {
      setActiveStage('train');
      setActiveProjectId(projectId);
      writeProjectIdToUrl(projectId);
      await loadWorkspaceData(projectId);
    },
    [loadWorkspaceData]
  );

  const navigateHome = useCallback(async () => {
    setActiveProjectId(null);
    setActiveProjectSync(null);
    setLabels([]);
    setSamples([]);
    setActiveStage('train');
    writeProjectIdToUrl(null);
    await refreshDashboard();
  }, [refreshDashboard, setActiveProjectSync]);

  const deleteProject = useCallback(
    async (projectId: string) => {
      await projectRepository.deleteProject(projectId);
      await removeSavedClassifierHead(projectId);
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
        setActiveProjectSync(null);
        setLabels([]);
        setSamples([]);
        writeProjectIdToUrl(null);
      }
      await refreshDashboard();
    },
    [activeProjectId, refreshDashboard, setActiveProjectSync]
  );

  const createLabel = useCallback(
    async (name: string) => {
      if (!activeProjectId) return;
      const created = await projectRepository.createLabel(activeProjectId, name);
      setLabels((prev) => [...prev, created]);
      await refreshDashboard();
    },
    [activeProjectId, refreshDashboard]
  );

  const renameLabel = useCallback(
    async (labelId: string, newName: string) => {
      const updated = await projectRepository.renameLabel(labelId, newName);
      setLabels((prev) =>
        prev.map((item) => (item.id === labelId ? updated : item))
      );
      await refreshDashboard();
    },
    [refreshDashboard]
  );

  const deleteLabel = useCallback(
    async (labelId: string) => {
      await projectRepository.deleteLabel(labelId);
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
      setSamples((prev) => prev.filter((s) => s.labelId !== labelId));
      if (activeProjectId) {
        const updatedProj = await projectRepository.getProject(activeProjectId);
        if (updatedProj) {
          setActiveProjectSync(updatedProj);
        }
      }
      await refreshDashboard();
    },
    [activeProjectId, refreshDashboard, setActiveProjectSync]
  );

  const addSample = useCallback(
    async (input: CreateSampleInput) => {
      const created = await projectRepository.addSample(input);
      setSamples((prev) => [...prev, created]);
      await refreshDashboard();
    },
    [refreshDashboard]
  );

  const deleteSample = useCallback(
    async (sampleId: string) => {
      await projectRepository.deleteSample(sampleId);
      setSamples((prev) => prev.filter((s) => s.id !== sampleId));
      await refreshDashboard();
    },
    [refreshDashboard]
  );

  const updateProjectRecord = useCallback(
    async (patch: Partial<ProjectRecord>) => {
      const current = activeProjectRef.current;
      if (!current) return;
      const merged: ProjectRecord = {
        ...current,
        ...patch,
      };
      // Optimistically update activeProject synchronously so controlled inputs (checkboxes, text, color) reflect immediately
      setActiveProjectSync(merged);
      const saved = await projectRepository.updateProject(merged);
      setActiveProjectSync(saved);
      await refreshDashboard();
    },
    [refreshDashboard, setActiveProjectSync]
  );

  const updateReaction = useCallback(
    async (labelId: string, reaction: ReactionConfig) => {
      const current = activeProjectRef.current;
      if (!current) return;
      const nextReactions: Record<string, ReactionConfig> = {
        ...current.reactions,
        [labelId]: reaction,
      };
      await updateProjectRecord({ reactions: nextReactions });
    },
    [updateProjectRecord]
  );

  const recordTrainingComplete = useCallback(
    async (config: TrainingConfig, trainedLabelIds: string[]) => {
      await updateProjectRecord({
        trainingConfig: config,
        lastTrainedAt: Date.now(),
        trainedLabelOrder: trainedLabelIds,
      });
    },
    [updateProjectRecord]
  );

  return {
    projectSummaries,
    isLoadingDashboard,
    activeProjectId,
    activeProject,
    activeStage,
    setActiveStage,
    labels,
    samples,
    createProject,
    openProject,
    navigateHome,
    deleteProject,
    createLabel,
    renameLabel,
    deleteLabel,
    addSample,
    deleteSample,
    updateReaction,
    recordTrainingComplete,
  };
}
