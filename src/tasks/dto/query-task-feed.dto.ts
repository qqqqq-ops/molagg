import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryTaskFeedDto extends PaginationDto {
  /** active = pending + processing（任务队列「当前」标签） */
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed', 'active'])
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'active';

  /** 资产库按类型筛选 */
  @IsOptional()
  @IsIn(['image', 'video'])
  type?: 'image' | 'video';

  /** 资产库按文件夹（项目）筛选：数字 = 某个项目，'none' = 未归入任何项目 */
  @IsOptional()
  @Matches(/^(none|\d+)$/)
  projectId?: string;

  /** 按提示词关键字搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
