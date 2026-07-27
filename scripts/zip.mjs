// Собирает dist/ в архив для загрузки в консоль Яндекс Игр (index.html в корне архива).
import AdmZip from 'adm-zip';

const zip = new AdmZip();
zip.addLocalFolder('dist');
zip.writeZip('brainrot-lab-merge.zip');
console.log('✅ brainrot-lab-merge.zip готов — загружай в консоль Яндекс Игр');
