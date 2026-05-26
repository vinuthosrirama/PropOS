// Post-build patch: add data-cfasync="false" to all module script tags in dist/index.html
// This opts PropOS out of Cloudflare Rocket Loader, which breaks Vite ES modules by
// mangling type="module" to a random hash string on the addvantage.site zone.
const fs = require("fs")
const path = require("path")

const htmlPath = path.join(__dirname, "..", "dist", "index.html")
if (!fs.existsSync(htmlPath)) {
  console.log("[patch-html] dist/index.html not found, skipping")
  process.exit(0)
}

let html = fs.readFileSync(htmlPath, "utf8")
const before = html
html = html.replace(
  /<script type="module" crossorigin(?! data-cfasync)/g,
  '<script type="module" crossorigin data-cfasync="false"'
)
fs.writeFileSync(htmlPath, html)
console.log(
  before !== html
    ? "[patch-html] Added data-cfasync=\"false\" to module scripts in dist/index.html"
    : "[patch-html] data-cfasync already present, no changes needed"
)
