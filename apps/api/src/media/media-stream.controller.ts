import { Controller, Get, Param, Req, Res, NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

function contentTypeFromPath(p: string) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".m4v":
      return "video/x-m4v";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

@Controller()
export class MediaStreamController {
  private readonly MEDIA_DIR = "/opt/pulsepanels/storage/media";

  @Get("media/:key")
  async stream(@Param("key") key: string, @Req() req: Request, @Res() res: Response) {
    if (!key) throw new NotFoundException("Missing media key");

    const safeKey = path.basename(String(key));
    const filePath = path.join(this.MEDIA_DIR, safeKey);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Media not found: ${safeKey}`);
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = contentTypeFromPath(filePath);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (!range) {
      res.setHeader("Content-Length", fileSize);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).send("Invalid range");
      return;
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", chunkSize);

    fs.createReadStream(filePath, { start, end }).pipe(res);
  }
}