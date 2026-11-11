import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import en from './en.json';
import bn from './bn.json';

interface Tree {
  [key: string]: string | Tree;
}

/** Every message by its dotted key path. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** The arguments and tags a message uses, wherever they sit (plural branches included). */
function argumentsOf(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      ) {
        found.add(el.value);
      } else if (el.type === TYPE.select || el.type === TYPE.plural) {
        found.add(el.value);
        for (const option of Object.values(el.options)) walk(option.value);
      } else if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

const english = flatten(en);
const bangla = flatten(bn);

describe('message catalogs', () => {
  it('have the same keys in Bangla and English', () => {
    expect([...bangla.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('use the same placeholders in both languages', () => {
    for (const [key, text] of english) {
      const other = bangla.get(key);
      if (other === undefined) continue; // reported by the key test
      expect({ key, args: argumentsOf(other) }).toEqual({ key, args: argumentsOf(text) });
    }
  });

  it('have no empty messages', () => {
    for (const [key, text] of [...english, ...bangla]) {
      expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('use no em or en dashes', () => {
    for (const [key, text] of [...english, ...bangla]) {
      expect({ key, dash: /[–—]/.test(text) }).toEqual({ key, dash: false });
    }
  });
});
