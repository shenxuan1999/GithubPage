const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = __dirname;
const outputFile = path.join(root, "tools.json");
const configFile = path.join(root, "tools.config.json");
const excludedFolders = new Set([".git", ".github", "node_modules", "visitor"]);

const config = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
const groupOrder = Array.isArray(config.groupOrder) ? config.groupOrder : [];
const groupOrderIndex = new Map(
  groupOrder.map((folderName, index) => [String(folderName).toLowerCase(), index])
);
const toolOrder = config.toolOrder && typeof config.toolOrder === "object"
  ? config.toolOrder
  : {};
const toolOrderIndexes = new Map(
  Object.entries(toolOrder).map(([folderName, fileNames]) => [
    folderName.toLowerCase(),
    new Map(
      (Array.isArray(fileNames) ? fileNames : [])
        .map((fileName, index) => [String(fileName).toLowerCase(), index])
    )
  ])
);

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

const getTrackedFolderNames = () => {
  try {
    const files = execSync("git ls-files", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split(/\r?\n/);
    const names = new Map();

    files.forEach((file) => {
      const [folderName] = file.split("/");

      if (folderName && !folderName.includes(".")) {
        names.set(folderName.toLowerCase(), folderName);
      }
    });

    return names;
  } catch (error) {
    return new Map();
  }
};

const readPageInfo = (folderName, hrefFolderName, fileName) => {
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
    href: `${encodeURIComponent(hrefFolderName)}/${encodeURIComponent(fileName)}`,
    tags
  };
};

const trackedFolderNames = getTrackedFolderNames();

const folders = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => !entry.name.startsWith(".") && !excludedFolders.has(entry.name.toLowerCase()))
  .sort((first, second) => {
    const firstOrder = groupOrderIndex.get(first.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const secondOrder = groupOrderIndex.get(second.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return first.name.localeCompare(second.name, "zh-Hans-CN", {
      numeric: true,
      sensitivity: "base"
    });
  });

const groups = folders.map((folder) => {
  const folderPath = path.join(root, folder.name);
  const hrefFolderName = trackedFolderNames.get(folder.name.toLowerCase()) || folder.name;
  const configuredToolOrder = toolOrderIndexes.get(folder.name.toLowerCase()) || new Map();
  const htmlFiles = fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((first, second) => {
      const firstOrder = configuredToolOrder.get(first.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = configuredToolOrder.get(second.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

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
    tools: htmlFiles.map((fileName) => readPageInfo(folder.name, hrefFolderName, fileName))
  };
});

fs.writeFileSync(outputFile, `${JSON.stringify({ groups }, null, 2)}\n`, "utf8");
console.log(`Generated tools.json with ${groups.length} groups.`);
