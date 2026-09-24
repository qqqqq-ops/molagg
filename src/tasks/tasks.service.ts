import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TaskStatus } from '../common/prisma-enums';

import { SlicePaginatedResult } from '../common/dto/slice-pagination.dto';
import { serializeImageTask, serializeVideoTask } from '../common/serializers/task.serializer';
import { PrismaService } from '../prisma/prisma.service';
import { canCancelVideoTask, supportsVideoTaskCancel } from '../common/utils/video-task-cancel.util';
import { QueryTaskFeedDto } from './dto/query-task-feed.dto';

type StatusCountRow = {
  status: string;
  count: bigint | number;
};

export type TaskStats = {
  active: number;
  completed: number;
  failed: number;
  total: number;
};

type DurationRow = {
  modelId: bigint | number | string;
  createdAt: Date | string | number | bigint;
  completedAt: Date | string | number | bigint;
};

/** 每个模型最近若干次成功任务的耗时中位数（从创建到完成，含排队），前端据此估算没有真实进度的任务 */
export type TaskDurationEstimates = {
  models: Record<string, { medianMs: number; samples: number }>;
};

/** 每个模型只看最近这么多次；太旧的数据反映不了上游现在的速度 */
const ESTIMATE_SAMPLES_PER_MODEL = 20;
/** 超过这个时长的算异常（卡住后才完成），不计入中位数 */
const ESTIMATE_MAX_DURATION_MS = 60 * 60 * 1000;

function toTimeMs(value: Date | string | number | bigint) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  // SQLite 原生查询里的 DateTime 可能是毫秒数字符串，也可能是 ISO 串
  return /^\d+$/.test(value) ? Number(value) : new Date(value).getTime();
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type FeedRow = {
  type: 'image' | 'video';
  id: bigint | number | string;
  createdAt: Date;
};

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listFeed(
    userId: bigint,
    query: QueryTaskFeedDto,
  ): Promise<SlicePaginatedResult<any>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const take = limit + 1;
    const statusClause =
      query.status === 'active'
        ? Prisma.sql`AND status IN ('pending', 'processing')`
        : query.status
          ? Prisma.sql`AND status = ${query.status as TaskStatus}`
          : Prisma.empty;
    const projectClause =
      query.projectId === 'none'
        ? Prisma.sql`AND project_id IS NULL`
        : query.projectId
          ? Prisma.sql`AND project_id = ${BigInt(query.projectId)}`
          : Prisma.empty;
    const keyword = query.q?.trim();
    const keywordClause = keyword ? Prisma.sql`AND prompt LIKE ${`%${keyword}%`}` : Prisma.empty;
    // 只要某一类时，另一路 UNION 直接不出行
    const imageTypeClause = query.type === 'video' ? Prisma.sql`AND 1 = 0` : Prisma.empty;
    const videoTypeClause = query.type === 'image' ? Prisma.sql`AND 1 = 0` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<FeedRow[]>(Prisma.sql`
      SELECT type, id, createdAt
      FROM (
        SELECT
          'image' AS type,
          image_tasks.id AS id,
          image_tasks.created_at AS createdAt
        FROM image_tasks
        WHERE image_tasks.user_id = ${userId}
          AND image_tasks.deleted_at IS NULL
          ${statusClause}
          ${projectClause}
          ${keywordClause}
          ${imageTypeClause}

        UNION ALL

        SELECT
          'video' AS type,
          video_tasks.id AS id,
          video_tasks.created_at AS createdAt
        FROM video_tasks
        WHERE video_tasks.user_id = ${userId}
          ${statusClause}
          ${projectClause}
          ${keywordClause}
          ${videoTypeClause}

      ) AS feed_rows
      ORDER BY createdAt DESC, id DESC
      LIMIT ${take}
      OFFSET ${offset}
    `);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          hasMore: false,
        },
      };
    }

    const imageIds = pageRows
      .filter((row) => row.type === 'image')
      .map((row) => BigInt(row.id));
    const videoIds = pageRows
      .filter((row) => row.type === 'video')
      .map((row) => BigInt(row.id));
    const [images, videos] = await Promise.all([
      imageIds.length > 0
        ? this.prisma.imageTask.findMany({
            where: { id: { in: imageIds }, userId, deletedAt: null },
          })
        : Promise.resolve([]),
      videoIds.length > 0
        ? this.prisma.videoTask.findMany({
            where: { id: { in: videoIds }, userId },
            include: {
              model: { select: { provider: true, modelKey: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const imageMap = new Map(images.map((item) => [item.id.toString(), serializeImageTask(item)]));
    const videoMap = new Map(
      videos.map((item) => [
        item.id.toString(),
        serializeVideoTask(item, {
          canCancel: canCancelVideoTask(item.status, item.model.provider, item.model.modelKey),
          cancelSupported: supportsVideoTaskCancel(item.model.provider, item.model.modelKey),
        }),
      ]),
    );
    const data = pageRows
      .map((row) => {
        const key = BigInt(row.id).toString();
        if (row.type === 'image') return imageMap.get(key) ?? null;
        return videoMap.get(key) ?? null;
      })
      .filter((item) => item !== null);

    return {
      data,
      pagination: {
        page,
        limit,
        hasMore,
      },
    };
  }

  /** 任务队列顶部统计卡：图片 + 视频按状态计数（图片软删的不算，和 feed 口径一致） */
  async getStats(userId: bigint): Promise<TaskStats> {
    const rows = await this.prisma.$queryRaw<StatusCountRow[]>(Prisma.sql`
      SELECT status, COUNT(*) AS count
      FROM (
        SELECT status FROM image_tasks
        WHERE user_id = ${userId} AND deleted_at IS NULL
        UNION ALL
        SELECT status FROM video_tasks
        WHERE user_id = ${userId}
      ) AS task_rows
      GROUP BY status
    `);

    const stats: TaskStats = { active: 0, completed: 0, failed: 0, total: 0 };
    for (const row of rows) {
      const count = Number(row.count);
      stats.total += count;
      if (row.status === 'pending' || row.status === 'processing') stats.active += count;
      else if (row.status === 'completed') stats.completed += count;
      else if (row.status === 'failed') stats.failed += count;
    }
    return stats;
  }

  async getDurationEstimates(userId: bigint): Promise<TaskDurationEstimates> {
    // 每张表取最近 500 条成功任务，够覆盖常用模型；再在内存里按模型各取最近 20 条
    const [imageRows, videoRows] = await Promise.all([
      this.prisma.$queryRaw<DurationRow[]>(Prisma.sql`
        SELECT model_id AS modelId, created_at AS createdAt, completed_at AS completedAt
        FROM image_tasks
        WHERE user_id = ${userId} AND status = 'completed' AND completed_at IS NOT NULL AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500
      `),
      this.prisma.$queryRaw<DurationRow[]>(Prisma.sql`
        SELECT model_id AS modelId, created_at AS createdAt, completed_at AS completedAt
        FROM video_tasks
        WHERE user_id = ${userId} AND status = 'completed' AND completed_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500
      `),
    ]);

    const durationsByModel = new Map<string, number[]>();
    for (const row of [...imageRows, ...videoRows]) {
      const durationMs = toTimeMs(row.completedAt) - toTimeMs(row.createdAt);
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > ESTIMATE_MAX_DURATION_MS) continue;
      const key = String(row.modelId);
      const list = durationsByModel.get(key) ?? [];
      if (list.length < ESTIMATE_SAMPLES_PER_MODEL) list.push(durationMs);
      durationsByModel.set(key, list);
    }

    const models: TaskDurationEstimates['models'] = {};
    durationsByModel.forEach((durations, modelId) => {
      models[modelId] = { medianMs: Math.round(median(durations)), samples: durations.length };
    });
    return { models };
  }
}
