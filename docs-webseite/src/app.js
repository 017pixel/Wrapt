const article = document.querySelector("#article");
const desktopNavigation = document.querySelector("#desktop-navigation");
const mobileNavigation = document.querySelector("#mobile-navigation");
const tableOfContents = document.querySelector("#table-of-contents");
const breadcrumb = document.querySelector("#breadcrumbs");
const pageTurn = document.querySelector("#page-turn");
const searchDialog = document.querySelector("#search-dialog");
const navigationDialog = document.querySelector("#navigation-dialog");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");

let groups = [];
let pages = [];
let pageById = new Map();
let currentId = "";
let releaseFilter = "all";

function escapeText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function flatNavigation() {
  return groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));
}

function renderNavigation(target) {
  target.innerHTML = groups.map((group) => {
    const links = group.items.map((item) => {
      const page = pageById.get(item.id);
      if (!page) return "";
      return `<a class="navigation-link" href="#/${page.id}" data-page-link="${escapeText(page.id)}">${escapeText(page.title)}</a>`;
    }).join("");
    return `<section class="navigation-group"><h2 class="navigation-group__title">${escapeText(group.title)}</h2>${links}</section>`;
  }).join("");
}

function routeFromHash() {
  const fragment = window.location.hash.slice(1);
  if (!fragment.startsWith("/")) return { id: currentId || "start", anchor: fragment.split("#").at(-1) ?? "" };
  const value = fragment.replace(/^\//, "");
  const [id, ...anchorParts] = value.split("#");
  return { id: pageById.has(id) ? id : "start", anchor: anchorParts.join("#") };
}

function renderBreadcrumb(page) {
  breadcrumb.innerHTML = `<a href="#/start">Dokumentation</a><span class="breadcrumbs__divider">/</span><span>${escapeText(page.group)}</span><span class="breadcrumbs__divider">/</span><span>${escapeText(page.title)}</span>`;
}

function renderToc() {
  if (currentId === "changelog") {
    tableOfContents.innerHTML = "";
    document.querySelector(".toc__title").hidden = true;
    return;
  }
  document.querySelector(".toc__title").hidden = false;
  const headings = [...article.querySelectorAll("h2[id], h3[id]")];
  tableOfContents.innerHTML = headings.map((heading) => {
    const level = heading.tagName === "H3" ? "3" : "2";
    return `<a href="#/${currentId}#${heading.id}" data-level="${level}">${escapeText(heading.textContent ?? "")}</a>`;
  }).join("");
}

function renderPageTurn(page) {
  const nav = flatNavigation();
  const index = nav.findIndex((item) => item.id === page.id);
  const previous = nav[index - 1] ? pageById.get(nav[index - 1].id) : null;
  const next = nav[index + 1] ? pageById.get(nav[index + 1].id) : null;
  const link = (target, direction, className) => target
    ? `<a class="page-turn__link ${className}" href="#/${target.id}"><span class="page-turn__direction">${direction}</span><span class="page-turn__title">${escapeText(target.title)}</span></a>`
    : "<span></span>";
  pageTurn.innerHTML = `${link(previous, "Zurück", "page-turn__link--previous")}${link(next, "Weiter", "page-turn__link--next")}`;
}

function renderPage(id) {
  const page = pageById.get(id) ?? pageById.get("start");
  currentId = page.id;
  article.innerHTML = page.content;
  article.setAttribute("aria-label", page.title);
  document.title = `${page.title} · Wrapt Dokumentation`;
  renderBreadcrumb(page);
  renderToc();
  renderPageTurn(page);
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    if (link.dataset.pageLink === page.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  bindReleaseFilters();
}

function scrollToAnchor(anchor) {
  if (!anchor) return;
  requestAnimationFrame(() => document.getElementById(decodeURIComponent(anchor))?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

function handleRoute() {
  const { id, anchor } = routeFromHash();
  const changed = id !== currentId;
  if (changed) renderPage(id);
  if (anchor) scrollToAnchor(anchor);
  else if (changed) window.scrollTo({ top: 0, behavior: "auto" });
  if (navigationDialog.open) navigationDialog.close();
}

function excerpt(page, query) {
  const text = page.search.replace(/\s+/g, " ");
  const index = text.toLocaleLowerCase("de-DE").indexOf(query.toLocaleLowerCase("de-DE"));
  const start = index < 0 ? 0 : Math.max(0, index - 42);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 120)}${start + 120 < text.length ? "…" : ""}`;
}

function resultScore(page, query, terms) {
  const title = page.title.toLocaleLowerCase("de-DE");
  const group = page.group.toLocaleLowerCase("de-DE");
  let score = title === query ? 120 : title.startsWith(query) ? 90 : title.includes(query) ? 70 : 0;
  for (const term of terms) {
    if (title.includes(term)) score += 20;
    else if (group.includes(term)) score += 8;
  }
  const content = page.search.toLocaleLowerCase("de-DE");
  let cursor = 0;
  for (let count = 0; count < 5; count += 1) {
    const index = content.indexOf(query, cursor);
    if (index < 0) break;
    score += 5;
    cursor = index + query.length;
  }
  return score;
}

function updateSearch() {
  const query = searchInput.value.trim();
  const terms = query.toLocaleLowerCase("de-DE").split(/\s+/).filter(Boolean);
  const normalizedQuery = query.toLocaleLowerCase("de-DE");
  const matches = pages.filter((page) => {
    const searchable = `${page.title} ${page.group} ${page.search}`.toLocaleLowerCase("de-DE");
    return terms.every((term) => searchable.includes(term));
  }).sort((left, right) => resultScore(right, normalizedQuery, terms) - resultScore(left, normalizedQuery, terms)).slice(0, 12);

  if (!query) {
    searchResults.innerHTML = `<p class="search-empty">Gib einen Begriff ein. Beispiele: Orbit, Terminal, Sicherung, Changelog.</p>`;
    return;
  }
  if (!matches.length) {
    searchResults.innerHTML = `<p class="search-empty">Keine passenden Seiten gefunden.</p>`;
    return;
  }
  searchResults.innerHTML = matches.map((page) => `<a class="search-result" role="option" href="#/${page.id}"><span class="search-result__group">${escapeText(page.group)}</span><strong>${escapeText(page.title)}</strong><span class="search-result__excerpt">${escapeText(excerpt(page, query))}</span></a>`).join("");
}

function openSearch() {
  if (!searchDialog.open) searchDialog.showModal();
  searchInput.value = "";
  updateSearch();
  requestAnimationFrame(() => searchInput.focus());
}

function bindReleaseFilters() {
  const releases = [...article.querySelectorAll("[data-release]")];
  const search = article.querySelector("#release-search");
  if (!releases.length || !search) return;
  const filters = [...article.querySelectorAll("[data-release-filter]")];
  const count = article.querySelector(".release-count");
  const empty = article.querySelector(".release-empty");

  const update = () => {
    const query = search.value.trim().toLocaleLowerCase("de-DE");
    let visible = 0;
    for (const release of releases) {
      const matchesText = !query || release.dataset.search.includes(query);
      const matchesType = releaseFilter === "all" || release.dataset.categories.includes(releaseFilter);
      release.hidden = !(matchesText && matchesType);
      if (!release.hidden) visible += 1;
    }
    count.textContent = `${visible} von ${releases.length} Versionen`;
    empty.hidden = visible > 0;
  };

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      releaseFilter = button.dataset.releaseFilter;
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      update();
    });
  });
  search.addEventListener("input", update);
  update();
}

function bindControls() {
  document.querySelectorAll("[data-open-search]").forEach((button) => button.addEventListener("click", openSearch));
  document.querySelector("[data-close-search]").addEventListener("click", () => searchDialog.close());
  document.querySelector("[data-open-navigation]").addEventListener("click", () => navigationDialog.showModal());
  document.querySelector("[data-close-navigation]").addEventListener("click", () => navigationDialog.close());
  searchInput.addEventListener("input", updateSearch);
  searchDialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const firstResult = searchResults.querySelector("a[href]");
    if (!firstResult) return;
    window.location.hash = firstResult.getAttribute("href");
    searchDialog.close();
  });
  searchResults.addEventListener("click", (event) => {
    if (event.target.closest("a")) searchDialog.close();
  });
  navigationDialog.addEventListener("click", (event) => {
    if (event.target.closest("a")) navigationDialog.close();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("en-US") === "k") {
      event.preventDefault();
      openSearch();
    }
  });
  window.addEventListener("hashchange", handleRoute);
}

async function start() {
  try {
    const response = await fetch("./data/pages.json");
    if (!response.ok) throw new Error(`Dokumentationsdaten nicht geladen (${response.status}).`);
    const data = await response.json();
    groups = data.groups;
    pages = data.pages;
    pageById = new Map(pages.map((page) => [page.id, page]));
    renderNavigation(desktopNavigation);
    renderNavigation(mobileNavigation);
    bindControls();
    handleRoute();
  } catch (error) {
    article.innerHTML = `<h1>Dokumentation nicht verfügbar</h1><p>${escapeText(error instanceof Error ? error.message : String(error))}</p><p>Prüfe, ob die statische Doku vollständig gebaut und unter <code>/Wrapt/doku/</code> veröffentlicht wurde.</p>`;
  }
}

start();
