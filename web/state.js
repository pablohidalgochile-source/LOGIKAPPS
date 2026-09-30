/* Validation shared by browser storage, imports, and the native bridge. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogikappsState = api;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const MAX_BYTES = 8_000_000;
  const CATEGORIES = ['music', 'business', 'personal', 'creative'];
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max, required = false) => {
    if (value !== undefined && typeof value !== 'string') throw new Error('Hay un campo con formato incorrecto.');
    const result = (value || '').trim();
    if (result.length > max || result.includes('\0') || (required && !result)) throw new Error('Hay un texto con formato o tamaño incompatible.');
    return result;
  };
  const validURL = (value) => {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\\\s\p{Cc}\p{Cf}]/u.test(value)) return null;
    const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1];
    if (!authority || authority.includes('@')) return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  const localPath = (value) => value.startsWith('/') && !/[\n\r\0]/.test(value);
  function validateApp(source) {
    if (!object(source)) throw new Error('Hay una app con datos incompletos en el archivo.');
    const app = {
      id: text(source.id, 100, true), name: text(source.name, 100, true),
      description: text(source.description, 2000), category: text(source.category, 30, true),
      kind: text(source.kind, 30, true), target: text(source.target, 4096, true),
      status: text(source.status, 30, true), icon: text(source.icon === undefined ? 'grid' : source.icon, 40),
      favorite: source.favorite === undefined ? false : source.favorite
    };
    if (!CATEGORIES.includes(app.category) || !['ready', 'prototype', 'setup'].includes(app.status) || typeof app.favorite !== 'boolean') throw new Error('Hay una app con colección, estado o favorito incompatible.');
    if (!['app', 'url', 'command', 'folder', 'managed'].includes(app.kind)) throw new Error('El tipo de acceso no es válido.');
    if (app.kind === 'url' && !validURL(app.target)) throw new Error(`El enlace de ${app.name} no es válido.`);
    if (app.kind === 'managed' && app.target !== 'trackhunt') throw new Error('La copia contiene un acceso integrado que no está disponible.');
    if (['app', 'command', 'folder'].includes(app.kind) && !localPath(app.target)) throw new Error(`La ubicación de ${app.name} no es válida.`);
    if (app.kind === 'app' && !/\.app\/?$/i.test(app.target)) throw new Error(`El acceso de ${app.name} debe ser una aplicación .app.`);
    if (app.kind === 'command' && !/\.command\/?$/i.test(app.target)) throw new Error(`El acceso de ${app.name} debe ser un lanzador .command.`);
    for (const key of ['notes', 'sourcePath', 'lastOpenedAt']) {
      if (source[key] !== undefined) app[key] = text(source[key], key === 'lastOpenedAt' ? 60 : 4096);
    }
    if (app.sourcePath && !localPath(app.sourcePath)) throw new Error(`La carpeta de ${app.name} no es válida.`);
    return app;
  }
  function validateIdea(source) {
    if (!object(source)) throw new Error('Hay una idea con datos incompletos en el archivo.');
    const idea = {
      id: text(source.id, 100, true), title: text(source.title, 160, true),
      description: text(source.description, 16000), status: text(source.status, 30, true)
    };
    if (!['idea', 'development', 'ready'].includes(idea.status)) throw new Error('El estado de la idea no es válido.');
    for (const key of ['appId', 'createdAt', 'updatedAt']) {
      if (source[key] !== undefined) idea[key] = text(source[key], 100);
    }
    return idea;
  }
  function validatedState(input, native = false) {
    if (!object(input) || input.schemaVersion !== 1 || !Array.isArray(input.apps) || !Array.isArray(input.ideas)) throw new Error('Este archivo no es una copia válida de LOGIKAPPS.');
    if (input.apps.length > 250 || input.ideas.length > 2000) throw new Error('El archivo supera el tamaño admitido: 250 apps y 2000 ideas.');
    if (input.settings !== undefined && !object(input.settings)) throw new Error('Los ajustes de la copia tienen un formato incorrecto.');
    if (input.environment !== undefined && !object(input.environment)) throw new Error('Los datos de la copia tienen un formato incorrecto.');
    const apps = input.apps.map(validateApp);
    const ideas = input.ideas.map(validateIdea);
    const ids = new Set(apps.map((app) => app.id));
    if (ids.size !== apps.length || new Set(ideas.map((idea) => idea.id)).size !== ideas.length) throw new Error('La copia contiene identificadores repetidos.');
    for (const idea of ideas) {
      if (idea.appId && !ids.has(idea.appId)) throw new Error('Hay una idea vinculada a una app que no está en esta copia.');
    }
    const environment = { native: Boolean(native) };
    if (native && input.environment) {
      for (const key of ['dataPath', 'version']) {
        if (input.environment[key] !== undefined) environment[key] = text(input.environment[key], 4096);
      }
    }
    return { schemaVersion: 1, apps, ideas, settings: {}, environment };
  }
  function serialize(state) {
    const result = JSON.stringify(state);
    if (new TextEncoder().encode(result).byteLength > MAX_BYTES) throw new Error('Tu biblioteca alcanzó el límite de 8 MB. Exporta una copia y reduce los textos antes de guardar más información.');
    return result;
  }
  function parseImport(contents, native = false) {
    if (typeof contents !== 'string' || new TextEncoder().encode(contents).byteLength > MAX_BYTES) throw new Error('La copia es demasiado grande. El máximo es 8 MB.');
    let parsed;
    try { parsed = JSON.parse(contents); }
    catch { throw new Error('No pudimos leer esta copia. Elige un archivo JSON exportado por LOGIKAPPS.'); }
    const checked = validatedState(parsed, native);
    serialize(checked);
    return checked;
  }
  return Object.freeze({ MAX_BYTES, validURL, validatedState, serialize, parseImport });
});
