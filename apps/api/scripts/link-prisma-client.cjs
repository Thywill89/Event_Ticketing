const fs = require("fs");
const path = require("path");

const apiRoot = path.join(__dirname, "..");
const linkPath = path.join(apiRoot, "node_modules", "@prisma", "client");
const targetPath = path.join(apiRoot, "..", "..", "node_modules", "@prisma", "client");

if (!fs.existsSync(targetPath)) {
  console.warn("@prisma/client not found at repo root; skipping local link.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(linkPath), { recursive: true });

try {
  const existing = fs.lstatSync(linkPath);
  if (existing.isSymbolicLink() || existing.isDirectory()) {
    process.exit(0);
  }
} catch {
  // link does not exist yet
}

try {
  fs.symlinkSync(targetPath, linkPath, "junction");
  console.log("Linked @prisma/client into apps/api/node_modules");
} catch (error) {
  console.warn("Could not link @prisma/client:", error.message);
}
