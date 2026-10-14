import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import fs from 'node:fs';
import path from 'node:path';

// framer-motion's `m` is the component factory (`<m.div>`). A local binding
// named `m` in the same function (a mask helper, a market object, a .map
// callback) makes `m.div` undefined, which React reports as error #130.
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function bindsM(id) {
  if (!id) return false;
  if (id.type === 'Identifier') return id.name === 'm';
  if (id.type === 'ObjectPattern') return id.properties.some((p) => bindsM(p.value || p.argument));
  if (id.type === 'ArrayPattern') return id.elements.some((el) => bindsM(el));
  if (id.type === 'AssignmentPattern') return bindsM(id.left);
  if (id.type === 'RestElement') return bindsM(id.argument);
  return false;
}

function fnName(node) {
  return node.id?.name || 'arrow';
}

function shadowingMotion(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('framer-motion')) return [];
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const imported = ast.program.body.some((node) => node.type === 'ImportDeclaration'
    && node.source.value === 'framer-motion'
    && node.specifiers.some((s) => s.local?.name === 'm'));
  if (!imported) return [];

  const hits = [];
  const stack = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    const isFn = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
    if (isFn) {
      stack.push({ name: fnName(node), line: node.loc?.start.line, decls: [], jsx: [] });
      for (const p of node.params || []) {
        if (bindsM(p)) stack.at(-1).decls.push(p.loc?.start.line);
      }
    }
    if (node.type === 'VariableDeclarator' && bindsM(node.id)) {
      stack.at(-1)?.decls.push(node.loc?.start.line);
    }
    // `<m.div>` is a component. `key={m.id}` and `{m.icon}` are data, not elements.
    if (node.type === 'JSXMemberExpression' && node.object?.name === 'm') {
      stack.at(-1)?.jsx.push(`${node.property.name}@${node.loc?.start.line}`);
    }
    if (node.type === 'JSXAttribute' && node.name?.name === 'as' && node.value?.type === 'JSXExpressionContainer') {
      const expr = node.value.expression;
      if (expr?.type === 'MemberExpression' && expr.object?.name === 'm') {
        stack.at(-1)?.jsx.push(`${expr.property.name}@${node.loc?.start.line}`);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'leadingComments' || key === 'trailingComments') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && value.type) visit(value);
    }
    if (isFn) {
      const top = stack.pop();
      if (top.decls.length && top.jsx.length) {
        hits.push(`${file}:${top.line} ${top.name} binds m (${top.decls.join(',')}) and renders <m.${top.jsx[0]}>`);
      }
    }
  }
  visit(ast);
  return hits;
}

describe('framer-motion m is not shadowed', () => {
  it('no function both binds m and renders an m.* element', () => {
    const hits = walk('src').flatMap(shadowingMotion);
    expect(hits).toEqual([]);
  });
});
