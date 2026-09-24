/**
 * 新手教程内容。
 *
 * 写成数据而不是 JSX，是为了让中英文结构保持一致，
 * 也让提示词模板能被「复制」和「带去创作页」两个动作复用。
 *
 * 内容按 FlowMuse 的实际能力写（本地部署、自带 Key、单步生成），
 * 不假设存在积分、批量队列或分镜流水线。
 */

export type TutorialItem = {
  title: string
  detail: string
}

export type TutorialTemplate = {
  name: string
  meta: string
  purpose: string
  prompt: string
  mode: 'image' | 'video'
}

export type TutorialDiagnosisRow = {
  symptom: string
  cause: string
  fix: string
}

export type TutorialSection =
  | { id: string; kind: 'steps'; title: string; lead: string; items: TutorialItem[] }
  | { id: string; kind: 'order'; title: string; lead: string; items: TutorialItem[] }
  | { id: string; kind: 'templates'; title: string; lead: string; templates: TutorialTemplate[] }
  | { id: string; kind: 'diagnosis'; title: string; lead: string; rows: TutorialDiagnosisRow[] }
  | { id: string; kind: 'checklist'; title: string; lead: string; checks: string[] }

export type TutorialData = {
  kicker: string
  title: string
  subtitle: string
  tocLabel: string
  copyPrompt: string
  copied: string
  useTemplate: string
  goCreate: string
  diagnosisHeaders: { symptom: string; cause: string; fix: string }
  sections: TutorialSection[]
}

const ZH: TutorialData = {
  kicker: '新手教程',
  title: '让模型听懂你的描述',
  subtitle:
    '把模型当成执行指令的摄影师，而不是替你构思的编剧。一次只安排一件事，结果会稳定得多，也更听话。',
  tocLabel: '本页目录',
  copyPrompt: '复制提示词',
  copied: '已复制',
  useTemplate: '带去创作页',
  goCreate: '去创作页',
  diagnosisHeaders: { symptom: '现象', cause: '常见原因', fix: '优先修改' },
  sections: [
    {
      id: 'start',
      kind: 'steps',
      title: '先做这三件事',
      lead:
        '还没配模型渠道的话，先去创作页点「去配置模型渠道」填一个 Base URL 和 API Key，模型列表才会出现。',
      items: [
        {
          title: '用简洁模式起步',
          detail:
            '创作页右上角切到「简洁模式」，写一句描述就能生成。参考图、首尾帧和细节参数等摸熟了再去高级模式。',
        },
        {
          title: '一次只描述一个画面',
          detail:
            '出现换场、多人对话或连续三四个动作时，拆成多次生成。一个提示词塞一整段剧情，模型通常会自己删减或改写。',
        },
        {
          title: '先生成一次再调',
          detail:
            '先用默认参数出一张，确认构图和风格方向对了，再改比例、分辨率或加参考图。参数调得再细也救不了方向错的提示词。',
        },
      ],
    },
    {
      id: 'order',
      kind: 'order',
      title: '按这个顺序写，模型最容易执行',
      lead:
        '不是写得越长越好。先给不可改变的事实，再给动作，最后才是风格和禁止项。每一项都限量，宁少勿多。',
      items: [
        { title: '主体', detail: '谁或者什么。外观只保留最重要的 2—4 个特征，不用写满。' },
        { title: '场景', detail: '地点、时间、光线。避免在一句话里要求两个地点。' },
        { title: '镜头', detail: '景别 + 机位，运镜最多写一种。' },
        { title: '动作', detail: '视频要写清动作先后并覆盖完整时长；图片写清姿态和朝向。' },
        { title: '风格', detail: '画风、色调、质感。给一个明确方向，不要同时要求写实和插画。' },
        { title: '约束', detail: '只写真正重要的 3—5 条。堆几十个否定词会稀释掉真正在意的那几条。' },
      ],
    },
    {
      id: 'templates',
      kind: 'templates',
      title: '复制后只改主体、场景和风格',
      lead: '模板不是固定咒语，保留结构、替换内容即可。点「带去创作页」会把提示词直接填进输入框。',
      templates: [
        {
          name: '人物肖像',
          meta: '图片 · 建议 3:4 或 9:16',
          purpose: '适合头像、角色定妆、职业形象。',
          mode: 'image',
          prompt:
            '一位三十岁左右的亚洲女性，短发，穿深色西装外套，坐姿，双手交叠放在桌面，看向镜头，嘴角微笑。室内办公室，侧面窗光，背景是虚化的书架。中景，胶片质感，肤质自然保留细节。不要广角变形，不要画面文字。',
        },
        {
          name: '商品展示',
          meta: '图片 · 建议 1:1',
          purpose: '适合电商主图、产品细节图。',
          mode: 'image',
          prompt:
            '一瓶白色磨砂玻璃的面霜，放在浅灰色石材台面中央，瓶身正面朝向镜头，标签清晰。背景是同色系渐变墙面，左上方柔光，台面有一道柔和高光和短投影。正面平视，微距，干净商业摄影质感。不要出现手，不要多余道具，不要画面文字。',
        },
        {
          name: '短视频镜头',
          meta: '视频 · 建议 5 秒 · 16:9',
          purpose: '适合空镜、氛围片段、产品动态展示。',
          mode: 'video',
          prompt:
            '5 秒，单一连续镜头。海浪缓慢拍打沙滩，日落时分，暖金色逆光。0—2 秒：一道浪从画面右侧推向沙滩；2—4 秒：浪退回，沙面留下湿痕；4—5 秒：画面保持，浪花余沫缓慢消散。固定机位，中景，慢动作质感。全程无人出现，无人说话，仅保留海浪环境声。',
        },
      ],
    },
    {
      id: 'diagnosis',
      kind: 'diagnosis',
      title: '结果不对，先改哪一行',
      lead:
        '第一版结果偏了，不要急着加词或换模型。先删掉次要要求，找到模型没听懂的那一行，再逐项加回来。',
      rows: [
        {
          symptom: '画面里多出了人或物',
          cause: '描述里有歧义词，模型按常见搭配补全了',
          fix: '在约束里写明不要出现什么，并把主体数量说清楚，例如「画面中只有一个人」。',
        },
        {
          symptom: '风格和预期差很远',
          cause: '同时给了互相冲突的风格词',
          fix: '只留一个风格方向。不要同时要求写实摄影和插画，也不要同时要求极简和繁复。',
        },
        {
          symptom: '人物不像参考图',
          cause: '参考图太小、脸部不清晰，或多张互相冲突',
          fix: '减少参考图数量，换清晰正脸，并在提示词里点名「人物外观参考第 1 张图」。',
        },
        {
          symptom: '视频动作只做了一半',
          cause: '时长不够，或动作太多',
          fix: '删掉次要动作，或延长时长，并在结尾留 1—2 秒保持结束状态。',
        },
        {
          symptom: '镜头乱晃、构图漂移',
          cause: '同时要求了推进、环绕、跟拍等多种运镜',
          fix: '改成固定机位，或只保留一种缓慢运镜。',
        },
        {
          symptom: '画面文字是乱码',
          cause: '生成模型本身不擅长稳定呈现可读文字',
          fix: '在提示词里要求不出现文字，成片后用剪辑或图片软件另外加字。',
        },
        {
          symptom: '一直生成失败',
          cause: '多半不是提示词的问题',
          fix: '看任务队列里的失败原因。写着渠道未配置就去补 Key；写着上游故障就直接重试或换一个模型。',
        },
      ],
    },
    {
      id: 'checklist',
      kind: 'checklist',
      title: '点生成之前，最后看一眼',
      lead: '这七条都满足，第一版结果通常就能用。',
      checks: [
        '只有一个主体，数量写清楚了',
        '只有一个场景',
        '运镜或机位只写了一种',
        '风格方向只有一个，没有互相冲突',
        '视频的动作覆盖了完整时长',
        '约束控制在 3—5 条以内',
        '先只生成一次，确认方向再调参数',
      ],
    },
  ],
}

const EN: TutorialData = {
  kicker: 'Getting started',
  title: 'Make the model understand you',
  subtitle:
    'Treat the model as a camera operator following instructions, not a screenwriter filling in your story. Ask for one thing at a time and results get far more stable.',
  tocLabel: 'On this page',
  copyPrompt: 'Copy prompt',
  copied: 'Copied',
  useTemplate: 'Use in create page',
  goCreate: 'Go to create page',
  diagnosisHeaders: { symptom: 'Symptom', cause: 'Likely cause', fix: 'Fix this first' },
  sections: [
    {
      id: 'start',
      kind: 'steps',
      title: 'Do these three things first',
      lead:
        'If no model channel is configured yet, open the create page, click “Configure model channels” and fill in a Base URL and API Key — models only appear after that.',
      items: [
        {
          title: 'Start in simple mode',
          detail:
            'Switch to “Simple” at the top right of the create page. One sentence is enough. Reference images, first/last frames and detailed settings can wait.',
        },
        {
          title: 'Describe one shot at a time',
          detail:
            'Split scene changes, multi-person dialogue or three-to-four action chains into separate generations. A whole storyline in one prompt usually gets trimmed or rewritten.',
        },
        {
          title: 'Generate once, then adjust',
          detail:
            'Run one generation on defaults, confirm composition and style, then change ratio, resolution or add references. No amount of tuning fixes a prompt pointing the wrong way.',
        },
      ],
    },
    {
      id: 'order',
      kind: 'order',
      title: 'Write in this order',
      lead:
        'Longer is not better. State the unchangeable facts first, then the action, and only then style and restrictions. Keep every item short.',
      items: [
        { title: 'Subject', detail: 'Who or what. Keep only the 2–4 most important traits.' },
        { title: 'Scene', detail: 'Place, time, light. Avoid asking for two places at once.' },
        { title: 'Camera', detail: 'Shot size plus angle. At most one camera movement.' },
        { title: 'Action', detail: 'For video, order the actions and cover the full duration; for images, fix pose and facing.' },
        { title: 'Style', detail: 'One clear direction. Do not ask for photoreal and illustration together.' },
        { title: 'Constraints', detail: 'Only the 3–5 that matter. Dozens of negatives dilute the ones you care about.' },
      ],
    },
    {
      id: 'templates',
      kind: 'templates',
      title: 'Copy, then swap subject, scene and style',
      lead:
        'Templates are not magic spells — keep the structure, replace the content. “Use in create page” drops the prompt straight into the input.',
      templates: [
        {
          name: 'Portrait',
          meta: 'Image · try 3:4 or 9:16',
          purpose: 'Avatars, character looks, professional headshots.',
          mode: 'image',
          prompt:
            'An Asian woman around thirty, short hair, dark blazer, seated, hands folded on the desk, looking into the lens with a slight smile. Indoor office, side window light, blurred bookshelf behind. Medium shot, filmic texture, natural skin detail retained. No wide-angle distortion, no text in frame.',
        },
        {
          name: 'Product shot',
          meta: 'Image · try 1:1',
          purpose: 'E-commerce hero images and detail shots.',
          mode: 'image',
          prompt:
            'A jar of face cream in frosted white glass, centered on a light grey stone counter, label facing the lens and legible. Gradient wall of the same tone behind, soft light from upper left, one soft highlight and a short shadow. Eye-level, macro, clean commercial photography. No hands, no extra props, no text in frame.',
        },
        {
          name: 'Short video shot',
          meta: 'Video · try 5s · 16:9',
          purpose: 'Establishing shots, mood clips, product motion.',
          mode: 'video',
          prompt:
            '5 seconds, one continuous shot. Waves washing gently onto sand at sunset, warm golden backlight. 0–2s: a wave pushes in from frame right; 2–4s: it recedes, leaving a wet line on the sand; 4–5s: the frame holds as the foam slowly fades. Locked-off camera, medium shot, slow-motion feel. No people appear, nobody speaks, only natural wave ambience.',
        },
      ],
    },
    {
      id: 'diagnosis',
      kind: 'diagnosis',
      title: 'Wrong result? Fix this line first',
      lead:
        'When the first result misses, do not pile on words or swap models. Remove the secondary requirements, find the line the model did not follow, then add things back one at a time.',
      rows: [
        {
          symptom: 'Extra people or objects appear',
          cause: 'An ambiguous phrase let the model fill in the usual companions',
          fix: 'Say explicitly what must not appear, and state the count, e.g. “only one person in frame”.',
        },
        {
          symptom: 'Style is far off',
          cause: 'Conflicting style words in one prompt',
          fix: 'Keep one direction. Never ask for photoreal and illustration, or minimal and ornate, at once.',
        },
        {
          symptom: 'Person does not match the reference',
          cause: 'Reference too small, face unclear, or multiple references conflict',
          fix: 'Use fewer references, a clear frontal face, and name it: “facial appearance follows image 1”.',
        },
        {
          symptom: 'Video action only half completes',
          cause: 'Duration too short, or too many actions',
          fix: 'Drop secondary actions or extend duration, and leave 1–2s at the end to hold the final state.',
        },
        {
          symptom: 'Camera drifts or shakes',
          cause: 'Push-in, orbit and tracking all requested together',
          fix: 'Lock the camera off, or keep exactly one slow movement.',
        },
        {
          symptom: 'On-screen text is garbled',
          cause: 'Generation models are bad at stable legible text',
          fix: 'Ask for no text in the prompt and add captions afterwards in an editor.',
        },
        {
          symptom: 'Generation keeps failing',
          cause: 'Usually not the prompt',
          fix: 'Check the failure reason in the task queue. Channel not configured → add the key. Upstream failure → retry or switch model.',
        },
      ],
    },
    {
      id: 'checklist',
      kind: 'checklist',
      title: 'One last look before generating',
      lead: 'Meet all seven and the first result is usually usable.',
      checks: [
        'One subject, with the count stated',
        'One scene only',
        'One camera movement or angle',
        'One style direction, nothing conflicting',
        'For video, actions cover the full duration',
        'Constraints kept to 3–5',
        'Generate once first, confirm direction before tuning',
      ],
    },
  ],
}

export function getTutorialData(locale: string): TutorialData {
  return locale.toLowerCase().startsWith('zh') ? ZH : EN
}
