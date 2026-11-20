import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  LabelBucketRecord,
  ProjectRecord,
  SampleRecord,
} from '../types/domain';

export const DB_NAME = 'image-classifier-platform-db';
export const DB_VERSION = 1;

export const STORE_NAMES = {
  PROJECTS: 'projects',
  LABELS: 'labels',
  SAMPLES: 'samples',
} as const;

export interface ClassifierDBSchema extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
    indexes: {
      'by-updatedAt': number;
    };
  };
  labels: {
    key: string;
    value: LabelBucketRecord;
    indexes: {
      'by-projectId': string;
    };
  };
  samples: {
    key: string;
    value: SampleRecord;
    indexes: {
      'by-projectId': string;
      'by-labelId': string;
    };
  };
}

export type ClassifierDB = IDBPDatabase<ClassifierDBSchema>;

export type StorageErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type StorageValidationReason =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'INVALID_RELATION'
  | 'INVALID_TRAINING_CONFIG'
  | 'INVALID_SAMPLE';

export interface StorageErrorOptions extends ErrorOptions {
  reason?: StorageValidationReason;
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly reason?: StorageValidationReason;

  constructor(
    code: StorageErrorCode,
    message: string,
    options?: StorageErrorOptions
  ) {
    super(message, options);
    this.name = 'StorageError';
    this.code = code;
    if (options?.reason !== undefined) {
      this.reason = options.reason;
    }
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

const QUOTA_MESSAGE_PATTERN = /quota|storage limit|disk space/i;

function classifyErrorCode(error: unknown, visited: Set<unknown>): StorageErrorCode {
  if (!error || typeof error !== 'object') {
    return 'UNKNOWN';
  }
  if (visited.has(error)) {
    return 'UNKNOWN';
  }
  visited.add(error);

  const record = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const numericCode = typeof record.code === 'number' ? record.code : undefined;

  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    numericCode === 22
  ) {
    return 'QUOTA_EXCEEDED';
  }

  if (record.cause !== undefined) {
    const causeCode = classifyErrorCode(record.cause, visited);
    if (causeCode === 'QUOTA_EXCEEDED') {
      return 'QUOTA_EXCEEDED';
    }
  }

  if (
    (name === 'AbortError' || name === 'UnknownError') &&
    QUOTA_MESSAGE_PATTERN.test(message)
  ) {
    return 'QUOTA_EXCEEDED';
  }

  switch (name) {
    case 'NotFoundError':
      return 'NOT_FOUND';
    case 'DataError':
    case 'DataCloneError':
    case 'SyntaxError':
    case 'ConstraintError':
      return 'VALIDATION_ERROR';
    case 'SecurityError':
    case 'InvalidStateError':
    case 'VersionError':
    case 'NotAllowedError':
    case 'ReadOnlyError':
    case 'TransactionInactiveError':
    case 'InvalidAccessError':
    case 'UnknownError':
    case 'AbortError':
      return 'UNAVAILABLE';
    default:
      return 'UNKNOWN';
  }
}

export function toStorageError(
  error: unknown,
  fallbackMessage = 'IndexedDB storage operation failed.'
): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  const message =
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
      ? error.message
      : typeof error === 'string' && error.length > 0
        ? error
        : fallbackMessage;

  const code = classifyErrorCode(error, new Set<unknown>());
  return new StorageError(code, message, { cause: error });
}

export function isIndexedDbAvailable(): boolean {
  try {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.indexedDB !== 'undefined' &&
      globalThis.indexedDB !== null &&
      typeof globalThis.indexedDB.open === 'function'
    );
  } catch {
    return false;
  }
}

let dbPromise: Promise<ClassifierDB> | null = null;
let activeDb: ClassifierDB | null = null;

export function getDb(): Promise<ClassifierDB> {
  if (dbPromise) {
    return dbPromise;
  }

  if (!isIndexedDbAvailable()) {
    return Promise.reject(
      new StorageError(
        'UNAVAILABLE',
        'IndexedDB is unavailable in this browser environment.'
      )
    );
  }

  let pendingPromise: Promise<ClassifierDB>;
  try {
    pendingPromise = openDB<ClassifierDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
          const projectsStore = db.createObjectStore(STORE_NAMES.PROJECTS, {
            keyPath: 'id',
          });
          projectsStore.createIndex('by-updatedAt', 'updatedAt', {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.LABELS)) {
          const labelsStore = db.createObjectStore(STORE_NAMES.LABELS, {
            keyPath: 'id',
          });
          labelsStore.createIndex('by-projectId', 'projectId', {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.SAMPLES)) {
          const samplesStore = db.createObjectStore(STORE_NAMES.SAMPLES, {
            keyPath: 'id',
          });
          samplesStore.createIndex('by-projectId', 'projectId', {
            unique: false,
          });
          samplesStore.createIndex('by-labelId', 'labelId', { unique: false });
        }
      },
      blocking() {
        if (activeDb) {
          activeDb.close();
          activeDb = null;
        }
        if (dbPromise === pendingPromise) {
          dbPromise = null;
        }
      },
      terminated() {
        activeDb = null;
        if (dbPromise === pendingPromise) {
          dbPromise = null;
        }
      },
    })
      .then((db) => {
        if (dbPromise !== pendingPromise) {
          db.close();
          throw new StorageError(
            'UNAVAILABLE',
            'Database connection was closed before initialization completed.'
          );
        }
        activeDb = db;
        return db;
      })
      .catch((err) => {
        if (dbPromise === pendingPromise) {
          dbPromise = null;
          activeDb = null;
        }
        throw toStorageError(err, 'Failed to open IndexedDB database.');
      });
  } catch (err) {
    return Promise.reject(
      toStorageError(err, 'Failed to open IndexedDB database.')
    );
  }

  dbPromise = pendingPromise;
  return pendingPromise;
}

export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  const current = activeDb;
  dbPromise = null;
  activeDb = null;

  if (current) {
    current.close();
    return;
  }

  if (pending) {
    try {
      const opened = await pending;
      opened.close();
    } catch {
      // Ignore errors from an in-flight open that was cancelled/failed during close.
    }
  }
}

export async function resetDbForTests(): Promise<void> {
  await closeDb();

  if (!isIndexedDbAvailable()) {
    return;
  }

  try {
    await deleteDB(DB_NAME, {
      blocked() {
        // Deliberately silent to satisfy zero-console-error requirement.
      },
    });
  } catch (err) {
    throw toStorageError(err, 'Failed to reset IndexedDB database.');
  }
}
