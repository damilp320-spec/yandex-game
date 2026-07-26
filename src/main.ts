import Phaser from 'phaser';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import { W, H, FONT } from './config';
import { GameScene } from './GameScene';
import { initSDK, sdkLang } from './sdk';
import { initMetrica } from './analytics';
import { fetchSkinManifest } from './assets';
import { detectLang, setLang } from './i18n';

// Единый шрифт для всех текстов: подмешиваем fontFamily в дефолты фабрики,
// чтобы не проставлять его в каждом style-объекте вручную.
const factory = Phaser.GameObjects.GameObjectFactory.prototype as any;
const origText = factory.text;
factory.text = function (x: number, y: number, text: string | string[], style?: object) {
  return origText.call(this, x, y, text, { fontFamily: FONT, ...style });
};

(async () => {
  initMetrica();
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch { /* шрифт подхватится позже */ }
  await fetchSkinManifest(); // до старта сцены, чтобы preload знал о кастомных PNG
  await initSDK();
  setLang(detectLang(sdkLang())); // выбор игрока (S.lang) применится позже, в restore()
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#1a1230',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [GameScene],
  });
})();
