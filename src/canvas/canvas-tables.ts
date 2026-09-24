/**
 * 画布三张表的建表语句。
 *
 * 跟 prisma/migrations/.../migration.sql 末尾那段**一字不差**（改一处要改两处）：
 * - migration.sql 管新装 / 桌面版（scripts/init-sqlite.cjs 每次启动整份重跑）；
 * - 这里管已经部署、不会重跑 init 的实例（Docker 直接 node dist/src/main.js），CanvasService 启动时补表。
 * 全部 IF NOT EXISTS，重复跑没副作用。放在 .ts 里是因为 tsc 不会把 .sql 拷进 dist。
 */
export const CANVAS_TABLES_SQL = `
-- CreateTable
CREATE TABLE IF NOT EXISTS "canvas_boards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "graph" TEXT NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "canvas_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "canvas_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "board_id" BIGINT NOT NULL,
    "label" TEXT NOT NULL,
    "graph" TEXT NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canvas_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "canvas_snapshots_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "canvas_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "canvas_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "graph" TEXT NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "canvas_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "canvas_board_idx_user_time" ON "canvas_boards"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "canvas_snapshot_idx_board_time" ON "canvas_snapshots"("board_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "canvas_template_idx_user_time" ON "canvas_templates"("user_id", "updated_at");
`
