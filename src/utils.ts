import * as fs from 'fs';
import * as path from 'path';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const DEFAULT_SYSTEM_PROMPT_PATH = path.join(__dirname, 'prompts/system_prompt.txt');
const DEFAULT_CODE_REVIEW_PROMPT_PATH = path.join(__dirname, 'prompts/code_review_prompt.txt');

interface S3Config {
    bucket: string;
    key: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}

const isS3Path = (path: string): boolean => {
    return path.startsWith('s3://');
};

const parseS3Path = (s3Path: string): S3Config => {
    const match = s3Path.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
        throw new Error(`Invalid S3 path format: ${s3Path}`);
    }
    return {
        bucket: match[1],
        key: match[2],
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    };
};

const loadFromS3 = async (config: S3Config): Promise<string> => {
    const s3Client = new S3Client({
        region: config.region || process.env.AWS_REGION || 'us-east-1',
        credentials: config.accessKeyId && config.secretAccessKey ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        } : undefined
    });

    try {
        const command = new GetObjectCommand({
            Bucket: config.bucket,
            Key: config.key
        });
        const response = await s3Client.send(command);
        const bodyContents = await response.Body?.transformToString();
        if (!bodyContents) {
            throw new Error('Empty response from S3');
        }
        return bodyContents.trim();
    } catch (error) {
        throw new Error(`Failed to load from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

const loadFromFile = (filePath: string): string => {
    try {
        return fs.readFileSync(filePath, 'utf-8').trim();
    } catch (error) {
        throw new Error(`Failed to load from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const loadPrompt = async (defaultPath: string, customPath?: string): Promise<string> => {
    if (!customPath) {
        return loadFromFile(defaultPath);
    }

    try {
        if (isS3Path(customPath)) {
            const s3Config = parseS3Path(customPath);
            return await loadFromS3(s3Config);
        } else {
            return loadFromFile(customPath);
        }
    } catch (error) {
        console.warn(`Failed to load prompt from ${customPath}, falling back to default: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return loadFromFile(defaultPath);
    }
};

export const getSystemPrompt = async (customPath?: string): Promise<string> => {
    return loadPrompt(DEFAULT_SYSTEM_PROMPT_PATH, customPath);
};

export const getCodeReviewPrompt = async (customPath?: string): Promise<string> => {
    return loadPrompt(DEFAULT_CODE_REVIEW_PROMPT_PATH, customPath);
};

// For backward compatibility - these will be deprecated
export const systemPrompt = fs.readFileSync(DEFAULT_SYSTEM_PROMPT_PATH, 'utf-8').trim();
export const codeReviewPrompt = fs.readFileSync(DEFAULT_CODE_REVIEW_PROMPT_PATH, 'utf-8').trim();

export const geminiCompletionsConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
    model: "gemini-1.5-flash",
}

export const delay = (time: number) => {
    return new Promise(resolve => setTimeout(resolve, time));
}

export const getDiffBlocks = (diff: string) => {
    const regex = /(?=@@\s-\d+(?:,\d+)?\s\+\d+(?:,\d+)?\s@@)/g;
    const diffBlocks: string[] = diff.split(regex);
    return diffBlocks;
}

export const getLineObj = (matches: RegExpMatchArray, item: string) => {
    const lineObj: { new_line?: number, old_line?: number } = {};
    const lastLine = item.split(/\r?\n/)?.reverse()?.[1]?.trim();
    const oldLineStart = +matches[1];
    const oldLineEnd = +matches[2] || 0;
    const newLineStart = +matches[3];
    const newLineEnd = +matches[4] || 0;
    if (lastLine?.[0] === '+') {
        lineObj.new_line = newLineStart + newLineEnd - 1;
    } else if (lastLine?.[0] === '-') {
        lineObj.old_line = oldLineStart + oldLineEnd - 1;
    } else {
        lineObj.new_line = newLineStart + newLineEnd - 1;
        lineObj.old_line = oldLineStart + oldLineEnd - 1;
    }
    return lineObj;
}
