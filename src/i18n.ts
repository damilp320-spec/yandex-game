// Локализация: RU (основной рынок) + EN + TR (у Яндекс Игр большая турецкая аудитория).
// Язык берётся из S.lang (выбор игрока), иначе из ysdk.environment.i18n.lang, иначе из браузера.
//
// ИМЕНА СУЩЕСТВ: в RU — свои стилизации, в EN/TR — латиница в «итальянском» духе,
// потому что мем-персонажей во всём мире знают именно так (Ballerino Cappuccino и т.д.).
// Один латинский набор служит и EN, и TR — турецкая аудитория знает мемы в латинице.
import type { Chain } from './config';

export type Lang = 'ru' | 'en' | 'tr';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Русский' }, { code: 'en', label: 'English' }, { code: 'tr', label: 'Türkçe' },
];

let lang: Lang = 'ru';
export const getLang = () => lang;
export const setLang = (l: Lang) => { lang = l; };

/** Код языка платформы/браузера → поддерживаемый язык. */
export function detectLang(sdkLang?: string | null): Lang {
  const raw = (sdkLang || navigator.language || 'ru').slice(0, 2).toLowerCase();
  return raw === 'en' ? 'en' : raw === 'tr' ? 'tr' : 'ru';
}

const RU: Record<string, string> = {
  'common.close': 'Закрыть',
  'common.claim': 'Забрать',
  'common.notEnoughCoins': 'Не хватает монет!',
  'common.notEnoughGems': 'Не хватает 💎',
  'common.notEnoughFunds': 'Не хватает средств',
  'common.boardFull': 'Поле заполнено!',
  'common.copied': 'Скопировано — кидай в чат!',
  'common.yes': 'Да',
  'common.cancel': 'Отмена',

  'hud.creature': 'Существо ({cost}🪙)',
  'hud.incomeAd': '🎬 Доход ×{mult} (2 мин)',
  'hud.boostOn': 'Доход ×{mult}!',
  'hud.sec': 'с',
  'hud.day': 'д',
  'hud.shop': '💎 Магазин',
  'hud.quests': '📋 Задания',
  'hud.pedia': '📖 Мемпедия',
  'hud.arena': '🏆 Арена',
  'gen.ready': 'ГОТОВ',
  'gen.wait': 'Ещё {n} с',

  'order.label': 'Ролик с:\n{name}\n🪙 {reward}',
  'order.missing': 'Нет такого существа',
  'golden.tap': '✨ ЗОЛОТОЙ! +{n}🪙',

  'pedia.title': '📖 Мемпедия {found}/{total}',
  'pedia.discovered': '📖 Открыто: {name}! +{coins}🪙{gems}',
  'pedia.locked': 'Ещё не открыт',
  'pedia.secretHint': 'Секрет… ищи в сундуках 👀',

  'ftue.drag': '👆 Перетащи одно существо на другое!',
  'ftue.afterMerge': 'Отлично! Теперь выполни заказ наверху 👆',
  'ftue.income': 'Существа сами приносят монеты — следи за счётчиком 💰',
  'ftue.tap': 'Тапай существ на поле — они платят сразу!',
  'ftue.arena': 'Открой Арену — собери команду и бейся за кубки 🏆',
  'event.points': '{emoji} +{n} очков события',

  'row.title': '🔒 Дополнительный ряд',
  'row.desc': 'Больше места — больше существ\nи длиннее цепочки!',
  'row.buyCoins': 'Открыть за {n}🪙',
  'row.buyGems': 'Открыть за {n}💎',

  'streak.title': '📅 Ежедневный бонус',
  'streak.claimDay': 'Забрать бонус дня {n}!',
  'streak.lost': 'Серия из {n} дн. прервалась!',
  'streak.save': '🎬 Спасти серию за рекламу',
  'streak.restart': 'Начать серию заново',

  'quests.title': '📋 Задания дня',
  'quests.line': '{label}\n{prog}/{target} · награда {coins}🪙 +{gems}💎',
  'quests.footer': 'Новые задания — каждый день!',
  'quest.merges': 'Слей существ',
  'quest.orders': 'Выполни заказы',
  'quest.spawns': 'Заведи существ',
  'quest.taps': 'Покликай существ',

  'zones.title': '🗺️ Локации',
  'zones.chains': '{n} цепочки существ',
  'zones.unlock': 'Открыть: {coins}🪙 или {gems}💎',
  'zone.lab': 'Лаборатория',
  'zone.club': 'Неон-Клуб',
  'zone.watch': 'Ночной Дозор',
  'zone.space': 'Космо-База',

  'event.info': 'Осталось {days} дн. · Очки: {points} {emoji}\n\nСобытийные существа появляются при создании\nновых (шанс 25%). Сливай их и копи очки!',
  'event.footer': 'Когда событие закончится, его существа\nпревратятся в монеты — ничего не пропадёт!',
  'event.chest': '📦 сундук',
  'event.beach26': 'Пляжный сезон',
  'event.ny26': 'Новогодний движ',

  'arena.title': '🏆 Арена · {n}🏆',
  'arena.teamHint': 'Команда (бойцы не приносят доход на поле):',
  'arena.power': 'Сила команды: {n}',
  'arena.fight': '⚔️ В БОЙ!',
  'arena.needTeam': 'Сначала добавь бойцов!',
  'arena.atk': '⚔ Атака ур.{n}\n{cost}🪙',
  'arena.hp': '❤ Броня ур.{n}\n{cost}🪙',
  'arena.top': '🏅 Топ игроков',
  'arena.pickTitle': '➕ Выбери бойца с поля',
  'arena.pickEmpty': 'На поле пусто!\nКупи существ и возвращайся.',
  'arena.noRoom': 'На поле нет места!',
  'arena.win': '🎉 ПОБЕДА!',
  'arena.lose': '💀 Поражение…',
  'arena.winInfo': '{d}🏆  ·  +{coins}🪙',
  'arena.chestHint': '🎁 Каждая 3-я победа — сундук!',
  'arena.loseInfo': '{d}🏆\n\nПодкачай команду в казарме\nили слей существ повыше уровнем.',
  'arena.again': '⚔️ Ещё бой!',
  'arena.rematch': '🎬 Реванш с бустом ×1.2',
  'arena.lbTitle': '🏅 Топ по кубкам',
  'arena.you': 'Ты',
  'arena.player': 'Игрок',
  'battle.vs': '⚔️ Ты  VS  {name}',
  'battle.speed': '▶ ×2',

  'wb.title': '⚔️ Битва недели',
  'wb.desc': '{a}  VS  {b}\n\nВыбери сторону — очки идут за слияния\nсуществ твоей команды. В конце недели —\nкристаллы по очкам. Сторону не сменить!',
  'wb.join': 'За {name}!',
  'wb.mine': '⭐ Твоя команда',
  'wb.points': 'Твои очки: {n} ⚔️',
  'wb.invite': '📣 Позвать друзей в мою команду',
  'wb.share': 'Я топлю за команду «{name}» в Битве недели Brainrot Lab: Merge ({n} очков) ⚔️ А ты за кого? Игра — на Яндекс Играх!',
  'wb.over': '⚔️ Битва недели окончена: +{gems}💎 за {points} очков!',

  'rename.title': '⭐ ЛЕГЕНДАРКА!',
  'rename.desc': 'Ты вырастил «{name}»!\nТакое существо заслуживает СОБСТВЕННОЕ имя.\nОно останется в твоей Мемпедии навсегда.',
  'rename.btn': '✏️ Дать имя',
  'rename.prompt': 'Имя для твоей легендарки:',
  'rename.done': 'Теперь это «{name}»!',
  'rename.brag': '📣 Похвастаться легендаркой',
  'rename.share': 'Моя легендарка «{name}» уже качает в Brainrot Lab: Merge 🏆 Покажи свою! Игра — на Яндекс Играх.',

  's67.title': '⁉️ 6 7 !!!',
  's67.desc': 'Ты выбил СЕКРЕТНОГО 67!\nШанс — всего 6,7%.\n\nТаких игроков — единицы.\nСольёшь до ЛЕГЕНДО 67 — станешь легендой сам.',
  's67.brag': '📣 Скопировать хвастовство',
  's67.share': 'Я выбил секретного 67 в Brainrot Lab: Merge — шанс всего 6,7% 🔵6️⃣7️⃣ Слабо повторить? Ищи игру на Яндекс Играх!',

  'starter.title': '🎁 Подарок новичку',
  'starter.desc': 'Стартовый набор — выгода ×5\n\n150💎 + 5000🪙\n+ 7 дней без рекламы\n\nТолько один раз!',
  'starter.btn': 'Забрать со скидкой',

  'offline.title': '💤 Пока вас не было…',
  'offline.desc': 'Твои брейнроты наработали:\n🪙 {n}',
  'offline.claim': 'Забрать {n}🪙',
  'offline.claim2': '🎬 Забрать ×2 ({n}🪙)',

  'shop.title': '💎 Магазин',
  'shop.freeChest': '🎁 Бесплатный сундук за рекламу',
  'shop.freeChestWait': '🎁 Бесплатный сундук через {n} мин',
  'shop.chest': '📦 Сундук существа — {n}💎',
  'shop.boost': '⚡ Буст дохода ×{mult} (10 мин) — {gems}💎',
  'p.starter.title': 'Стартовый набор — выгода ×5',
  'p.starter.desc': '150💎 + 5000🪙 + 7 дней без рекламы (только 1 раз)',
  'p.gems_s.title': 'Горсть кристаллов',
  'p.gems_s.desc': '80💎',
  'p.gems_m.title': 'Мешок кристаллов',
  'p.gems_m.desc': '500💎 · выгода +25%',
  'p.gems_l.title': 'Сундук кристаллов',
  'p.gems_l.desc': '1200💎 · выгода +50%',
  'p.no_ads.title': 'Отключить рекламу',
  'p.no_ads.desc': 'Убирает всю принудительную рекламу навсегда',
  'chest.secret': '⁉️ ВЫПАЛ СЕКРЕТНЫЙ 67!!!',
  'chest.secretFull': 'Поле забито — +67💎 (это знак)',
  'chest.new': 'Новое существо из сундука!',
  'chest.full': 'Поле забито — +{n}🪙',

  'rarity.common': 'обычный',
  'rarity.rare': 'редкий',
  'rarity.epic': 'эпический',
  'rarity.legendary': 'легендарный',

  'set.title': '⚙️ Настройки',
  'set.soundOn': '🔊 Звук: вкл',
  'set.soundOff': '🔇 Звук: выкл',
  'set.lang': '🌐 Язык',
  'set.reset': '🗑️ Сбросить прогресс',
  'set.resetAsk': 'Точно удалить ВЕСЬ прогресс?\nОтменить будет нельзя.',
  'set.resetYes': 'Да, удалить всё',
  'set.version': 'Brainrot Lab: Merge · v{v}',
  'set.credits': 'Сделано для Яндекс Игр',
};

const EN: Record<string, string> = {
  'common.close': 'Close',
  'common.claim': 'Claim',
  'common.notEnoughCoins': 'Not enough coins!',
  'common.notEnoughGems': 'Not enough 💎',
  'common.notEnoughFunds': 'Not enough funds',
  'common.boardFull': 'Board is full!',
  'common.copied': 'Copied — paste it in chat!',
  'common.yes': 'Yes',
  'common.cancel': 'Cancel',

  'hud.creature': 'Creature ({cost}🪙)',
  'hud.incomeAd': '🎬 Income ×{mult} (2 min)',
  'hud.boostOn': 'Income ×{mult}!',
  'hud.sec': 's',
  'hud.day': 'd',
  'hud.shop': '💎 Shop',
  'hud.quests': '📋 Quests',
  'hud.pedia': '📖 Mempedia',
  'hud.arena': '🏆 Arena',
  'gen.ready': 'READY',
  'gen.wait': '{n} s left',

  'order.label': 'Video with:\n{name}\n🪙 {reward}',
  'order.missing': 'No such creature',
  'golden.tap': '✨ GOLDEN! +{n}🪙',

  'pedia.title': '📖 Mempedia {found}/{total}',
  'pedia.discovered': '📖 Unlocked: {name}! +{coins}🪙{gems}',
  'pedia.locked': 'Not found yet',
  'pedia.secretHint': 'A secret… look inside chests 👀',

  'ftue.drag': '👆 Drag one creature onto another!',
  'ftue.afterMerge': 'Nice! Now fill an order up top 👆',
  'ftue.income': 'Creatures earn coins on their own — watch the counter 💰',
  'ftue.tap': 'Tap creatures on the board — they pay instantly!',
  'ftue.arena': 'Open the Arena — build a team and fight for trophies 🏆',
  'event.points': '{emoji} +{n} event points',

  'row.title': '🔒 Extra row',
  'row.desc': 'More space means more creatures\nand longer chains!',
  'row.buyCoins': 'Unlock for {n}🪙',
  'row.buyGems': 'Unlock for {n}💎',

  'streak.title': '📅 Daily bonus',
  'streak.claimDay': 'Claim day {n} bonus!',
  'streak.lost': 'Your {n}-day streak broke!',
  'streak.save': '🎬 Save streak with an ad',
  'streak.restart': 'Start a new streak',

  'quests.title': '📋 Daily quests',
  'quests.line': '{label}\n{prog}/{target} · reward {coins}🪙 +{gems}💎',
  'quests.footer': 'New quests every day!',
  'quest.merges': 'Merge creatures',
  'quest.orders': 'Fill orders',
  'quest.spawns': 'Get new creatures',
  'quest.taps': 'Tap your creatures',

  'zones.title': '🗺️ Locations',
  'zones.chains': '{n} creature chains',
  'zones.unlock': 'Unlock: {coins}🪙 or {gems}💎',
  'zone.lab': 'The Lab',
  'zone.club': 'Neon Club',
  'zone.watch': 'Night Watch',
  'zone.space': 'Cosmo Base',

  'event.info': '{days} days left · Points: {points} {emoji}\n\nEvent creatures appear when you buy\nnew ones (25% chance). Merge them for points!',
  'event.footer': 'When the event ends its creatures\nturn into coins — nothing is lost!',
  'event.chest': '📦 chest',
  'event.beach26': 'Beach Season',
  'event.ny26': 'New Year Party',

  'arena.title': '🏆 Arena · {n}🏆',
  'arena.teamHint': 'Team (fighters earn no income on the board):',
  'arena.power': 'Team power: {n}',
  'arena.fight': '⚔️ FIGHT!',
  'arena.needTeam': 'Add some fighters first!',
  'arena.atk': '⚔ Attack lv.{n}\n{cost}🪙',
  'arena.hp': '❤ Armor lv.{n}\n{cost}🪙',
  'arena.top': '🏅 Top players',
  'arena.pickTitle': '➕ Pick a fighter from the board',
  'arena.pickEmpty': 'The board is empty!\nGet some creatures and come back.',
  'arena.noRoom': 'No free cell on the board!',
  'arena.win': '🎉 VICTORY!',
  'arena.lose': '💀 Defeat…',
  'arena.winInfo': '{d}🏆  ·  +{coins}🪙',
  'arena.chestHint': '🎁 Every 3rd win gives a chest!',
  'arena.loseInfo': '{d}🏆\n\nUpgrade your team in the barracks\nor merge higher-level creatures.',
  'arena.again': '⚔️ One more fight!',
  'arena.rematch': '🎬 Rematch with ×1.2 buff',
  'arena.lbTitle': '🏅 Trophy leaderboard',
  'arena.you': 'You',
  'arena.player': 'Player',
  'battle.vs': '⚔️ You  VS  {name}',
  'battle.speed': '▶ ×2',

  'wb.title': '⚔️ Battle of the Week',
  'wb.desc': '{a}  VS  {b}\n\nPick a side — you score points for merging\nyour team\'s creatures. Gems at the end of\nthe week. You can\'t switch sides!',
  'wb.join': 'Team {name}!',
  'wb.mine': '⭐ Your team',
  'wb.points': 'Your points: {n} ⚔️',
  'wb.invite': '📣 Invite friends to my team',
  'wb.share': 'I\'m repping team "{name}" in the Battle of the Week in Brainrot Lab: Merge ({n} points) ⚔️ Whose side are you on?',
  'wb.over': '⚔️ Battle of the Week is over: +{gems}💎 for {points} points!',

  'rename.title': '⭐ LEGENDARY!',
  'rename.desc': 'You raised "{name}"!\nA creature like this deserves ITS OWN name.\nIt stays in your Mempedia forever.',
  'rename.btn': '✏️ Give it a name',
  'rename.prompt': 'Name your legendary:',
  'rename.done': 'Now it\'s "{name}"!',
  'rename.brag': '📣 Brag about your legendary',
  'rename.share': 'My legendary "{name}" is grinding in Brainrot Lab: Merge 🏆 Show me yours!',

  's67.title': '⁉️ 6 7 !!!',
  's67.desc': 'You pulled the SECRET 67!\nThe chance is only 6.7%.\n\nAlmost nobody gets this.\nMerge it up to LEGENDO 67 and become a legend.',
  's67.brag': '📣 Copy the brag',
  's67.share': 'I pulled the secret 67 in Brainrot Lab: Merge — a 6.7% chance 🔵6️⃣7️⃣ Bet you can\'t!',

  'starter.title': '🎁 Newcomer gift',
  'starter.desc': 'Starter pack — ×5 value\n\n150💎 + 5000🪙\n+ 7 days without ads\n\nOne time only!',
  'starter.btn': 'Claim at a discount',

  'offline.title': '💤 While you were away…',
  'offline.desc': 'Your brainrots earned:\n🪙 {n}',
  'offline.claim': 'Claim {n}🪙',
  'offline.claim2': '🎬 Claim ×2 ({n}🪙)',

  'shop.title': '💎 Shop',
  'shop.freeChest': '🎁 Free chest for an ad',
  'shop.freeChestWait': '🎁 Free chest in {n} min',
  'shop.chest': '📦 Creature chest — {n}💎',
  'shop.boost': '⚡ Income ×{mult} (10 min) — {gems}💎',
  'p.starter.title': 'Starter pack — ×5 value',
  'p.starter.desc': '150💎 + 5000🪙 + 7 days without ads (one time)',
  'p.gems_s.title': 'Handful of gems',
  'p.gems_s.desc': '80💎',
  'p.gems_m.title': 'Bag of gems',
  'p.gems_m.desc': '500💎 · +25% value',
  'p.gems_l.title': 'Chest of gems',
  'p.gems_l.desc': '1200💎 · +50% value',
  'p.no_ads.title': 'Remove ads',
  'p.no_ads.desc': 'Removes all forced ads forever',
  'chest.secret': '⁉️ THE SECRET 67 DROPPED!!!',
  'chest.secretFull': 'Board is full — +67💎 (that\'s a sign)',
  'chest.new': 'A new creature from the chest!',
  'chest.full': 'Board is full — +{n}🪙',

  'rarity.common': 'common',
  'rarity.rare': 'rare',
  'rarity.epic': 'epic',
  'rarity.legendary': 'legendary',

  'set.title': '⚙️ Settings',
  'set.soundOn': '🔊 Sound: on',
  'set.soundOff': '🔇 Sound: off',
  'set.lang': '🌐 Language',
  'set.reset': '🗑️ Reset progress',
  'set.resetAsk': 'Delete ALL progress for real?\nThis cannot be undone.',
  'set.resetYes': 'Yes, delete everything',
  'set.version': 'Brainrot Lab: Merge · v{v}',
  'set.credits': 'Made for Yandex Games',
};

const TR: Record<string, string> = {
  'common.close': 'Kapat',
  'common.claim': 'Al',
  'common.notEnoughCoins': 'Yeterli altın yok!',
  'common.notEnoughGems': 'Yeterli 💎 yok',
  'common.notEnoughFunds': 'Yeterli kaynak yok',
  'common.boardFull': 'Alan dolu!',
  'common.copied': 'Kopyalandı — sohbete at!',
  'common.yes': 'Evet',
  'common.cancel': 'İptal',

  'hud.creature': 'Yaratık ({cost}🪙)',
  'hud.incomeAd': '🎬 Gelir ×{mult} (2 dk)',
  'hud.boostOn': 'Gelir ×{mult}!',
  'hud.sec': 'sn',
  'hud.day': 'g',
  'hud.shop': '💎 Mağaza',
  'hud.quests': '📋 Görevler',
  'hud.pedia': '📖 Mempedi',
  'hud.arena': '🏆 Arena',
  'gen.ready': 'HAZIR',
  'gen.wait': '{n} sn kaldı',

  'order.label': 'Video:\n{name}\n🪙 {reward}',
  'order.missing': 'Böyle bir yaratık yok',
  'golden.tap': '✨ ALTIN! +{n}🪙',

  'pedia.title': '📖 Mempedi {found}/{total}',
  'pedia.discovered': '📖 Keşfedildi: {name}! +{coins}🪙{gems}',
  'pedia.locked': 'Henüz keşfedilmedi',
  'pedia.secretHint': 'Bir sır… sandıklara bak 👀',

  'ftue.drag': '👆 Bir yaratığı diğerinin üzerine sürükle!',
  'ftue.afterMerge': 'Harika! Şimdi yukarıdaki siparişi tamamla 👆',
  'ftue.income': 'Yaratıklar kendi başına altın kazandırır — sayacı izle 💰',
  'ftue.tap': 'Alandaki yaratıklara dokun — anında ödeme yaparlar!',
  'ftue.arena': 'Arena\'yı aç — takım kur ve kupa için savaş 🏆',
  'event.points': '{emoji} +{n} etkinlik puanı',

  'row.title': '🔒 Ek sıra',
  'row.desc': 'Daha çok yer, daha çok yaratık\nve daha uzun zincirler!',
  'row.buyCoins': '{n}🪙 ile aç',
  'row.buyGems': '{n}💎 ile aç',

  'streak.title': '📅 Günlük ödül',
  'streak.claimDay': '{n}. günün ödülünü al!',
  'streak.lost': '{n} günlük serin bozuldu!',
  'streak.save': '🎬 Reklamla seriyi kurtar',
  'streak.restart': 'Yeni seriye başla',

  'quests.title': '📋 Günün görevleri',
  'quests.line': '{label}\n{prog}/{target} · ödül {coins}🪙 +{gems}💎',
  'quests.footer': 'Her gün yeni görevler!',
  'quest.merges': 'Yaratık birleştir',
  'quest.orders': 'Sipariş tamamla',
  'quest.spawns': 'Yeni yaratık edin',
  'quest.taps': 'Yaratıklara dokun',

  'zones.title': '🗺️ Bölgeler',
  'zones.chains': '{n} yaratık zinciri',
  'zones.unlock': 'Aç: {coins}🪙 veya {gems}💎',
  'zone.lab': 'Laboratuvar',
  'zone.club': 'Neon Kulüp',
  'zone.watch': 'Gece Nöbeti',
  'zone.space': 'Kozmo Üs',

  'event.info': '{days} gün kaldı · Puan: {points} {emoji}\n\nEtkinlik yaratıkları yeni yaratık alırken\nçıkar (%25 şans). Birleştir ve puan topla!',
  'event.footer': 'Etkinlik bitince yaratıkları altına\ndönüşür — hiçbir şey kaybolmaz!',
  'event.chest': '📦 sandık',
  'event.beach26': 'Plaj Sezonu',
  'event.ny26': 'Yılbaşı Partisi',

  'arena.title': '🏆 Arena · {n}🏆',
  'arena.teamHint': 'Takım (savaşçılar alanda gelir getirmez):',
  'arena.power': 'Takım gücü: {n}',
  'arena.fight': '⚔️ SAVAŞA!',
  'arena.needTeam': 'Önce savaşçı ekle!',
  'arena.atk': '⚔ Saldırı sv.{n}\n{cost}🪙',
  'arena.hp': '❤ Zırh sv.{n}\n{cost}🪙',
  'arena.top': '🏅 En iyi oyuncular',
  'arena.pickTitle': '➕ Alandan savaşçı seç',
  'arena.pickEmpty': 'Alan boş!\nYaratık al ve geri gel.',
  'arena.noRoom': 'Alanda boş yer yok!',
  'arena.win': '🎉 KAZANDIN!',
  'arena.lose': '💀 Kaybettin…',
  'arena.winInfo': '{d}🏆  ·  +{coins}🪙',
  'arena.chestHint': '🎁 Her 3. galibiyette sandık!',
  'arena.loseInfo': '{d}🏆\n\nKışlada takımını güçlendir ya da\ndaha yüksek seviye yaratıklar birleştir.',
  'arena.again': '⚔️ Bir savaş daha!',
  'arena.rematch': '🎬 ×1.2 güçle rövanş',
  'arena.lbTitle': '🏅 Kupa sıralaması',
  'arena.you': 'Sen',
  'arena.player': 'Oyuncu',
  'battle.vs': '⚔️ Sen  VS  {name}',
  'battle.speed': '▶ ×2',

  'wb.title': '⚔️ Haftanın Savaşı',
  'wb.desc': '{a}  VS  {b}\n\nBir taraf seç — takımının yaratıklarını\nbirleştirdikçe puan kazanırsın. Hafta sonunda\nkristal. Taraf değiştirilemez!',
  'wb.join': '{name} tarafı!',
  'wb.mine': '⭐ Senin takımın',
  'wb.points': 'Puanın: {n} ⚔️',
  'wb.invite': '📣 Arkadaşlarını takımıma çağır',
  'wb.share': 'Brainrot Lab: Merge\'de Haftanın Savaşı\'nda «{name}» takımındayım ({n} puan) ⚔️ Sen kimin tarafındasın?',
  'wb.over': '⚔️ Haftanın Savaşı bitti: {points} puan için +{gems}💎!',

  'rename.title': '⭐ EFSANE!',
  'rename.desc': '«{name}» yarattın!\nBöyle bir yaratık KENDİ adını hak ediyor.\nMempedi\'nde sonsuza kadar kalır.',
  'rename.btn': '✏️ İsim ver',
  'rename.prompt': 'Efsanenin adı:',
  'rename.done': 'Artık adı «{name}»!',
  'rename.brag': '📣 Efsanenle övün',
  'rename.share': 'Efsanem «{name}» Brainrot Lab: Merge\'de kasıyor 🏆 Sen de göster!',

  's67.title': '⁉️ 6 7 !!!',
  's67.desc': 'GİZLİ 67\'yi yakaladın!\nŞans sadece %6,7.\n\nBunu çok az kişi görür.\nLEGENDO 67\'ye kadar birleştir, efsane ol.',
  's67.brag': '📣 Övünmeyi kopyala',
  's67.share': 'Brainrot Lab: Merge\'de gizli 67\'yi yakaladım — şans sadece %6,7 🔵6️⃣7️⃣ Sen yapabilir misin?',

  'starter.title': '🎁 Yeni oyuncu hediyesi',
  'starter.desc': 'Başlangıç paketi — ×5 değer\n\n150💎 + 5000🪙\n+ 7 gün reklamsız\n\nSadece bir kez!',
  'starter.btn': 'İndirimli al',

  'offline.title': '💤 Sen yokken…',
  'offline.desc': 'Brainrot\'ların kazandı:\n🪙 {n}',
  'offline.claim': '{n}🪙 al',
  'offline.claim2': '🎬 ×2 al ({n}🪙)',

  'shop.title': '💎 Mağaza',
  'shop.freeChest': '🎁 Reklamla bedava sandık',
  'shop.freeChestWait': '🎁 Bedava sandık {n} dk sonra',
  'shop.chest': '📦 Yaratık sandığı — {n}💎',
  'shop.boost': '⚡ Gelir ×{mult} (10 dk) — {gems}💎',
  'p.starter.title': 'Başlangıç paketi — ×5 değer',
  'p.starter.desc': '150💎 + 5000🪙 + 7 gün reklamsız (sadece 1 kez)',
  'p.gems_s.title': 'Bir tutam kristal',
  'p.gems_s.desc': '80💎',
  'p.gems_m.title': 'Kristal torbası',
  'p.gems_m.desc': '500💎 · +%25 değer',
  'p.gems_l.title': 'Kristal sandığı',
  'p.gems_l.desc': '1200💎 · +%50 değer',
  'p.no_ads.title': 'Reklamları kapat',
  'p.no_ads.desc': 'Tüm zorunlu reklamları kalıcı olarak kaldırır',
  'chest.secret': '⁉️ GİZLİ 67 ÇIKTI!!!',
  'chest.secretFull': 'Alan dolu — +67💎 (bu bir işaret)',
  'chest.new': 'Sandıktan yeni yaratık!',
  'chest.full': 'Alan dolu — +{n}🪙',

  'rarity.common': 'normal',
  'rarity.rare': 'nadir',
  'rarity.epic': 'epik',
  'rarity.legendary': 'efsanevi',

  'set.title': '⚙️ Ayarlar',
  'set.soundOn': '🔊 Ses: açık',
  'set.soundOff': '🔇 Ses: kapalı',
  'set.lang': '🌐 Dil',
  'set.reset': '🗑️ İlerlemeyi sıfırla',
  'set.resetAsk': 'TÜM ilerleme silinsin mi?\nBu geri alınamaz.',
  'set.resetYes': 'Evet, hepsini sil',
  'set.version': 'Brainrot Lab: Merge · v{v}',
  'set.credits': 'Yandex Games için yapıldı',
};

const DICTS: Record<Lang, Record<string, string>> = { ru: RU, en: EN, tr: TR };

/** Строка по ключу с подстановкой {param}. Фолбэк: язык → RU → сам ключ. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? RU[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

// Латинские имена существ для EN/TR — по id цепочки (и по id события для событийных).
const LATIN: Record<string, string[]> = {
  coffee: ['Granello', 'Tazzina', 'Latterina', 'Ballerino Cappuccino', 'Grande Mocaccino', 'Prima Espressima'],
  croc: ['Uovino', 'Coccodrillino', 'Coccodrino', 'Aviocrocodilo', 'Bombardino', 'Mega Crocodilissimo'],
  shark: ['Pesciolino', 'Squaletto', 'Tralalino', 'Squalo Ballerino', 'Megalodino', 'Grande Tralalissimo'],
  drum: ['Scheggia', 'Tamburello', 'Tung Tungano', 'Tamburando', 'Notte Tamburandissimo', 'Sahurando Legendo'],
  cat: ['Gattino', 'Gatto Beatino', 'Miao DJino', 'Gatto Disco Fonio', 'Mega Miaomix', 'Legendo Gattofono'],
  robot: ['Bulloncino', 'Robo Piccolino', 'Bitbox 3000', 'Robo Ballerino', 'Giga Danzato', 'Primo Robotissimo'],
  fruit: ['Semino', 'Fragolella', 'Bacca Ladina', 'Banano Stiliso', 'Duetto Romantico', 'Frutto Legendario'],
  stick: ['Legnetto', 'Palo Guardino', 'Bastone Notturno', 'Guardiando Bastone', 'Grande Postovissimo', 'Legendo Vigilante'],
  sixseven: ['Sei', 'Sette', 'Sei-Sette', '67 Danzato', 'Mega 67', 'LEGENDO 67'],
  capy: ['Capibarino', 'Capi Chillo', 'Capibarello', 'Cosmo Capibara', 'Capibara Comandante', 'Grande Capibarissimo'],
  ufo: ['Lucino', 'UFOlino', 'Dischetto', 'Ospite Verdino', 'Mega Alienoso', 'Legendo Galattico'],
  noodle: ['Maccherino', 'Nudlino', 'Spaghetti Joe', 'Nudlo Cosmo', 'Giga Pasta', 'Spaghettissimo Prime'],
  beach26: ['Sabbiolino', 'Conchiglino', 'Crabo DJino', 'Palmando Cocosini', 'Grande Solecissimo'],
  ny26: ['Fioccolino', 'Sugrobino', 'Alberello Ballerino', 'Nonno Gelato', 'Grande Salutissimo'],
};

/** Имя существа: в RU — из конфига, в EN/TR — латиница (фолбэк на конфиг). */
export function creatureName(cfg: Chain, level: number): string {
  if (lang === 'ru') return cfg.names[level];
  return LATIN[cfg.id]?.[level] ?? cfg.names[level];
}

export const rarityName = (level: number) =>
  t(level >= 5 ? 'rarity.legendary' : level >= 4 ? 'rarity.epic' : level >= 2 ? 'rarity.rare' : 'rarity.common');

// Ники соперников арены: живые, «как у настоящих игроков».
const NICKS_RU = [
  'Кирилл_2013', 'xX_БравлеР_Xx', 'НагибаторТоля', 'мама сказала можно', 'Скуф67',
  'ПростоДаня', 'КапибараЛюб', 'ЗубастикПро', 'aunt_walera', 'СЛИВКИ_ОБЩЕСТВА',
  'Тимофей TV', 'девочка_вайб', 'КрутойПерец99', 'Их_Бин_Ту', 'сигма-с-урока',
  'ЛещДесантный', 'Полиночка)', 'ГномГномыч', 'Абобус228', 'человек-роблокс',
];
const NICKS_LAT = [
  'Kirill_2013', 'xX_BrawleR_Xx', 'NoScopeToni', 'mom_said_yes', 'BigChungus67',
  'JustDaniel', 'CapybaraLover', 'SharkTeethPro', 'uncle_bob', 'CREAM_OF_SOCIETY',
  'Timo TV', 'girly_vibe', 'CoolPepper99', 'Ich_Bin_Zwei', 'sigma_from_class',
  'ParatrooperFish', 'Ayse_gamer', 'GnomeGnomich', 'Abobus228', 'roblox-person',
];
export const nicks = () => (lang === 'ru' ? NICKS_RU : NICKS_LAT);
