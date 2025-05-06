import { Buffer } from "node:buffer";
import sharp from "sharp";

export type ArchiveIndex = { 
    series: number;
    volume: number;
    page: number;
}


const CURSOR_PATH = 'archiveCursor.json';

export function loadArchiveIndex(): ArchiveIndex {
    try {
        const data = Deno.readTextFileSync(CURSOR_PATH);
        const index = JSON.parse(data) as ArchiveIndex;
        return index;
    } catch (error) {
        console.error(`failed to load archive index from ${CURSOR_PATH}: ${error}`);
        Deno.exit(1);
    }
}

export function saveArchiveIndex(index: ArchiveIndex): void {
    try {
        const data = JSON.stringify(index, null, 2);
        Deno.writeTextFileSync(CURSOR_PATH, data);
    } catch (error) {
        console.error(`failed to save archive index to ${CURSOR_PATH}: ${error}`);
        Deno.exit(1);
    }
}

export type LoadedImage = {
    buffer: Buffer;
    aspectRatio: { width: number; height: number };
}

export type LoadedLabeledImage = {
    buffer: Buffer;
    aspectRatio: { width: number; height: number };
    meta: PostMetadata;
    sequence: SequenceMetadata;
}

export type PostMetadata = {
    seriesName: string;
    volumeNumber: number;
    pageNumber: number;
};

export type SequenceMetadata = {
    isLastPageInVolume: boolean;
    isLastVolumeInSeries: boolean;
    isLastSeries: boolean;
}

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
    // scale image if needed to comply with 976KB limit
    const scaledBuffer = await scaleImageIfNeeded(buffer, metadata.width, metadata.height);
    return { buffer: scaledBuffer, aspectRatio: { width: metadata.width, height: metadata.height } };
}

const MAX_SIZE = 976 * 1024;

const envJpgQuality = Deno.env.get("JPG_QUALITY"); // default to 89
const jpgQualityStart = envJpgQuality ? parseInt(envJpgQuality, 10) : 89;

const envResizeStep = Deno.env.get("RESIZE_STEP"); // default to 0.04
const resizeStep = envResizeStep ? parseFloat(envResizeStep) : 0.04;

async function scaleImageIfNeeded(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    if (buffer.length <= MAX_SIZE) {
        console.log(`image size - original: ${buffer.length}`);
        return buffer;
    }

    let resizeFactor = 0.9;
    let output: Buffer;
    let jpgQuality = jpgQualityStart

    while (true) {
        output = await sharp(buffer)
            .resize(Math.floor(width * resizeFactor), Math.floor(height * resizeFactor))
            .jpeg({ quality: jpgQuality })
            .toBuffer();

        if (output.length <= MAX_SIZE) {
            console.log(`image size - original: ${buffer.length}, scaled: ${output.length} bytes`);
            break;
        } 

        if (resizeFactor > 0.2) {
            resizeFactor -= resizeStep;
        } else if (jpgQuality > 50){
            jpgQuality -= 4;
        } else {
            console.error('image too large, cannot scale further without losing too much quality');
            break;
        }
    }
    return output;
}

async function loadSeriesPaths(): Promise<string[]> {
    let series: string[] = [];
    try {
        for await (const entry of Deno.readDir(ARCHIVE_ROOT)) {
            if (entry.isDirectory) {
                series.push(entry.name);
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
        throw new Error(`page index ${index.page} out of bounds for volume ${index.volume}: only ${imagePaths.length} pages`);
    }

    const isLastPageInVolume = index.page === imagePaths.length - 1;
    const isLastVolumeInSeries = index.volume === volumePaths.length - 1;
    const isLastSeries = index.series === seriesPaths.length - 1;
    
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
        },
        sequence: {
            isLastPageInVolume,
            isLastVolumeInSeries,
            isLastSeries
        }
    };
}

export function makeNextIndex(currentIndex: ArchiveIndex, sequence: SequenceMetadata): ArchiveIndex {
    const nextIndex = { ...currentIndex };
    if (sequence.isLastPageInVolume) {
        nextIndex.page = 0;
        if (sequence.isLastVolumeInSeries) {
            if (sequence.isLastSeries) 
                nextIndex.series = 0;
            else 
                nextIndex.series += 1;
            nextIndex.volume = 0;
        } else {
            nextIndex.volume += 1;
        }
    } else {
        nextIndex.page += 1;
    }
    return nextIndex;
}