import { Global, Module } from '@nestjs/common';

import { UserCredentialsService } from './user-credentials.service';

@Global()
@Module({
  providers: [UserCredentialsService],
  exports: [UserCredentialsService],
})
export class CredentialsModule {}
