import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 画布图本体 { nodes, edges }；具体结构由前端定，这里只检查是两个数组（见 CanvasService.serializeGraph） */
export type CanvasGraphInput = Record<string, unknown>;

export class SaveCanvasBoardDto {
  @IsObject()
  graph!: CanvasGraphInput;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class CreateCanvasSnapshotDto {
  @IsObject()
  graph!: CanvasGraphInput;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class CreateCanvasTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsObject()
  graph!: CanvasGraphInput;
}
