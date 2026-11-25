import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const source = new URL("../", import.meta.url);
const output = new URL("dist/", source);
const read = (path) => readFileSync(new URL(path, source), "utf8");
const dataURL = (path, type) => "data:" + type + ";base64," + readFileSync(new URL(path, source)).toString("base64");

const styles = read("src/styles.css").replace("../assets/hero-filaments.webp", dataURL("assets/hero-filaments.webp", "image/webp"));
const html = read("index.html")
  .replace("./assets/folio-icon.png", dataURL("assets/folio-icon.png", "image/png"))
  .replace('<link rel="stylesheet" href="./src/styles.css">', () => "<style>\n" + styles + "\n</style>")
  .replace(/<script defer src="\.\/(src\/[^"]+\.js|assets\/editor\.js)"><\/script>/g, (_, path) =>
    "<script>\n" + read(path).replace(/<\/script/gi, "<\\/script") + "\n</script>");

mkdirSync(output, { recursive: true });
writeFileSync(new URL("index.html", output), html);
