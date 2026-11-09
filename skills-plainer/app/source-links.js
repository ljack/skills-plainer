// Only create source links when the repository, revision and skill directory are known.
export function sourceFileURL(a, path, line, end) {
  const repo = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(a?.sourceUrl || "");
  if (!repo || !/^[a-f0-9]{40}$/i.test(a.sourceCommit || "") || typeof a.sourcePath !== "string") return null;
  const safePath = (p, root = false) => typeof p === "string" && (root && p === "" ||
    p !== "" && !p.includes("\\") && !p.startsWith("/") && p.split("/").every((s) => s && s !== "." && s !== ".."));
  if (!safePath(a.sourcePath, true) || !safePath(path)) return null;
  const file = (a.inventory?.files || []).find((f) => f.path === path);
  if (!file) return null;
  let fragment = "";
  if (line != null && line !== "") {
    const first = Number(line), last = end == null || end === "" ? first : Number(end);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first ||
        !Number.isInteger(file.lines) || last > file.lines) return null;
    fragment = "#L" + first + (last > first ? "-L" + last : "");
  } else if (end != null && end !== "") return null;
  const segments = [a.sourcePath, path].filter(Boolean).join("/").split("/").map(encodeURIComponent);
  return "https://github.com/" + repo[1] + "/" + repo[2] + "/blob/" + a.sourceCommit + "/" + segments.join("/") + fragment;
}

function sourceAnchor(doc, url, title) {
  const link = doc.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = title + " (analyzed revision; opens in a new tab)";
  return link;
}

export function linkSourceReferences(root, a) {
  const files = (a?.inventory?.files || []).map((f) => f.path).filter((p) => sourceFileURL(a, p));
  if (!root || !files.length) return;
  const doc = root.ownerDocument;
  // Preserve chip styling and provide native copy-link and new-tab behavior.
  root.querySelectorAll("button.ev[data-file], button.filechip[data-file]").forEach((button) => {
    const url = sourceFileURL(a, button.dataset.file, button.dataset.line, button.dataset.end);
    if (!url) return;
    const link = sourceAnchor(doc, url, "View " + button.textContent.trim() + " on GitHub");
    link.className = button.className;
    if (button.hasAttribute("style")) link.setAttribute("style", button.getAttribute("style"));
    link.append(...button.childNodes);
    button.replaceWith(link);
  });
  const escapeRE = (s) => s.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  const pattern = new RegExp("(^|[\\s(\\[,;])(" + files.sort((p, q) => q.length - p.length).map(escapeRE).join("|") +
    "):(\\d+(?:[-–]\\d+)?(?:,\\s*\\d+(?:[-–]\\d+)?)*)(?=$|[\\s)\\],;.!?\"'])", "g");
  const walker = doc.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("a,button,pre,script,style,textarea,[contenteditable]")) nodes.push(node);
  }
  for (const node of nodes) {
    const text = node.textContent;
    pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(text.slice(cursor, match.index), match[1]);
      let numberEnd = 0;
      const numbers = [...match[3].matchAll(/\d+(?:[-–]\d+)?/g)];
      for (const [index, number] of numbers.entries()) {
        fragment.append(match[3].slice(numberEnd, number.index));
        const [first, last] = number[0].split(/[-–]/);
        const label = (index === 0 ? match[2] + ":" : "") + number[0];
        const url = sourceFileURL(a, match[2], first, last);
        if (url) {
          const link = sourceAnchor(doc, url, "View " + match[2] + ":" + number[0] + " on GitHub");
          link.className = "source-ref";
          link.textContent = label;
          fragment.append(link);
        } else fragment.append(label);
        numberEnd = number.index + number[0].length;
      }
      cursor = match.index + match[0].length;
    }
    fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
}
