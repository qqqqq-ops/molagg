import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CurrentUser = createParamDecorator((property: string | undefined, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  const user = request.user;
  if (!user) throw new UnauthorizedException('请先登录');

  if (!property) return user;
  return user[property];
});
