/**
 * HTTP 设计稿中的演示数据。
 * 保留相同的家庭、成员、食谱顺序和文案，使原生页面首次打开时与设计稿一致。
 */

import type { Member, Recipe, RecipeContent, Revision } from '../models/recipe'

type SeedContent = Omit<RecipeContent, 'steps'> & { steps: string[] }

const DAY = 86400000

function ago(days: number, hours = 0): string {
  return new Date(Date.now() - days * DAY - hours * 3600000).toISOString()
}

function contentOf(recipe: SeedContent | RecipeContent): RecipeContent {
  return {
    name: recipe.name,
    successKeys: [...recipe.successKeys],
    ingredients: recipe.ingredients.map((item) => ({ ...item })),
    steps: recipe.steps.map((step, index) => typeof step === 'string'
      ? { id: `seed-step-${index + 1}`, text: step }
      : { ...step, image: step.image ? { ...step.image } : undefined }),
    stage: recipe.stage,
    type: recipe.type,
    tags: [...recipe.tags],
  }
}

function makeRevision(
  id: string,
  authorId: string,
  time: string,
  summary: string,
  content: SeedContent | RecipeContent,
  successKeys?: string[],
): Revision {
  return {
    id,
    authorId,
    time,
    summary,
    snapshot: { ...contentOf(content), successKeys: successKeys || [...content.successKeys] },
  }
}

export const FAMILY_NAME = '我们的家庭食谱'
export const FAMILY_ID = 'f-demo'

export const SEED_MEMBERS: Member[] = [
  { id: 'm-mom', userId: 'local-mom', name: '妈妈', role: 'admin', joinedAt: ago(62), color: '#BF5924' },
  { id: 'm-dad', userId: 'local-dad', name: '爸爸', role: 'member', joinedAt: ago(58), color: '#4A7C8A' },
  { id: 'm-grandma', userId: 'local-grandma', name: '奶奶', role: 'member', joinedAt: ago(31), color: '#6B8A4A' },
]

const yamBeef: SeedContent = {
  name: '山药牛肉末软粥',
  type: '粥类',
  stage: '带小颗粒',
  tags: ['牛肉', '山药'],
  successKeys: [
    '牛肉逆着纹路剁碎，加一点淀粉抓匀，粥快好时下锅焖 5 分钟，肉末嫩而不柴',
    '山药选铁棍的，蒸熟压成泥再拌进粥里，比直接煮更绵',
  ],
  ingredients: [
    { name: '牛里脊', amount: '约 30g' },
    { name: '铁棍山药', amount: '一小段' },
    { name: '大米', amount: '小半杯' },
    { name: '淀粉', amount: '一小撮' },
  ],
  steps: [
    '大米提前浸泡 20 分钟，加水大火煮开转小火熬粥。',
    '牛肉逆纹剁成细末，加淀粉和一点水抓匀，静置 10 分钟。',
    '山药去皮切薄片，蒸 15 分钟至透，压成泥。',
    '粥熬至软烂时下牛肉末搅匀，盖盖焖 5 分钟。',
    '拌入山药泥，再煮 2 分钟即可。',
  ],
}

const tomatoEgg: SeedContent = {
  name: '番茄蛋黄羹',
  type: '蛋羹',
  stage: '细腻泥糊',
  tags: ['蛋黄', '番茄'],
  successKeys: [
    '蛋黄液用温水 1:1.5 调开再蒸，盖上扎了孔的保鲜膜，水开后中小火 10 分钟，嫩滑不起蜂窝',
    '番茄先去皮去籽炒成茸再拌入，比直接蒸口感干净',
  ],
  ingredients: [
    { name: '蛋黄', amount: '1 个' },
    { name: '番茄', amount: '四分之一个' },
    { name: '温水', amount: '约 45ml' },
  ],
  steps: [
    '番茄顶上划十字，开水烫 30 秒去皮去籽，切小丁炒成茸。',
    '蛋黄打散，加温水搅匀，过筛一遍去泡沫。',
    '盖上扎了小孔的保鲜膜，水开后中小火蒸 10 分钟。',
    '取出后拌入番茄茸即可。',
  ],
}

const pumpkinMillet: SeedContent = {
  name: '南瓜小米糊',
  type: '泥糊',
  stage: '细腻泥糊',
  tags: ['南瓜', '小米'],
  successKeys: [
    '小米提前泡 20 分钟、大火煮开转小火多焖一会儿才够烂',
    '南瓜一定蒸到筷子能轻松穿透，和粥一起过一遍筛，口感明显更细',
  ],
  ingredients: [
    { name: '小米', amount: '两小把' },
    { name: '贝贝南瓜', amount: '四分之一个' },
  ],
  steps: [
    '小米淘洗后浸泡 20 分钟。',
    '加水大火煮开，转小火熬 25 分钟，期间搅几次防粘。',
    '南瓜去皮去瓤切片，蒸 15 分钟。',
    '南瓜和小米粥一起放入料理机打成糊，或过筛一遍。',
  ],
}

const bananaPancake: SeedContent = {
  name: '香蕉蛋黄软饼',
  type: '小饼',
  stage: '手指食物',
  tags: ['香蕉', '蛋黄'],
  successKeys: [
    '熟透的香蕉压泥直接和蛋黄、面粉搅成稠糊，不额外加水',
    '小火少油、一面定型再翻，饼软不容易散，正好练习抓握',
  ],
  ingredients: [
    { name: '熟香蕉', amount: '半根' },
    { name: '蛋黄', amount: '1 个' },
    { name: '低筋面粉', amount: '两勺' },
  ],
  steps: [
    '香蕉压成细腻的泥。',
    '加入蛋黄搅匀，再分次加入面粉，搅成能缓慢流动的稠糊。',
    '不粘锅刷薄油，小火，舀一小勺糊摊成小圆饼。',
    '底面定型出现小孔后翻面，再煎 1 分钟。',
  ],
}

const wintermelonNoodle: SeedContent = {
  name: '冬瓜肉末烂糊面',
  type: '面食',
  stage: '软烂块状',
  tags: ['冬瓜', '猪肉'],
  successKeys: [
    '面条掰短先单独煮软再捞进汤里，不会糊成一团',
    '冬瓜切小丁和肉末先用高汤煨入味，最后勾一点薄芡，好吞咽',
  ],
  ingredients: [
    { name: '宝宝面条', amount: '一小把' },
    { name: '冬瓜', amount: '两薄片' },
    { name: '猪前腿肉末', amount: '约 25g' },
  ],
  steps: [
    '面条掰成小段，单独煮软后过一遍温水。',
    '肉末加淀粉抓匀；冬瓜切绿豆大的小丁。',
    '少量水下肉末炒散，加冬瓜丁和一点高汤煨 8 分钟。',
    '放入面条再煮 2 分钟，勾薄芡收汁。',
  ],
}

const broccoliPotato: SeedContent = {
  name: '西兰花土豆泥',
  type: '泥糊',
  stage: '细腻泥糊',
  tags: ['西兰花', '土豆'],
  successKeys: [
    '西兰花只取花朵部分、盐水泡 10 分钟再冲洗，蒸 8 分钟刚好翠绿软烂',
    '土豆蒸好后趁热压泥，加一勺配方奶更顺滑，凉了会返生变硬',
  ],
  ingredients: [
    { name: '西兰花', amount: '3 朵' },
    { name: '土豆', amount: '半个' },
    { name: '配方奶', amount: '一勺' },
  ],
  steps: [
    '西兰花切小朵，盐水浸泡 10 分钟后冲洗。',
    '土豆去皮切片，和西兰花一起蒸，土豆 15 分钟、西兰花后放蒸 8 分钟。',
    '土豆趁热压泥，加入配方奶调匀。',
    '西兰花细切后拌入，或一起压泥。',
  ],
}

export const SEED_RECIPES: Recipe[] = [
  {
    ...contentOf(yamBeef),
    id: 'r-yam-beef', familyId: FAMILY_ID,
    createdById: 'm-mom', createdAt: ago(21), updatedById: 'm-mom', updatedAt: ago(2, 3),
    revisions: [
      makeRevision('rev-yam-1', 'm-mom', ago(21), '初次收录', yamBeef, ['牛肉逆纹剁碎加淀粉抓匀，粥快好时下锅焖 5 分钟，肉末不柴。']),
      makeRevision('rev-yam-2', 'm-grandma', ago(6), '补充山药的处理方式', yamBeef, [yamBeef.successKeys[0]]),
      makeRevision('rev-yam-3', 'm-mom', ago(2, 3), '完善步骤，拆分成功关键', yamBeef),
    ],
  },
  {
    ...contentOf(tomatoEgg),
    id: 'r-tomato-egg', familyId: FAMILY_ID,
    createdById: 'm-dad', createdAt: ago(15), updatedById: 'm-dad', updatedAt: ago(15),
    revisions: [makeRevision('rev-egg-1', 'm-dad', ago(15), '初次收录', tomatoEgg, [tomatoEgg.successKeys[0]])],
  },
  {
    ...contentOf(pumpkinMillet),
    id: 'r-pumpkin-millet', familyId: FAMILY_ID,
    createdById: 'm-grandma', createdAt: ago(30), updatedById: 'm-mom', updatedAt: ago(4),
    revisions: [
      makeRevision('rev-pumpkin-1', 'm-grandma', ago(30), '初次收录', pumpkinMillet, ['小米泡 20 分钟再煮更烂，南瓜要蒸透。']),
      makeRevision('rev-pumpkin-2', 'm-mom', ago(4), '补充过筛的细节', pumpkinMillet),
    ],
  },
  {
    ...contentOf(bananaPancake),
    id: 'r-banana-pancake', familyId: FAMILY_ID,
    createdById: 'm-mom', createdAt: ago(9), updatedById: 'm-grandma', updatedAt: ago(1),
    revisions: [
      makeRevision('rev-banana-1', 'm-mom', ago(9), '初次收录', bananaPancake, ['香蕉泥加蛋黄面粉调稠糊，小火少油煎，不加水。']),
      makeRevision('rev-banana-2', 'm-grandma', ago(1), '补充翻面的时机', bananaPancake),
    ],
  },
  {
    ...contentOf(wintermelonNoodle),
    id: 'r-wintermelon-noodle', familyId: FAMILY_ID,
    createdById: 'm-dad', createdAt: ago(11), updatedById: 'm-dad', updatedAt: ago(3),
    revisions: [
      makeRevision('rev-noodle-1', 'm-dad', ago(11), '初次收录', wintermelonNoodle, ['面先单独煮软再入汤；冬瓜切小丁和肉末煨入味。']),
      makeRevision('rev-noodle-2', 'm-dad', ago(3), '补充勾芡步骤', wintermelonNoodle),
    ],
  },
  {
    ...contentOf(broccoliPotato),
    id: 'r-broccoli-potato', familyId: FAMILY_ID,
    createdById: 'm-mom', createdAt: ago(18), updatedById: 'm-mom', updatedAt: ago(7),
    revisions: [
      makeRevision('rev-broccoli-1', 'm-mom', ago(18), '初次收录', broccoliPotato, ['西兰花只取花朵蒸 8 分钟；土豆趁热压泥不会返生。']),
      makeRevision('rev-broccoli-2', 'm-mom', ago(7), '补充配方奶调顺滑的做法', broccoliPotato),
    ],
  },
  {
    id: 'r-pending-liver', familyId: FAMILY_ID, name: '自制猪肝粉',
    successKeys: [], ingredients: [], steps: [], tags: [],
    createdById: 'm-grandma', createdAt: ago(1, 5), updatedById: 'm-grandma', updatedAt: ago(1, 5), revisions: [],
  },
  {
    id: 'r-pending-shrimp', familyId: FAMILY_ID, name: '番茄虾仁碎碎面',
    successKeys: [], ingredients: [], steps: [], tags: [],
    createdById: 'm-mom', createdAt: ago(5), updatedById: 'm-mom', updatedAt: ago(5), revisions: [],
  },
]
