import { glossary } from '../data/glossary.mjs';

const labels = {
  do: 'What to do',
  tradeoff: 'Trade-off',
  interview: 'In the interview',
  avoid: 'Avoid',
  distinguish: 'Do not confuse',
};

// Keep inline code unchanged while making article links usable outside the site.
function inlineText(line, articleUrl) {
  return line.replace(/(`+)(.*?)\1|<!--.*?-->|\]\(([^\s)]+)([^)]*)\)/g, (match, ticks, _code, href, suffix) => {
    if (ticks) return match;
    if (!href) return '';
    return `](${new URL(href, articleUrl).href}${suffix})`;
  });
}

/** Export article text with expanded callouts and glossary notes, omitting diagrams. */
export function articleMarkdown({ title, description, body, renderedHtml = '', articleUrl, siteRoot }) {
  const output = [];
  const containers = [];
  let fence;
  const emit = (text) => output.push(...text.split('\n').map((line) => `${'> '.repeat(containers.length)}${line}`.trimEnd()));

  for (const line of body.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      emit(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker[1];
      emit(line);
      continue;
    }
    const directive = line.match(/^(:{3,})(\w+)?\s*$/);
    if (directive) {
      if (directive[2]) {
        const label = labels[directive[2]];
        if (!label) throw new Error(`Unknown article block: ${directive[2]}`);
        containers.push(directive[1]);
        emit(`**${label}**\n`);
      } else {
        if (!containers.length || directive[1].length < containers.at(-1).length) throw new Error('Unmatched article block');
        containers.pop();
        emit('');
      }
      continue;
    }
    if (/^::diagram\{.*\}\s*$/.test(line)) continue;
    emit(inlineText(line, articleUrl));
  }
  if (containers.length) throw new Error('Unclosed article block');

  // Only include definitions that the rendered article actually shows as tooltips.
  const termIds = new Set([...renderedHtml.matchAll(/id="term-tip-([^"]+)"/g)].map((match) => match[1]));
  const notes = glossary.filter((term) => termIds.has(term.id)).map((term) => {
    const name = term.expansion ? `${term.term} (${term.expansion})` : term.term;
    const more = term.readMore ? ` [${term.readMore.label}](${new URL(term.readMore.href, siteRoot).href})` : '';
    return `**${name}**: ${term.short} ${term.explanation}${more}`;
  });
  return [
    `# ${title}`, description, output.join('\n').trim(),
    ...(notes.length ? ['## Glossary notes', ...notes] : []),
  ].filter(Boolean).join('\n\n') + '\n';
}
