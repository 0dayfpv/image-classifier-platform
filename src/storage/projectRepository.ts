import {
  DEFAULT_TRAINING_CONFIG,
  TRAINING_CONFIG_BOUNDS,
  type CreateSampleInput,
  type LabelBucketRecord,
  type ProjectRecord,
  type ReactionConfig,
  type SampleRecord,
  type SampleSource,
  type SupportedImageMimeType,
  type TrainingConfig,
} from '../types/domain';
import {
  StorageError,
  STORE_NAMES,
  closeDb,
  getDb,
  isStorageError,
  toStorageError,
} from './db';

export const MAX_PROJECT_NAME_LENGTH = 50;
export const MAX_LABEL_NAME_LENGTH = 40;

export const LABEL_COLOR_PALETTE: readonly string[] = [
  '#2563EB', // Blue 600
  '#DC2626', // Red 600
  '#047857', // Emerald 700
  '#B45309', // Amber 700
  '#7C3AED', // Violet 600
  '#BE185D', // Pink 700
  '#0E7490', // Cyan 700
  '#4F46E5', // Indigo 600
  '#C2410C', // Orange 700
  '#0F766E', // Teal 700
] as const;

export interface ProjectCounts {
  labelCount: number;
  sampleCount: number;
}

export interface ProjectSummary {
  project: ProjectRecord;
  labelCount: number;
  sampleCount: number;
  labelNames: string[];
}

export interface ProjectRepository {
  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<ProjectRecord | undefined>;
  createProject(name: string): Promise<ProjectRecord>;
  updateProject(project: ProjectRecord): Promise<ProjectRecord>;
  deleteProject(projectId: string): Promise<void>;
  listLabels(projectId: string): Promise<LabelBucketRecord[]>;
  createLabel(projectId: string, name: string): Promise<LabelBucketRecord>;
  renameLabel(labelId: string, newName: string): Promise<LabelBucketRecord>;
  deleteLabel(labelId: string): Promise<void>;
  listSamples(projectId: string): Promise<SampleRecord[]>;
  listSamplesByLabel(labelId: string): Promise<SampleRecord[]>;
  addSample(input: CreateSampleInput): Promise<SampleRecord>;
  deleteSample(sampleId: string): Promise<void>;
  getProjectCounts(projectId: string): Promise<ProjectCounts>;
  listProjectSummaries(): Promise<ProjectSummary[]>;
}

const VALID_MIME_TYPES = new Set<SupportedImageMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const VALID_SAMPLE_SOURCES = new Set<SampleSource>([
  'webcam',
  'upload',
  'drawing',
]);

export function sanitizeDisplayName(raw: string): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().normalize('NFC');
}

export function normalizeLabelComparisonKey(raw: string): string {
  return sanitizeDisplayName(raw).toLocaleLowerCase('tr-TR');
}

export function validateProjectName(raw: string): string {
  const trimmed = sanitizeDisplayName(raw);
  if (!trimmed) {
    throw new StorageError('VALIDATION_ERROR', 'Project name cannot be empty.', {
      reason: 'NAME_REQUIRED',
    });
  }
  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    throw new StorageError(
      'VALIDATION_ERROR',
      `Project name can be at most ${MAX_PROJECT_NAME_LENGTH} characters.`,
      { reason: 'NAME_TOO_LONG' }
    );
  }
  return trimmed;
}

export function validateLabelName(raw: string): string {
  const trimmed = sanitizeDisplayName(raw);
  if (!trimmed) {
    throw new StorageError('VALIDATION_ERROR', 'Label name cannot be empty.', {
      reason: 'NAME_REQUIRED',
    });
  }
  if (trimmed.length > MAX_LABEL_NAME_LENGTH) {
    throw new StorageError(
      'VALIDATION_ERROR',
      `Label name can be at most ${MAX_LABEL_NAME_LENGTH} characters.`,
      { reason: 'NAME_TOO_LONG' }
    );
  }
  return trimmed;
}

function validateTrainingConfig(config: TrainingConfig): TrainingConfig {
  if (!config || typeof config !== 'object') {
    throw new StorageError(
      'VALIDATION_ERROR',
      'Invalid training configuration.',
      { reason: 'INVALID_TRAINING_CONFIG' }
    );
  }

  const { epochs, batchSize, learningRate } = config;
  if (
    !Number.isInteger(epochs) ||
    epochs < TRAINING_CONFIG_BOUNDS.epochs.min ||
    epochs > TRAINING_CONFIG_BOUNDS.epochs.max
  ) {
    throw new StorageError(
      'VALIDATION_ERROR',
      'Invalid epochs configuration.',
      { reason: 'INVALID_TRAINING_CONFIG' }
    );
  }
  if (
    !Number.isInteger(batchSize) ||
    batchSize < TRAINING_CONFIG_BOUNDS.batchSize.min ||
    batchSize > TRAINING_CONFIG_BOUNDS.batchSize.max
  ) {
    throw new StorageError(
      'VALIDATION_ERROR',
      'Invalid batchSize configuration.',
      { reason: 'INVALID_TRAINING_CONFIG' }
    );
  }
  if (
    !Number.isFinite(learningRate) ||
    learningRate < TRAINING_CONFIG_BOUNDS.learningRate.min ||
    learningRate > TRAINING_CONFIG_BOUNDS.learningRate.max
  ) {
    throw new StorageError(
      'VALIDATION_ERROR',
      'Invalid learningRate configuration.',
      { reason: 'INVALID_TRAINING_CONFIG' }
    );
  }
  return { epochs, batchSize, learningRate };
}

function cloneReactions(
  reactions: Record<string, ReactionConfig>
): Record<string, ReactionConfig> {
  const cloned: Record<string, ReactionConfig> = {};
  for (const [key, value] of Object.entries(reactions ?? {})) {
    cloned[key] = { ...value };
  }
  return cloned;
}

export function pickNextLabelColor(
  existingLabels: readonly LabelBucketRecord[],
  nextOrder: number
): string {
  const used = new Set(
    existingLabels.map((label) => label.color.toUpperCase())
  );
  for (const candidate of LABEL_COLOR_PALETTE) {
    if (!used.has(candidate.toUpperCase())) {
      return candidate;
    }
  }
  const index = Math.abs(nextOrder) % LABEL_COLOR_PALETTE.length;
  return LABEL_COLOR_PALETTE[index] ?? LABEL_COLOR_PALETTE[0];
}

function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const projectRepository: ProjectRepository = {
  async listProjects(): Promise<ProjectRecord[]> {
    try {
      const db = await getDb();
      const projects = await db.getAll(STORE_NAMES.PROJECTS);
      return projects.sort(
        (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
      );
    } catch (error) {
      throw toStorageError(error, 'Failed to list projects.');
    }
  },

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    if (!id) {
      return undefined;
    }
    try {
      const db = await getDb();
      return await db.get(STORE_NAMES.PROJECTS, id);
    } catch (error) {
      throw toStorageError(error, 'Failed to get project.');
    }
  },

  async createProject(name: string): Promise<ProjectRecord> {
    const trimmedName = validateProjectName(name);
    const now = Date.now();
    const record: ProjectRecord = {
      id: generateId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
      reactions: {},
    };

    try {
      const db = await getDb();
      const tx = db.transaction(STORE_NAMES.PROJECTS, 'readwrite');
      tx.done.catch(() => {});
      try {
        await tx.store.put(record);
        await tx.done;
        return record;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to create project.');
    }
  },

  async updateProject(project: ProjectRecord): Promise<ProjectRecord> {
    const trimmedName = validateProjectName(project.name);
    const trainingConfig = validateTrainingConfig(project.trainingConfig);

    if (!project.id) {
      throw new StorageError('NOT_FOUND', 'Project ID is required.');
    }

    try {
      const db = await getDb();
      const tx = db.transaction(STORE_NAMES.PROJECTS, 'readwrite');
      tx.done.catch(() => {});
      try {
        const existing = await tx.store.get(project.id);
        if (!existing) {
          throw new StorageError(
            'NOT_FOUND',
            `Project "${project.id}" not found.`
          );
        }

        const updated: ProjectRecord = {
          id: existing.id,
          name: trimmedName,
          createdAt: existing.createdAt,
          updatedAt: Date.now(),
          trainingConfig,
          reactions: cloneReactions(project.reactions),
          ...(project.lastTrainedAt !== undefined
            ? { lastTrainedAt: project.lastTrainedAt }
            : {}),
          ...(project.trainedLabelOrder !== undefined
            ? { trainedLabelOrder: [...project.trainedLabelOrder] }
            : {}),
        };

        await tx.store.put(updated);
        await tx.done;
        return updated;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to update project.');
    }
  },

  async deleteProject(projectId: string): Promise<void> {
    if (!projectId) {
      return;
    }
    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        let sampleCursor = await tx
          .objectStore(STORE_NAMES.SAMPLES)
          .index('by-projectId')
          .openCursor(projectId);
        while (sampleCursor) {
          await sampleCursor.delete();
          sampleCursor = await sampleCursor.continue();
        }

        let labelCursor = await tx
          .objectStore(STORE_NAMES.LABELS)
          .index('by-projectId')
          .openCursor(projectId);
        while (labelCursor) {
          await labelCursor.delete();
          labelCursor = await labelCursor.continue();
        }

        await tx.objectStore(STORE_NAMES.PROJECTS).delete(projectId);
        await tx.done;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to delete project.');
    }
  },

  async listLabels(projectId: string): Promise<LabelBucketRecord[]> {
    if (!projectId) {
      return [];
    }
    try {
      const db = await getDb();
      const labels = await db.getAllFromIndex(
        STORE_NAMES.LABELS,
        'by-projectId',
        projectId
      );
      return labels.sort(
        (a, b) => a.order - b.order || a.createdAt - b.createdAt
      );
    } catch (error) {
      throw toStorageError(error, 'Failed to list labels.');
    }
  },

  async createLabel(
    projectId: string,
    name: string
  ): Promise<LabelBucketRecord> {
    const trimmedName = validateLabelName(name);
    if (!projectId) {
      throw new StorageError('NOT_FOUND', 'Project ID is required.');
    }
    const normalizedKey = normalizeLabelComparisonKey(trimmedName);

    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        const project = await tx.objectStore(STORE_NAMES.PROJECTS).get(projectId);
        if (!project) {
          throw new StorageError(
            'NOT_FOUND',
            `Project "${projectId}" not found.`
          );
        }

        const existingLabels = await tx
          .objectStore(STORE_NAMES.LABELS)
          .index('by-projectId')
          .getAll(projectId);

        const duplicate = existingLabels.some(
          (label) => normalizeLabelComparisonKey(label.name) === normalizedKey
        );
        if (duplicate) {
          throw new StorageError(
            'DUPLICATE_NAME',
            `Label "${trimmedName}" already exists in project.`
          );
        }

        const nextOrder =
          existingLabels.length === 0
            ? 0
            : Math.max(...existingLabels.map((label) => label.order)) + 1;
        const now = Date.now();
        const newLabel: LabelBucketRecord = {
          id: generateId(),
          projectId,
          name: trimmedName,
          color: pickNextLabelColor(existingLabels, nextOrder),
          order: nextOrder,
          createdAt: now,
        };

        await tx.objectStore(STORE_NAMES.LABELS).put(newLabel);
        await tx.objectStore(STORE_NAMES.PROJECTS).put({
          ...project,
          updatedAt: now,
        });
        await tx.done;
        return newLabel;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to create label.');
    }
  },

  async renameLabel(
    labelId: string,
    newName: string
  ): Promise<LabelBucketRecord> {
    const trimmedName = validateLabelName(newName);
    if (!labelId) {
      throw new StorageError('NOT_FOUND', 'Label ID is required.');
    }
    const normalizedKey = normalizeLabelComparisonKey(trimmedName);

    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        const existing = await tx.objectStore(STORE_NAMES.LABELS).get(labelId);
        if (!existing) {
          throw new StorageError('NOT_FOUND', `Label "${labelId}" not found.`);
        }

        const siblings = await tx
          .objectStore(STORE_NAMES.LABELS)
          .index('by-projectId')
          .getAll(existing.projectId);

        const duplicate = siblings.some(
          (sibling) =>
            sibling.id !== labelId &&
            normalizeLabelComparisonKey(sibling.name) === normalizedKey
        );
        if (duplicate) {
          throw new StorageError(
            'DUPLICATE_NAME',
            `Label "${trimmedName}" already exists in project.`
          );
        }

        const updated: LabelBucketRecord = {
          ...existing,
          name: trimmedName,
        };

        await tx.objectStore(STORE_NAMES.LABELS).put(updated);

        const project = await tx
          .objectStore(STORE_NAMES.PROJECTS)
          .get(existing.projectId);
        if (project) {
          await tx.objectStore(STORE_NAMES.PROJECTS).put({
            ...project,
            updatedAt: Date.now(),
          });
        }

        await tx.done;
        return updated;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to rename label.');
    }
  },

  async deleteLabel(labelId: string): Promise<void> {
    if (!labelId) {
      return;
    }
    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        const existing = await tx.objectStore(STORE_NAMES.LABELS).get(labelId);
        if (!existing) {
          await tx.done;
          return;
        }

        let sampleCursor = await tx
          .objectStore(STORE_NAMES.SAMPLES)
          .index('by-labelId')
          .openCursor(labelId);
        while (sampleCursor) {
          await sampleCursor.delete();
          sampleCursor = await sampleCursor.continue();
        }

        await tx.objectStore(STORE_NAMES.LABELS).delete(labelId);

        const project = await tx
          .objectStore(STORE_NAMES.PROJECTS)
          .get(existing.projectId);
        if (project) {
          const nextReactions = cloneReactions(project.reactions);
          delete nextReactions[labelId];

          const nextTrainedLabelOrder = Array.isArray(project.trainedLabelOrder)
            ? project.trainedLabelOrder.filter((id) => id !== labelId)
            : undefined;

          await tx.objectStore(STORE_NAMES.PROJECTS).put({
            ...project,
            reactions: nextReactions,
            ...(nextTrainedLabelOrder !== undefined
              ? { trainedLabelOrder: nextTrainedLabelOrder }
              : {}),
            updatedAt: Date.now(),
          });
        }

        await tx.done;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to delete label.');
    }
  },

  async listSamples(projectId: string): Promise<SampleRecord[]> {
    if (!projectId) {
      return [];
    }
    try {
      const db = await getDb();
      const samples = await db.getAllFromIndex(
        STORE_NAMES.SAMPLES,
        'by-projectId',
        projectId
      );
      return samples.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw toStorageError(error, 'Failed to list samples.');
    }
  },

  async listSamplesByLabel(labelId: string): Promise<SampleRecord[]> {
    if (!labelId) {
      return [];
    }
    try {
      const db = await getDb();
      const samples = await db.getAllFromIndex(
        STORE_NAMES.SAMPLES,
        'by-labelId',
        labelId
      );
      return samples.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw toStorageError(error, 'Failed to list samples by label.');
    }
  },

  async addSample(input: CreateSampleInput): Promise<SampleRecord> {
    if (
      !input ||
      typeof input.dataUrl !== 'string' ||
      input.dataUrl.trim().length === 0
    ) {
      throw new StorageError(
        'VALIDATION_ERROR',
        'Sample dataUrl is required.',
        { reason: 'INVALID_SAMPLE' }
      );
    }
    if (
      !Number.isFinite(input.width) ||
      !Number.isFinite(input.height) ||
      input.width <= 0 ||
      input.height <= 0
    ) {
      throw new StorageError(
        'VALIDATION_ERROR',
        'Sample dimensions must be positive.',
        { reason: 'INVALID_SAMPLE' }
      );
    }
    if (!VALID_MIME_TYPES.has(input.mimeType)) {
      throw new StorageError(
        'VALIDATION_ERROR',
        `Unsupported mimeType: ${String(input.mimeType)}`,
        { reason: 'INVALID_SAMPLE' }
      );
    }
    if (!VALID_SAMPLE_SOURCES.has(input.source)) {
      throw new StorageError(
        'VALIDATION_ERROR',
        `Unsupported sample source: ${String(input.source)}`,
        { reason: 'INVALID_SAMPLE' }
      );
    }
    if (!input.projectId) {
      throw new StorageError('NOT_FOUND', 'Project ID is required.');
    }
    if (!input.labelId) {
      throw new StorageError('NOT_FOUND', 'Label ID is required.');
    }

    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        const project = await tx
          .objectStore(STORE_NAMES.PROJECTS)
          .get(input.projectId);
        if (!project) {
          throw new StorageError(
            'NOT_FOUND',
            `Project "${input.projectId}" not found.`
          );
        }

        const label = await tx
          .objectStore(STORE_NAMES.LABELS)
          .get(input.labelId);
        if (!label) {
          throw new StorageError(
            'NOT_FOUND',
            `Label "${input.labelId}" not found.`
          );
        }
        if (label.projectId !== input.projectId) {
          throw new StorageError(
            'VALIDATION_ERROR',
            `Label "${input.labelId}" does not belong to project "${input.projectId}".`,
            { reason: 'INVALID_RELATION' }
          );
        }

        const now = Date.now();
        const sample: SampleRecord = {
          projectId: input.projectId,
          labelId: input.labelId,
          dataUrl: input.dataUrl,
          mimeType: input.mimeType,
          width: input.width,
          height: input.height,
          source: input.source,
          id: generateId(),
          createdAt: now,
        };

        await tx.objectStore(STORE_NAMES.SAMPLES).put(sample);
        await tx.objectStore(STORE_NAMES.PROJECTS).put({
          ...project,
          updatedAt: now,
        });
        await tx.done;
        return sample;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to add sample.');
    }
  },

  async deleteSample(sampleId: string): Promise<void> {
    if (!sampleId) {
      return;
    }
    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.SAMPLES],
        'readwrite'
      );
      tx.done.catch(() => {});
      try {
        const sample = await tx.objectStore(STORE_NAMES.SAMPLES).get(sampleId);
        if (!sample) {
          await tx.done;
          return;
        }

        await tx.objectStore(STORE_NAMES.SAMPLES).delete(sampleId);

        const project = await tx
          .objectStore(STORE_NAMES.PROJECTS)
          .get(sample.projectId);
        if (project) {
          await tx.objectStore(STORE_NAMES.PROJECTS).put({
            ...project,
            updatedAt: Date.now(),
          });
        }

        await tx.done;
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already completed or aborted.
        }
        throw err;
      }
    } catch (error) {
      throw toStorageError(error, 'Failed to delete sample.');
    }
  },

  async getProjectCounts(projectId: string): Promise<ProjectCounts> {
    if (!projectId) {
      return { labelCount: 0, sampleCount: 0 };
    }
    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readonly'
      );
      const [labelCount, sampleCount] = await Promise.all([
        tx.objectStore(STORE_NAMES.LABELS).index('by-projectId').count(projectId),
        tx
          .objectStore(STORE_NAMES.SAMPLES)
          .index('by-projectId')
          .count(projectId),
      ]);
      await tx.done;
      return { labelCount, sampleCount };
    } catch (error) {
      throw toStorageError(error, 'Failed to get project counts.');
    }
  },

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    try {
      const db = await getDb();
      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readonly'
      );
      const projects = await tx.objectStore(STORE_NAMES.PROJECTS).getAll();
      projects.sort(
        (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
      );

      const labelIndex = tx.objectStore(STORE_NAMES.LABELS).index('by-projectId');
      const sampleIndex = tx
        .objectStore(STORE_NAMES.SAMPLES)
        .index('by-projectId');

      const summaries = await Promise.all(
        projects.map(async (project) => {
          const [labels, sampleCount] = await Promise.all([
            labelIndex.getAll(project.id),
            sampleIndex.count(project.id),
          ]);
          labels.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
          return {
            project,
            labelCount: labels.length,
            sampleCount,
            labelNames: labels.map((l) => l.name),
          };
        })
      );

      await tx.done;
      return summaries;
    } catch (error) {
      throw toStorageError(error, 'Failed to list project summaries.');
    }
  },
};

export { StorageError, closeDb, isStorageError };
