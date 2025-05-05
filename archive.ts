import { Buffer } from "node:buffer";
import sharp from "sharp";

export type ArchiveIndex = { 
    series: number;
    volume: number;
    page: number;
}

export type LoadedImage = {
    buffer: Buffer;
    aspectRatio: { width: number; height: number };
}

export type LoadedLabeledImage = {
    buffer: Buffer;
    aspectRatio: { width: number; height: number };
    meta: PostMetadata;
}

export type PostMetadata = {
    seriesName: string;
    volumeNumber: number;
    pageNumber: number;
};

export function generateAltText(meta: PostMetadata): string {
    return `volume ${meta.volumeNumber}, page ${meta.pageNumber} of ${meta.seriesName}`;
}
  
/**
 * Loads the image from disk and calculates its aspect ratio.
 * @param filePath - The path to the image file.
 * @returns An object containing the image buffer and the aspect ratio.
 */
async function getImageDataAndAspect(filePath: string): Promise<LoadedImage> {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("failed to retrieve image dimensions");
    }
    const buffer = await image.toBuffer();
    return { buffer, aspectRatio: { width: metadata.width, height: metadata.height } };
}

async function loadSeriesPaths(): Promise<string[]> {
    let series: string[] = [];
    try {
        for await (const entry of Deno.readDir(ARCHIVE_ROOT)) {
            if (entry.isDirectory) {
                series.push(`${entry.name}`);
            }
        }
    } catch (error) {
        throw new Error(`failed to read series paths from ${ARCHIVE_ROOT}: ${error}`);
    }
    // make sure they're sorted alphanumerically
    series = series.sort((a, b) => a.localeCompare(b));
    return series;
}

async function loadVolumePaths(seriesPathSegment: string): Promise<string[]> {
    const seriesPath = `${ARCHIVE_ROOT}/${seriesPathSegment}`;
    let volumes: string[] = [];
    try {
        for await (const entry of Deno.readDir(seriesPath)) {
            if (entry.isDirectory) {
                volumes.push(`${seriesPath}/${entry.name}`);
            }
        }
    } catch (error) {
        throw new Error(`failed to read volume paths from ${seriesPath}: ${error}`);
    }

    // make sure they're sorted alphanumerically
    volumes = volumes.sort((a, b) => a.localeCompare(b));
    return volumes;
}

async function loadImagePaths(volumePath: string): Promise<string[]> {
    let imagePaths: string[] = [];
    try {
        for await (const entry of Deno.readDir(volumePath)) {
            if (entry.isFile) {
                imagePaths.push(entry.name);
            }
        }
    } catch (error) {
        throw new Error(`failed to read image paths from ${volumePath}: ${error}`);
    }
    
    // make sure they're sorted alphanumerically
    imagePaths = imagePaths.sort((a, b) => a.localeCompare(b));
    return imagePaths;
}


const ARCHIVE_ROOT = 'images';

const SERIES_NAMES = [
    'The Original Bondage Fairies',
    'Bondage Fairies Extreme',
    'Bondage Fairies Fairie Fetish',
    'New Bondage Fairies'
];

export async function loadImageAtIndex(index: ArchiveIndex): Promise<LoadedLabeledImage> {
    const seriesPaths = await loadSeriesPaths();
    if (index.series >= seriesPaths.length) {
        throw new Error(`series index ${index.series} out of bounds`);
    }

    const seriesPath = seriesPaths[index.series];
    const volumePaths = await loadVolumePaths(seriesPath);
    if (index.volume >= volumePaths.length) {
        throw new Error(`volume index ${index.volume} out of bounds for series ${index.series}`);
    }

    const volumePath = volumePaths[index.volume];
    const imagePaths = await loadImagePaths(volumePath);
    if (index.page >= imagePaths.length) {
        throw new Error(`page index ${index.page} out of bounds for volume ${index.volume}`);
    }
    
    const imageName = imagePaths[index.page];
    const { buffer, aspectRatio } = await getImageDataAndAspect(`${volumePath}/${imageName}`);

    const seriesName = SERIES_NAMES[index.series];
    const volumeNumber = index.volume + 1;
    const pageNumber = index.page + 1;

    return {
        buffer,
        aspectRatio,
        meta: { 
            seriesName,
            volumeNumber,
            pageNumber
        }
    };
}