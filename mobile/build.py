#!/usr/bin/env python3
"""
mobile/build.py — Momentum mobile bundler (no Node.js required).

Strips TypeScript type annotations and concatenates source modules into a
single dist/app.js file.  Works with the Python 3 interpreter that ships
inside a-Shell on iPhone, or any Python 3.6+ environment.

Usage (run from any directory):
  python3 mobile/build.py
"""
from __future__ import annotations

import os
import re
import shutil

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
DIST = os.path.join(ROOT, 'dist')

# Source files in dependency order (type-only files are omitted).
# Each entry is (relative_path, wrap_in_iife).
# Files with wrap_in_iife=True get their internal helpers scoped to avoid
# name collisions with symbols in other modules.
SOURCES: list[tuple[str, bool]] = [
    ('utils/date.ts', False),
    ('data/routines.ts', False),
    ('utils/routine.ts', False),
    ('utils/stats.ts', False),
    ('services/persistenceService.web.ts', True),   # has internal helpers that collide
    ('mobile/main.ts', False),
]


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------

def read_file(rel: str) -> str:
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return fh.read()


def write_file(path: str, text: str) -> None:
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

# TypeScript type names: PascalCase identifiers or known primitive keywords.
_TYPE_HEAD = re.compile(
    r'^(?:string|number|boolean|void|never|any|unknown|object|null|undefined|'
    r'bigint|symbol|[A-Z]\w*)'
    r'(?=[<\[\|& ;,)\n>{}]|$)'
)


def _skip_type(src: str, i: int) -> int:
    """Return the index just past the TypeScript type starting at src[i]."""
    n = len(src)
    # We track <> and () depths; at angle/paren depth 0, { always ends the
    # scan (it is a function-body or block opener, not a type-body opener —
    # the only { inside types appears nested inside angle brackets).
    angle = 0
    brace = 0  # { } depth, only non-zero while inside < >

    while i < n:
        c = src[i]
        if c == '<':
            angle += 1
            i += 1
        elif c == '>':
            if angle:
                angle -= 1
                i += 1
            else:
                break
        elif c == '{':
            if angle:
                brace += 1
                i += 1
            else:
                break  # function body / block — stop scanning
        elif c == '}':
            if brace:
                brace -= 1
                i += 1
            else:
                break
        elif c == '(':
            # Parenthesised sub-type, e.g. function-type parameters
            depth = 1
            i += 1
            while i < n and depth:
                if src[i] == '(':
                    depth += 1
                elif src[i] == ')':
                    depth -= 1
                i += 1
        elif c == ')':
            break
        elif c == '[':
            # Trailing [] suffix (e.g. string[]) — check next char
            if i + 1 < n and src[i + 1] == ']':
                i += 2
                continue
            i += 1
        elif c == ']':
            break
        elif c in ('|', '&') and not angle and not brace:
            # Union / intersection type — keep scanning past the operator
            i += 1
            while i < n and src[i] in ' \t':
                i += 1
        elif c in (',', ';') and not angle and not brace:
            break
        elif c == '=' and not angle and not brace:
            break
        elif c == '\n' and not angle and not brace:
            break
        else:
            i += 1

    # Consume any trailing [] suffixes (e.g. DailyEntry[])
    while i + 1 < n and src[i] == '[' and src[i + 1] == ']':
        i += 2

    return i


# ---------------------------------------------------------------------------
# TypeScript stripping passes
# ---------------------------------------------------------------------------

def _remove_block_comments(src: str) -> str:
    return re.sub(r'/\*[\s\S]*?\*/', '', src)


def _remove_imports(src: str) -> str:
    """Remove every 'import …;' statement (handles multi-line imports)."""
    return re.sub(
        r'^import\s+(?:type\s+)?[\s\S]*?from\s+[\'"][^\'"]+[\'"]\s*;[ \t]*\n?',
        '',
        src,
        flags=re.MULTILINE,
    )


def _remove_interface_and_type_blocks(src: str) -> str:
    """Remove 'interface X {…}' blocks and 'type X = …;' declarations."""
    out: list[str] = []
    i = 0
    n = len(src)

    while i < n:
        m = re.match(
            r'(?:export\s+)?(?:interface|type)\s+\w+(?:\s*<[^{=\n]*>)?\s*',
            src[i:],
        )
        if m:
            j = i + len(m.group(0))

            if j < n and src[j] == '=':
                # type alias: skip everything until ';' at brace depth 0
                j += 1
                depth = 0
                in_s: str | None = None
                while j < n:
                    c = src[j]
                    if in_s:
                        if c == '\\':
                            j += 2
                            continue
                        if c == in_s:
                            in_s = None
                    elif c in ('"', "'", '`'):
                        in_s = c
                    elif c in '<{([':
                        depth += 1
                    elif c in '>})]':
                        if depth:
                            depth -= 1
                    elif c == ';' and not depth:
                        j += 1
                        break
                    j += 1
                if j < n and src[j] == '\n':
                    j += 1
                i = j
                continue

            if j < n and src[j] == '{':
                # interface block: skip balanced braces
                depth = 0
                while j < n:
                    if src[j] == '{':
                        depth += 1
                    elif src[j] == '}':
                        depth -= 1
                        if not depth:
                            j += 1
                            break
                    j += 1
                while j < n and src[j] in ';\n':
                    j += 1
                i = j
                continue

        out.append(src[i])
        i += 1

    return ''.join(out)


def _remove_export_keyword(src: str) -> str:
    return re.sub(
        r'\bexport\s+((?:default\s+)?(?:async\s+)?(?:const|function|let|var|class)\b)',
        r'\1',
        src,
    )


# Context tags for the state machine used by the type-annotation stripper
_CTX_CODE = 'code'
_CTX_TEMPLATE = 'tpl'       # inside `…` (the literal characters only)
_CTX_TPL_EXPR = 'tpl_expr'  # inside ${…} of a template literal


def _strip_colon_types_and_as(src: str) -> str:  # noqa: C901
    """
    Walk src using a state machine that tracks string / template-literal
    context so we never modify string content.

    Removes:
    • ': Type' annotations on parameters, variables, and return types
    • 'as Type' / 'as const' casts
    """
    out: list[str] = []
    i = 0
    n = len(src)

    # Stack of context tags.
    ctx_stack = [_CTX_CODE]
    # Per-context brace depth: how many { } have been opened inside the current
    # template-expression context.  Mirrors ctx_stack.
    brace_stack = [0]

    def ctx() -> str:
        return ctx_stack[-1]

    while i < n:
        c = src[i]
        current = ctx()

        # ── inside a template literal (the literal character part) ───────
        if current == _CTX_TEMPLATE:
            if c == '\\':
                out.append(c)
                i += 1
                if i < n:
                    out.append(src[i])
                    i += 1
            elif c == '`':
                ctx_stack.pop()
                brace_stack.pop()
                out.append(c)
                i += 1
            elif c == '$' and i + 1 < n and src[i + 1] == '{':
                ctx_stack.append(_CTX_TPL_EXPR)
                brace_stack.append(0)
                out.append(c)
                out.append(src[i + 1])
                i += 2
            else:
                out.append(c)
                i += 1
            continue

        # ── inside ${…} of a template literal ────────────────────────────
        if current == _CTX_TPL_EXPR:
            if c == '\\':
                out.append(c)
                i += 1
                if i < n:
                    out.append(src[i])
                    i += 1
                continue
            if c == '`':
                # nested template literal opens
                ctx_stack.append(_CTX_TEMPLATE)
                brace_stack.append(0)
                out.append(c)
                i += 1
                continue
            if c in ('"', "'"):
                # regular string inside the expression
                out.append(c)
                i += 1
                while i < n:
                    cc = src[i]
                    out.append(cc)
                    if cc == '\\':
                        i += 1
                        if i < n:
                            out.append(src[i])
                            i += 1
                        continue
                    if cc == c:
                        i += 1
                        break
                    i += 1
                continue
            if c == '{':
                brace_stack[-1] += 1
                out.append(c)
                i += 1
                continue
            if c == '}':
                if brace_stack[-1] > 0:
                    brace_stack[-1] -= 1
                    out.append(c)
                    i += 1
                else:
                    # closes the ${ — pop back to template literal
                    ctx_stack.pop()
                    brace_stack.pop()
                    out.append(c)
                    i += 1
                continue
            # fall through to the colon / as handling (same logic as plain code)

        # ── plain code (or inside a template expression) ──────────────────

        # Start of a regular string literal
        if c in ('"', "'"):
            out.append(c)
            i += 1
            while i < n:
                cc = src[i]
                out.append(cc)
                if cc == '\\':
                    i += 1
                    if i < n:
                        out.append(src[i])
                        i += 1
                    continue
                if cc == c:
                    i += 1
                    break
                i += 1
            continue

        # Start of a template literal
        if c == '`':
            ctx_stack.append(_CTX_TEMPLATE)
            brace_stack.append(0)
            out.append(c)
            i += 1
            continue

        # ': Type' annotation ─────────────────────────────────────────────
        if c == ':':
            prev = ''.join(out).rstrip()
            prev_ch = prev[-1] if prev else ''
            # Only interpret as a type annotation if the previous token
            # was an identifier character, ), ], or ?.
            if prev_ch in (')', ']') or prev_ch.isalnum() or prev_ch in ('_', '?'):
                j = i + 1
                while j < n and src[j] in ' \t':
                    j += 1
                if j < n and _TYPE_HEAD.match(src[j:]):
                    i = _skip_type(src, j)
                    continue  # drop the colon and the type annotation

        # 'as Type' / 'as const' cast ─────────────────────────────────────
        if (c == 'a'
                and src[i:i + 3] == 'as '
                and (i == 0 or (not src[i - 1].isalnum() and src[i - 1] != '_'))):
            j = i + 3
            while j < n and src[j] == ' ':
                j += 1
            # 'as const' — TypeScript-only hint, strip it
            if src[j:j + 5] == 'const' and (j + 5 >= n or not src[j + 5].isalnum()):
                i = j + 5
                continue
            # 'as SomeType' — strip if next token looks like a type
            if j < n and _TYPE_HEAD.match(src[j:]):
                i = _skip_type(src, j)
                continue

        out.append(c)
        i += 1

    return ''.join(out)


def _remove_generic_call_types(src: str) -> str:
    """Remove generic type args from method / function calls: .foo<T>( → .foo("""
    # Method calls:  .method<TypeName>(
    src = re.sub(r'(\.\w+)<([A-Z]\w*(?:\s*,\s*[A-Z]\w*)*)>(\()', r'\1\3', src)
    # Common standalone generic calls
    src = re.sub(
        r'\b(reduce|map|filter|forEach|find|some|every|flatMap|from)<[A-Za-z][^>]*>(\()',
        r'\1\2',
        src,
    )
    src = re.sub(r'\bnew\s+(\w+)<[A-Za-z][^>]*>(\()', r'new \1\2', src)
    return src


def _collapse_blank_lines(src: str) -> str:
    return re.sub(r'\n{3,}', '\n\n', src)


# ---------------------------------------------------------------------------
# Public transform entry point
# ---------------------------------------------------------------------------

def transform(src: str) -> str:
    src = _remove_block_comments(src)
    src = _remove_imports(src)
    src = _remove_interface_and_type_blocks(src)
    src = _remove_export_keyword(src)
    src = _strip_colon_types_and_as(src)
    src = _remove_generic_call_types(src)
    src = _collapse_blank_lines(src)
    return src.strip()


# ---------------------------------------------------------------------------
# IIFE wrapper
# When a file is marked wrap_in_iife=True, its content is placed inside an
# immediately-invoked function expression.  This scopes internal helper
# functions so they cannot collide with same-named symbols in other files.
# The file's top-level 'const' declarations become the public interface.
# ---------------------------------------------------------------------------

def _collect_top_level_const_names(js: str) -> list[str]:
    """Return names of top-level 'const NAME' declarations."""
    return re.findall(r'^const\s+(\w+)\s*[=;]', js, re.MULTILINE)


def wrap_in_iife(js: str) -> str:
    """
    Wrap file content in an IIFE, pre-declaring all top-level const names
    in the enclosing scope so they remain accessible by other modules.
    """
    names = _collect_top_level_const_names(js)
    # Convert 'const name = ...' to 'name = ...' so assignments go to the
    # pre-declared outer variables.
    body = re.sub(r'^const\s+(\w+)\s*=', r'\1 =', js, flags=re.MULTILINE)

    decls = ', '.join(names) if names else ''
    declaration = f'var {decls};\n' if decls else ''

    return f'{declaration}(function () {{\n{body}\n}})();'


# ---------------------------------------------------------------------------
# Bundler
# ---------------------------------------------------------------------------

def bundle() -> str:
    parts: list[str] = [
        '// Momentum — auto-generated bundle.  Do not edit directly.',
        '// Rebuild with:  python3 mobile/build.py',
        '',
    ]
    for rel, use_iife in SOURCES:
        js = transform(read_file(rel))
        if not js:
            continue
        parts.append(f'// === {rel} ===')
        if use_iife:
            parts.append(wrap_in_iife(js))
        else:
            parts.append(js)
        parts.append('')
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    print('Building Momentum mobile bundle...')

    os.makedirs(DIST, exist_ok=True)

    js = bundle()
    out_js = os.path.join(DIST, 'app.js')
    write_file(out_js, js)
    kb = len(js.encode()) / 1024
    print(f'  dist/app.js  ({kb:.1f} KB)')

    for name in ('index.html', 'style.css'):
        src_path = os.path.join(SCRIPT_DIR, name)
        dst_path = os.path.join(DIST, name)
        shutil.copy2(src_path, dst_path)
        print(f'  dist/{name}')

    print('\nDone.  Open dist/index.html in a browser, or in a-Shell:')
    print('  cd dist && view index.html')


if __name__ == '__main__':
    main()
