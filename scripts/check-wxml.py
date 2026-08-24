#!/usr/bin/env python3
"""WXML tag-balance checker that mimics the WXML compiler's parser.

Handles: comments, self-closing tags, `>` inside quoted attribute values,
`<` appearing in text/mustache expressions. Reports exact line:col of
mismatches the way the WeChat compiler does ("unexpected end tag" etc.).
"""
import re
import sys
from pathlib import Path

SELF_CLOSING_OK = True  # every tag in wxml may self-close


def strip_comments(text):
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def scan(path):
    errors = []
    src = strip_comments(path.read_text(encoding="utf-8"))
    stack = []  # (tagname, line, col)
    i, line, col = 0, 1, 1
    n = len(src)

    def advance(k):
        nonlocal i, line, col
        while k > 0:
            if src[i] == "\n":
                line += 1
                col = 1
            else:
                col += 1
            i += 1
            k -= 1

    while i < n:
        ch = src[i]
        if ch == "<":
            if src.startswith("</", i):
                m = re.match(r"</\s*([A-Za-z_][\w.-]*)\s*>", src[i:])
                if not m:
                    errors.append((line, col, f"malformed end tag at {line}:{col}"))
                    advance(1)
                    continue
                tag = m.group(1)
                if not stack:
                    errors.append((line, col, f"unexpected end tag: {tag}"))
                else:
                    top, tl, tc = stack[-1]
                    if top == tag:
                        stack.pop()
                    else:
                        errors.append(
                            (line, col,
                             f"unexpected end tag: {tag} (open tag <{top}> from {tl}:{tc} still unclosed)"))
                        # attempt recovery: pop until match found
                        for idx in range(len(stack) - 1, -1, -1):
                            if stack[idx][0] == tag:
                                del stack[idx:]
                                break
                advance(m.end())
                continue
            m = re.match(r"<([A-Za-z_][\w.-]*)", src[i:])
            if m:
                tag = m.group(1)
                j = i + m.end()
                quote = None
                # scan to end of tag '>', respecting quotes
                while j < n:
                    c = src[j]
                    if quote:
                        if c == quote:
                            quote = None
                    elif c in ('"', "'"):
                        quote = c
                    elif c == ">":
                        break
                    j += 1
                if j >= n:
                    errors.append((line, col, f"unterminated tag <{tag}>"))
                    break
                self_closing = src[j - 1] == "/"
                # find start col of this tag
                stack.append((tag, line, col)) if not self_closing else None
                advance(j - i + 1)
                continue
            # lone '<' in text — skip it
            advance(1)
            continue
        advance(1)

    for tag, tl, tc in stack:
        errors.append((tl, tc, f"unclosed tag: <{tag}> opened at {tl}:{tc}"))
    return errors


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("miniprogram")
    files = sorted(root.rglob("*.wxml"))
    total = 0
    for f in files:
        errs = scan(f)
        if errs:
            total += len(errs)
            print(f"\n== {f} ==")
            for ln, col, msg in errs:
                print(f"  {ln}:{col}  {msg}")
    print(f"\n{len(files)} wxml files scanned, {total} errors")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
