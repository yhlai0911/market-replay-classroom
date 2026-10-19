// Version every local JS module and stylesheet together to prevent mixed cached builds.
import fs from 'node:fs';
const version=process.argv[2];if(!/^[a-zA-Z0-9._-]+$/.test(version??''))throw Error('Supply an asset version token');
for(const file of fs.readdirSync('dist').filter(f=>f.endsWith('.js'))){const path='dist/'+file,source=fs.readFileSync(path,'utf8');fs.writeFileSync(path,source.replace(/(['"])(\.\/[^'"?]+\.js)(?:\?v=[^'"]+)?\1/g,(all,quote,url)=>url.includes('/vendor/')?all:`${quote}${url}?v=${version}${quote}`));}
const path='dist/index.html';fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/(src|href)="(app\.js|style\.css)(?:\?v=[^"]+)?"/g,`$1="$2?v=${version}"`));
console.log('Versioned application assets:',version);
