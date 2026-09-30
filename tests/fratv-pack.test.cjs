'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pack = path.resolve(__dirname, '../tools/fratv-obs');
const resources = path.join(pack, 'fratv/resources');
const runtimeCode = fs.readFileSync(path.join(resources, 'fratv-runtime.js'), 'utf8');
const resourceCode = fs.readFileSync(path.join(resources, 'fratv-resource.js'), 'utf8');

// A small deterministic DOM/timer harness: no server, network or dependencies.
function resource(id, query = '') {
  const fields = new Map();
  const events = new Map();
  const timers = new Map();
  const css = new Map();
  let now = 0;
  let sequence = 0;
  let markup = '';
  const stage = {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      for (const match of value.matchAll(/data-field="([^"]+)"/g)) {
        const key = match[1];
        fields.set(key, { textContent: '', hidden: false, getAttribute: () => key });
      }
    }
  };
  const parent = { postMessage() {} };
  const window = { parent, addEventListener(name, callback) { events.set(name, callback); } };
  const document = {
    body: { getAttribute: () => id },
    documentElement: { style: { setProperty(key, value) { css.set(key, value); } }, setAttribute() {} },
    getElementById: (key) => key === 'stage' ? stage : null,
    querySelector(selector) {
      const match = /^\[data-field="([^"]+)"\]$/.exec(selector);
      return match ? fields.get(match[1]) : null;
    },
    querySelectorAll(selector) {
      if (selector === '*') return [];
      if (selector === '[data-field]') return [...fields.values()];
      throw new Error('No dynamic CSS selectors allowed: ' + selector);
    }
  };
  const context = vm.createContext({
    window, document, location: { search: query }, URLSearchParams,
    Date: { now: () => now }, requestAnimationFrame: (callback) => callback(),
    setInterval(callback) { const id = ++sequence; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); }
  });
  vm.runInContext(runtimeCode, context);
  vm.runInContext(resourceCode, context);
  return {
    api: window.FRATV, fields, stage, css, timers,
    advance(ms) { now += ms; for (const callback of [...timers.values()]) callback(); },
    message(data, trusted = true) { events.get('message')({ data, source: trusted ? parent : {} }); },
    pagehide() { events.get('pagehide')?.(); }
  };
}

test('query text is escaped before innerHTML and remains literal after field hydration', () => {
  const payload = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const r = resource('program-title', '?title=' + encodeURIComponent(payload));
  assert(!r.stage.innerHTML.includes('<img src=x'));
  assert(r.stage.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.equal(r.fields.get('title').textContent, payload);
});

test('all generated text resources encode injected URL values', () => {
  const payload = '</strong><script>alert(1)</script>';
  const pairs = [['countdown', 'caption'], ['bumper-in', 'title'], ['bumper-out', 'subtitle'], ['program-title', 'meta'], ['schedule', 'items'], ['engagement', 'comment'], ['sponsor', 'sponsor'], ['ticker', 'text'], ['end-credits', 'credits']];
  for (const [id, field] of pairs) {
    const r = resource(id, '?' + field + '=' + encodeURIComponent(payload));
    assert(!r.stage.innerHTML.includes('<script>'), id);
    assert.equal(r.fields.get(field).textContent, payload, id);
  }
});

test('unknown and selector-shaped URL field names cannot change other fields', () => {
  const r = resource('program-title', '?title=Correcto&' + encodeURIComponent('missing"], *') + '=bad&__proto__=bad&constructor=bad');
  assert.equal(r.fields.get('title').textContent, 'Correcto');
  assert.equal(r.fields.get('meta').textContent, '');
  assert.doesNotThrow(() => r.api.setFields({ 'title"], *': 'bad', title: 'Seguro\\nLiteral' }));
  assert.equal(r.fields.get('title').textContent, 'Seguro\nLiteral');
});

test('empty fields hide and later text reveals; malformed messages are harmless', () => {
  const r = resource('sponsor');
  r.api.setFields({ sponsor: '' });
  assert.equal(r.fields.get('sponsor').hidden, true);
  r.api.setFields({ sponsor: 'Patrocinador' });
  assert.equal(r.fields.get('sponsor').hidden, false);
  for (const value of [null, [], true, 'text']) {
    assert.doesNotThrow(() => r.api.setFields(value));
    assert.doesNotThrow(() => r.message({ type: 'fratv:fonts', preset: value }));
    assert.doesNotThrow(() => r.message({ type: 'fratv:tokens', tokens: value }));
  }
});

test('only the embedding parent can send field controls', () => {
  const r = resource('sponsor');
  r.api.setFields({ sponsor: 'Inicial' });
  r.message({ type: 'fratv:fields', fields: { sponsor: 'Ajeno' } }, false);
  assert.equal(r.fields.get('sponsor').textContent, 'Inicial');
  r.message({ type: 'fratv:fields', fields: { sponsor: '<b>Texto del padre</b>' } });
  assert.equal(r.fields.get('sponsor').textContent, '<b>Texto del padre</b>');
});

test('countdown starts at default 00:04:58 and uses elapsed wall-clock time', () => {
  const r = resource('countdown');
  assert.equal(r.fields.get('clock').textContent, '00:04:58');
  assert.equal(r.timers.size, 1);
  r.advance(2700);
  assert.equal(r.fields.get('clock').textContent, '00:04:56');
  r.advance(300000);
  assert.equal(r.fields.get('clock').textContent, '00:00:00');
  assert.equal(r.timers.size, 0);
});

test('custom countdown ends at zero without becoming negative or restarting', () => {
  const r = resource('countdown', '?clock=00:00:02');
  assert.equal(r.fields.get('clock').textContent, '00:00:02');
  r.advance(1000);
  assert.equal(r.fields.get('clock').textContent, '00:00:01');
  r.advance(1000);
  r.advance(9000);
  assert.equal(r.fields.get('clock').textContent, '00:00:00');
  assert.equal(r.timers.size, 0);
});

test('invalid countdowns safely use the documented default', () => {
  for (const clock of ['bad', '00:99:00', '-1:02:03', '<img src=x>', '01:01']) {
    const r = resource('countdown', '?clock=' + encodeURIComponent(clock));
    assert.equal(r.fields.get('clock').textContent, '00:04:58', clock);
  }
});

test('countdown supports paused loading, seek, resume and field reset', async () => {
  const r = resource('countdown', '?clock=01:02:03&autoplay=0');
  await r.api.ready;
  assert.equal(r.timers.size, 0);
  r.advance(1000);
  assert.equal(r.fields.get('clock').textContent, '01:02:03');
  r.api.seek(62000);
  assert.equal(r.fields.get('clock').textContent, '01:01:01');
  r.api.play();
  r.advance(1000);
  assert.equal(r.fields.get('clock').textContent, '01:01:00');
  r.api.pause();
  r.advance(5000);
  assert.equal(r.fields.get('clock').textContent, '01:01:00');
  r.api.setFields({ clock: '00:00:03' });
  assert.equal(r.fields.get('clock').textContent, '00:00:03');
  r.api.play();
  r.advance(1000);
  assert.equal(r.fields.get('clock').textContent, '00:00:02');
  r.pagehide();
  assert.equal(r.timers.size, 0);
});

test('invalid seek values do not corrupt the countdown', () => {
  const r = resource('countdown', '?clock=00:00:10');
  for (const value of [NaN, Infinity, -1, 'oops', null]) r.api.seek(value);
  assert.equal(r.fields.get('clock').textContent, '00:00:10');
});

test('all HTML relative dependencies stay inside the pack and exist', () => {
  const files = [path.join(pack, 'fratv/GUIA-OBS.html'), ...fs.readdirSync(resources).filter(name => name.endsWith('.html')).map(name => path.join(resources, name))];
  let relativeReferences = 0;
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const ref = match[1];
      if (/^(?:https?:|data:|#)/i.test(ref)) continue;
      const dependency = path.resolve(path.dirname(file), ref.split(/[?#]/)[0]);
      assert(!path.relative(pack, dependency).startsWith('..'), file + ': ' + ref);
      assert(fs.existsSync(dependency), file + ': ' + ref);
      relativeReferences++;
    }
  }
  // JS-injected brand asset is also a relative dependency.
  assert(fs.existsSync(path.resolve(resources, '../../brand/fratv-horizontal.svg')));
  assert(relativeReferences > 30);
});
