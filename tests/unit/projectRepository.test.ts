import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TRAINING_CONFIG,
  type CreateSampleInput,
} from '../../src/types/domain';
import { resetDbForTests } from '../../src/storage/db';
import {
  LABEL_COLOR_PALETTE,
  MAX_LABEL_NAME_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  StorageError,
  closeDb,
  normalizeLabelComparisonKey,
  projectRepository,
  sanitizeDisplayName,
} from '../../src/storage/projectRepository';

function makeSampleInput(
  projectId: string,
  labelId: string,
  overrides: Partial<CreateSampleInput> = {}
): CreateSampleInput {
  return {
    projectId,
    labelId,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    mimeType: 'image/jpeg',
    width: 224,
    height: 224,
    source: 'drawing',
    ...overrides,
  };
}

describe('projectRepository', () => {
  let tick = 1_700_000_000_000;

  beforeEach(async () => {
    tick = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => ++tick);
    await resetDbForTests();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDbForTests();
  });

  describe('Project CRUD and ordering', () => {
    it('returns an empty list initially', async () => {
      await expect(projectRepository.listProjects()).resolves.toEqual([]);
    });

    it('creates a project with trimmed name, default training config, and empty reactions', async () => {
      const created = await projectRepository.createProject(
        '  Meyve Tanıyıcı  '
      );

      expect(created.id).toBeTruthy();
      expect(created.name).toBe('Meyve Tanıyıcı');
      expect(created.createdAt).toBe(created.updatedAt);
      expect(created.trainingConfig).toEqual(DEFAULT_TRAINING_CONFIG);
      expect(created.reactions).toEqual({});

      const fetched = await projectRepository.getProject(created.id);
      expect(fetched).toEqual(created);
      await expect(
        projectRepository.getProject('non-existent-id')
      ).resolves.toBeUndefined();
    });

    it('updates project fields, preserves createdAt, advances updatedAt, and sorts most-recently-updated first', async () => {
      const p1 = await projectRepository.createProject('Birinci Proje');
      const p2 = await projectRepository.createProject('İkinci Proje');

      const initialOrder = await projectRepository.listProjects();
      expect(initialOrder.map((p) => p.id)).toEqual([p2.id, p1.id]);

      const updatedP1 = await projectRepository.updateProject({
        ...p1,
        name: '  Güncel Proje  ',
        trainingConfig: { epochs: 35, batchSize: 8, learningRate: 0.005 },
        lastTrainedAt: 1_700_000_009_999,
        trainedLabelOrder: ['lbl-a', 'lbl-b'],
        reactions: {
          'lbl-a': {
            labelId: 'lbl-a',
            message: 'Elma algılandı!',
            backgroundColor: '#fef2f2',
            accentColor: '#dc2626',
            sound: 'chime',
            enableCounter: true,
          },
        },
      });

      expect(updatedP1.name).toBe('Güncel Proje');
      expect(updatedP1.createdAt).toBe(p1.createdAt);
      expect(updatedP1.updatedAt).toBeGreaterThan(p2.updatedAt);
      expect(updatedP1.trainingConfig).toEqual({
        epochs: 35,
        batchSize: 8,
        learningRate: 0.005,
      });
      expect(updatedP1.lastTrainedAt).toBe(1_700_000_009_999);
      expect(updatedP1.trainedLabelOrder).toEqual(['lbl-a', 'lbl-b']);
      expect(updatedP1.reactions['lbl-a']?.message).toBe('Elma algılandı!');

      const reordered = await projectRepository.listProjects();
      expect(reordered.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });

    it('throws NOT_FOUND when updating a missing project and VALIDATION_ERROR for out-of-bounds trainingConfig', async () => {
      await expect(
        projectRepository.updateProject({
          id: 'missing',
          name: 'Test',
          createdAt: 1,
          updatedAt: 1,
          trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
          reactions: {},
        })
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof StorageError && err.code === 'NOT_FOUND'
      );

      const p = await projectRepository.createProject('Config Test');
      await expect(
        projectRepository.updateProject({
          ...p,
          trainingConfig: { epochs: 0, batchSize: 16, learningRate: 0.001 },
        })
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'INVALID_TRAINING_CONFIG'
      );

      await expect(
        projectRepository.updateProject({
          ...p,
          trainingConfig: { epochs: 20, batchSize: 256, learningRate: 0.001 },
        })
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'VALIDATION_ERROR'
      );

      await expect(
        projectRepository.updateProject({
          ...p,
          trainingConfig: { epochs: 20, batchSize: 16, learningRate: 0 },
        })
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'VALIDATION_ERROR'
      );
    });
  });

  describe('Turkish Unicode preservation and name validation', () => {
    it('preserves full Turkish Unicode characters verbatim in projects and labels', async () => {
      const fullTurkish = 'ÇĞIÖŞÜ çğıöşü Çiçek Şişe Gözlük Üzüm İnek Işık';
      const project = await projectRepository.createProject(
        `  ${fullTurkish}  `
      );
      expect(project.name).toBe(fullTurkish);
      expect(project.name.length).toBeLessThanOrEqual(MAX_PROJECT_NAME_LENGTH);

      const labelNames = [
        'Çiçek & Böcek',
        'Şişe',
        'Gözlük',
        'Üzüm',
        'İnek',
        'Işık',
        'Ağaç ÇĞİÖŞÜ çğıöşü',
      ];
      for (const name of labelNames) {
        const created = await projectRepository.createLabel(project.id, name);
        expect(created.name).toBe(name);
      }

      const stored = await projectRepository.listLabels(project.id);
      expect(stored.map((l) => l.name)).toEqual(labelNames);

      // Verify NFC normalization preserves canonical Turkish form
      const decomposed = 'C\u0327ic\u0327ek'.normalize('NFD');
      expect(sanitizeDisplayName(decomposed)).toBe('Çiçek');
      expect(normalizeLabelComparisonKey('İNEK')).toBe('inek');
      expect(normalizeLabelComparisonKey('IŞIK')).toBe('ışık');
    });

    it('rejects empty/whitespace names and names exceeding max lengths, while accepting boundary lengths', async () => {
      const p = await projectRepository.createProject('Sınır Testi');

      for (const blank of ['', '   ', '\t\n  ']) {
        await expect(
          projectRepository.createProject(blank)
        ).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof StorageError &&
            err.code === 'VALIDATION_ERROR' &&
            err.reason === 'NAME_REQUIRED'
        );

        await expect(
          projectRepository.createLabel(p.id, blank)
        ).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof StorageError &&
            err.code === 'VALIDATION_ERROR' &&
            err.reason === 'NAME_REQUIRED'
        );
      }

      const maxProjectName = 'Ş'.repeat(MAX_PROJECT_NAME_LENGTH);
      const validMaxProject = await projectRepository.createProject(
        maxProjectName
      );
      expect(validMaxProject.name).toHaveLength(MAX_PROJECT_NAME_LENGTH);

      await expect(
        projectRepository.createProject('Ş'.repeat(MAX_PROJECT_NAME_LENGTH + 1))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'NAME_TOO_LONG'
      );

      const maxLabelName = 'ğ'.repeat(MAX_LABEL_NAME_LENGTH);
      const validMaxLabel = await projectRepository.createLabel(
        p.id,
        maxLabelName
      );
      expect(validMaxLabel.name).toHaveLength(MAX_LABEL_NAME_LENGTH);

      await expect(
        projectRepository.createLabel(p.id, 'ğ'.repeat(MAX_LABEL_NAME_LENGTH + 1))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'NAME_TOO_LONG'
      );
    });
  });

  describe('Label CRUD, deterministic colors, monotonic order, and Turkish duplicate checks', () => {
    it('rejects Turkish case-insensitive duplicate labels within the same project', async () => {
      const project = await projectRepository.createProject('Etiket Projesi');

      await projectRepository.createLabel(project.id, 'Elma');
      await projectRepository.createLabel(project.id, 'Çiçek');
      await projectRepository.createLabel(project.id, 'Şişe');
      await projectRepository.createLabel(project.id, 'Gözlük');
      await projectRepository.createLabel(project.id, 'Üzüm');
      await projectRepository.createLabel(project.id, 'İnek');
      await projectRepository.createLabel(project.id, 'Işık');

      const duplicates = [
        'elma',
        '  ELMA  ',
        'çiçek',
        'şişe',
        'gözlük',
        'üzüm',
        'inek',
        'ışık',
      ];
      for (const dup of duplicates) {
        await expect(
          projectRepository.createLabel(project.id, dup)
        ).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof StorageError && err.code === 'DUPLICATE_NAME'
        );
      }

      // Same label name is allowed in a separate project
      const otherProject = await projectRepository.createProject('Diğer Proje');
      const otherLabel = await projectRepository.createLabel(
        otherProject.id,
        'elma'
      );
      expect(otherLabel.name).toBe('elma');
    });

    it('allows case-only self-rename, rejects sibling duplicate rename, and advances project.updatedAt', async () => {
      const project = await projectRepository.createProject('Yeniden Adlandır');
      const l1 = await projectRepository.createLabel(project.id, 'elma');
      await projectRepository.createLabel(project.id, 'Armut');

      const beforeRename = await projectRepository.getProject(project.id);
      const renamed = await projectRepository.renameLabel(l1.id, '  Elma  ');
      expect(renamed.name).toBe('Elma');

      const afterRename = await projectRepository.getProject(project.id);
      expect(afterRename!.updatedAt).toBeGreaterThan(beforeRename!.updatedAt);

      await expect(
        projectRepository.renameLabel(l1.id, 'armut')
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'DUPLICATE_NAME'
      );

      await expect(
        projectRepository.renameLabel('missing-label', 'Yeni')
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'NOT_FOUND'
      );
    });

    it('assigns non-colliding palette colors and monotonic order even after middle deletions', async () => {
      const project = await projectRepository.createProject('Renk ve Sıra');
      const l0 = await projectRepository.createLabel(project.id, 'Etiket 0');
      const l1 = await projectRepository.createLabel(project.id, 'Etiket 1');
      const l2 = await projectRepository.createLabel(project.id, 'Etiket 2');

      expect([l0.order, l1.order, l2.order]).toEqual([0, 1, 2]);
      expect([l0.color, l1.color, l2.color]).toEqual([
        LABEL_COLOR_PALETTE[0],
        LABEL_COLOR_PALETTE[1],
        LABEL_COLOR_PALETTE[2],
      ]);

      // Delete middle label (order 1, color index 1)
      await projectRepository.deleteLabel(l1.id);

      const l3 = await projectRepository.createLabel(project.id, 'Etiket 3');
      expect(l3.order).toBe(3);
      expect(l3.color).toBe(LABEL_COLOR_PALETTE[1]);

      // Create remaining up to 11 labels to verify cycling past palette length
      for (let i = 4; i <= 11; i++) {
        await projectRepository.createLabel(project.id, `Etiket ${i}`);
      }
      const allLabels = await projectRepository.listLabels(project.id);
      expect(allLabels).toHaveLength(11);
      expect(new Set(allLabels.slice(0, 10).map((l) => l.color)).size).toBe(10);
    });
  });

  describe('Sample CRUD and integrity checks', () => {
    it('adds samples, sorts chronologically, advances project.updatedAt, and deletes individually', async () => {
      const project = await projectRepository.createProject('Örnek Testi');
      const labelA = await projectRepository.createLabel(project.id, 'Kedi');
      const labelB = await projectRepository.createLabel(project.id, 'Köpek');

      const s1 = await projectRepository.addSample(
        makeSampleInput(project.id, labelA.id, { source: 'drawing' })
      );
      const s2 = await projectRepository.addSample(
        makeSampleInput(project.id, labelB.id, {
          source: 'upload',
          mimeType: 'image/png',
        })
      );
      const s3 = await projectRepository.addSample(
        makeSampleInput(project.id, labelA.id, {
          source: 'webcam',
          mimeType: 'image/webp',
        })
      );

      expect(s1.createdAt).toBeLessThan(s2.createdAt);
      expect(s2.createdAt).toBeLessThan(s3.createdAt);

      const allSamples = await projectRepository.listSamples(project.id);
      expect(allSamples.map((s) => s.id)).toEqual([s1.id, s2.id, s3.id]);

      const labelASamples = await projectRepository.listSamplesByLabel(
        labelA.id
      );
      expect(labelASamples.map((s) => s.id)).toEqual([s1.id, s3.id]);

      const beforeDelete = await projectRepository.getProject(project.id);
      await projectRepository.deleteSample(s1.id);
      const afterDelete = await projectRepository.getProject(project.id);

      expect(afterDelete!.updatedAt).toBeGreaterThan(beforeDelete!.updatedAt);
      expect(
        (await projectRepository.listSamplesByLabel(labelA.id)).map((s) => s.id)
      ).toEqual([s3.id]);

      // Idempotent delete on missing sample
      await expect(
        projectRepository.deleteSample('missing-sample')
      ).resolves.toBeUndefined();
    });

    it('rejects invalid sample payloads, missing relations, and cross-project label mismatch', async () => {
      const p1 = await projectRepository.createProject('Proje 1');
      const p2 = await projectRepository.createProject('Proje 2');
      const l1 = await projectRepository.createLabel(p1.id, 'Sınıf A');
      const l2 = await projectRepository.createLabel(p2.id, 'Sınıf B');

      await expect(
        projectRepository.addSample(
          makeSampleInput(p1.id, l1.id, { dataUrl: '   ' })
        )
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'INVALID_SAMPLE'
      );

      await expect(
        projectRepository.addSample(
          makeSampleInput(p1.id, l1.id, { width: 0, height: 224 })
        )
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'INVALID_SAMPLE'
      );

      await expect(
        projectRepository.addSample(makeSampleInput('missing-proj', l1.id))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'NOT_FOUND'
      );

      await expect(
        projectRepository.addSample(makeSampleInput(p1.id, 'missing-label'))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'NOT_FOUND'
      );

      await expect(
        projectRepository.addSample(makeSampleInput(p1.id, l2.id))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError &&
          err.code === 'VALIDATION_ERROR' &&
          err.reason === 'INVALID_RELATION'
      );
    });
  });

  describe('Atomic cascade deletes and stale metadata cleanup', () => {
    it('deleteLabel cascades to samples and removes stale reactions and trainedLabelOrder entries', async () => {
      const project = await projectRepository.createProject('Cascade Etiket');
      const l1 = await projectRepository.createLabel(project.id, 'Çiçek');
      const l2 = await projectRepository.createLabel(project.id, 'Yaprak');

      await projectRepository.addSample(makeSampleInput(project.id, l1.id));
      await projectRepository.addSample(makeSampleInput(project.id, l1.id));
      const s2 = await projectRepository.addSample(
        makeSampleInput(project.id, l2.id)
      );

      const latest = (await projectRepository.getProject(project.id))!;
      await projectRepository.updateProject({
        ...latest,
        lastTrainedAt: 1_700_000_005_000,
        trainedLabelOrder: [l1.id, l2.id],
        reactions: {
          [l1.id]: {
            labelId: l1.id,
            message: 'Çiçek!',
            backgroundColor: '#fff',
            accentColor: '#2563eb',
            sound: 'pop',
            enableCounter: true,
          },
          [l2.id]: {
            labelId: l2.id,
            message: 'Yaprak!',
            backgroundColor: '#fff',
            accentColor: '#047857',
            sound: 'chime',
            enableCounter: false,
          },
        },
      });

      await projectRepository.deleteLabel(l1.id);

      const remainingLabels = await projectRepository.listLabels(project.id);
      expect(remainingLabels.map((l) => l.id)).toEqual([l2.id]);

      expect(await projectRepository.listSamplesByLabel(l1.id)).toEqual([]);
      expect((await projectRepository.listSamples(project.id)).map((s) => s.id)).toEqual([
        s2.id,
      ]);

      const updatedProject = (await projectRepository.getProject(project.id))!;
      expect(updatedProject.reactions[l1.id]).toBeUndefined();
      expect(updatedProject.reactions[l2.id]?.message).toBe('Yaprak!');
      expect(updatedProject.trainedLabelOrder).toEqual([l2.id]);

      // Idempotent on missing label
      await expect(
        projectRepository.deleteLabel('non-existent')
      ).resolves.toBeUndefined();
    });

    it('deleteProject atomically removes project, labels, and samples without touching other projects', async () => {
      const p1 = await projectRepository.createProject('Silinecek');
      const p2 = await projectRepository.createProject('Korunacak');

      const l1 = await projectRepository.createLabel(p1.id, 'A');
      const l2 = await projectRepository.createLabel(p2.id, 'B');
      await projectRepository.addSample(makeSampleInput(p1.id, l1.id));
      await projectRepository.addSample(makeSampleInput(p1.id, l1.id));
      const p2Sample = await projectRepository.addSample(
        makeSampleInput(p2.id, l2.id)
      );

      await projectRepository.deleteProject(p1.id);

      expect(await projectRepository.getProject(p1.id)).toBeUndefined();
      expect(await projectRepository.listLabels(p1.id)).toEqual([]);
      expect(await projectRepository.listSamples(p1.id)).toEqual([]);

      expect(await projectRepository.getProject(p2.id)).toBeDefined();
      expect(await projectRepository.listLabels(p2.id)).toHaveLength(1);
      expect(
        (await projectRepository.listSamples(p2.id)).map((s) => s.id)
      ).toEqual([p2Sample.id]);

      // Idempotent on missing project
      await expect(
        projectRepository.deleteProject('missing-project')
      ).resolves.toBeUndefined();
    });
  });

  describe('Reload persistence simulation, counts summary, and QuotaExceededError handling', () => {
    it('persists Turkish projects, labels, samples, reactions, and counts across closeDb() reload', async () => {
      const project = await projectRepository.createProject('Kalıcılık Testi');
      const cicek = await projectRepository.createLabel(project.id, 'Çiçek');
      const sise = await projectRepository.createLabel(project.id, 'Şişe');

      const s1 = await projectRepository.addSample(
        makeSampleInput(project.id, cicek.id, {
          source: 'drawing',
          dataUrl: 'data:image/png;base64,DRAWING1',
        })
      );
      const s2 = await projectRepository.addSample(
        makeSampleInput(project.id, sise.id, {
          source: 'upload',
          mimeType: 'image/webp',
          dataUrl: 'data:image/webp;base64,UPLOAD2',
        })
      );

      const current = (await projectRepository.getProject(project.id))!;
      await projectRepository.updateProject({
        ...current,
        lastTrainedAt: 1_700_000_012_345,
        trainedLabelOrder: [cicek.id, sise.id],
        reactions: {
          [cicek.id]: {
            labelId: cicek.id,
            message: 'Güzel çiçek!',
            backgroundColor: '#ecfdf5',
            accentColor: '#047857',
            sound: 'success',
            enableCounter: true,
          },
        },
      });

      // Simulate full page reload by closing the IDB singleton connection
      await closeDb();

      const reloaded = await projectRepository.getProject(project.id);
      expect(reloaded?.name).toBe('Kalıcılık Testi');
      expect(reloaded?.lastTrainedAt).toBe(1_700_000_012_345);
      expect(reloaded?.trainedLabelOrder).toEqual([cicek.id, sise.id]);
      expect(reloaded?.reactions[cicek.id]?.message).toBe('Güzel çiçek!');

      const labels = await projectRepository.listLabels(project.id);
      expect(labels.map((l) => l.name)).toEqual(['Çiçek', 'Şişe']);

      const samples = await projectRepository.listSamples(project.id);
      expect(samples.map((s) => s.id)).toEqual([s1.id, s2.id]);
      expect(samples[0]?.dataUrl).toBe('data:image/png;base64,DRAWING1');
      expect(samples[1]?.dataUrl).toBe('data:image/webp;base64,UPLOAD2');

      expect(await projectRepository.getProjectCounts(project.id)).toEqual({
        labelCount: 2,
        sampleCount: 2,
      });

      const summaries = await projectRepository.listProjectSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        labelCount: 2,
        sampleCount: 2,
        labelNames: ['Çiçek', 'Şişe'],
      });
    });

    it('updates getProjectCounts and listProjectSummaries accurately across mutations', async () => {
      const p1 = await projectRepository.createProject('Proje Alfa');
      expect(await projectRepository.getProjectCounts(p1.id)).toEqual({
        labelCount: 0,
        sampleCount: 0,
      });

      const l1 = await projectRepository.createLabel(p1.id, 'Sınıf 1');
      const l2 = await projectRepository.createLabel(p1.id, 'Sınıf 2');
      const s1 = await projectRepository.addSample(makeSampleInput(p1.id, l1.id));
      await projectRepository.addSample(makeSampleInput(p1.id, l1.id));
      await projectRepository.addSample(makeSampleInput(p1.id, l1.id));
      await projectRepository.addSample(makeSampleInput(p1.id, l2.id));
      await projectRepository.addSample(makeSampleInput(p1.id, l2.id));

      expect(await projectRepository.getProjectCounts(p1.id)).toEqual({
        labelCount: 2,
        sampleCount: 5,
      });

      await projectRepository.deleteSample(s1.id);
      expect(await projectRepository.getProjectCounts(p1.id)).toEqual({
        labelCount: 2,
        sampleCount: 4,
      });

      await projectRepository.deleteLabel(l2.id);
      expect(await projectRepository.getProjectCounts(p1.id)).toEqual({
        labelCount: 1,
        sampleCount: 2,
      });

      const p2 = await projectRepository.createProject('Proje Beta');
      const summaries = await projectRepository.listProjectSummaries();
      expect(summaries.map((s) => s.project.id)).toEqual([p2.id, p1.id]);
      expect(summaries[0]).toMatchObject({
        labelCount: 0,
        sampleCount: 0,
        labelNames: [],
      });
      expect(summaries[1]).toMatchObject({
        labelCount: 1,
        sampleCount: 2,
        labelNames: ['Sınıf 1'],
      });
    });

    it('translates QuotaExceededError cleanly to StorageError(QUOTA_EXCEEDED) with zero partial writes', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const project = await projectRepository.createProject('Kota Testi');
      const label = await projectRepository.createLabel(project.id, 'Örnek');

      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      await expect(
        projectRepository.addSample(makeSampleInput(project.id, label.id))
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof StorageError && err.code === 'QUOTA_EXCEEDED'
      );

      expect(await projectRepository.listSamples(project.id)).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
