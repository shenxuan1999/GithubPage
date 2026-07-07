const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const outputFile = path.join(root, "tools.json");
const excludedFolders = new Set([".git", ".github", "node_modules"]);

const decodeEntities = (value) => {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
};

const stripTags = (value) => {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
};

const matchText = (html, pattern) => {
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
};

const prettifyName = (name) => {
  return name
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const readPageInfo = (folderName, fileName) => {
  const html = fs.readFileSync(path.join(root, folderName, fileName), "utf8");
  const title = matchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    matchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    (fileName.toLowerCase() === "index.html" ? `${folderName} 工具` : prettifyName(fileName));
  const description = matchText(html, /<[^>]+class=["'][^"']*\bsubtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    matchText(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    `${folderName} 文件夹下的 HTML 工具。`;

  const tags = [folderName];

  if (fileName.toLowerCase() !== "index.html") {
    tags.push("HTML");
  }

  return {
    file: fileName,
    title,
    description,
    href: `${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`,
    tags
  };
};

const folders = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => !entry.name.startsWith(".") && !excludedFolders.has(entry.name))
  .sort((first, second) => first.name.localeCompare(second.name, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base"
  }));

const groups = folders.map((folder) => {
  const folderPath = path.join(root, folder.name);
  const htmlFiles = fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((first, second) => {
      if (first.toLowerCase() === "index.html") {
        return -1;
      }

      if (second.toLowerCase() === "index.html") {
        return 1;
      }

      return first.localeCompare(second, "zh-Hans-CN", {
        numeric: true,
        sensitivity: "base"
      });
    });

  return {
    name: folder.name,
    tools: htmlFiles.map((fileName) => readPageInfo(folder.name, fileName))
  };
});

fs.writeFileSync(outputFile, `${JSON.stringify({ groups }, null, 2)}\n`, "utf8");
console.log(`Generated tools.json with ${groups.length} groups.`);
