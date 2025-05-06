import { Bot, PostSelfLabels } from "@skyware/bot";
import { Buffer } from "node:buffer";
import process, { exit } from "node:process";
import sharp from "sharp";
import { ArchiveIndex, generateAltText, loadArchiveIndex, loadImageAtIndex, makeNextIndex, saveArchiveIndex } from "./archive.ts";

const bot = new Bot();

const identifier = process.env.BLUESKY_USERNAME || "";
if (!identifier) {
  throw new Error("BLUESKY_USERNAME is not set");
}
const password = process.env.BLUESKY_PASSWORD || "";
if (!password) {
  throw new Error("BLUESKY_PASSWORD is not set");
}

async function main() {
  await bot.login({ identifier, password });

  const currentIndex = loadArchiveIndex();

  // Load the image and calculate its aspect ratio
  const { buffer, aspectRatio, meta, sequence } = await loadImageAtIndex(currentIndex);

  const alt = generateAltText(meta);

  const post = await bot.post({
    text: '',
    images: [
      {
        data: new Blob([buffer], { type: 'image/jpeg' }),
        alt,
        aspectRatio,
      },
    ],
    labels: [
      PostSelfLabels.Porn
    ]
  });

  console.log(`new post URI: ${post.uri}`);

  // Save the updated index
  const newIndex = makeNextIndex(currentIndex, sequence);
  saveArchiveIndex(newIndex);
}

await main();
exit(0);
