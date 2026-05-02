import { readFileSync } from 'node:fs';

function stripComment(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index - 1] !== '\\') quoted = !quoted;
    if (char === '#' && !quoted) return line.slice(0, index);
  }
  return line;
}

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted = trimmed.match(/^(['"])(.*)\1$/);
  return quoted ? quoted[2] : trimmed;
}

function lineParts(rawLine) {
  const indent = rawLine.match(/^ */)[0].length;
  return { indent, text: rawLine.trim() };
}

function parseKeyValue(text) {
  const separator = text.indexOf(':');
  if (separator === -1) throw new Error(`Expected key/value YAML line: ${text}`);
  return [text.slice(0, separator).trim(), text.slice(separator + 1).trim()];
}

function parseBlock(lines, state, indent) {
  if (state.index >= lines.length || lines[state.index].indent < indent) return undefined;

  if (lines[state.index].text.startsWith('- ')) {
    const items = [];
    while (state.index < lines.length && lines[state.index].indent === indent && lines[state.index].text.startsWith('- ')) {
      const itemText = lines[state.index].text.slice(2).trim();
      state.index += 1;
      if (itemText === '') {
        items.push(parseBlock(lines, state, indent + 2));
      } else if (itemText.includes(':')) {
        const [key, value] = parseKeyValue(itemText);
        const item = { [key]: scalar(value) };
        if (state.index < lines.length && lines[state.index].indent > indent) {
          Object.assign(item, parseBlock(lines, state, indent + 2));
        }
        items.push(item);
      } else {
        items.push(scalar(itemText));
      }
    }
    return items;
  }

  const object = {};
  while (state.index < lines.length && lines[state.index].indent === indent && !lines[state.index].text.startsWith('- ')) {
    const { text } = lines[state.index];
    const [key, value] = parseKeyValue(text);
    state.index += 1;
    object[key] = value === '' ? parseBlock(lines, state, indent + 2) : scalar(value);
  }
  return object;
}

export function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map(stripComment)
    .filter((line) => line.trim() !== '')
    .map(lineParts);
  return parseBlock(lines, { index: 0 }, 0) ?? {};
}

export function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, 'utf8'));
}
