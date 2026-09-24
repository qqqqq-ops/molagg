import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CANVAS_TABLES_SQL } from './canvas-tables';
import { CanvasGraphInput } from './dto/canvas.dto';

/** 单张图序列化后的上限。本地拖进来的图是 base64 存在节点里的，放宽一点，但不能无限大 */
const MAX_GRAPH_BYTES = 20 * 1024 * 1024;
/** 每张画布最多留这么多快照，超了删最早的 */
const MAX_SNAPSHOTS_PER_BOARD = 50;
const MAX_TEMPLATES_PER_USER = 200;
const DEFAULT_BOARD_NAME = 'Canvas';

type SerializedGraph = { json: string; nodeCount: number; edgeCount: number };

function splitSqlStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

@Injectable()
export class CanvasService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** 已经部署的实例不会重跑 init-sqlite，这里把画布的三张表补上（IF NOT EXISTS，重复跑无副作用） */
  async onModuleInit() {
    for (const statement of splitSqlStatements(CANVAS_TABLES_SQL)) {
      await this.prisma.$executeRawUnsafe(statement);
    }
  }

  /** 只认 { nodes: [], edges: [] }，别的字段丢掉；太大直接拒 */
  private serializeGraph(graph: CanvasGraphInput): SerializedGraph {
    const nodes = graph?.nodes;
    const edges = graph?.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      throw new BadRequestException('canvas graph must contain nodes and edges arrays');
    }
    const json = JSON.stringify({ nodes, edges });
    if (Buffer.byteLength(json, 'utf8') > MAX_GRAPH_BYTES) {
      throw new BadRequestException('canvas graph is too large');
    }
    return { json, nodeCount: nodes.length, edgeCount: edges.length };
  }

  private parseGraph(json: string) {
    try {
      const parsed = JSON.parse(json) as { nodes?: unknown; edges?: unknown };
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  private async ownedBoard(userId: bigint, boardId: bigint) {
    const board = await this.prisma.canvasBoard.findFirst({ where: { id: boardId, userId } });
    if (!board) throw new NotFoundException('canvas board not found');
    return board;
  }

  // ---- 画布本体（自动保存）----

  /** 当前画布：最近改过的那张；一张都没有就建一张空的 */
  async getCurrentBoard(userId: bigint) {
    const existing = await this.prisma.canvasBoard.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    const board =
      existing ??
      (await this.prisma.canvasBoard.create({
        data: { userId, name: DEFAULT_BOARD_NAME, graph: JSON.stringify({ nodes: [], edges: [] }) },
      }));
    return {
      id: board.id,
      name: board.name,
      nodeCount: board.nodeCount,
      edgeCount: board.edgeCount,
      updatedAt: board.updatedAt,
      graph: this.parseGraph(board.graph),
    };
  }

  async saveBoard(userId: bigint, boardId: bigint, graph: CanvasGraphInput, name?: string) {
    await this.ownedBoard(userId, boardId);
    const serialized = this.serializeGraph(graph);
    const board = await this.prisma.canvasBoard.update({
      where: { id: boardId },
      data: {
        graph: serialized.json,
        nodeCount: serialized.nodeCount,
        edgeCount: serialized.edgeCount,
        ...(name ? { name } : {}),
      },
      select: { id: true, name: true, nodeCount: true, edgeCount: true, updatedAt: true },
    });
    return board;
  }

  // ---- 版本快照 ----

  async listSnapshots(userId: bigint, boardId: bigint) {
    await this.ownedBoard(userId, boardId);
    return this.prisma.canvasSnapshot.findMany({
      where: { boardId, userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, label: true, nodeCount: true, edgeCount: true, createdAt: true },
    });
  }

  async createSnapshot(userId: bigint, boardId: bigint, graph: CanvasGraphInput, label?: string) {
    await this.ownedBoard(userId, boardId);
    const serialized = this.serializeGraph(graph);
    const snapshot = await this.prisma.canvasSnapshot.create({
      data: {
        userId,
        boardId,
        label: label?.trim() ?? '',
        graph: serialized.json,
        nodeCount: serialized.nodeCount,
        edgeCount: serialized.edgeCount,
      },
      select: { id: true, label: true, nodeCount: true, edgeCount: true, createdAt: true },
    });

    // 超出上限删最早的，免得库越涨越大
    const overflow = await this.prisma.canvasSnapshot.findMany({
      where: { boardId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: MAX_SNAPSHOTS_PER_BOARD,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await this.prisma.canvasSnapshot.deleteMany({ where: { id: { in: overflow.map((item) => item.id) } } });
    }
    return snapshot;
  }

  async getSnapshot(userId: bigint, snapshotId: bigint) {
    const snapshot = await this.prisma.canvasSnapshot.findFirst({ where: { id: snapshotId, userId } });
    if (!snapshot) throw new NotFoundException('canvas snapshot not found');
    return {
      id: snapshot.id,
      label: snapshot.label,
      nodeCount: snapshot.nodeCount,
      edgeCount: snapshot.edgeCount,
      createdAt: snapshot.createdAt,
      graph: this.parseGraph(snapshot.graph),
    };
  }

  async deleteSnapshot(userId: bigint, snapshotId: bigint) {
    const { count } = await this.prisma.canvasSnapshot.deleteMany({ where: { id: snapshotId, userId } });
    if (count === 0) throw new NotFoundException('canvas snapshot not found');
    return { ok: true };
  }

  // ---- 工作流模板 ----

  async listTemplates(userId: bigint) {
    return this.prisma.canvasTemplate.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, description: true, nodeCount: true, createdAt: true, updatedAt: true },
    });
  }

  async createTemplate(userId: bigint, name: string, graph: CanvasGraphInput, description?: string) {
    const serialized = this.serializeGraph(graph);
    if (serialized.nodeCount === 0) throw new BadRequestException('canvas template is empty');
    const count = await this.prisma.canvasTemplate.count({ where: { userId } });
    if (count >= MAX_TEMPLATES_PER_USER) throw new BadRequestException('canvas template limit reached');
    return this.prisma.canvasTemplate.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        graph: serialized.json,
        nodeCount: serialized.nodeCount,
      },
      select: { id: true, name: true, description: true, nodeCount: true, createdAt: true, updatedAt: true },
    });
  }

  async getTemplate(userId: bigint, templateId: bigint) {
    const template = await this.prisma.canvasTemplate.findFirst({ where: { id: templateId, userId } });
    if (!template) throw new NotFoundException('canvas template not found');
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      nodeCount: template.nodeCount,
      graph: this.parseGraph(template.graph),
    };
  }

  async deleteTemplate(userId: bigint, templateId: bigint) {
    const { count } = await this.prisma.canvasTemplate.deleteMany({ where: { id: templateId, userId } });
    if (count === 0) throw new NotFoundException('canvas template not found');
    return { ok: true };
  }
}
