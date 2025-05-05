import { Bot } from "@skyware/bot";
import { Buffer } from "node:buffer";
import process from "node:process";
import sharp from "sharp";
import { ArchiveIndex, generateAltText, loadImageAtIndex } from "./archive.ts";

const bot = new Bot();

const identifier = process.env.BLUESKY_USERNAME || "";
if (!identifier) {
  throw new Error("BLUESKY_USERNAME is not set");
}
const password = process.env.BLUESKY_PASSWORD || "";
if (!password) {
  throw new Error("BLUESKY_PASSWORD is not set");
}

const TEST_ARCHIVE_INDEX = {
  series: 0,
  volume: 1,
  page: 5
} as ArchiveIndex

async function main() {
  await bot.login({ identifier, password });

  // Load the image and calculate its aspect ratio
  //const imagePath = "testimg.jpg";
  const { buffer, aspectRatio, meta } = await loadImageAtIndex(TEST_ARCHIVE_INDEX);

  const alt = generateAltText(meta);

  // Post the image to Bluesky using the calculated aspect ratio
  const post = await bot.post({
    text: '',
    images: [
      {
        data: new Blob([buffer], { type: 'image/jpeg' }),
        alt,
        aspectRatio,
      },
    ],
  });

  console.log(post);
}

main();