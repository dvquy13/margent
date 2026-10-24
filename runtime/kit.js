// Margent island kit, contract v1. One implementation, loaded two ways:
// the browser (a classic script, inlined into pages as MargentKit) and Node (evaluated in node:vm
// to wrap modules and validate schemas). Plain browser script: no imports, no network, and nothing
// touches the DOM at load time.
var MargentKit = (function () {
  'use strict';

  var CONTRACT = 1;
  var TOKEN_NAMES = [
    'bg', 'bg2', 'bg3', 'border', 'text', 'text-muted', 'accent', 'accent-light', 'accent-border',
    'green', 'amber', 'red', 'font-ui', 'font-prose', 'mono',
    'font-xs', 'font-sm', 'font-md', 'font-body', 'font-base', 'font-lg', 'font-2xl', 'font-4xl', 'font-5xl', 'font-6xl',
    'radius-sm', 'radius-pill', 'gap-xs', 'gap-sm', 'gap-md', 'gap-lg', 'gap-xl'
  ];
  var TONES = {
    go: 'var(--green)', warn: 'var(--amber)', stop: 'var(--red)', done: 'var(--accent)', neutral: 'var(--text-muted)'
  };

  function hasOwn(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  // Theme tokens: read from the page's computed custom properties (no fallbacks: a missing token is an error).
  function readTokens(cs) {
    var out = {};
    TOKEN_NAMES.forEach(function (n) {
      var v = cs.getPropertyValue('--' + n).trim();
      if (!v) throw new Error('theme token --' + n + ' is not defined on the page');
      out[n] = v;
    });
    return out;
  }
  function currentTokens() {
    return readTokens(getComputedStyle(document.documentElement));
  }

  // Kit base stylesheet: every token as a custom property on :host, plus the host box rules.
  function baseCss(tokens) {
    var decls = TOKEN_NAMES.map(function (n) { return '--' + n + ': ' + tokens[n] + ';'; }).join(' ');
    return ':host { ' + decls +
      ' display: block; position: relative; overflow: hidden; box-sizing: border-box;' +
      ' font-family: var(--font-ui); font-size: var(--font-body); line-height: 1.5; color: var(--text); }\n' +
      ':host *, :host *::before, :host *::after { box-sizing: border-box; }\n';
  }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  // Inline markdown subset: **bold**, *em*, `code`, [text](url), ~~strike~~, \$ -> $. Everything else escaped.
  function md(src) {
    var codes = [];
    var text = String(src).replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    text = text.replace(/\\\$/g, '\u0001');
    text = esc(text);
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
      if (!/^(https?:|mailto:)/i.test(url)) return label;
      return '<a href="' + url + '">' + label + '</a>';
    });
    text = text.replace(/\u0001/g, '$');
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + esc(codes[Number(i)]) + '</code>'; });
    return text;
  }

  function fixed(n, digits) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  var fmt = {
    usd: function (n, digits) {
      var d = digits == null ? 2 : digits;
      return (n < 0 ? '-$' : '$') + fixed(Math.abs(n), d);
    },
    pct: function (x, digits) {
      return fixed(x * 100, digits == null ? 0 : digits) + '%';
    },
    num: function (n) {
      return Number(n).toLocaleString('en-US', { maximumFractionDigits: 20 });
    }
  };

  function tone(name) {
    if (!hasOwn(TONES, name)) {
      throw new Error('unknown tone "' + name + '" (use go, warn, stop, done or neutral)');
    }
    return TONES[name];
  }

  // ---- Schema validation.
  // Supported keywords: type, enum, const, required, properties, additionalProperties, items, minItems,
  // maxItems, contains, minLength, maxLength, pattern, minimum, maximum, allOf, anyOf, maxProperties.
  // Annotations (title, description, $comment, default, examples) are ignored. The root may also carry
  // `columns` (R3.1), which the runtime does not check; T5 applies column patterns in Node.
  // Anything else is an error, never ignored.
  var ANNOTATIONS = ['title', 'description', '$comment', 'default', 'examples'];
  var VALIDATED = [
    'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems',
    'contains', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'allOf', 'anyOf', 'maxProperties'
  ];
  var TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  function isType(v, t) {
    if (t === 'object') return isObject(v);
    if (t === 'array') return Array.isArray(v);
    if (t === 'string') return typeof v === 'string';
    if (t === 'number') return typeof v === 'number' && isFinite(v);
    if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
    if (t === 'boolean') return typeof v === 'boolean';
    return v === null;
  }
  function typeName(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every(function (k) { return hasOwn(b, k) && deepEqual(a[k], b[k]); });
  }
  function isCount(v) {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0;
  }

  // Throws on any keyword the runtime does not implement, and on a malformed schema.
  function checkColumns(columns, where) {
    if (!isObject(columns)) throw new Error(where + ' must be an object of column definitions');
    Object.keys(columns).forEach(function (key) {
      var def = columns[key];
      var at = where + '.' + key;
      if (!isObject(def)) throw new Error(at + ' must be an object with a pattern');
      Object.keys(def).forEach(function (k) {
        if (k !== 'pattern') throw new Error(at + ': only "pattern" is supported in a column definition, got "' + k + '"');
      });
      if (typeof def.pattern !== 'string') throw new Error(at + '.pattern must be a string');
      try {
        new RegExp(def.pattern, 'u');
      } catch (e) {
        throw new Error(at + '.pattern is not a valid regular expression: ' + e.message);
      }
    });
  }
  function checkSchema(schema, where, isRoot) {
    if (!isObject(schema)) throw new Error(where + ': schema must be an object');
    Object.keys(schema).forEach(function (k) {
      if (ANNOTATIONS.indexOf(k) >= 0) return;
      if (k === 'columns' && isRoot) return;
      if (VALIDATED.indexOf(k) < 0) throw new Error('schema keyword "' + k + '" is not supported (at ' + where + ')');
    });
    if (isRoot && hasOwn(schema, 'columns')) checkColumns(schema.columns, where + '.columns');
    if (hasOwn(schema, 'type')) {
      [].concat(schema.type).forEach(function (t) {
        if (TYPES.indexOf(t) < 0) throw new Error('schema uses unsupported type "' + t + '" (at ' + where + ')');
      });
    }
    if (hasOwn(schema, 'enum') && !Array.isArray(schema.enum)) throw new Error(where + ': enum must be an array');
    ['minItems', 'maxItems', 'minLength', 'maxLength', 'maxProperties'].forEach(function (k) {
      if (hasOwn(schema, k) && !isCount(schema[k])) throw new Error(where + ': ' + k + ' must be a non-negative integer');
    });
    ['minimum', 'maximum'].forEach(function (k) {
      if (hasOwn(schema, k) && typeof schema[k] !== 'number') throw new Error(where + ': ' + k + ' must be a number');
    });
    if (hasOwn(schema, 'pattern')) {
      if (typeof schema.pattern !== 'string') throw new Error(where + ': pattern must be a string');
      try {
        new RegExp(schema.pattern, 'u');
      } catch (e) {
        throw new Error(where + ': pattern is not a valid regular expression: ' + e.message);
      }
    }
    if (hasOwn(schema, 'required')) {
      if (!Array.isArray(schema.required) || !schema.required.every(function (r) { return typeof r === 'string'; })) {
        throw new Error(where + ': required must be an array of property names');
      }
    }
    if (hasOwn(schema, 'properties')) {
      if (!isObject(schema.properties)) throw new Error(where + ': properties must be an object of schemas');
      Object.keys(schema.properties).forEach(function (k) {
        checkSchema(schema.properties[k], where + '.' + k, false);
      });
    }
    if (hasOwn(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') {
      checkSchema(schema.additionalProperties, where + ' (additionalProperties)', false);
    }
    if (hasOwn(schema, 'items')) checkSchema(schema.items, where + ' (items)', false);
    if (hasOwn(schema, 'contains')) checkSchema(schema.contains, where + ' (contains)', false);
    ['allOf', 'anyOf'].forEach(function (k) {
      if (!hasOwn(schema, k)) return;
      if (!Array.isArray(schema[k]) || !schema[k].length) throw new Error(where + ': ' + k + ' must be a non-empty array of schemas');
      schema[k].forEach(function (s, i) { checkSchema(s, where + ' (' + k + '[' + i + '])', false); });
    });
  }

  // Appends one message per violation to errors.
  function check(schema, value, path, errors) {
    if (hasOwn(schema, 'type')) {
      var types = [].concat(schema.type);
      if (!types.some(function (t) { return isType(value, t); })) {
        errors.push(path + ': expected ' + types.join(' or ') + ', got ' + typeName(value));
        return;
      }
    }
    if (hasOwn(schema, 'const') && !deepEqual(schema.const, value)) {
      errors.push(path + ': must equal ' + JSON.stringify(schema.const));
    }
    if (hasOwn(schema, 'enum') && !schema.enum.some(function (e) { return deepEqual(e, value); })) {
      errors.push(path + ': must be one of ' + JSON.stringify(schema.enum));
    }
    if (typeof value === 'string') {
      var len = Array.from(value).length;
      if (hasOwn(schema, 'minLength') && len < schema.minLength) errors.push(path + ': shorter than ' + schema.minLength + ' characters');
      if (hasOwn(schema, 'maxLength') && len > schema.maxLength) errors.push(path + ': longer than ' + schema.maxLength + ' characters');
      if (hasOwn(schema, 'pattern') && !new RegExp(schema.pattern, 'u').test(value)) {
        errors.push(path + ': does not match pattern ' + schema.pattern);
      }
    }
    if (typeof value === 'number') {
      if (hasOwn(schema, 'minimum') && value < schema.minimum) errors.push(path + ': must be at least ' + schema.minimum);
      if (hasOwn(schema, 'maximum') && value > schema.maximum) errors.push(path + ': must be at most ' + schema.maximum);
    }
    if (isObject(value)) {
      var keys = Object.keys(value);
      var props = schema.properties || {};
      (schema.required || []).forEach(function (k) {
        if (!hasOwn(value, k)) errors.push(path + ': missing required property "' + k + '"');
      });
      Object.keys(props).forEach(function (k) {
        if (hasOwn(value, k)) check(props[k], value[k], path + '.' + k, errors);
      });
      if (hasOwn(schema, 'additionalProperties')) {
        var extra = keys.filter(function (k) { return !hasOwn(props, k); });
        if (schema.additionalProperties === false) {
          extra.forEach(function (k) { errors.push(path + ': unexpected property "' + k + '"'); });
        } else if (isObject(schema.additionalProperties)) {
          extra.forEach(function (k) { check(schema.additionalProperties, value[k], path + '.' + k, errors); });
        }
      }
      if (hasOwn(schema, 'maxProperties') && keys.length > schema.maxProperties) {
        errors.push(path + ': more than ' + schema.maxProperties + ' properties');
      }
    }
    if (Array.isArray(value)) {
      if (hasOwn(schema, 'minItems') && value.length < schema.minItems) errors.push(path + ': fewer than ' + schema.minItems + ' items');
      if (hasOwn(schema, 'maxItems') && value.length > schema.maxItems) errors.push(path + ': more than ' + schema.maxItems + ' items');
      if (hasOwn(schema, 'items')) {
        value.forEach(function (v, i) { check(schema.items, v, path + '[' + i + ']', errors); });
      }
      if (hasOwn(schema, 'contains')) {
        var found = value.some(function (v) { return errorsOf(schema.contains, v, path).length === 0; });
        if (!found) errors.push(path + ': no item matches the contains schema');
      }
    }
    if (hasOwn(schema, 'allOf')) {
      schema.allOf.forEach(function (s) { check(s, value, path, errors); });
    }
    if (hasOwn(schema, 'anyOf')) {
      var any = schema.anyOf.some(function (s) { return errorsOf(s, value, path).length === 0; });
      if (!any) errors.push(path + ': matches none of the allowed schemas');
    }
  }
  function errorsOf(schema, value, path) {
    var out = [];
    check(schema, value, path, out);
    return out;
  }

  // Validates data against a schema. Returns an array of "$.path: message" strings (empty when valid).
  // Throws if the schema itself uses an unsupported keyword or is malformed.
  function validate(schema, data) {
    checkSchema(schema, '$', true);
    return errorsOf(schema, data, '$');
  }

  // Turns a module's ES source into a classic-script IIFE. Strict CSP in the sandbox forbids
  // blob: and data: module imports, so modules run as inline scripts. Exports are stripped;
  // the wrapper returns { contract, schema, render }.
  function wrapModule(name, source) {
    if (/<\/?script/i.test(source)) {
      throw new Error('island "' + name + '": module source may not contain a script tag');
    }
    if (/^\s*import\b/m.test(source)) {
      throw new Error('island "' + name + '": modules may not import anything (contract v1)');
    }
    var defaultName = null;
    var body = source.replace(/^([ \t]*)export[ \t]+default[ \t]+function[ \t]*([A-Za-z_$][\w$]*)?[ \t]*\(/m,
      function (_, ws, id) {
        defaultName = id || '__margent_default';
        return ws + 'function ' + defaultName + '(';
      });
    if (!defaultName) {
      throw new Error('island "' + name + '": module must have `export default function render(root, data, kit)`');
    }
    body = body.replace(/^([ \t]*)export[ \t]+(?=(const|let|var|function|class|async)\b)/mg, '$1');
    if (/^\s*export\b/m.test(body)) {
      throw new Error('island "' + name + '": unsupported export form (use export const, export function or export default function)');
    }
    return '(function () {"use strict";\n' + body + '\n;return {' +
      ' contract: typeof contract === "undefined" ? undefined : contract,' +
      ' schema: typeof schema === "undefined" ? undefined : schema,' +
      ' render: ' + defaultName + ' };\n})();';
  }

  // The exact script text that registers a module. The page policy lists its sha256, so Node and the
  // browser must both use this function: one character of difference and the script is blocked.
  function moduleScript(name, source) {
    return 'window.__margentModules[' + JSON.stringify(name) + '] = ' + wrapModule(name, source);
  }

  // Shows the error box inside root (R3.7) and logs the failure to the console.
  function showError(root, name, err) {
    var msg = err && err.message ? err.message : String(err);
    var box = document.createElement('div');
    box.setAttribute('data-island-error', name);
    box.setAttribute('role', 'alert');
    box.style.cssText = 'border:2px solid var(--red);background:transparent;color:var(--red);' +
      'padding:12px;border-radius:4px;font:13px/1.45 Menlo,Consolas,monospace;white-space:pre-wrap;box-sizing:border-box;';
    box.textContent = 'island "' + name + '" failed\n' + msg;
    root.replaceChildren(box);
    console.error('island "' + name + '": ' + (err && err.stack ? err.stack : msg));
  }

  // Column patterns (M5 R3.3), checked in the guest against the island's data. Returns one {row, column, text} per
  // cell that does not match its column's pattern, in row order. Throws the check's messages when a pattern names no
  // column or the island is not a table. A bad pattern was already rejected by validate.
  function checkPatterns(name, schema, kind, data) {
    var patterns = schema.columns || {};
    var keys = Object.keys(patterns);
    if (keys.length === 0) return [];
    if (kind !== 'table') {
      throw new Error('island "' + name + '": column patterns apply only to table islands');
    }
    var columns = data.columns.map(function (c) { return c.key; });
    keys.forEach(function (key) {
      if (columns.indexOf(key) < 0) {
        throw new Error('island "' + name + '": column pattern for "' + key + '" matches no column (the table has ' +
          columns.map(function (k) { return '"' + k + '"'; }).join(', ') + ')');
      }
    });
    var tests = keys.map(function (key) { return { key: key, re: new RegExp(patterns[key].pattern, 'u') }; });
    var mismatches = [];
    data.rows.forEach(function (row, i) {
      tests.forEach(function (t) {
        var text = row[t.key] === undefined ? '' : row[t.key];
        if (!t.re.test(text)) mismatches.push({ row: i, column: t.key, text: text });
      });
    });
    return mismatches;
  }

  // Calls fn() whenever the page theme may have changed (data-theme attribute or system scheme).
  function watchTheme(fn) {
    new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  }

  return {
    CONTRACT: CONTRACT,
    TOKEN_NAMES: TOKEN_NAMES,
    readTokens: readTokens,
    currentTokens: currentTokens,
    baseCss: baseCss,
    md: md,
    esc: esc,
    fmt: fmt,
    tone: tone,
    validate: validate,
    wrapModule: wrapModule,
    moduleScript: moduleScript,
    checkPatterns: checkPatterns,
    showError: showError,
    watchTheme: watchTheme
  };
})();
