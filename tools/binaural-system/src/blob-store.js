/* ============================================================
   NANOOK RESET — Archivos binarios en IndexedDB (window.NanookBlobs)
   Para archivos grandes que NO deben vivir en localStorage (ahí la
   cuota es de ~5 MB y un solo audio en base64 la llenaba).
   Claves separadas por perfil. Base de datos propia, aparte de la de
   fotos (photo-store.js), para no tocar su versión ni su esquema.
   Nota: estos archivos viven solo en este dispositivo (no se sincronizan).
   ============================================================ */

window.NanookBlobs = (function() {
  const DB_NAME = 'binaural-system-files-v1';
  const STORE   = 'files';
  let _dbP = null;

  function _db() {
    if (_dbP) return _dbP;
    _dbP = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    });
    _dbP.catch(() => { _dbP = null; }); // permitir reintentar
    return _dbP;
  }

  function _key(id) {
    const sk = (window._getStoreKey && window._getStoreKey()) || 'binaural-system-v1';
    return sk + ':' + id;
  }

  function _tx(mode, fn) {
    return _db().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const st = tx.objectStore(STORE);
      const r  = fn(st);
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      tx.onerror    = () => reject(tx.error || new Error('Error de IndexedDB'));
      tx.onabort    = () => reject(tx.error || new Error('Operación cancelada (¿espacio lleno?)'));
    }));
  }

  return {
    put: (id, blob) => _tx('readwrite', st => st.put(blob, _key(id))),
    get: (id)       => _tx('readonly',  st => st.get(_key(id))),
    del: (id)       => _tx('readwrite', st => st.delete(_key(id))),
  };
})();

export const blobStore = window.NanookBlobs;
