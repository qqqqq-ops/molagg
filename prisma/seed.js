const { PrismaClient } = require('@prisma/client');
const defaultModelProviders = require('./default-model-providers.json');
const defaultApiChannels = require('./default-api-channels.json');
const defaultAiModels = require('./default-ai-models.json');
const personalSqliteIndexes = require('./personal-sqlite-indexes.json');

const prisma = new PrismaClient();

const LOCAL_USER_ID = 1n;

function stringifyNullableJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function quoteSqliteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function ensurePersonalSqliteIndexes() {
  for (const index of personalSqliteIndexes) {
    const columns = index.columns.map(quoteSqliteIdentifier).join(', ');
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${quoteSqliteIdentifier(index.name)} ON ${quoteSqliteIdentifier(index.table)}(${columns})`,
    );
  }
}

async function main() {
  const localEmail = 'local@flowmuse.personal';
  const existingOwner = await prisma.user.findFirst({ orderBy: { id: 'asc' } });

  if (!existingOwner) {
    await prisma.user.upsert({
      where: { email: localEmail },
      create: {
        id: LOCAL_USER_ID,
        email: localEmail,
        username: 'local',
        role: 'admin',
        status: 'active',
      },
      update: {},
    });
  }

  for (const provider of defaultModelProviders) {
    await prisma.modelProvider.upsert({
      where: { provider: provider.provider },
      create: {
        id: provider.id,
        provider: provider.provider,
        displayName: provider.displayName,
        adapterClass: provider.adapterClass,
        icon: provider.icon,
        supportTypes: JSON.stringify(provider.supportTypes),
        defaultParams: provider.defaultParams ? JSON.stringify(provider.defaultParams) : null,
        paramSchema: provider.paramSchema ? JSON.stringify(provider.paramSchema) : null,
        webhookRequired: provider.webhookRequired,
        isActive: provider.isActive,
        sortOrder: provider.sortOrder,
      },
      update: {
        displayName: provider.displayName,
        adapterClass: provider.adapterClass,
        icon: provider.icon,
        supportTypes: JSON.stringify(provider.supportTypes),
        defaultParams: provider.defaultParams ? JSON.stringify(provider.defaultParams) : null,
        paramSchema: provider.paramSchema ? JSON.stringify(provider.paramSchema) : null,
        webhookRequired: provider.webhookRequired,
        isActive: provider.isActive,
        sortOrder: provider.sortOrder,
      },
    });
  }

  for (const channel of defaultApiChannels) {
    await prisma.apiChannel.upsert({
      where: { id: BigInt(channel.id) },
      create: {
        id: BigInt(channel.id),
        name: channel.name,
        provider: channel.provider,
        baseUrl: channel.baseUrl,
        apiKey: null,
        apiSecret: null,
        extraHeaders: null,
        timeout: channel.timeout,
        maxRetry: channel.maxRetry,
        rateLimit: null,
        status: 'disabled',
        priority: channel.priority,
        description: null,
      },
      update: {
        name: channel.name,
        provider: channel.provider,
        timeout: channel.timeout,
        maxRetry: channel.maxRetry,
        rateLimit: null,
        priority: channel.priority,
        description: null,
      },
    });

    if (channel.baseUrl) {
      await prisma.apiChannel.updateMany({
        where: {
          id: BigInt(channel.id),
          baseUrl: '',
        },
        data: {
          baseUrl: channel.baseUrl,
        },
      });
    }
  }

  for (const model of defaultAiModels) {
    const data = {
      name: model.name,
      modelKey: model.modelKey,
      icon: model.icon,
      type: model.type,
      provider: model.provider,
      channelId: BigInt(model.channelId),
      defaultParams: stringifyNullableJson(model.defaultParams),
      paramConstraints: stringifyNullableJson(model.paramConstraints),
      isActive: model.isActive,
      sortOrder: model.sortOrder,
      description: model.description,
      supportsImageInput: model.supportsImageInput,
      supportsResolutionSelect: model.supportsResolutionSelect,
      supportsSizeSelect: model.supportsSizeSelect,
      supportsQuickMode: model.supportsQuickMode,
      supportsAgentMode: model.supportsAgentMode,
      supportsAutoMode: model.supportsAutoMode,
      maxContextRounds: model.maxContextRounds,
      systemPrompt: model.systemPrompt,
    };

    await prisma.aiModel.upsert({
      where: { id: BigInt(model.id) },
      create: {
        id: BigInt(model.id),
        ...data,
      },
      update: data,
    });
  }

  await prisma.aiModel.updateMany({
    where: {
      type: { in: ['image', 'video'] },
      id: { notIn: defaultAiModels.map((model) => BigInt(model.id)) },
    },
    data: { isActive: false },
  });

  await ensurePersonalSqliteIndexes();
  await migrateGlobalKeysToOwner();

  console.log(`Seed completed. Placeholder user email: ${localEmail} (first registered account claims this workspace)`);
}

async function migrateGlobalKeysToOwner() {
  const owner = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
  if (!owner) return;

  const channels = await prisma.apiChannel.findMany();
  for (const channel of channels) {
    if (!channel.apiKey) continue;
    const existing = await prisma.userChannelCredential.findUnique({
      where: {
        user_channel_credential_user_channel_unique: {
          userId: owner.id,
          channelId: channel.id,
        },
      },
    });
    if (existing) continue;
    await prisma.userChannelCredential.create({
      data: {
        userId: owner.id,
        channelId: channel.id,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiSecret: channel.apiSecret,
        extraHeaders: channel.extraHeaders,
      },
    });
  }

  const existingAi = await prisma.userAiSetting.findUnique({ where: { userId: owner.id } });
  if (!existingAi) {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ['ai.apiBaseUrl', 'ai.apiKey', 'ai.modelName'] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    if (map['ai.apiKey'] || map['ai.apiBaseUrl'] || map['ai.modelName']) {
      await prisma.userAiSetting.create({
        data: {
          userId: owner.id,
          apiBaseUrl: map['ai.apiBaseUrl'] || '',
          apiKey: map['ai.apiKey'] || null,
          modelName: map['ai.modelName'] || '',
        },
      });
    }
  }

  await prisma.apiChannel.updateMany({
    data: { apiKey: null, apiSecret: null },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
