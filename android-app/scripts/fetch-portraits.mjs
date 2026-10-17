// Build step: bundle the interviewer photos into the app (any that fail to download fall back to drawn portraits).
import { mkdirSync, writeFileSync } from "node:fs";
const P = {
  "p-jessica": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  "p-priya": "https://images.pexels.com/photos/29811345/pexels-photo-29811345.jpeg?auto=compress&cs=tinysrgb&w=900",
  "p-david": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  "p-elena": "https://images.unsplash.com/photo-1580894908361-967195033215?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  "p-marcus": "https://images.pexels.com/photos/5483147/pexels-photo-5483147.jpeg?auto=compress&cs=tinysrgb&w=900",
  "p-raj": "https://images.pexels.com/photos/38889922/pexels-photo-38889922.jpeg?auto=compress&cs=tinysrgb&w=900",
  "p-sarah": "https://images.unsplash.com/photo-1604904612715-47bf9d9bc670?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  "p-james": "https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
};
mkdirSync(new URL("../www/portraits/", import.meta.url), { recursive: true });
let ok = 0;
for (const [id, url] of Object.entries(P)) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 5000) throw new Error("too small");
    writeFileSync(new URL(`../www/portraits/${id}.jpg`, import.meta.url), buf); ok++;
  } catch (e) { console.warn("skip", id, e.message); }
}
console.log(`bundled ${ok} interviewer photos`);
