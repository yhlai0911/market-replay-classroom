// All practice mutations commit through one atomic localStorage value. Legacy keys are read-only.
export const PRACTICE_STORE_KEY = 'market-replay-practices-v1';
export const STORE_KEY = PRACTICE_STORE_KEY;
const SAVE_KEY = 'market-replay-save-v1', BACKUP_KEY = 'market-replay-previous-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const copy = value => JSON.parse(JSON.stringify(value));
function fail(message, code) { const error = new Error(message); error.code = code; throw error; }
function validName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) fail('練習名稱須為 1–100 個字', 'INVALID_NAME');
  return name.trim();
}
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) fail('瀏覽器無法產生安全的練習識別碼', 'UUID_UNAVAILABLE');
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createPracticeStore(storage, { validate } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('Storage is required');
  if (typeof validate !== 'function') throw new TypeError('A save validation callback is required');
  let expected, envelope, loaded = false, blocked = false, corrupt = false;
  function get(key) {
    try { return storage.getItem(key); } catch { fail('瀏覽器無法讀取本機練習；請使用 JSON 備份', 'STORAGE_READ'); }
  }
  function validateSave(save) {
    if (!save || typeof save !== 'object' || Array.isArray(save)) fail('練習存檔格式損壞，原資料已保留', 'CORRUPT');
    const raw = JSON.stringify(save);
    if (validate(raw) === false) fail('練習存檔校驗失敗，原資料已保留', 'CORRUPT');
    return save;
  }
  function decode(raw) {
    let parsed; try { parsed = JSON.parse(raw); } catch { fail('練習紀錄 JSON 損壞，原資料已保留', 'CORRUPT'); }
    if (!parsed || parsed.version !== 1 || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0 || !Array.isArray(parsed.records) || !(parsed.activeId === null || typeof parsed.activeId === 'string')) fail('練習紀錄格式或版本不支援，原資料已保留', 'CORRUPT');
    const ids = new Set();
    for (const record of parsed.records) {
      if (!record || typeof record.id !== 'string' || !UUID.test(record.id) || ids.has(record.id) || typeof record.name !== 'string' || record.name !== validName(record.name) || !(record.deletedAt === null || typeof record.deletedAt === 'string' && Number.isFinite(Date.parse(record.deletedAt)))) fail('練習紀錄識別碼或名稱損壞，原資料已保留', 'CORRUPT');
      ids.add(record.id); validateSave(record.save);
      if (record.save.practice?.id !== record.id || record.save.practice?.name !== record.name) fail('練習名稱與存檔資料不一致，原資料已保留', 'CORRUPT');
    }
    if (parsed.activeId !== null && !parsed.records.some(record => record.id === parsed.activeId && record.deletedAt === null)) fail('目前練習指標損壞，原資料已保留', 'CORRUPT');
    return parsed;
  }
  function makeRecord(save, records, name, uniqueName=false) {
    validateSave(save);
    let id; do { id = uuid(); } while (records.some(record => record.id === id));
    let displayName = name ?? (typeof save.practice?.name === 'string' && save.practice.name.trim() ? validName(save.practice.name) : `練習 ${records.length + 1}`);
    if(uniqueName){const base=displayName;let copyNumber=2;while(records.some(r=>r.name===displayName)){const suffix=`（副本 ${copyNumber++}）`;displayName=base.slice(0,100-suffix.length)+suffix;}}
    const stored = copy(save); stored.practice = { id, name: displayName };
    validateSave(stored);
    return { id, name: displayName, save: stored, deletedAt: null };
  }
  function activeRaw(source = envelope) {
    const record = source?.records.find(record => record.id === source.activeId && record.deletedAt === null);
    return record ? JSON.stringify(record.save) : null;
  }
  function assertCurrent() {
    if (get(PRACTICE_STORE_KEY) !== expected) { blocked = true; fail('另一分頁已更新練習紀錄；請先匯出目前進度再重新整理，避免覆蓋', 'CONFLICT'); }
  }
  function commit(next) {
    assertCurrent();
    next.revision = (envelope?.revision ?? 0) + 1;
    const raw = JSON.stringify(next);
    try { storage.setItem(PRACTICE_STORE_KEY, raw); }
    catch { fail('本機保存失敗（空間不足或瀏覽器限制）；原練習與記憶體進度未變更，請立即匯出 JSON 備份', 'STORAGE_WRITE'); }
    envelope = next; expected = raw; loaded = true;
  }
  function ensure() { if (!loaded) read(); }
  function writable(replace = false) {
    ensure();
    if (corrupt) fail('損壞的練習紀錄已保護，不能覆寫；請先保留原始資料', 'CORRUPT');
    if (blocked && !replace) fail('原練習已保護，請先備份並明確開始新局或載入備份', 'LOCKED');
  }
  function recordById(next, id) {
    const record = next.records.find(record => record.id === id);
    if (!record) fail('找不到這份練習', 'NOT_FOUND');
    return record;
  }
  function read() {
    const raw = get(PRACTICE_STORE_KEY);
    if (raw !== null) {
      let parsed;
      try { parsed = decode(raw); } catch (error) { corrupt = true; blocked = true; throw error; }
      envelope = parsed; expected = raw; loaded = true; corrupt = false;
      return activeRaw();
    }
    const legacy = get(SAVE_KEY), backup = get(BACKUP_KEY);
    const next = { version: 1, revision: 0, activeId: null, records: [] };
    try {
      for (const [source, name] of [[legacy, undefined], [backup, '前一份練習（移轉）']]) {
        if (source === null) continue;
        // Validate the original bytes, then preserve every save field, even for identical backups.
        if (validate(source) === false) fail('舊存檔校驗失敗，原資料已保留', 'CORRUPT');
        const record = makeRecord(JSON.parse(source), next.records, name);
        next.records.push(record);
        if (next.activeId === null) next.activeId = record.id;
      }
    } catch (error) { corrupt = true; blocked = true; throw error; }
    // Do not overwrite a legacy edit or a concurrently created multi-practice envelope during migration.
    if (get(PRACTICE_STORE_KEY) !== null || get(SAVE_KEY) !== legacy || get(BACKUP_KEY) !== backup) { blocked = true; fail('另一分頁已更新存檔，請重新整理後再移轉', 'CONFLICT'); }
    if (next.records.length) {
      next.revision = 1; const migration = JSON.stringify(next);
      try { storage.setItem(PRACTICE_STORE_KEY, migration); } catch { fail('舊存檔移轉保存失敗；原存檔與備份均已保留', 'STORAGE_WRITE'); }
      envelope = next; expected = migration;
    } else { envelope = next; expected = null; }
    loaded = true; corrupt = false;
    return activeRaw();
  }
  return {
    read,
    list({ deleted = false } = {}) { ensure(); return copy(envelope.records.filter(record => deleted ? record.deletedAt !== null : record.deletedAt === null)).reverse(); },
    write(save, { replace = false } = {}) {
      writable(replace); const next = copy(envelope); let record;
      if (replace || next.activeId === null) {
        record = makeRecord(save, next.records, undefined, true); next.records.push(record); next.activeId = record.id;
      } else {
        record = recordById(next, next.activeId); const stored = copy(save);
        stored.practice = { id: record.id, name: record.name }; validateSave(stored); record.save = stored;
      }
      commit(next); blocked = false;
      // Export metadata becomes visible to the caller only after successful persistence.
      if (save && typeof save === 'object' && Object.isExtensible(save)) {
        try { save.practice = { id: record.id, name: record.name }; } catch { /* Frozen callers can read the persisted record instead. */ }
      }
      return record.save.updatedAt;
    },
    activate(id) {
      writable(); const next = copy(envelope), record = recordById(next, id);
      if (record.deletedAt !== null) fail('這份練習在垃圾桶，請先還原', 'DELETED');
      next.activeId = id; commit(next); return activeRaw();
    },
    rename(id, name) {
      writable(); const next = copy(envelope), record = recordById(next, id);
      record.name = validName(name); record.save.practice = { id, name: record.name };
      commit(next); return copy(record);
    },
    trash(id) {
      writable(); const next = copy(envelope), record = recordById(next, id);
      if (record.deletedAt === null) record.deletedAt = new Date().toISOString();
      if (next.activeId === id) next.activeId = null;
      commit(next); return activeRaw();
    },
    restore(id) {
      writable(); const next = copy(envelope), record = recordById(next, id); record.deletedAt = null;
      // Restoration does not silently switch the user's current practice.
      commit(next); return copy(record);
    },
    raw() { ensure(); return activeRaw(); },
    previous() { return get(BACKUP_KEY); },
    lock() { blocked = true; }
  };
}
