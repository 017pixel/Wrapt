import { dirname, resolve, sep } from "node:path";

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return value
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeHref(target, source, pageIds, contentRoot) {
  const [pathPart, ...hashParts] = target.split("#");
  const anchor = hashParts.length ? `#${hashParts.join("#")}` : "";
  if (/^https:\/\//i.test(pathPart)) return `${pathPart}${anchor}`;
  if (/^mailto:/i.test(pathPart)) return `${pathPart}${anchor}`;
  if (!pathPart) return `#/${pageIds.get(source)}${anchor}`;
  if (pathPart.startsWith("#")) return pathPart;

  const resolved = resolve(contentRoot, dirname(source), pathPart);
  if (!resolved.startsWith(`${contentRoot}${sep}`) && resolved !== contentRoot) return "";
  const relative = resolved.slice(contentRoot.length + 1).replaceAll(sep, "/");
  if (!relative.endsWith(".md")) return "";
  const id = pageIds.get(relative);
  return id ? `#/${id}${anchor}` : "";
}

function safeImage(target, source, contentRoot, assetNames) {
  const match = target.match(/(?:^|\/)assets\/([^/]+)$/);
  const filename = match?.[1];
  if (filename && assetNames.has(filename)) return `./assets/${encodeURIComponent(filename)}`;

  const resolved = resolve(contentRoot, dirname(source), target);
  if (!resolved.startsWith(`${contentRoot}${sep}`)) return "";
  const relative = resolved.slice(contentRoot.length + 1).replaceAll(sep, "/");
  if (!relative.startsWith("assets/") || !assetNames.has(relative.slice(7))) return "";
  return `./${relative.split("/").map(encodeURIComponent).join("/")}`;
}

function inlineMarkdown(value, source, pageIds, contentRoot, assetNames) {
  const tokens = [];
  const hold = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let text = value.replace(/`([^`]+)`/g, (_match, code) => hold(`<code>${escapeHtml(code)}</code>`));

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, target) => {
    const src = safeImage(target.trim(), source, contentRoot, assetNames);
    if (!src) return escapeHtml(alt);
    return hold(`<img src="${src}" alt="${escapeHtml(alt.trim())}" loading="lazy" />`);
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, target) => {
    const href = safeHref(target.trim(), source, pageIds, contentRoot);
    if (!href) return escapeHtml(label);
    const external = /^https:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return hold(`<a href="${escapeHtml(href)}"${attrs}>${inlineMarkdown(label, source, pageIds, contentRoot, assetNames)}</a>`);
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] ?? "");
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderTable(lines, index, renderInline) {
  const headings = tableCells(lines[index]);
  const rows = [];
  let cursor = index + 2;
  while (cursor < lines.length && /^\s*\|/.test(lines[cursor])) {
    rows.push(tableCells(lines[cursor]));
    cursor += 1;
  }
  const head = `<thead><tr>${headings.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join("")}</tr></thead>`;
  const body = rows.map((row) => `<tr>${headings.map((_cell, i) => `<td>${renderInline(row[i] ?? "")}</td>`).join("")}</tr>`).join("");
  return { html: `<div class="table-scroll"><table>${head}${body ? `<tbody>${body}</tbody>` : ""}</table></div>`, next: cursor };
}

function parseFence(line) {
  const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
  return match ? { marker: match[1], language: match[2].trim() } : null;
}

function closesFence(line, marker) {
  const trimmed = line.trim();
  return trimmed.length >= marker.length && [...trimmed].every((character) => character === marker[0]);
}

export function renderMarkdown(markdown, source, pageIds, contentRoot, assetNames, options = {}) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output = [];
  const headingCounts = new Map();
  const renderInline = (value) => inlineMarkdown(value, source, pageIds, contentRoot, assetNames);
  let firstParagraph = Boolean(options.leadFirstParagraph);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = parseFence(line);
    if (fence) {
      const language = fence.language;
      const code = [];
      index += 1;
      while (index < lines.length && !closesFence(lines[index], fence.marker)) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const langClass = /^[a-z0-9-]+$/i.test(language) ? ` class="language-${language}"` : "";
      output.push(`<pre><code${langClass}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      const src = safeImage(image[2].trim(), source, contentRoot, assetNames);
      if (src) output.push(`<figure><img src="${src}" alt="${escapeHtml(image[1].trim())}" loading="lazy" /><figcaption>${escapeHtml(image[1].trim())}</figcaption></figure>`);
      index += 1;
      continue;
    }

    if (line.trim() === ":::flow") {
      const steps = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        const match = lines[index].match(/^\s*\*\*(.+?)\*\*\s*\|\s*(.+)$/);
        if (match) steps.push({ title: match[1], text: match[2] });
        index += 1;
      }
      if (index < lines.length) index += 1;
      if (steps.length) {
        output.push(`<div class="flow-diagram" role="list">${steps.map((step, i) => `<div class="flow-step" role="listitem"><span class="flow-step__number">0${i + 1}</span><strong>${renderInline(step.title)}</strong><p>${renderInline(step.text)}</p></div>`).join("")}</div>`);
      }
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      const level = Math.min(6, match[1].length + (options.headingOffset ?? 0));
      const title = match[2];
      const baseId = slugify(title) || "abschnitt";
      const seen = headingCounts.get(baseId) ?? 0;
      headingCounts.set(baseId, seen + 1);
      const id = seen ? `${baseId}-${seen + 1}` : baseId;
      output.push(`<h${level} id="${id}">${renderInline(title)}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      output.push("<hr />");
      index += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const table = renderTable(lines, index, renderInline);
      output.push(table.html);
      index = table.next;
      continue;
    }

    if (/^>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      const notice = quote[0]?.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT|SUCCESS)\]\s*(.*)$/i);
      let kind = "note";
      if (notice) {
        const name = notice[1].toLocaleLowerCase("en-US");
        kind = name === "warning" || name === "caution" ? "warning" : name === "success" ? "success" : "note";
        quote[0] = notice[2] || ({ note: "Hinweis", tip: "Tipp", warning: "Achtung", caution: "Vorsicht", important: "Wichtig", success: "Erledigt" }[name]);
      }
      const paragraphs = quote.filter(Boolean).map((part) => `<p>${renderInline(part)}</p>`).join("");
      output.push(`<blockquote data-kind="${kind}">${paragraphs}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length && (/^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+\.\s+/.test(lines[index]))) {
        items.push(lines[index].replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, ""));
        index += 1;
      }
      output.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !parseFence(lines[index]) && !/^#{1,6}\s|^\s*\||^>|^\s*[-*+]\s|^\s*\d+\.\s|^:::flow$|^---$/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    const className = firstParagraph ? ' class="lead"' : "";
    firstParagraph = false;
    output.push(`<p${className}>${renderInline(paragraph.join(" "))}</p>`);
  }

  return output.join("\n");
}
