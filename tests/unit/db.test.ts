import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  StorageError,
  closeDb,
  getDb,
  isIndexedDbAvailable,
  isStorageError,
  resetDbForTests,
  toStorageError,
} from '../../src/storage/db';

describe('storage/db', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDbForTests();
  });

  describe('getDb(), closeDb(), and resetDbForTests()', () => {
    it('opens the v1 database with expected object stores and indexes', async () => {
      const db = await getDb();

      expect(db.name).toBe(DB_NAME);
      expect(db.version).toBe(DB_VERSION);
      expect(Array.from(db.objectStoreNames).sort()).toEqual([
        STORE_NAMES.LABELS,
        STORE_NAMES.PROJECTS,
        STORE_NAMES.SAMPLES,
      ]);

      const tx = db.transaction(
        [STORE_NAMES.PROJECTS, STORE_NAMES.LABELS, STORE_NAMES.SAMPLES],
        'readonly'
      );
      expect(
        Array.from(tx.objectStore(STORE_NAMES.PROJECTS).indexNames)
      ).toEqual(['by-updatedAt']);
      expect(Array.from(tx.objectStore(STORE_NAMES.LABELS).indexNames)).toEqual(
        ['by-projectId']
      );
      expect(
        Array.from(tx.objectStore(STORE_NAMES.SAMPLES).indexNames).sort()
      ).toEqual(['by-labelId', 'by-projectId']);
      await tx.done;
    });

    it('returns the same singleton promise and database connection for concurrent getDb() calls', async () => {
      const p1 = getDb();
      const p2 = getDb();
      expect(p1).toBe(p2);

      const [db1, db2] = await Promise.all([p1, p2]);
      expect(db1).toBe(db2);
    });

    it('reopens cleanly after closeDb() and wipes all data on resetDbForTests()', async () => {
      const db1 = await getDb();
      await db1.put(STORE_NAMES.PROJECTS, {
        id: 'proj-1',
        name: 'Çiçek Projesi',
        createdAt: 100,
        updatedAt: 100,
        trainingConfig: { epochs: 20, batchSize: 16, learningRate: 0.001 },
        reactions: {},
      });

      await closeDb();
      const db2 = await getDb();
      expect(db2).not.toBe(db1);
      const saved = await db2.get(STORE_NAMES.PROJECTS, 'proj-1');
      expect(saved?.name).toBe('Çiçek Projesi');

      await resetDbForTests();
      const db3 = await getDb();
      const afterReset = await db3.getAll(STORE_NAMES.PROJECTS);
      expect(afterReset).toEqual([]);
    });

    it('rejects with UNAVAILABLE when indexedDB is missing or throws SecurityError, and recovers once available', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'indexedDB'
      );

      try {
        Object.defineProperty(globalThis, 'indexedDB', {
          configurable: true,
          get() {
            throw new DOMException('Access denied', 'SecurityError');
          },
        });

        expect(isIndexedDbAvailable()).toBe(false);
        await expect(getDb()).rejects.toSatisfy(
          (err: unknown) => isStorageError(err) && err.code === 'UNAVAILABLE'
        );
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
        }
      }

      expect(isIndexedDbAvailable()).toBe(true);
      const recovered = await getDb();
      expect(recovered.name).toBe(DB_NAME);
    });

    it('recovers cleanly if open fails transiently and never caches rejected promises', async () => {
      const openSpy = vi
        .spyOn(globalThis.indexedDB, 'open')
        .mockImplementationOnce(() => {
          throw new DOMException('Blocked by private mode', 'SecurityError');
        });

      await expect(getDb()).rejects.toSatisfy(
        (err: unknown) => isStorageError(err) && err.code === 'UNAVAILABLE'
      );
      expect(openSpy).toHaveBeenCalledTimes(1);

      openSpy.mockRestore();
      const db = await getDb();
      expect(db.name).toBe(DB_NAME);
    });

    it('handles closeDb() called while getDb() open is still pending without leaking open connections', async () => {
      const pending = getDb();
      await closeDb();

      await expect(pending).rejects.toSatisfy(
        (err: unknown) => isStorageError(err) && err.code === 'UNAVAILABLE'
      );

      const nextDb = await getDb();
      expect(nextDb.name).toBe(DB_NAME);
    });

    it('emits zero console.error or console.warn calls across open, close, and reset', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await getDb();
      await closeDb();
      await resetDbForTests();

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('toStorageError() and isStorageError()', () => {
    it('preserves an existing StorageError instance unchanged', () => {
      const original = new StorageError('DUPLICATE_NAME', 'Already exists', {
        reason: 'NAME_REQUIRED',
      });
      expect(isStorageError(original)).toBe(true);
      expect(toStorageError(original)).toBe(original);
      expect(original.reason).toBe('NAME_REQUIRED');
    });

    it('translates quota errors across DOMException, Firefox name, legacy code 22, abort message, and nested cause', () => {
      expect(
        toStorageError(new DOMException('Disk full', 'QuotaExceededError')).code
      ).toBe('QUOTA_EXCEEDED');
      expect(
        toStorageError({
          name: 'NS_ERROR_DOM_QUOTA_REACHED',
          message: 'Quota reached',
        }).code
      ).toBe('QUOTA_EXCEEDED');
      expect(
        toStorageError({
          name: 'LegacyError',
          code: 22,
          message: 'Legacy quota',
        }).code
      ).toBe('QUOTA_EXCEEDED');
      expect(
        toStorageError(
          new DOMException('Transaction aborted due to quota limit', 'AbortError')
        ).code
      ).toBe('QUOTA_EXCEEDED');

      const wrapped = new Error('Commit failed', {
        cause: new DOMException('Quota exceeded', 'QuotaExceededError'),
      });
      expect(toStorageError(wrapped).code).toBe('QUOTA_EXCEEDED');
    });

    it('handles cyclic error causes without infinite recursion', () => {
      const cyclic: { name: string; message: string; cause?: unknown } = {
        name: 'CustomError',
        message: 'Cyclic failure',
      };
      cyclic.cause = cyclic;

      const mapped = toStorageError(cyclic);
      expect(mapped).toBeInstanceOf(StorageError);
      expect(mapped.code).toBe('UNKNOWN');
      expect(mapped.message).toBe('Cyclic failure');
    });

    it('maps NotFoundError, validation DOMExceptions, unavailability DOMExceptions, and unknown values', () => {
      expect(
        toStorageError(new DOMException('Missing store', 'NotFoundError')).code
      ).toBe('NOT_FOUND');

      for (const name of [
        'DataError',
        'DataCloneError',
        'SyntaxError',
        'ConstraintError',
      ]) {
        expect(toStorageError(new DOMException('Bad data', name)).code).toBe(
          'VALIDATION_ERROR'
        );
      }

      for (const name of [
        'SecurityError',
        'InvalidStateError',
        'VersionError',
        'NotAllowedError',
        'ReadOnlyError',
        'TransactionInactiveError',
        'InvalidAccessError',
        'UnknownError',
        'AbortError',
      ]) {
        expect(
          toStorageError(new DOMException('Unavailable', name)).code
        ).toBe('UNAVAILABLE');
      }

      const fromString = toStorageError('plain failure');
      expect(fromString.code).toBe('UNKNOWN');
      expect(fromString.message).toBe('plain failure');

      const fromNull = toStorageError(null, 'Fallback message');
      expect(fromNull.code).toBe('UNKNOWN');
      expect(fromNull.message).toBe('Fallback message');
      expect(isStorageError(new Error('not storage'))).toBe(false);
    });
  });
});
