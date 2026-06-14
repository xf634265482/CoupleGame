/** 在线匹配补位 AI 昵称池（中文、像真实玩家） */
const BOT_NAME_POOL = [
  '小橘',
  '阿北',
  '糖豆',
  '迷路羊',
  '夜航员',
  '青柠茶',
  '晚风',
  '拾光',
  '云边Walk',
  '栗子同学',
  '半糖',
  '野鹿',
  '星河落',
  '桃汽水',
  '木子',
  '南风知意',
  '浅夏',
  '北巷',
  '小鹿乱撞',
  '橘子海',
  '阿白',
  '雾岛',
  '长安某',
  '七月',
  '一叶舟',
  '奶茶七分甜',
  '咸鱼翻身',
  '周末玩家',
  '摸鱼达人',
  '路人甲',
  '快乐星球',
  '不想起名',
  '今天也要赢',
  '随缘选手',
  '再来一局',
  '棋盘杀手',
  '走位风骚',
  '苟住别浪',
  '冲锋队员',
  '后勤部长',
];

/**
 * @param {Set<string>|string[]} usedNames 房间内已占用昵称
 */
function pickRandomBotNickname(usedNames = []) {
  const used =
    usedNames instanceof Set ? usedNames : new Set(usedNames.filter(Boolean));
  let available = BOT_NAME_POOL.filter((n) => !used.has(n));
  if (!available.length) {
    available = BOT_NAME_POOL.map((n) => `${n}${Math.floor(Math.random() * 90) + 10}`);
  }
  const pick = available[Math.floor(Math.random() * available.length)];
  used.add(pick);
  return pick;
}

module.exports = {
  BOT_NAME_POOL,
  pickRandomBotNickname,
};
