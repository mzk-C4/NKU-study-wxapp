// Keep the site's purple palette and system body font inside mp-html's native nodes.
const heading = 'color:var(--nk-accent,#4B1F6F);font-weight:700;line-height:1.45;'
module.exports = Object.freeze({
  p: 'margin:0 0 1em;line-height:1.85;',
  h1: heading + 'font-size:1.45em;margin:1.8em 0 .7em;',
  h2: heading + 'font-size:1.3em;margin:1.65em 0 .65em;',
  h3: heading + 'font-size:1.15em;margin:1.5em 0 .6em;',
  h4: heading + 'font-size:1.05em;margin:1.3em 0 .6em;',
  h5: heading + 'font-size:1em;margin:1.2em 0 .6em;',
  h6: heading + 'font-size:1em;margin:1.2em 0 .6em;',
  ul: 'padding-left:1.4em;margin:.7em 0 1.2em;',
  ol: 'padding-left:1.6em;margin:.7em 0 1.2em;',
  li: 'padding-left:.15em;margin:.45em 0;line-height:1.85;',
  a: 'color:var(--nk-accent,#69309A);text-decoration:underline;',
  strong: 'font-weight:700;color:var(--nk-text,#282230);',
  blockquote: 'margin:1.2em 0;padding:.9em 1em;border-left:3px solid var(--nk-accent,#8960AD);background:var(--nk-soft,#F5F0F9);border-radius:0 8px 8px 0;color:var(--nk-muted,#5E5369);',
  img: 'display:block;max-width:100%;height:auto;margin:1.2em auto;border-radius:6px;',
  hr: 'height:0;border:0;border-top:1px solid var(--nk-line,#E8E1ED);margin:1.8em 0;',
  code: 'padding:.12em .3em;border-radius:4px;background:var(--nk-soft,#F5F0F9);font-family:monospace;font-size:.9em;',
  table: 'border-collapse:collapse;font-size:.9em;line-height:1.6;margin:1em 0;',
  th: 'padding:.65em .8em;border:1px solid var(--nk-line,#DDD3E5);background:var(--nk-soft,#F5F0F9);font-weight:700;',
  td: 'padding:.65em .8em;border:1px solid var(--nk-line,#DDD3E5);vertical-align:top;'
})
