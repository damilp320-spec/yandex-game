import Phaser from 'phaser';
import { W, H } from './config';
import { GameScene } from './GameScene';
import { initSDK } from './sdk';

(async () => {
  await initSDK();
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
