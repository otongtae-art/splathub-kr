'use client';

/**
 * `splathub.captures` IndexedDB store — 촬영된 사진 File[] 을 안전하게 보관.
 *
 * 왜 IndexedDB:
 *   - window 변수: 페이지 리로드 시 사라짐 (이전 버그)
 *   - sessionStorage: 문자열만 저장 가능, File 저장 불가
 *   - localStorage: 용량 5MB 제한 (사진 20장 = 40MB 가능)
 *   - IndexedDB: Blob/File 원본 저장, 용량 GB 단위, 리로드 survival ✓
 *
 * API:
 *   saveCaptures(files, meta?) : Promise<string>  세션 ID 반환
 *   loadCaptures(sessionId)    : Promise<{files, meta} | null>
 *   clearCaptures(sessionId)   : Promise<void>
 *   getLatestSession()         : Promise<string | null>
 */

const DB_NAME = 'splathub';
const STORE_NAME = 'captures';
const DB_VERSION = 1;

export type CaptureMeta = {
  count: number;
  sectorsCovered?: number;
  orientations?: Array<{ alpha: number; beta: number; gamma: number } | null>;
  /** sharpness 필터로 자동 제외된 흐림 사진 수 (round 7+) */
  droppedBlurry?: number;
  /** 각 kept file 의 sharpness 점수 (files 와 같은 순서). round 20+ */
  sharpnessScores?: number[];
  timestamp: number;
};

type CaptureRecord = {
  id: string;
  files: File[];
  /** R7 흐림 자동 제외된 사진들 — train 페이지에서 디버깅 미리보기용 (round 18) */
  droppedFiles?: File[];
  meta: CaptureMeta;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveCaptures(
  files: File[],
  meta: Omit<CaptureMeta, 'timestamp' | 'count'> = {},
  droppedFiles?: File[],
): Promise<string> {
  const db = await openDb();
  const id = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: CaptureRecord = {
    id,
    files,
    droppedFiles,
    meta: {
      count: files.length,
      timestamp: Date.now(),
      ...meta,
    },
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(record);
  });
  db.close();
  // 최신 세션 ID 를 sessionStorage 에도 함께 저장 (빠른 lookup 용)
  try {
    sessionStorage.setItem('splathub:latest-capture', id);
  } catch {
    /* ignore */
  }
  return id;
}

export async function loadCaptures(
  sessionId: string,
): Promise<{ files: File[]; droppedFiles?: File[]; meta: CaptureMeta } | null> {
  const db = await openDb();
  const record = await new Promise<CaptureRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => resolve(req.result as CaptureRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!record) return null;
  return {
    files: record.files,
    droppedFiles: record.droppedFiles,
    meta: record.meta,
  };
}

export async function clearCaptures(sessionId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(sessionId);
  });
  db.close();
}

export function getLatestSessionId(): string | null {
  try {
    return sessionStorage.getItem('splathub:latest-capture');
  } catch {
    return null;
  }
}

/**
 * 오래된 세션 (24 시간+) 자동 정리 — 스토리지 누적 방지.
 */
export async function pruneOldCaptures(maxAgeMs: number = 24 * 3600 * 1000) {
  const db = await openDb();
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const rec = cursor.value as CaptureRecord;
      if (now - rec.meta.timestamp > maxAgeMs) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
  db.close();
}
