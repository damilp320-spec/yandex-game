# Промпты для генерации PNG-персонажей и фонов

Сгенерируй картинки, положи в `public/skins/`, перечисли в `public/skins/manifest.json` — игра подхватит их автоматически вместо процедурных (как со звуками).

## Технические требования

- **Персонажи:** квадрат **512×512** (можно 256×256), **прозрачный фон (PNG)**, персонаж по центру, занимает ~85% кадра. Имена файлов: `<id>_<уровень>.png`, например `coffee_0.png` … `coffee_5.png`.
- **Фоны:** портрет **720×1280** (или 1080×1920). Имена: `bg_lab.png`, `bg_club.png`, `bg_watch.png`, `bg_space.png`.
- **manifest.json** (кладётся туда же, в `public/skins/`):
```json
{
  "sprites": ["coffee_0", "coffee_1", "coffee_2", "coffee_3", "coffee_4", "coffee_5", "sixseven_0"],
  "backgrounds": ["lab", "club", "watch", "space"]
}
```
Можно заменять частично: что не перечислено — продолжит рисоваться кодом.

## Базовый шаблон промпта (подставляй вместо {...})

> 3D render in the style of viral Italian brainrot memes, Pixar-like glossy cartoon, single character: {ОПИСАНИЕ ПЕРСОНАЖА}, {МОДИФИКАТОР УРОВНЯ}, big expressive cartoon eyes with highlights, cheeky smile, centered full-body view, vibrant saturated colors, soft studio lighting, absurd and funny, isolated on transparent background, PNG, no text, no watermark

## Модификаторы уровня (одинаковые для всех цепочек)

| Уровень | Файл `_N` | Модификатор |
|---|---|---|
| 1 | `_0` | tiny cute baby version, small and round, innocent look |
| 2 | `_1` | young version, slightly bigger, playful pose |
| 3 | `_2` | adult version, confident pose, one signature accessory |
| 4 | `_3` | cool epic version, sunglasses or fancy outfit, dynamic pose |
| 5 | `_4` | epic boss version, golden crown with gems, dramatic pose |
| 6 | `_5` | LEGENDARY version, golden aura, sparkles, god rays behind, majestic |

## Описания персонажей (12 цепочек)

| id | Описание для шаблона |
|---|---|
| `coffee` | anthropomorphic cappuccino coffee cup ballerina with foam art hair, wearing a pink ballet tutu, thin dancing legs |
| `croc` | absurd crocodile with airplane bomber wings and a propeller, military green, tiny teeth grin |
| `shark` | funny shark standing upright on legs, wearing blue sneakers (like walking on a beach), grey-blue body, white belly |
| `drum` | anthropomorphic wooden drum creature beating itself with drumsticks, night watchman vibe |
| `cat` | DJ cat with headphones and glowing disco glasses, neon pink fur, standing at a turntable pose |
| `robot` | dancing retro robot with a screen face showing an equalizer, teal metallic body, antenna with a light bulb |
| `fruit` | elegant strawberry lady with green leaf hair; higher levels: add a charming banana gentleman in a white shirt standing next to her (romantic couple) |
| `stick` | tall wooden log creature with a cute face, thin arms and bare feet, holding a wooden bat, night village watchman (like the Indonesian brainrot meme) |
| `sixseven` | blocky voxel creature shaped like the numbers "6" and "7" standing side by side as a body, bright blue Lego-like blocks, googly eyes inside the digits, sneakers (Roblox brainrot style) |
| `capy` | chill capybara in a tiny astronaut suit, relaxed half-closed eyes, brown fur, absolutely unbothered |
| `ufo` | cute green alien inside a glass-dome flying saucer with yellow lights, tiny waving hands |
| `noodle` | spaghetti pasta gentleman: bundle of noodles as a body, meatball face, tiny top hat, Italian mustache |

Для **событийных существ** (id = `event`): summer beach sun creature with sunglasses / snowflake creature in a winter hat — по текущему событию.

## Фоны локаций

> {ОПИСАНИЕ}, vertical mobile game background 720x1280, stylized cartoon, soft depth of field, muted colors so characters pop, no characters, no text

| Файл | Описание |
|---|---|
| `bg_lab.png` | cozy mad-scientist laboratory at night, purple walls, glowing flasks and bubbling potions, soft neon glow |
| `bg_club.png` | neon nightclub interior, dark blue walls, pink and cyan laser beams, disco ball light dots, dance floor |
| `bg_watch.png` | quiet Indonesian village street at night, warm lantern light, wooden watch post, full moon, light fog |
| `bg_space.png` | space station interior with a huge window showing stars and a purple ringed planet, dark blue metal walls |

## Советы

- Генерируй всю цепочку одним чатом/сессией, чтобы стиль был консистентным («same character, next evolution stage…»).
- Если фон получился не прозрачным — прогони через удалялку фона, у спрайтов это критично.
- Начни с одной цепочки (например `sixseven` — главный вирусный персонаж) и проверь в игре, прежде чем генерить остальные 66 картинок.
